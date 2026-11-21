import test from "node:test";
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {mkdtemp, rm, readFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {walkthrough} from "./behavioural-demo.js";

test("recorded walkthrough gates control, fault and missing evidence", async () => {
  const folder = await mkdtemp(join(tmpdir(), "humanly-demo-"));
  try { assert.equal((await walkthrough(folder)).length, 3); }
  finally { await rm(folder, {recursive: true, force: true}); }
});

test("real LangGraph endpoint uses the same supported CLI and gates", async () => {
  const folder = await mkdtemp(join(tmpdir(), "humanly-langgraph-"));
  const isolatedPath = process.env.HUMANLY_STARTER_PYTHONPATH;
  const child = spawn("python", [...(isolatedPath ? ["-S"] : []), "examples/langgraph/agent.py", "--port", "0"], {
    env: {PATH: process.env.PATH, HOME: process.env.HOME, PYTHONUNBUFFERED: "1", ...(isolatedPath ? {PYTHONPATH: isolatedPath} : {})},
    stdio: ["ignore", "pipe", "pipe"],
  });
  try {
    const base = await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(Error("LangGraph startup timeout")), 15000);
      child.once("error", reject);
      child.once("exit", code => {clearTimeout(timer); reject(Error(`LangGraph exited ${code}`));});
      child.stdout.on("data", data => {
        const match = String(data).match(/Ready (http:\/\/127\.0\.0\.1:\d+)/);
        if (match) {clearTimeout(timer); resolve(match[1]);}
      });
    });
    await walkthrough(folder, base);
    const report = JSON.parse(await readFile(join(folder, "faulty.json"), "utf8"));
    assert.equal(report.conversations[0].workflow.status, "fail");
    assert.equal(report.conversations[0].evidence.events.find((e: any) => e.type === "outcome").status, "failure");
    assert.equal((await fetch(base + "/agent/control", {method: "POST", body: "{}"})).status, 400);
  } finally { child.kill(); await rm(folder, {recursive: true, force: true}); }
});
