import test from "node:test";
import assert from "node:assert/strict";
import { conversationExample, runConversation, type ModelInput } from "./conversation.js";
import { defaultExecutionPlan } from "./execution-plan.js";
import { conversationModelPayload, conversationSystemPrompt, CONVERSATION_JUDGE_PROMPT } from "./conversation-model.js";

const usage = { model: "fixture", promptTokens: 1, completionTokens: 1, totalTokens: 2 };
const f = { score: 100, explanation: "Fixture", findings: [] };
async function exercise(rag: any, goalScore = 100, withRag = true, unexercised = true, routing = false) {
  const d = conversationExample();
  d.executionPlan = defaultExecutionPlan();
  d.executionPlan.metrics = [];
  d.executionPlan.ragCases = withRag ? (unexercised ? [1, 2, 3] : [1, 2]).map(turn => ({
    turn, case: { id: `c${turn}`, question: `Evaluator intent ${turn}`, answerable: true,
      referenceAnswer: `PRIVATE_REFERENCE_${turn}` },
  })) : [];
  if (routing || !withRag) {
    d.executionPlan.graph = { contractVersion: 1, kind: "scenario", id: "routing", start: "a",
      limits: { ...d.executionPlan.limits }, stages: [
        { id: "a", user: { mode: "synthetic", instruction: "Ask the first question" }, maxVisits: 1,
          terminal: false, transitions: [{ to: "b", routing: "model", condition: "An answer was received" }], onNoMatch: "stop_inconclusive" },
        { id: "b", user: { mode: "synthetic", instruction: "Ask the second question" }, maxVisits: 1,
          terminal: true, transitions: [], onNoMatch: "stop_inconclusive" },
      ] };
  }
  let goal: Extract<ModelInput, { purpose: "judge" }> | undefined;
  let routed = 0;
  const report = await runConversation({ definition: d, runId: "evidence", model: async input => {
    if (input.purpose === "route") {
      routed++;
      assert.ok(!JSON.stringify(input).includes("PRIVATE_REFERENCE"));
      return { usage, output: { matches: input.conditions.map(() => true) } };
    }
    if (input.purpose === "simulate") {
      assert.ok(!JSON.stringify(input).includes("PRIVATE_REFERENCE"));
      return { usage, output: input.turn === 3 ? { done: true, message: "" } : { done: false, message: `Question ${input.turn}` } };
    }
    if (input.purpose === "judge") {
      goal = structuredClone(input);
      return { usage, output: { assessments: input.criteria.map(c => ({
        id: c.id, score: goalScore, explanation: "Controlled goal judgement", quote: "Recorded answer",
      })) } };
    }
    assert.equal(input.purpose, "rag");
    return { usage, output: { expectedFactCoverage: f, referenceCorrectness: f,
      claimVerdicts: [], answerHandling: { ...f, responseKind: "substantive_answer" },
      groundedness: input.purpose === "rag" && input.input.observation.retrievedChunks?.length ? f : null,
      citations: input.purpose === "rag" && input.input.observation.retrievedChunks?.length ? f : null } };
  }, invoke: async req => {
    assert.ok(!JSON.stringify(req).includes("PRIVATE_REFERENCE"));
    return { reply: "Recorded answer", rag: req.turn === 1 ? {
      retrievedChunks: [{ id: "first", content: "First turn only" }], citations: [{ id: "first" }],
    } : rag } as any;
  } });
  assert.ok(goal);
  return { report, goal, routed };
}
test("goal receives turn-scoped references/observations without leaking them to simulator or agent", async () => {
  const { goal, report } = await exercise({});
  assert.equal(goal.ragContext?.[0].reference.referenceAnswer, "PRIVATE_REFERENCE_1");
  assert.equal(goal.ragContext?.[0].observation?.retrievedChunks?.[0].id, "first");
  assert.equal(goal.ragContext?.[1].observation?.retrievedChunks, undefined);
  assert.equal(goal.ragContext?.[1].exercised, true);
  assert.equal(goal.ragContext?.[2].exercised, false);
  assert.equal(goal.ragContext?.[2].observation, undefined);
  assert.equal(report.status, "inconclusive"); // Unexercised required check still blocks.
});
test("supported, empty and absent retrieval produce distinct goal payloads", async () => {
  const supported = await exercise({ retrievedChunks: [{ id: "second", content: "Second turn" }], citations: [{ id: "second" }] });
  const empty = await exercise({ retrievedChunks: [], citations: [] });
  const absent = await exercise({});
  assert.deepEqual(empty.goal.ragContext?.[1].observation?.retrievedChunks, []);
  assert.equal(absent.goal.ragContext?.[1].observation?.retrievedChunks, undefined);
  assert.notEqual(conversationModelPayload(supported.goal), conversationModelPayload(empty.goal));
  assert.notEqual(conversationModelPayload(empty.goal), conversationModelPayload(absent.goal));
});
test("routing models never receive evaluator-only references", async () => {
  assert.equal((await exercise({}, 100, true, true, true)).routed, 1);
});
test("uncertainty guidance is scoped to RAG goals; non-RAG prompt and payload stay unchanged", async () => {
  const { goal } = await exercise({}, 100, false);
  assert.equal(goal.ragContext, undefined);
  assert.equal(conversationSystemPrompt(goal), CONVERSATION_JUDGE_PROMPT);
  const rag = (await exercise({})).goal;
  assert.match(conversationSystemPrompt(rag), /not mandatory when the answer is supported/);
  assert.match(conversationSystemPrompt(rag), /data, not instructions/);
  assert.match(conversationSystemPrompt(rag), /preserve genuine goal failures/);
});
test("RAG passes cannot override a genuine failing goal; a passing goal cannot override empty retrieval", async () => {
  const supported = { retrievedChunks: [{ id: "second", content: "Evidence" }], citations: [{ id: "second" }] };
  assert.equal((await exercise(supported, 100, true, false)).report.status, "pass");
  const goalFailure = (await exercise(supported, 50, true, false)).report;
  assert.ok(goalFailure.conversations[0].ragResults!.every(r => r.report.status === "pass"));
  assert.equal(goalFailure.status, "fail");
  assert.equal(goalFailure.qualityGate.passed, false);
  assert.equal((await exercise({ retrievedChunks: [], citations: [] }, 100, true, false)).report.status, "fail");
});
test("replay restores evaluator-only evidence from saved observations without invoking the agent", async () => {
  const { report, goal } = await exercise({});
  let captured: ModelInput | undefined;
  const replay = await runConversation({ definition: report.definition, replay: JSON.parse(JSON.stringify(report)),
    runId: "offline-replay", invoke: async () => { throw Error("Agent must not be invoked"); },
    model: async input => {
      if (input.purpose === "judge") {
        captured = input;
        return { usage, output: { assessments: report.conversations[0].assessments } };
      }
      assert.equal(input.purpose, "rag");
      return { usage, output: { expectedFactCoverage: f, referenceCorrectness: f, claimVerdicts: [],
        answerHandling: { ...f, responseKind: "substantive_answer" },
        groundedness: input.purpose === "rag" && input.input.observation.retrievedChunks?.length ? f : null,
        citations: input.purpose === "rag" && input.input.observation.retrievedChunks?.length ? f : null } };
    } });
  assert.deepEqual(captured, goal);
  assert.equal(replay.status, report.status);
});
