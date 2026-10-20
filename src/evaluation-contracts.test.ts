import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { validateEvaluationContract as validate, validateMetricPair, assertExecutableContract,
  EVALUATION_CAPABILITIES, type ScenarioContract, type MetricContract, type MetricResultContract,
  type ProviderContract, type ReportContract } from "./evaluation-contracts.js";
import { conversationExample, validateConversationDefinition } from "./conversation.js";
import { validateSuite } from "./rag-contract.js";
import { validateWorkflowCase } from "./workflow.js";

const scenario: ScenarioContract = {
  contractVersion: 1, kind: "scenario", id: "refund", start: "ask",
  stages: [{ id: "ask", user: { mode: "synthetic", instruction: "Ask for a refund." },
    maxVisits: 2, terminal: true, transitions: [], onNoMatch: "stop_inconclusive" }],
  limits: { maxTurns: 4, maxModelCalls: 10, maxTokens: 2000, timeoutMs: 30000 },
};
const metric: MetricContract = {
  contractVersion: 1, kind: "metric", id: "approval", revision: "1",
  description: "Require actual approval", scale: { min: 0, max: 100, direction: "higher" },
  threshold: 90, weight: 0, required: true, evidence: ["runtime"],
  requiredExposure: "exercised", missingEvidence: "inconclusive",
};
const result: MetricResultContract = {
  contractVersion: 1, kind: "metric-result", metricId: "approval", metricRevision: "1",
  status: "pass", score: 100, exposure: "exercised", reason: "Recorded approval matches.",
  evidence: [{ id: "event-1", source: "runtime", turn: 1 }],
};
const provider: ProviderContract = {
  contractVersion: 1, kind: "provider", id: "fixture", model: "fixture",
  capabilities: { structuredOutput: true, usage: "unknown", cancellation: "unsupported" }, usage: null,
};
const report: ReportContract = {
  contractVersion: 1, kind: "report-summary", runId: "fixture", runner: "conversation", surface: "oss",
  configuration: { format: "conversation", version: "1", snapshotId: "fixture-snapshot" },
  results: [result], status: "pass", gate: { status: "pass", passed: true, reasons: [] }, providers: [provider],
};
test("all five contract kinds validate without mutation or normalization", () => {
  for (const value of [scenario, metric, result, provider, report]) {
    const before = JSON.stringify(value); validate(value); assert.equal(JSON.stringify(value), before);
  }
  assert.equal(metric.weight, 0);
});
test("unknown versions, kinds, keys and missing fields fail explicitly", () => {
  for (const value of [null, [], { ...scenario, contractVersion: 2 }, { ...scenario, kind: "unknown" },
    { ...scenario, secret: "never-echo-this" }, { ...scenario, limits: {} }]) assert.throws(() => validate(value), /Invalid evaluation contract/);
});
test("graphs reject dangling edges, duplicate IDs and absent start", () => {
  assert.throws(() => validate({ ...scenario, start: "missing" }), /start stage/);
  assert.throws(() => validate({ ...scenario, stages: [scenario.stages[0], scenario.stages[0]] }), /unique/);
  assert.throws(() => validate({ ...scenario, stages: [{ ...scenario.stages[0], terminal: false,
    transitions: [{ to: "missing", condition: "declined", routing: "rule" }] }] }), /dangling/);
});
test("bounded loops are representable but invalid budgets and terminal edges are rejected", () => {
  const edge = { to: "ask", condition: "refused", routing: "model" };
  validate({ ...scenario, stages: [{ ...scenario.stages[0], terminal: false, transitions: [edge] }] });
  assert.throws(() => validate({ ...scenario, stages: [{ ...scenario.stages[0], transitions: [edge] }] }), /terminal/);
  for (const n of [0, -1, Infinity, 1.5]) assert.throws(() => validate({ ...scenario, limits: { ...scenario.limits, maxTurns: n } }));
});
test("metric scale, threshold, evidence policy and revision are explicit", () => {
  validateMetricPair(metric, result);
  for (const value of [{ ...metric, threshold: 101 }, { ...metric, weight: -1 },
    { ...metric, missingEvidence: "pass" }, { ...metric, scale: { min: 1, max: 1, direction: "higher" } }])
    assert.throws(() => validate(value));
  assert.throws(() => validateMetricPair(metric, { ...result, metricRevision: "2" }), /revision/);
  assert.throws(() => validateMetricPair(metric, { ...result, score: 101 }), /outside scale/);
  assert.throws(() => validateMetricPair(metric, { ...result, score: 50 }), /contradicts/);
  validateMetricPair({ ...metric, scale: { ...metric.scale, direction: "lower" } }, { ...result, score: 0 });
});
test("required zero-weight metric is not exempt from evidence and threshold checks", () => {
  assert.throws(() => validateMetricPair(metric, { ...result, evidence: [] }), /inconclusive/);
  assert.throws(() => validateMetricPair(metric, { ...result, exposure: "not_exercised" }), /inconclusive/);
  validateMetricPair(metric, { ...result, status: "inconclusive", score: null, evidence: [], exposure: "unknown" });
});
test("provider unknown usage remains null and credentials are not a contract field", () => {
  assert.throws(() => validate({ ...provider, usage: { inputTokens: 0, outputTokens: 0 } }), /usage/);
  assert.throws(() => validate({ ...provider, apiKey: "not-a-key" }), /unknown field/);
  validate({ ...provider, capabilities: { ...provider.capabilities, usage: "reported" }, usage: { inputTokens: 0, outputTokens: 0 } });
});
test("report cannot pass with empty, duplicated or inconclusive findings", () => {
  assert.throws(() => validate({ ...report, results: [] }), /cannot pass/);
  assert.throws(() => validate({ ...report, results: [result, result] }), /duplicate/);
  assert.throws(() => validate({ ...report, results: [{ ...result, status: "inconclusive", score: null }] }), /cannot pass/);
  assert.throws(() => validate({ ...report, gate: { ...report.gate, passed: false } }), /consistency/);
});
test("extension contracts never execute on either surface or legacy validators", () => {
  for (const surface of ["oss", "studio"] as const) assert.throws(() => assertExecutableContract(scenario, surface), /not supported yet/);
  for (const validator of [validateConversationDefinition, validateSuite, validateWorkflowCase]) {
    assert.throws(() => validator(scenario), /not executable/);
    assert.throws(() => validator({ version: 2 }), /unsupported version/);
  }
  assert.equal(EVALUATION_CAPABILITIES.find(c => c.id === "branching-scenario")?.studio, "available");
});
test("legacy inputs retain weights, thresholds and contents", () => {
  const conversation = conversationExample();
  const rag = { version: 1, name: "legacy", cases: [{ id: "a", question: "Unknown?", answerable: false }] };
  const workflow = { version: 1, name: "legacy", turns: [{ message: "Hi" }], checks: { L4: { requireClaim: true } } };
  for (const [value, validator] of [[conversation, validateConversationDefinition], [rag, validateSuite], [workflow, validateWorkflowCase]] as const) {
    const before = JSON.stringify(value); validator(value); assert.equal(JSON.stringify(value), before);
  }
});
test("contract CLI exposes capabilities without a provider or database", () => {
  const run = spawnSync(process.execPath, ["--import", "tsx", fileURLToPath(new URL("./contract-cli.ts", import.meta.url)), "capabilities"],
    { encoding: "utf8", env: { PATH: process.env.PATH }, timeout: 15000 });
  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(JSON.parse(run.stdout), EVALUATION_CAPABILITIES);
});
