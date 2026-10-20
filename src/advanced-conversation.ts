import { validateAssessments, type ConversationDefinition, type ConversationReport, type ConversationRecord,
  type Model, type ModelInput, type AgentRequest, type Usage } from "./conversation.js";
import { evaluateWorkflow, workflowResponseText, type WorkflowReply } from "./workflow.js";
import { ScenarioGraph } from "./scenario-graph.js";
import { validateMetricPair, type MetricResultContract } from "./evaluation-contracts.js";
import { evaluateRag, observationFromReply } from "./rag.js";
import { scoreClaimVerdicts } from "./rag-claim-verdicts.js";
import { validateAssessment } from "./rag-contract.js";

async function timed<T>(fn: () => Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([fn(), new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("Execution timeout")), ms);
  })]); } finally { clearTimeout(timer); }
}
export async function runAdvancedConversation(options: {
  definition: ConversationDefinition; runId: string; model: Model;
  invoke?: (request: AgentRequest) => Promise<WorkflowReply>; replay?: ConversationReport;
}): Promise<ConversationReport> {
  const d = structuredClone(options.definition), plan = d.executionPlan!, limits = plan.limits;
  const started = new Date().toISOString(), usage: Usage[] = [], conversations: ConversationRecord[] = [];
  let modelCalls = 0, tokens = 0;
  if (!options.replay && !options.invoke) throw new Error("Agent invocation required");
  if (options.replay && (options.replay.kind !== "conversation-report" || options.replay.version !== 1 ||
    options.replay.conversations.length !== d.config.conversationCount)) throw new Error("Invalid advanced replay");
  const call = async (input: ModelInput) => {
    if (modelCalls >= limits.maxModelCalls || tokens >= limits.maxTokens) throw new Error("Model budget exhausted");
    modelCalls++;
    const response = await timed(() => options.model(structuredClone(input), {
      timeoutMs: limits.timeoutMs, maxOutputTokens: Math.min(4096, limits.maxTokens - tokens),
    }), limits.timeoutMs);
    const u = response.usage;
    if (!u || !u.model || ![u.promptTokens, u.completionTokens, u.totalTokens].every(n => Number.isSafeInteger(n) && n >= 0) ||
      u.totalTokens < u.promptTokens + u.completionTokens) throw new Error("Model usage unavailable");
    usage.push({ ...u }); tokens += u.totalTokens;
    if (tokens > limits.maxTokens) throw new Error("Reported token budget exceeded");
    return response;
  };
  for (let i = 0; i < d.config.conversationCount; i++) {
    const r: ConversationRecord = { id: `${options.runId}_${i + 1}`, messages: [],
      evidence: { version: 1, source: "runtime", complete: true, events: [] }, status: "inconclusive",
      termination: "error", score: null, assessments: [], branchHistory: [], metricResults: [], ragResults: [], observations: [] };
    conversations.push(r);
    const graph = plan.graph ? new ScenarioGraph(plan.graph) : undefined;
    try {
      if (options.replay) {
        const source = options.replay.conversations[i];
        if (!source.messages.length || source.messages.length % 2 || source.messages.length > limits.maxTurns * 2 ||
          source.messages.some((m, j) => m.role !== (j % 2 ? "assistant" : "user") || typeof m.content !== "string" || !m.content.trim()))
          throw new Error("Invalid advanced replay");
        r.messages = structuredClone(source.messages);
        r.evidence = structuredClone(source.evidence);
        r.observations = structuredClone(source.observations ?? []);
        r.branchHistory = structuredClone(source.branchHistory ?? []);
        r.termination = source.termination;
      } else {
        for (let turn = 1; turn <= limits.maxTurns; turn++) {
          const stage = graph?.enter();
          let message: string;
          if (stage?.user.mode === "scripted") message = stage.user.instruction;
          else if (d.mode === "scripted") {
            if (!d.turns?.[turn - 1]) { r.termination = "completed"; break; }
            message = d.turns[turn - 1].message;
          } else {
            const output = (await call({ purpose: "simulate", persona: d.persona!, scenario: {
              ...d.scenario, ...(stage ? { context: `${d.scenario.context}\nCurrent user task: ${stage.user.instruction}`,
                endCondition: "The stage runner controls stopping. Produce this stage's next user message with done:false." } : {}),
            }, messages: r.messages, turn })).output as any;
            if (typeof output?.done !== "boolean" || typeof output?.message !== "string") throw new Error("Invalid simulation response");
            if (output.done && !graph) {
              if (!r.messages.length || output.message !== "") throw new Error("Invalid simulation response");
              r.termination = "completed"; break;
            }
            message = output.message;
          }
          if (typeof message !== "string" || !message.trim() || message.length > 12000) throw new Error("Invalid user turn");
          const history = structuredClone(r.messages);
          r.messages.push({ role: "user", content: message });
          const reply = await timed(() => options.invoke!({ message, history, messages: structuredClone(r.messages),
            conversationId: r.id, sessionId: r.id, turn }), limits.timeoutMs);
          const answer = workflowResponseText(reply);
          if (!answer?.trim() || answer.length > 64000) throw new Error("Invalid agent response");
          r.messages.push({ role: "assistant", content: answer });
          const e = reply.workflow;
          if (!e || e.version !== 1 || e.source !== "runtime" || !e.complete || !Array.isArray(e.events) || e.events.some(x => x.turn !== turn))
            r.evidence.complete = false;
          else r.evidence.events.push(...structuredClone(e.events));
          if (plan.ragCases.some(c => c.turn === turn) || plan.metrics.some(m => m.evidence.includes("retrieval"))) {
            // Reference answers never enter invoke; only the actual current response is recorded.
            r.observations!.push({ turn, observation: observationFromReply(reply) });
          }
          if (graph && await graph.advance(turn, answer, async conditions => {
            const output = (await call({ purpose: "route", conditions, messages: r.messages })).output as any;
            return output?.matches;
          })) { r.termination = "completed"; break; }
          if (!graph && d.mode === "scripted" && turn === d.turns!.length) { r.termination = "completed"; break; }
          if (turn === limits.maxTurns) r.termination = "turn_limit";
        }
      }
      r.assessments = validateAssessments((await call({ purpose: "judge", scenario: d.scenario, criteria: d.criteria, messages: r.messages })).output, d.criteria, r.messages);
      r.score = r.assessments.reduce((sum, a) => sum + a.score * d.criteria.find(c => c.id === a.id)!.weight / 100, 0);
      for (const metric of plan.metrics) {
        const knownEvidence = [
          ...r.messages.map((_, j) => ({ id: `message-${j + 1}`, source: "transcript" as const, turn: Math.ceil((j + 1) / 2) })),
          ...(r.evidence.complete ? r.evidence.events.map(e => ({ id: `event-${e.seq}`, source: "runtime" as const, turn: e.turn })) : []),
          ...r.observations!.flatMap(o => (o.observation.retrievedChunks ?? []).map((_, j) => ({
            id: `retrieval-${o.turn}-${j + 1}`, source: "retrieval" as const, turn: o.turn,
          }))),
        ];
        if (metric.evidence.some(source => !knownEvidence.some(e => e.source === source))) {
          r.metricResults!.push({ contractVersion: 1, kind: "metric-result", metricId: metric.id, metricRevision: metric.revision,
            status: "inconclusive", score: null, exposure: "unknown", reason: "Required runtime/retrieval evidence is unavailable.", evidence: [] });
          continue;
        }
        const output = (await call({ purpose: "metric", metric, scenario: d.scenario, messages: r.messages, evidence: r.evidence, observations: r.observations })).output as any;
        if (!output || !Array.isArray(output.evidenceIds) || output.evidenceIds.some((id: unknown) => typeof id !== "string" || !knownEvidence.some(e => e.id === id)))
          throw new Error("Invalid metric evidence");
        const evidence = knownEvidence.filter(e => output.evidenceIds.includes(e.id));
        const missing = metric.evidence.some(source => !evidence.some(e => e.source === source));
        const status = missing || (metric.requiredExposure === "exercised" && output.exposure !== "exercised") || output.applicable !== true
          ? "inconclusive" : metric.scale.direction === "higher"
            ? output.score >= metric.threshold ? "pass" : "fail" : output.score <= metric.threshold ? "pass" : "fail";
        const finding: MetricResultContract = { contractVersion: 1, kind: "metric-result", metricId: metric.id, metricRevision: metric.revision,
          status, score: output.score, exposure: output.exposure, reason: output.reason, evidence };
        validateMetricPair(metric, finding); r.metricResults!.push(finding);
      }
      for (const entry of plan.ragCases) {
        const observed = r.observations!.find(o => o.turn === entry.turn);
        if (!observed) {
          r.ragResults!.push({ turn: entry.turn, report: { caseId: entry.case.id, status: "inconclusive", failures: [], errors: ["Turn was not exercised"],
            checks: {}, matchedExpectedSourceIds: [], missingExpectedSourceIds: entry.case.expectedChunkIds ?? [] } });
          continue;
        }
        // Use actual conversation context for follow-ups; the authored question is evaluator-only reference intent.
        const caseReport = await evaluateRag(entry.case, observed.observation, async input => {
          const response = await call({ purpose: "rag", input, messages: r.messages.slice(0, entry.turn * 2) });
          const a = response.output as any;
          a.prohibitedClaims = scoreClaimVerdicts(input.case.prohibitedClaims ?? [], input.observation.answer, a.claimVerdicts);
          validateAssessment(a, !!input.observation.retrievedChunks?.length);
          return { assessment: a, usage: response.usage };
        });
        r.ragResults!.push({ turn: entry.turn, report: caseReport });
      }
      if (d.workflowChecks) {
        r.workflow = evaluateWorkflow({ version: 1, name: d.name,
          turns: d.mode === "scripted" ? d.turns! : r.messages.filter(m => m.role === "user").map(m => ({ message: m.content })),
          checks: d.workflowChecks }, r.evidence);
      }
      const required = r.metricResults!.filter(x => plan.metrics.find(m => m.id === x.metricId)!.required);
      const unresolved = r.termination !== "completed" || required.some(m => m.status === "inconclusive") ||
        r.ragResults!.some(x => x.report.status === "inconclusive") || r.workflow?.status === "inconclusive";
      const failed = r.score < d.config.minimumScore || r.assessments.some(a => {
        const c = d.criteria.find(c => c.id === a.id)!; return c.required && a.score < c.minimumScore;
      }) || required.some(m => m.status === "fail") || r.ragResults!.some(x => x.report.status === "fail") || r.workflow?.status === "fail";
      r.status = unresolved ? "inconclusive" : failed ? "fail" : "pass";
    } catch {
      // No raw provider/connector exception text is persisted.
      r.status = "inconclusive"; r.error = "Execution or evaluation could not complete; inspect branch history, evidence and configured limits.";
    } finally {
      if (graph && !options.replay) r.branchHistory = graph.history;
    }
  }
  const status = conversations.some(r => r.status === "inconclusive") ? "inconclusive" :
    conversations.some(r => r.status === "fail") ? "fail" : "pass";
  const scores = conversations.map(r => r.score).filter((n): n is number => n !== null);
  return { version: 1, kind: "conversation-report", runId: options.runId, definition: d, status,
    qualityGate: { passed: status === "pass", status }, overallScore: scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null,
    conversations, usage, modelCalls, createdAt: started, completedAt: new Date().toISOString(),
    ...(options.replay ? { replayedFrom: options.replay.runId } : {}) };
}
