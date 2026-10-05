import { extractAgentResponse } from "./evaluator.js";
import {
  defaultThresholds, object, RagJudgeError, validateAssessment, validateObservation, validateSuite,
  type RagSuite, type RagCase, type Observation, type Judge, type Metric, type Finding,
} from "./rag-contract.js";

export type AgentRequest = { message: string; conversationId: string; history: [] };
export type InvokeAgent = (request: AgentRequest) => Promise<unknown>;
type Check = { state: "available" | "unavailable" | "not_applicable"; score: number | null; threshold: number; explanation: string; findings: string[] };
export type CaseReport = {
  caseId: string; status: "pass" | "fail" | "inconclusive"; failures: string[]; errors: string[];
  checks: Partial<Record<Metric | "citationIdentity", Check>>;
  missingExpectedSourceIds: string[]; matchedExpectedSourceIds: string[];
  observation?: Observation; judge?: Awaited<ReturnType<Judge>>;
  usage?: Awaited<ReturnType<Judge>>["usage"];
};

export function observationFromReply(reply: unknown): Observation {
  if (!object(reply)) throw new Error("Agent must return a JSON object");
  const rag = reply.rag;
  if (rag !== undefined && !object(rag)) throw new Error("Agent rag evidence must be an object");
  const evidence = rag ?? reply;
  const chunks = evidence.retrievedChunks;
  const value = {
    answer: extractAgentResponse(JSON.stringify(reply)),
    ...(chunks !== undefined ? { retrievedChunks: Array.isArray(chunks) ? chunks.map(chunk =>
      object(chunk) ? { ...chunk, content: chunk.content ?? chunk.text } : chunk) : chunks } : {}),
    ...(evidence.citations !== undefined ? { citations: evidence.citations } : {}),
  };
  validateObservation(value);
  return value;
}

export async function evaluateRag(
  c: RagCase, observation: Observation, judge: Judge, overrides: RagSuite["thresholds"] = {},
): Promise<CaseReport> {
  const thresholds = { ...defaultThresholds, ...overrides };
  const report: CaseReport = { caseId: c.id, status: "inconclusive", failures: [], errors: [],
    checks: {}, missingExpectedSourceIds: [], matchedExpectedSourceIds: [] };
  const check = (key: Metric | "citationIdentity", score: number | null, explanation: string,
    findings: string[] = [], state: Check["state"] = "available") => {
    const threshold = key === "citationIdentity" ? 100 : thresholds[key];
    report.checks[key] = { state, score, threshold, explanation, findings };
    if (state === "unavailable") report.errors.push(`${key}: unavailable`);
    if (score !== null && score < threshold) report.failures.push(key);
  };
  let phase = "observation";
  try {
    validateObservation(observation);
    report.observation = observation;
    const expected = [...new Set(c.expectedChunkIds ?? [])];
    if (expected.length) {
      const retrievedIds = new Set((observation.retrievedChunks ?? []).flatMap(x => [x.id, x.chunkId, x.documentId].filter(Boolean)));
      report.matchedExpectedSourceIds = expected.filter(x => retrievedIds.has(x));
      report.missingExpectedSourceIds = expected.filter(x => !retrievedIds.has(x));
      check("retrievalRecall", observation.retrievedChunks === undefined ? null :
        100 * report.matchedExpectedSourceIds.length / expected.length,
      "Recall of independently authored expected source IDs.", report.missingExpectedSourceIds,
      observation.retrievedChunks === undefined ? "unavailable" : "available");
    } else check("retrievalRecall", null, "No expected sources configured.", [], "not_applicable");
    if (!observation.answer.trim()) {
      report.failures.push("empty_answer");
      report.status = "fail";
      return report;
    }
    phase = "judge";
    const result = await judge({ case: c, observation });
    report.usage = result.usage;
    validateAssessment(result.assessment, !!observation.retrievedChunks?.length);
    report.judge = result;
    const a = result.assessment;
    const abstained = ["insufficient_evidence", "explicit_refusal"].includes(a.answerHandling.responseKind);
    const correctAbstention = !c.answerable && abstained && a.answerHandling.score === 100;
    const handlingScore = c.answerable ? (abstained ? 0 : a.answerHandling.score) : (abstained ? a.answerHandling.score : 0);
    check("answerHandling", handlingScore, a.answerHandling.explanation, a.answerHandling.findings);
    for (const key of ["expectedFactCoverage", "referenceCorrectness", "prohibitedClaims"] as const) {
      const applicable = key === "prohibitedClaims" ? !!c.prohibitedClaims?.length :
        !correctAbstention && (key === "expectedFactCoverage" ? !!c.expectedFacts?.length : !!c.referenceAnswer);
      const finding = a[key];
      check(key, applicable ? finding.score : null, applicable ? finding.explanation : "Not applicable.",
        applicable ? finding.findings : [], applicable ? "available" : "not_applicable");
    }
    for (const key of ["groundedness", "citations"] as const) {
      const finding: Finding | null = a[key];
      if (correctAbstention) check(key, null, "Correct abstention; content assessment not applicable.", [], "not_applicable");
      else if (observation.retrievedChunks === undefined || (key === "citations" && observation.citations === undefined)) {
        check(key, null, "Required runtime evidence was omitted.", [], "unavailable");
      } else if (!observation.retrievedChunks.length || (key === "citations" && !observation.citations?.length)) {
        check(key, 0, "Runtime explicitly returned no usable evidence or citations.");
      } else check(key, finding!.score, finding!.explanation, finding!.findings);
    }
    if (!correctAbstention && observation.citations?.length && observation.retrievedChunks !== undefined) {
      const invalid = observation.citations.filter(citation => {
        const stableId = citation.chunkId ?? citation.id;
        return observation.retrievedChunks!.filter(chunk =>
          (!citation.documentId || chunk.documentId === citation.documentId) &&
          (!stableId || (chunk.chunkId ?? chunk.id) === stableId)).length !== 1;
      });
      check("citationIdentity", invalid.length ? 0 : 100, "Each citation must uniquely resolve to retrieved evidence.",
        invalid.map(x => JSON.stringify(x)));
    }
  } catch (error) {
    // Never serialize provider bodies/credentials into reports.
    if (error instanceof RagJudgeError) {
      report.errors.push(error.code);
      report.usage = error.usage;
    } else report.errors.push(phase === "observation" ? "Invalid or missing observation evidence." :
      "Judge unavailable, transport blocked or invalid judge output.");
  }
  report.status = report.errors.length ? "inconclusive" : report.failures.length ? "fail" : "pass";
  return report;
}

export async function runRagSuite(input: {
  suite: RagSuite; judge: Judge; runId: string;
  observations?: Record<string, Observation>; invoke?: InvokeAgent;
}) {
  validateSuite(input.suite);
  if ((input.observations === undefined) === (input.invoke === undefined)) throw new Error("Supply observations OR a live connector");
  if (input.observations !== undefined && (!object(input.observations) ||
      Object.keys(input.observations).some(id => !input.suite.cases.some(c => c.id === id)))) throw new Error("Unknown observation case ID");
  const cases: CaseReport[] = [];
  const deadline = Date.now() + 300000;
  for (const c of input.suite.cases) {
    try {
      if (Date.now() >= deadline) throw new Error("Run deadline reached");
      // Never spread case fields here: references are judge-only data.
      const observation = input.invoke
        ? observationFromReply(await input.invoke({ message: c.question, conversationId: `${input.runId}_${c.id}`, history: [] }))
        : input.observations![c.id];
      cases.push(await evaluateRag(c, observation, input.judge, input.suite.thresholds));
    } catch {
      cases.push({ caseId: c.id, status: "inconclusive", failures: [], errors: ["Agent execution failed or run deadline reached."],
        checks: {}, missingExpectedSourceIds: [], matchedExpectedSourceIds: [] });
    }
  }
  const status = cases.some(c => c.status === "inconclusive") ? "inconclusive" :
    cases.some(c => c.status === "fail") ? "fail" : "pass";
  return {
    version: 1, runId: input.runId, suite: input.suite,
    evidenceSource: input.invoke ? "live_connector" : "uploaded",
    status, qualityGate: { passed: status === "pass", status }, cases,
  };
}
