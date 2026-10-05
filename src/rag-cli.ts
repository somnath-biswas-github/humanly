import "dotenv/config";
import { readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { runRagSuite } from "./rag.js";
import { configuredRagJudge } from "./rag-judge.js";
import { ragExample } from "./rag-example.js";
import { postJsonToConnector } from "./connector-http.js";

async function main() {
  const [mode, path, target, output] = process.argv.slice(2);
  if (mode === "example") {
    if (path && !["fixed", "faulty"].includes(path)) throw new Error("Example must be fixed or faulty");
    console.log(JSON.stringify(ragExample(path === "faulty"), null, 2));
    return;
  }
  if (!path || !["evaluate", "run"].includes(mode) || (mode === "run" && !target)) {
    throw new Error("Usage: rag example [fixed|faulty] | evaluate bundle.json [report.json] | run suite.json https://agent/chat [report.json]");
  }
  const input = JSON.parse(await readFile(path, "utf8"));
  const judge = configuredRagJudge();
  const report = await runRagSuite({
    suite: mode === "run" ? input : input.suite, judge, runId: randomUUID(),
    ...(mode === "evaluate" ? { observations: input.observations } : {
      invoke: async (request: unknown) => {
        const response = await postJsonToConnector({
          endpointUrl: target, body: JSON.stringify(request),
          headers: { "content-type": "application/json", ...(process.env.RAG_AGENT_TOKEN ? { authorization: `Bearer ${process.env.RAG_AGENT_TOKEN}` } : {}) },
          timeoutMs: 30000, allowPrivate: process.env.HUMANLY_ALLOW_PRIVATE_CONNECTORS === "true",
        });
        if (!response.ok) throw new Error(`Agent HTTP ${response.status}`);
        return JSON.parse(response.body);
      },
    }),
  });
  await writeFile((mode === "evaluate" ? target : output) ?? "rag-report.json", JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.status === "pass" ? 0 : report.status === "fail" ? 1 : 2;
}
main().catch(error => { console.error(error.message); process.exitCode = 2; });
