import { validateEvaluationContract, type ScenarioContract, type MetricContract } from "./evaluation-contracts.js";
import { validateSuite, type RagCase } from "./rag-contract.js";
import { validateConversationDefinition, type ConversationDefinition } from "./conversation.js";

export type ExecutionPlan = {
  version: 1; graph?: ScenarioContract; metrics: MetricContract[]; provider?: "openai"|"anthropic";
  reviewedCandidate?: Pick<ConversationDefinition,"persona"|"scenario"|"criteria"|"name"> & {generated:true;reviewed:true;minimumScore:number};
  ragCases: Array<{ turn: number; case: RagCase }>;
  limits: { maxTurns: number; maxModelCalls: number; maxTokens: number; timeoutMs: number };
};
export function metricCatalog(): MetricContract[] {
  return [
    ["goal_completion", "Goal completion", "Did the agent accomplish the configured goal without inventing facts or actions?"],
    ["conversation_completeness", "Conversation completeness", "Were the user's expressed needs addressed or appropriately handed off?"],
    ["knowledge_retention", "Knowledge retention", "Retain user-provided facts across turns; later corrections supersede earlier facts. If no recall/correction opportunity occurs, exposure is not_exercised."],
    ["turn_relevance", "Turn relevance", "Respond relevantly to the current request in conversation context."],
    ["policy_adherence", "Policy adherence", "Follow the configured policy only; never invent additional authentication requirements."],
    ["role_adherence", "Role adherence", "Stay within the configured role and authority; role assignment itself is not a hallucination."],
    ["claim_support", "Supported claims", "Do not invent factual claims or action completion. An assistant's claim is not runtime evidence."],
    ["tool_arguments", "Tool arguments", "Do actual tool targets and material arguments match the user's expressed request? Missing runtime evidence is inconclusive."],
  ].map(([id, title, description]) => ({
    contractVersion: 1, kind: "metric", id, revision: "1", description: `${title}: ${description}`,
    scale: { min: 0, max: 100, direction: "higher" }, threshold: 80, weight: 1, required: true,
    evidence: id === "tool_arguments" ? ["transcript", "runtime"] : ["transcript"],
    requiredExposure: "exercised", missingEvidence: "inconclusive",
  }));
}
export function defaultExecutionPlan(): ExecutionPlan {
  return { version: 1, metrics: [metricCatalog()[0]], ragCases: [],
    limits: { maxTurns: 8, maxModelCalls: 30, maxTokens: 20000, timeoutMs: 30000 } };
}
export function validateExecutionPlan(value: unknown): asserts value is ExecutionPlan {
  const p = value as ExecutionPlan;
  const fail = (message: string): never => { throw new Error(`Invalid execution plan: ${message}`); };
  if (!p || typeof p !== "object" || Array.isArray(p) || p.version !== 1) fail("expected version 1");
  if (Object.keys(p).some(k => !["version", "graph", "metrics", "ragCases", "limits", "provider","reviewedCandidate"].includes(k))) fail("unknown field");
  if(p.reviewedCandidate){
    const c=p.reviewedCandidate;
    if(c.generated!==true||c.reviewed!==true||Object.keys(c).some(k=>!["persona","scenario","criteria","name","generated","reviewed","minimumScore"].includes(k)))fail("reviewed candidate");
    validateConversationDefinition({version:1,kind:"conversation",mode:"synthetic",name:c.name,persona:c.persona,scenario:c.scenario,criteria:c.criteria,
      config:{conversationCount:1,minimumScore:c.minimumScore,...p.limits}});
  }
  if(p.provider!==undefined && !["openai","anthropic"].includes(p.provider))fail("unsupported provider");
  if (!p.limits || typeof p.limits !== "object" || Array.isArray(p.limits) ||
    Object.keys(p.limits).some(k => !["maxTurns", "maxModelCalls", "maxTokens", "timeoutMs"].includes(k))) fail("limits");
  for (const [key, max] of Object.entries({ maxTurns: 50, maxModelCalls: 500, maxTokens: 1000000, timeoutMs: 120000 })) {
    const n = p.limits[key as keyof ExecutionPlan["limits"]];
    if (!Number.isSafeInteger(n) || n < 1 || n > max) fail(`invalid ${key}`);
  }
  if (p.graph) {
    validateEvaluationContract(p.graph);
    if (p.graph.kind !== "scenario") fail("graph must be a scenario");
    for (const key of Object.keys(p.limits) as Array<keyof ExecutionPlan["limits"]>) {
      if (p.graph.limits[key] !== p.limits[key]) fail("graph and plan limits must agree");
    }
    for (const stage of p.graph.stages) for (const edge of stage.transitions) {
      if (edge.routing === "rule" && !/^(always|contains:.+|not_contains:.+)$/.test(edge.condition))
        fail("rule must be always, contains:text or not_contains:text");
    }
    const reached = new Set<string>();
    const visit = (id: string) => {
      if (reached.has(id)) return; reached.add(id);
      p.graph!.stages.find(s => s.id === id)!.transitions.forEach(e => visit(e.to));
    };
    visit(p.graph.start);
    if (reached.size !== p.graph.stages.length) fail("unreachable stage");
  }
  if (!Array.isArray(p.metrics) || p.metrics.length > 30) fail("at most 30 metrics");
  p.metrics.forEach(m => { validateEvaluationContract(m); if (m.kind !== "metric") fail("metric kind"); });
  if (new Set(p.metrics.map(m => m.id)).size !== p.metrics.length) fail("duplicate metric IDs");
  if (!Array.isArray(p.ragCases) || p.ragCases.length > 50) fail("at most 50 RAG turns");
  for (const entry of p.ragCases) {
    if (!entry || Object.keys(entry).some(k => !["turn", "case"].includes(k)) ||
      !Number.isInteger(entry.turn) || entry.turn < 1 || entry.turn > p.limits.maxTurns) fail("RAG turn outside limits");
    validateSuite({ version: 1, name: "conversation references", cases: [entry.case] });
  }
  if (new Set(p.ragCases.map(c => c.turn)).size !== p.ragCases.length) fail("duplicate RAG turn");
  if (new Set(p.ragCases.map(c => c.case.id)).size !== p.ragCases.length) fail("duplicate RAG case IDs");
  if (!p.graph && !p.metrics.length && !p.ragCases.length) fail("empty plan");
}

/** Metadata is disabled/zero-weight so it never changes existing criterion totals. */
export function executionPlanFromChecks(checks: any): ExecutionPlan | undefined {
  const entry = checks?.execution_plan;
  if (entry === undefined) return undefined;
  if (!entry || entry.enabled !== false || entry.weight !== 0 || !entry.config?.plan)
    throw new Error("Execution plan metadata must be disabled, zero-weight and contain a plan");
  validateExecutionPlan(entry.config.plan);
  return structuredClone(entry.config.plan);
}
