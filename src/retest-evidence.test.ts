import test from "node:test";
import assert from "node:assert/strict";
import { conversationExample, runConversation, type Model } from "./conversation.js";
import { defaultExecutionPlan } from "./execution-plan.js";

const question = "What is the return window for the UK and for the US?";
const correct = "UK: 14 days. US: 30 days.";
const usage = { model: "fixture", promptTokens: 1, completionTokens: 1, totalTokens: 2 };
const finding = { score: 100, explanation: "Controlled fixture", findings: [] };
function definition(answerable = true) {
  const d = conversationExample();
  const plan = defaultExecutionPlan();
  plan.graph = { contractVersion: 1, kind: "scenario", id: "fixed", start: "ask",
    limits: { ...plan.limits }, stages: [{ id: "ask", user: { mode: "scripted", instruction: question },
      terminal: true, maxVisits: 1, onNoMatch: "stop_inconclusive", transitions: [] }] };
  plan.metrics = [];
  plan.ragCases = [{ turn: 1, case: { id: "returns", question, answerable,
    ...(answerable ? { referenceAnswer: correct } : {}) } }];
  d.executionPlan = plan;
  return d;
}
function judge(answer: string, kind = "substantive_answer", fault?: string): Model {
  return async input => {
    if (input.purpose === "judge") {
      if (fault === "before-rag") throw new Error("private-provider-details");
      return { usage, output: { assessments: input.criteria.map(c =>
        ({ id: c.id, score: 100, explanation: "Goal only", quote: answer })) } };
    }
    assert.equal(input.purpose, "rag");
    if (input.purpose !== "rag") throw new Error("Unexpected model call");
    assert.equal(input.messages[0].content, question);
    assert.equal(input.input.observation.answer, answer);
    if (fault === "during-rag") throw new Error("private-provider-details");
    const score = answer === correct ? 100 : 0;
    return { usage, output: { expectedFactCoverage: finding,
      referenceCorrectness: { ...finding, score }, claimVerdicts: [],
      answerHandling: { ...finding, responseKind: kind },
      groundedness: input.input.observation.retrievedChunks?.length ? { ...finding, score } : null,
      citations: input.input.observation.retrievedChunks?.length ? finding : null } };
  };
}
const evidence = { retrievedChunks: [{ id: "returns", content: correct }], citations: [{ id: "returns" }] };

for (const fault of ["before-rag", "during-rag"]) {
  test(`recorded evidence survives ${fault} failure and JSON export`, async () => {
    const report = await runConversation({ definition: definition(), runId: fault,
      model: judge(correct, "substantive_answer", fault), invoke: async req => {
        assert.equal(req.message, question);
        return { reply: correct, rag: evidence } as any;
      } });
    const saved = JSON.parse(JSON.stringify(report));
    assert.equal(saved.status, "inconclusive");
    assert.equal(saved.qualityGate.passed, false);
    assert.equal(saved.conversations[0].ragResults[0].report.observation.answer, correct);
    assert.deepEqual(saved.conversations[0].ragResults[0].report.observation.retrievedChunks, evidence.retrievedChunks);
    assert.ok(!JSON.stringify(saved).includes("private-provider-details"));
  });
}
test("invalid retrieval preserves transcript without pretending to have valid evidence", async () => {
  const r = await runConversation({ definition: definition(), runId: "invalid", model: judge(correct),
    invoke: async () => ({ reply: correct, rag: { retrievedChunks: "invalid" } } as any) });
  assert.equal(r.status, "inconclusive");
  assert.equal(r.conversations[0].messages[1].content, correct);
  assert.equal(r.conversations[0].ragResults![0].report.issues![0].code, "observation_not_captured");
  assert.equal(r.conversations[0].ragResults![0].report.observation, undefined);
});
test("metric failure preserves goal 100 and observation while blocking the gate", async () => {
  const d = definition();
  d.executionPlan!.metrics = defaultExecutionPlan().metrics;
  const base = judge(correct);
  const r = await runConversation({ definition: d, runId: "metric-failure",
    model: async (input, limits) => {
      if (input.purpose === "metric") throw Error("private-provider-details");
      return base(input, limits);
    }, invoke: async () => ({ reply: correct, rag: evidence } as any) });
  assert.equal(r.conversations[0].score, 100);
  assert.equal(r.status, "inconclusive");
  assert.match(r.conversations[0].error!, /Evaluation stopped at metric/);
  assert.equal(r.conversations[0].ragResults![0].report.observation!.answer, correct);
  assert.equal(r.conversations[0].ragResults![0].report.issues![0].code, "evaluation_not_reached");
});
for (const c of [
  { name: "correct grounded answer", answer: correct, rag: evidence, expected: "pass", answerable: true },
  { name: "fabricated windows", answer: "Both countries: 365 days.", rag: evidence, expected: "fail", answerable: true },
  { name: "confident empty retrieval", answer: "Both countries: 365 days.", rag: { retrievedChunks: [], citations: [] }, expected: "fail", answerable: false },
  { name: "honest refusal", answer: "I do not know. Please contact support.", kind: "insufficient_evidence",
    rag: { retrievedChunks: [], citations: [] }, expected: "pass", answerable: false },
  { name: "disclaimer plus guess", answer: "I do not know, but probably 365 days.", kind: "disclaimer_with_answer",
    rag: { retrievedChunks: [], citations: [] }, expected: "fail", answerable: false },
  { name: "missing retrieval telemetry", answer: correct, rag: {}, expected: "inconclusive", answerable: true },
]) {
  test(`deterministic conversation safety: ${c.name}`, async () => {
    let calls = 0;
    const r = await runConversation({ definition: definition(c.answerable), runId: c.name,
      model: judge(c.answer, c.kind), invoke: async req => {
        calls++; assert.equal(req.message, question);
        return { reply: c.answer, rag: c.rag } as any;
      } });
    assert.equal(calls, 1);
    assert.equal(r.conversations[0].score, 100); // Goal score never overrides RAG.
    assert.equal(r.status, c.expected);
    assert.equal(r.qualityGate.passed, c.expected === "pass");
    assert.deepEqual(r.conversations[0].ragResults![0].report.observation,
      { answer: c.answer, ...c.rag });
  });
}
