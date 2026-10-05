import assert from "node:assert/strict";
import test from "node:test";
import http from "node:http";
import { once } from "node:events";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import express from "express";
import { ragExample } from "./rag-example.js";
import { evaluateRag, observationFromReply, runRagSuite } from "./rag.js";
import { validateSuite, type Assessment, type Judge } from "./rag-contract.js";
import { createRagJudge, judgeSchema } from "./rag-judge.js";
import { ragRunHandler } from "./rag-routes.js";

function assessment(): Assessment {
  const finding = () => ({ score: 100, explanation: "Controlled test assessment.", findings: [] as string[] });
  return {
    expectedFactCoverage: finding(), referenceCorrectness: finding(), prohibitedClaims: finding(),
    answerHandling: { ...finding(), responseKind: "substantive_answer" },
    groundedness: finding(), citations: finding(),
  };
}
const fixedJudge: Judge = async () => ({ assessment: assessment() });
const example = () => ragExample();
const evaluate = (judge: Judge = fixedJudge) => {
  const { suite, observations } = example();
  return evaluateRag(suite.cases[0], observations.electronics, judge);
};

test("standalone RAG passes a complete fixed control and reports metric thresholds", async () => {
  const result = await evaluate();
  assert.equal(result.status, "pass");
  assert.equal(result.checks.retrievalRecall?.score, 100);
  assert.equal(result.checks.retrievalRecall?.threshold, 80);
  assert.equal(result.checks.citationIdentity?.score, 100);
});

test("missing source fails recall even when semantic answer scores pass", async () => {
  const { suite, observations } = ragExample(true);
  const result = await evaluateRag(suite.cases[0], observations.electronics, fixedJudge);
  assert.equal(result.status, "fail");
  assert.equal(result.checks.retrievalRecall?.score, 50);
  assert.deepEqual(result.missingExpectedSourceIds, ["electronics-exception"]);
  assert.deepEqual(result.checks.expectedFactCoverage?.findings, []);
});

test("semantic faults block release and preserve missing facts separately from source IDs", async () => {
  for (const key of ["expectedFactCoverage", "referenceCorrectness", "groundedness", "citations", "prohibitedClaims"] as const) {
    const result = await evaluate(async () => {
      const a = assessment(); a[key] = { score: 0, explanation: "Known faulty control.", findings: ["Missing exception"] };
      return { assessment: a };
    });
    assert.equal(result.status, "fail", key);
    assert.ok(result.failures.includes(key));
    assert.deepEqual(result.missingExpectedSourceIds, []);
    assert.deepEqual(result.checks[key]?.findings, ["Missing exception"]);
  }
});

test("omitted evidence is inconclusive; explicitly empty evidence has zero recall/grounding", async () => {
  const { suite, observations } = example();
  const emptyJudge: Judge = async () => ({ assessment: { ...assessment(), groundedness: null, citations: null } });
  const omitted = await evaluateRag(suite.cases[0], { answer: "Answer" }, emptyJudge);
  assert.equal(omitted.status, "inconclusive");
  assert.equal(omitted.checks.retrievalRecall?.score, null);
  const empty = await evaluateRag(suite.cases[0], { answer: "Answer", retrievedChunks: [], citations: [] }, emptyJudge);
  assert.equal(empty.status, "fail");
  assert.equal(empty.checks.retrievalRecall?.score, 0);
  assert.equal(empty.checks.groundedness?.score, 0);
  const noCitations = await evaluateRag(suite.cases[0], { ...observations.electronics, citations: undefined }, fixedJudge);
  assert.equal(noCitations.status, "inconclusive");
});

test("valid uncertainty is not an incorrect factual denial and content checks become N/A", async () => {
  const c = { id: "unknown", question: "Is an unknown product covered?", answerable: false };
  for (const kind of ["insufficient_evidence", "explicit_refusal", "substantive_answer", "disclaimer_with_answer"] as const) {
    const result = await evaluateRag(c, { answer: "Controlled response" }, async () => ({
      assessment: { ...assessment(), groundedness: null, citations: null,
        answerHandling: { ...assessment().answerHandling, responseKind: kind } },
    }));
    if (kind === "insufficient_evidence" || kind === "explicit_refusal") {
      assert.equal(result.status, "pass");
      assert.equal(result.checks.groundedness?.state, "not_applicable");
    } else {
      assert.notEqual(result.status, "pass");
      assert.ok(result.failures.includes("answerHandling"));
    }
  }
});

test("correct refusal does not bypass independently required source recall", async () => {
  const result = await evaluateRag({ id: "unknown", question: "Question", answerable: false, expectedChunkIds: ["required"] },
    { answer: "I cannot confirm", retrievedChunks: [], citations: [] }, async () => ({
      assessment: { ...assessment(), groundedness: null, citations: null,
        answerHandling: { ...assessment().answerHandling, responseKind: "insufficient_evidence" } },
    }));
  assert.equal(result.status, "fail");
  assert.ok(result.failures.includes("retrievalRecall"));
});

test("empty answers fail without spending a judge call", async () => {
  const { suite } = example();
  const result = await evaluateRag(suite.cases[0], { answer: " " }, async () => { throw new Error("Must not call"); });
  assert.equal(result.status, "fail");
  assert.ok(result.failures.includes("empty_answer"));
});

test("judge failure, out-of-range scores, invalid categories and missing evidence assessments block the gate", async () => {
  const bad: any[] = [
    null, { ...assessment(), groundedness: null },
    { ...assessment(), citations: { score: 100, explanation: "OK", findings: [{}] } },
    { ...assessment(), referenceCorrectness: { score: 101, explanation: "OK", findings: [] } },
    { ...assessment(), answerHandling: { ...assessment().answerHandling, responseKind: "yes" } },
  ];
  for (const a of bad) assert.equal((await evaluate(async () => ({ assessment: a }))).status, "inconclusive");
  const result = await evaluate(async () => { throw new Error("Bearer do-not-leak"); });
  assert.equal(result.status, "inconclusive");
  assert.ok(!JSON.stringify(result).includes("do-not-leak"));
});

test("dangling or ambiguous citation identities fail even if semantic judge scores pass", async () => {
  const { suite, observations } = example();
  for (const chunks of [observations.electronics.retrievedChunks!, [...observations.electronics.retrievedChunks!, observations.electronics.retrievedChunks![0]]]) {
    const result = await evaluateRag(suite.cases[0], {
      ...observations.electronics, retrievedChunks: chunks,
      citations: [{ documentId: "policy", chunkId: chunks.length === 2 ? "invented" : "returns" }],
    }, fixedJudge);
    assert.equal(result.status, "fail");
    assert.ok(result.failures.includes("citationIdentity"));
  }
});

test("validates suites and uses only percentage thresholds", () => {
  const { suite } = example();
  for (const invalid of [null, { ...suite, cases: [] }, { ...suite, cases: [suite.cases[0], suite.cases[0]] },
    { ...suite, thresholds: { groundedness: 101 } }, { ...suite, thresholds: { unknown: 50 } },
    { ...suite, cases: [{ id: "x", question: "Q", answerable: true }] }]) {
    assert.throws(() => validateSuite(invalid));
  }
});

test("live run isolates golden fields, uses fresh case sessions, and captures reply plus evidence", async () => {
  const { suite, observations } = example();
  const requests: any[] = [];
  const result = await runRagSuite({ suite, runId: "unique-run", judge: fixedJudge, invoke: async request => {
    requests.push(request);
    return { reply: observations.electronics.answer, rag: {
      retrievedChunks: observations.electronics.retrievedChunks, citations: observations.electronics.citations,
    } };
  } });
  assert.deepEqual(requests, [{ message: suite.cases[0].question, conversationId: "unique-run_electronics", history: [] }]);
  assert.equal(result.qualityGate.passed, true);
  assert.equal(result.evidenceSource, "live_connector");
});

test("live evidence supports text and top-level aliases without hiding malformed rag data", () => {
  const observation = observationFromReply({ reply: "Answer", retrievedChunks: [{ id: "source", text: "Evidence" }], citations: [] });
  assert.equal(observation.retrievedChunks?.[0].content, "Evidence");
  assert.deepEqual(observation.citations, []);
  assert.throws(() => observationFromReply({ reply: "Answer", rag: [], retrievedChunks: [{ id: "source", text: "Evidence" }] }));
});

test("threshold overrides affect the gate while unavailable evidence remains inconclusive", async () => {
  const { suite, observations } = ragExample(true);
  const result = await evaluateRag(suite.cases[0], observations.electronics, fixedJudge, { retrievalRecall: 50 });
  assert.equal(result.status, "pass");
  const missing = await evaluateRag(suite.cases[0], { answer: "A" }, async () => ({
    assessment: { ...assessment(), groundedness: null, citations: null },
  }), { retrievalRecall: 0, groundedness: 0, citations: 0 });
  assert.equal(missing.status, "inconclusive");
});

test("missing/malformed observations and transport errors are inconclusive, not passes", async () => {
  const { suite } = example();
  for (const observations of [{}, { electronics: { answer: "A", retrievedChunks: [{}] } }]) {
    const result = await runRagSuite({ suite, observations: observations as any, judge: fixedJudge, runId: "x" });
    assert.equal(result.status, "inconclusive");
    assert.equal(result.qualityGate.passed, false);
  }
  const result = await runRagSuite({ suite, judge: fixedJudge, runId: "x", invoke: async () => { throw new Error("HTTP 500"); } });
  assert.equal(result.status, "inconclusive");
  assert.throws(() => observationFromReply({ reply: "A", rag: { retrievedChunks: [{ id: "source", content: "" }] } }));
  await assert.rejects(runRagSuite({ suite, judge: fixedJudge, runId: "x", observations: { unknown: { answer: "A" } } }));
});

async function listen(server: http.Server) {
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  return `http://127.0.0.1:${(server.address() as { port: number }).port}`;
}
async function close(server: http.Server) {
  server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve()));
}

test("RAG HTTP handler validates requests and persists the full fail-closed report", async () => {
  const app = express(); app.use(express.json());
  const saved: any[] = [];
  app.post("/v1/rag/runs", ragRunHandler({
    judge: () => fixedJudge, connector: async () => undefined,
    save: async report => { saved.push(report); },
  }));
  const server = http.createServer(app); const url = await listen(server);
  try {
    const call = (body: unknown) => fetch(url + "/v1/rag/runs", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    });
    assert.equal((await call({ suite: {} })).status, 400);
    assert.equal((await call({ ...example(), connectorId: "x" })).status, 400);
    assert.equal((await call({ suite: example().suite, connectorId: "missing" })).status, 404);
    const response = await call(example());
    assert.equal(response.status, 201);
    const report: any = await response.json();
    assert.equal(report.qualityGate.passed, true);
    assert.equal(saved[0].runId, report.runId);
    assert.equal(report.report.status, "pass");
    const missing: any = await (await call({ suite: example().suite, observations: {} })).json();
    assert.equal(missing.qualityGate.passed, false);
    assert.equal(missing.qualityGate.status, "inconclusive");
  } finally { await close(server); }
});

test("provider adapter and CLI run end-to-end against a controlled HTTP judge (not a live LLM)", async () => {
  const payloads: any[] = [];
  let providerMode = "normal";
  const judgeServer = http.createServer(async (req, res) => {
    let raw = ""; for await (const part of req) raw += part;
    const payload = JSON.parse(raw); payloads.push(payload);
    if (providerMode === "error") { res.writeHead(429); res.end("sensitive-provider-body"); return; }
    const input = JSON.parse(payload.messages[1].content);
    const a = assessment();
    if (input.observation.answer.startsWith("Yes")) {
      a.referenceCorrectness.score = 0;
      a.expectedFactCoverage = { score: 50, explanation: "Missing exception.", findings: ["Opened electronics exception"] };
    }
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: providerMode === "malformed" ? "{}" : JSON.stringify(a) } }],
      usage: { prompt_tokens: 20, completion_tokens: 30, total_tokens: 50 } }));
  });
  const url = await listen(judgeServer);
  const dir = await mkdtemp(join(tmpdir(), "oss-rag-"));
  const exec = promisify(execFile);
  try {
    const judge = createRagJudge({ baseUrl: url + "/v1", model: "fixture-judge", allowPrivate: true });
    const result = await evaluate(judge);
    assert.equal(result.status, "pass");
    assert.equal(result.judge?.usage?.totalTokens, 50);
    assert.equal(payloads[0].response_format.json_schema.strict, true);
    assert.deepEqual(payloads[0].response_format.json_schema.schema, judgeSchema(true));
    for (const faulty of [false, true]) {
      const bundle = join(dir, "bundle.json"), output = join(dir, "report.json");
      await writeFile(bundle, JSON.stringify(ragExample(faulty)));
      let code = 0;
      try {
        await exec(process.execPath, ["--import", "tsx", "src/rag-cli.ts", "evaluate", bundle, output], {
          env: { ...process.env, RAG_JUDGE_API_KEY: "", RAG_JUDGE_BASE_URL: url + "/v1", RAG_JUDGE_ALLOW_PRIVATE: "true", RAG_JUDGE_MODEL: "fixture-judge" },
        });
      } catch (e) { code = (e as any).code; }
      assert.equal(code, faulty ? 1 : 0);
      assert.equal(JSON.parse(await readFile(output, "utf8")).qualityGate.passed, !faulty);
    }
    providerMode = "malformed";
    const malformed = await evaluate(judge);
    assert.equal(malformed.status, "inconclusive");
    assert.ok(malformed.errors.includes("judge_invalid_assessment"));
    assert.equal(malformed.usage?.totalTokens, 50);
    providerMode = "error";
    const providerError = await evaluate(judge);
    assert.ok(providerError.errors.includes("judge_http_429"));
    assert.ok(!JSON.stringify(providerError).includes("sensitive-provider-body"));
    const errorBundle = join(dir, "error.json"), errorReport = join(dir, "error-report.json");
    await writeFile(errorBundle, JSON.stringify(example()));
    await assert.rejects(exec(process.execPath, ["--import", "tsx", "src/rag-cli.ts", "evaluate", errorBundle, errorReport], {
      env: { ...process.env, RAG_JUDGE_API_KEY: "", RAG_JUDGE_BASE_URL: url + "/v1", RAG_JUDGE_ALLOW_PRIVATE: "true" },
    }), (error: any) => error.code === 2);
    assert.equal(JSON.parse(await readFile(errorReport, "utf8")).qualityGate.passed, false);
    assert.throws(() => createRagJudge({ baseUrl: url, apiKey: "test" }), /HTTPS/);
    await assert.rejects(createRagJudge({ baseUrl: url.replace("http:", "https:"), apiKey: "test" })({
      case: example().suite.cases[0], observation: example().observations.electronics,
    }), /blocked|private|reserved/i);
  } finally { await close(judgeServer); await rm(dir, { recursive: true, force: true }); }
});
