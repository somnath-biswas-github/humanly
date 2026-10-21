import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { postJsonToConnector } from "./connector-http.js";
import { draftPersonaRag, approvePersonaRagDraft, generatePersonaRag, reviewPersonaRagCandidate } from "./persona-rag.js";
import { validateSuite } from "./rag-contract.js";
import { runRagSuite } from "./rag.js";
import { ragDraftHandler } from "./rag-routes.js";

const config = {
  name: "Representative refund questions", personas: [
    { name: "New customer", description: "Needs a simple explanation", questionTemplate: "I'm new. Please explain {{topic}} simply." },
    { name: "Experienced customer", description: "Asks about exceptions", questionTemplate: "What are the exceptions to {{topic}}?" },
  ], topics: [{ subject: "refund eligibility", criteria: ["referenceCorrectness" as const] }],
  thresholds: { referenceCorrectness: 95 },
};
function approved() {
  const draft = draftPersonaRag(config);
  draft.candidates.forEach(c => { c.review = { reviewer: "QA reviewer", referenceSource: "Approved refund policy",
    case: { id: c.id, question: c.question, answerable: true, referenceAnswer: "Private reviewer-only refund policy" } }; });
  return approvePersonaRagDraft(draft);
}
test("personas alter actual questions; drafting is not executable reference truth", () => {
  const draft = draftPersonaRag(config);
  assert.match(draft.candidates[0].question, /I'm new/);
  assert.match(draft.candidates[1].question, /exceptions/);
  assert.ok(!JSON.stringify(draft).includes("referenceAnswer"));
  assert.throws(() => validateSuite(draft));
  assert.throws(() => approvePersonaRagDraft(draft), /review/);
  assert.throws(() => draftPersonaRag({ ...config, personas: Array(21).fill(config.personas[0]) }));
  assert.throws(() => draftPersonaRag({ ...config, topics: [{ subject: "refunds", criteria: ["invented"] }] }));
});
test("review requires independent references; approved content changes invalidate approval", () => {
  const suite = approved(); validateSuite(suite);
  assert.equal(suite.thresholds?.referenceCorrectness, 95);
  suite.cases[0].question = "Changed question";
  assert.throws(() => validateSuite(suite), /review/);
  const referenceEdit = approved(); referenceEdit.cases[0].referenceAnswer = "Changed truth";
  assert.throws(() => validateSuite(referenceEdit), /review/);
  assert.throws(() => reviewPersonaRagCandidate(draftPersonaRag(config).candidates[0],
    { id: "x", question: "Question?", answerable: true }, "Reviewer", "Policy"), /reference/);
});
test("configured persona -> actual connector question -> criteria -> report; references stay evaluator-only", async () => {
  const suite = approved(); const sent: string[] = [];
  const received: unknown[] = [];
  const server = createServer(async (req, res) => {
    let body = ""; for await (const chunk of req) body += chunk;
    received.push(JSON.parse(body));
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ answer: "A controlled answer",
      retrievedChunks: [{ id: "public-source", content: "Agent-visible policy excerpt" }],
      citations: [{ id: "public-source" }] }));
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  try {
  const address = server.address() as { port: number };
  const report = await runRagSuite({ suite, runId: "persona-journey",
    invoke: async request => {
      assert.ok(!JSON.stringify(request).includes("Private reviewer"));
      assert.ok(!JSON.stringify(request).includes("QA reviewer"));
      sent.push(request.message);
      const response = await postJsonToConnector({ endpointUrl: `http://127.0.0.1:${address.port}/chat`,
        body: JSON.stringify(request), headers: { "content-type": "application/json" },
        timeoutMs: 3000, allowPrivate: true });
      assert.equal(response.ok, true);
      return JSON.parse(response.body);
    },
    judge: async input => {
      assert.equal(input.case.referenceAnswer, "Private reviewer-only refund policy");
      const good = { score: 100, explanation: "Controlled fixture", findings: [] };
      return { assessment: { expectedFactCoverage: good, referenceCorrectness: { ...good, score: 90 },
        prohibitedClaims: good, answerHandling: { ...good, responseKind: "substantive_answer" },
        groundedness: good, citations: good } };
    },
  });
  assert.deepEqual(sent, suite.cases.map(c => c.question));
  assert.equal(received.length, 2);
  assert.ok(!JSON.stringify(received).includes("Private reviewer"));
  assert.ok(!JSON.stringify(received).includes("QA reviewer"));
  assert.equal(report.status, "fail"); // 90 fails the developer's 95 threshold.
  assert.equal(report.suite.cases[0].provenance?.persona.name, "New customer");
  assert.equal(report.coveragePlan.length, 2);
  assert.equal(report.coveragePlan[0].targets[0].assessmentState, "available");
  assert.match(report.coveragePlan[0].limitation, /do not prove/);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});
test("model-assisted drafting uses personas, tracks usage and still requires review", async () => {
  let calls = 0;
  const draft = await generatePersonaRag(config, async input => {
    assert.equal(input.purpose, "simulate"); if (input.purpose !== "simulate") throw Error();
    assert.ok(!JSON.stringify(input).includes("referenceAnswer"));
    calls++;
    return { output: { done: false, message: `${input.persona.name}: how do refunds work?` },
      usage: { model: "fixture", promptTokens: 4, completionTokens: 3, totalTokens: 7 } };
  });
  assert.equal(calls, 2); assert.equal(draft.generationUsage?.length, 2);
  assert.equal(draft.candidates[0].generation, "model");
  assert.throws(() => approvePersonaRagDraft(draft), /review/);
  await assert.rejects(generatePersonaRag(config, async () => ({
    output: { done: false, message: "?" }, usage: { model: "fixture", promptTokens: 5, completionTokens: 5, totalTokens: 10 },
  }), 1), /budget/);
});
test("API draft and approve do not invoke agents, providers or persistence", () => {
  let status = 200; let result: any;
  const res: any = { status: (s: number) => { status = s; return res; }, json: (v: any) => { result = v; } };
  ragDraftHandler()({ body: config } as any, res, () => {});
  assert.equal(status, 200); assert.equal(result.kind, "persona-rag-draft");
  ragDraftHandler(true)({ body: result } as any, res, () => {});
  assert.equal(status, 400); assert.match(result.error, /review/);
});
test("CLI draft, explicit review and approval work without provider credentials", async () => {
  const dir = await mkdtemp(join(tmpdir(), "persona-rag-"));
  try {
    const source = join(dir, "config.json"), draftFile = join(dir, "draft.json"), suiteFile = join(dir, "suite.json");
    await writeFile(source, JSON.stringify(config));
    const run = (args: string[]) => spawnSync(process.execPath, ["--import", "tsx", "src/rag-cli.ts", ...args],
      { env: { PATH: process.env.PATH, NODE_ENV: "test", DOTENV_CONFIG_PATH: join(dir, "absent.env") }, encoding: "utf8" });
    assert.equal(run(["draft", source, draftFile]).status, 0);
    assert.equal(run(["approve", draftFile, suiteFile]).status, 2);
    const draft = JSON.parse(await readFile(draftFile, "utf8"));
    for (const c of draft.candidates) c.review = { reviewer: "Reviewer", referenceSource: "Policy",
      case: { id: c.id, question: c.question, answerable: false } };
    await writeFile(draftFile, JSON.stringify(draft));
    const result = run(["approve", draftFile, suiteFile]);
    assert.equal(result.status, 0, result.stderr);
    validateSuite(JSON.parse(await readFile(suiteFile, "utf8")));
  } finally { await rm(dir, { recursive: true, force: true }); }
});
