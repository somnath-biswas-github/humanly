/**
 * New, dependency-free interchange contracts. No Studio implementation is included.
 * These describe extensions, not permission to execute them on legacy runners.
 */
export const CONTRACT_VERSION = 1 as const;
export type Status = "pass" | "fail" | "inconclusive";
export type Exposure = "exercised" | "limited" | "not_exercised" | "unknown";
export type Runner = "conversation" | "workflow" | "rag";
export type Surface = "oss" | "studio";
export type EvidenceRef = { id: string; source: "transcript" | "runtime" | "retrieval"; turn: number };
export type ScenarioContract = {
  contractVersion: 1; kind: "scenario"; id: string; start: string;
  stages: {
    id: string; user: { mode: "scripted" | "synthetic"; instruction: string };
    maxVisits: number; terminal: boolean;
    transitions: { to: string; condition: string; routing: "rule" | "model" }[];
    onNoMatch: "stop_inconclusive" | "repeat";
  }[];
  limits: { maxTurns: number; maxModelCalls: number; maxTokens: number; timeoutMs: number };
};
export type MetricContract = {
  contractVersion: 1; kind: "metric"; id: string; revision: string;
  description: string; scale: { min: number; max: number; direction: "higher" | "lower" };
  threshold: number; weight: number; required: boolean;
  evidence: EvidenceRef["source"][]; requiredExposure: "exercised" | "none";
  missingEvidence: "inconclusive";
};
export type MetricResultContract = {
  contractVersion: 1; kind: "metric-result"; metricId: string; metricRevision: string;
  status: Status; score: number | null; exposure: Exposure;
  reason: string; evidence: EvidenceRef[];
};
export type ProviderContract = {
  contractVersion: 1; kind: "provider"; id: string; model: string;
  capabilities: { structuredOutput: boolean; usage: "reported" | "unknown"; cancellation: "best_effort" | "unsupported" };
  usage: { inputTokens: number; outputTokens: number } | null;
};
export type ReportContract = {
  contractVersion: 1; kind: "report-summary"; runId: string; runner: Runner; surface: Surface;
  configuration: { format: string; version: string; snapshotId: string };
  results: MetricResultContract[]; status: Status;
  gate: { status: Status; passed: boolean; reasons: string[] };
  providers: ProviderContract[];
};
export type EvaluationContract = ScenarioContract | MetricContract | MetricResultContract | ProviderContract | ReportContract;

const record = (v: unknown): v is Record<string, any> => !!v && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown) => typeof v === "string" && v.trim().length > 0;
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const positiveInt = (v: unknown) => Number.isSafeInteger(v) && Number(v) > 0;
function check(ok: unknown, message: string): asserts ok {
  if (!ok) throw new Error(`Invalid evaluation contract: ${message}`);
}
function fields(v: unknown, names: string[]): asserts v is Record<string, any> {
  check(record(v), "expected an object");
  check(Object.keys(v).every(k => names.includes(k)), "unknown field");
  check(names.every(k => Object.hasOwn(v, k)), "missing field");
}
function one(v: unknown, choices: readonly string[]) { return typeof v === "string" && choices.includes(v); }
const statuses = ["pass", "fail", "inconclusive"] as const;

/** Pure validation: never inserts defaults, normalizes weights or mutates input. */
export function validateEvaluationContract(value: unknown): asserts value is EvaluationContract {
  check(record(value), "expected an object");
  check(value.contractVersion === CONTRACT_VERSION, "unsupported contractVersion; expected 1");
  const v = value;
  const base = ["contractVersion", "kind"];
  switch (v.kind) {
    case "scenario": {
      fields(v, [...base, "id", "start", "stages", "limits"]);
      check(text(v.id) && text(v.start), "scenario identifiers");
      check(Array.isArray(v.stages) && v.stages.length > 0 && v.stages.length <= 100, "1–100 stages required");
      const ids = new Set<string>();
      for (const stage of v.stages) {
        fields(stage, ["id", "user", "maxVisits", "terminal", "transitions", "onNoMatch"]);
        check(text(stage.id) && !ids.has(stage.id), "unique stage IDs required"); ids.add(stage.id);
        fields(stage.user, ["mode", "instruction"]);
        check(one(stage.user.mode, ["scripted", "synthetic"]) && text(stage.user.instruction), "stage user");
        check(positiveInt(stage.maxVisits) && typeof stage.terminal === "boolean", "stage limits");
        check(one(stage.onNoMatch, ["stop_inconclusive", "repeat"]), "onNoMatch");
        check(Array.isArray(stage.transitions) && stage.transitions.length <= 100, "transitions");
        check(!stage.terminal || stage.transitions.length === 0, "terminal stage cannot transition");
        for (const edge of stage.transitions) {
          fields(edge, ["to", "condition", "routing"]);
          check(text(edge.to) && text(edge.condition) && one(edge.routing, ["rule", "model"]), "transition");
        }
      }
      check(ids.has(v.start), "start stage does not exist");
      check(v.stages.every((s: any) => s.transitions.every((e: any) => ids.has(e.to))), "dangling transition");
      fields(v.limits, ["maxTurns", "maxModelCalls", "maxTokens", "timeoutMs"]);
      check(Object.values(v.limits).every(positiveInt), "positive execution limits required");
      break;
    }
    case "metric":
      fields(v, [...base, "id", "revision", "description", "scale", "threshold", "weight", "required", "evidence", "requiredExposure", "missingEvidence"]);
      check(text(v.id) && text(v.revision) && text(v.description), "metric identity");
      fields(v.scale, ["min", "max", "direction"]);
      check(finite(v.scale.min) && finite(v.scale.max) && v.scale.min < v.scale.max && one(v.scale.direction, ["higher", "lower"]), "metric scale");
      check(finite(v.threshold) && v.threshold >= v.scale.min && v.threshold <= v.scale.max, "threshold outside scale");
      check(finite(v.weight) && v.weight >= 0 && typeof v.required === "boolean", "weight/required");
      check(Array.isArray(v.evidence) && v.evidence.every((s: unknown) => one(s, ["transcript", "runtime", "retrieval"])) && new Set(v.evidence).size === v.evidence.length, "evidence requirements");
      check(one(v.requiredExposure, ["exercised", "none"]) && v.missingEvidence === "inconclusive", "evidence policy");
      break;
    case "metric-result":
      fields(v, [...base, "metricId", "metricRevision", "status", "score", "exposure", "reason", "evidence"]);
      check(text(v.metricId) && text(v.metricRevision) && text(v.reason), "result identity/reason");
      check(one(v.status, statuses) && (v.score === null || finite(v.score)), "result score/status");
      check(v.status === "inconclusive" || v.score !== null, "decisive result requires score");
      check(one(v.exposure, ["exercised", "limited", "not_exercised", "unknown"]), "exposure");
      check(Array.isArray(v.evidence), "evidence references");
      for (const ref of v.evidence) {
        fields(ref, ["id", "source", "turn"]);
        check(text(ref.id) && one(ref.source, ["transcript", "runtime", "retrieval"]) && positiveInt(ref.turn), "evidence reference");
      }
      break;
    case "provider":
      fields(v, [...base, "id", "model", "capabilities", "usage"]);
      check(text(v.id) && text(v.model), "provider identity");
      fields(v.capabilities, ["structuredOutput", "usage", "cancellation"]);
      check(typeof v.capabilities.structuredOutput === "boolean" && one(v.capabilities.usage, ["reported", "unknown"]) && one(v.capabilities.cancellation, ["best_effort", "unsupported"]), "provider capabilities");
      if (v.usage !== null) {
        fields(v.usage, ["inputTokens", "outputTokens"]);
        check(v.capabilities.usage === "reported" && Object.values(v.usage).every(n => Number.isSafeInteger(n) && Number(n) >= 0), "reported token usage");
      }
      break;
    case "report-summary":
      fields(v, [...base, "runId", "runner", "surface", "configuration", "results", "status", "gate", "providers"]);
      check(text(v.runId) && one(v.runner, ["conversation", "workflow", "rag"]) && one(v.surface, ["oss", "studio"]), "report identity");
      fields(v.configuration, ["format", "version", "snapshotId"]);
      check(Object.values(v.configuration).every(text), "configuration provenance");
      check(Array.isArray(v.results) && Array.isArray(v.providers), "report collections");
      for (const result of v.results) { validateEvaluationContract(result); check(result.kind === "metric-result", "result kind"); }
      check(new Set(v.results.map((r: any) => r.metricId)).size === v.results.length, "duplicate metric result");
      for (const provider of v.providers) { validateEvaluationContract(provider); check(provider.kind === "provider", "provider kind"); }
      fields(v.gate, ["status", "passed", "reasons"]);
      check(one(v.status, statuses) && v.gate.status === v.status && v.gate.passed === (v.status === "pass"), "gate consistency");
      check(Array.isArray(v.gate.reasons) && v.gate.reasons.every(text) && (v.status === "pass" || v.gate.reasons.length > 0), "gate reasons");
      check(v.status !== "pass" || (v.results.length > 0 && v.results.every((r: any) => r.status === "pass")), "empty or unresolved report cannot pass");
      break;
    default: throw new Error("Invalid evaluation contract: unsupported kind");
  }
}

/** Validate a finding against its exact metric revision without changing either. */
export function validateMetricPair(metric: MetricContract, result: MetricResultContract): void {
  validateEvaluationContract(metric); validateEvaluationContract(result);
  check(metric.id === result.metricId && metric.revision === result.metricRevision, "metric revision mismatch");
  check(result.score === null || (result.score >= metric.scale.min && result.score <= metric.scale.max), "score outside scale");
  const missing = metric.evidence.some(source => !result.evidence.some(ref => ref.source === source));
  const unexercised = metric.requiredExposure === "exercised" && result.exposure !== "exercised";
  check(!(missing || unexercised) || result.status === "inconclusive", "missing evidence/exposure must be inconclusive");
  if (result.status !== "inconclusive") {
    const passes = metric.scale.direction === "higher" ? result.score! >= metric.threshold : result.score! <= metric.threshold;
    check(result.status === (passes ? "pass" : "fail"), "score contradicts verdict");
  }
}

/** Contract availability does not imply runner availability. */
export function assertExecutableContract(value: unknown, _surface: Surface): never {
  validateEvaluationContract(value);
  throw new Error("Contract-only extension: execution is not supported yet. Use the existing runner configuration.");
}

export function assertLegacyVersion(value: unknown, label: string): void {
  if (record(value) && "contractVersion" in value) {
    throw new Error(`${label}: extension contracts are not executable by this runner`);
  }
  if (record(value) && "version" in value && value.version !== 1) {
    throw new Error(`${label}: unsupported version; expected 1`);
  }
}

export const EVALUATION_CAPABILITIES = [
  { id: "scripted-conversation", oss: "available", studio: "available", interchange: "manual; different runner configurations" },
  { id: "synthetic-conversation", oss: "available", studio: "available", interchange: "manual; no score parity" },
  { id: "workflow-evidence", oss: "available", studio: "available", interchange: "version-1 case/evidence; connector credentials excluded" },
  { id: "independent-rag", oss: "available", studio: "available", interchange: "Studio export with conversion warnings; not reverse import" },
  { id: "branching-scenario", oss: "available", studio: "available", interchange: "opt-in executionPlan; captured script is one path, not branch parity" },
  { id: "reusable-metrics", oss: "available", studio: "available", interchange: "versioned metrics in executionPlan; separate evidence/exposure gate" },
  { id: "metric-provider-report-extensions", oss: "contract-only", studio: "contract-only", interchange: "validation only; existing reports unchanged" },
  { id: "conversational-rag", oss: "available", studio: "available", interchange: "per-turn reference cases and actual evidence in executionPlan" },
  { id: "framework-evidence-adapters", oss: "planned", studio: "planned", interchange: "existing starter is not adapter parity" },
] as const;
