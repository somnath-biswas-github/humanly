import {createServer} from "node:http";
import {once} from "node:events";
import {execFile} from "node:child_process";
import {promisify} from "node:util";
import {mkdir, readFile, writeFile} from "node:fs/promises";
import {resolve, dirname} from "node:path";
import {fileURLToPath} from "node:url";
import {createRequire} from "node:module";

const exec = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const recording = JSON.parse(await readFile(resolve(root, "examples/behaviour/recording.json"), "utf8"));

// No external provider or inherited credentials, even if the workspace has keys.
export async function walkthrough(output = resolve(root, "demo-output/behaviour"), agentBase?: string) {
  if (agentBase && !/^http:\/\/127\.0\.0\.1:\d+$/.test(agentBase)) throw Error("Fixture agent must be local");
  await mkdir(output, {recursive: true});
  const server = createServer(async (req, res) => {
    try {
      let raw = "";
      for await (const chunk of req) raw += chunk;
      const input = JSON.parse(raw);
      res.setHeader("content-type", "application/json");
      if (req.url?.startsWith("/agent/")) {
        const variant = req.url.split("/").at(-1);
        const turn = input.turn;
        const offset = (turn - 1) * 4;
        const status = recording.toolOutcome; // Recorded sandbox tool failure, no real refund.
        const claimed = variant === "faulty" ? "success" : status;
        res.end(JSON.stringify({
          reply: variant === "faulty" ? recording.faultyReply : recording.controlReply,
          ...(variant === "missing" ? {} : {workflow: {version: 1, source: "runtime", complete: true, events: [
            {seq: offset + 1, turn, type: "action", callId: `call-${turn}`, operationId: `refund-${turn}`, binding: {action: "refund", target: "demo-42", params: {}}},
            {seq: offset + 2, turn, type: "outcome", callId: `call-${turn}`, status},
            {seq: offset + 3, turn, type: "claim", operationId: `refund-${turn}`, status: claimed},
            {seq: offset + 4, turn, type: "end", status: "completed"},
          ]}}),
        }));
        return;
      }
      const content = JSON.parse(input.messages[1].content);
      const verdict = content.purpose === "simulate"
        ? {done: content.messages.length > 0, message: content.messages.length ? "" : recording.userMessage}
        : {assessments: content.criteria.map((criterion: {id: string}) => ({
          id: criterion.id, score: recording.judgeScore, explanation: recording.judgeExplanation, quote: "",
        }))};
      res.end(JSON.stringify({choices: [{finish_reason: "stop", message: {content: JSON.stringify(verdict)}}],
        usage: {prompt_tokens: 2, completion_tokens: 2, total_tokens: 4}}));
    } catch { res.statusCode = 400; res.end("{}"); }
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${(server.address() as import("node:net").AddressInfo).port}`;
  const env = {PATH: process.env.PATH, NODE_ENV: "test", DOTENV_CONFIG_PATH: resolve(output, "does-not-exist.env"),
    CONVERSATION_MODEL_BASE_URL: base, CONVERSATION_MODEL_ALLOW_PRIVATE: "true", HUMANLY_ALLOW_PRIVATE_CONNECTORS: "true"};
  const results = [];
  try {
    for (const [variant, expectedCode, expectedStatus] of [["control", 0, "pass"], ["faulty", 1, "fail"], ["missing", 2, "inconclusive"]] as const) {
      const reportPath = resolve(output, `${variant}.json`);
      let code = 0;
      try {
        await exec(process.execPath, [createRequire(import.meta.url).resolve("tsx/cli"),
          resolve(root, "src/conversation-cli.ts"), "run", resolve(root, "examples/behaviour/definition.json"),
          `${agentBase ?? base}/agent/${variant}`, reportPath], {cwd: output, env, timeout: 20000});
      } catch (error: any) {
        if (typeof error.code !== "number") throw error;
        code = error.code;
      }
      const report = JSON.parse(await readFile(reportPath, "utf8"));
      if (code !== expectedCode || report.status !== expectedStatus || report.qualityGate.passed !== (code === 0))
        throw Error(`Unexpected ${variant} gate: ${code}/${report.status}`);
      results.push({variant, code, status: report.status, findings: report.conversations[0].workflow.findings});
    }
    await writeFile(resolve(output, "walkthrough.json"), JSON.stringify({provenance: recording.provenance, results}, null, 2));
    console.log("Harness verification only; live judging unqualified.");
    console.table(results.map(({variant, code, status}) => ({variant, code, status})));
    return results;
  } finally { server.close(); server.closeAllConnections(); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  await walkthrough(undefined, process.argv[2]);
