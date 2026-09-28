import { mkdir, readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import http from "node:http";
import { resolve } from "node:path";

const workspace = resolve(import.meta.dirname, "..");
const envText = await readFile(resolve(workspace, ".env"), "utf8").catch(() => "");
const fileEnv = Object.fromEntries(envText
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith("#") && line.includes("="))
  .map((line) => {
    const separator = line.indexOf("=");
    return [line.slice(0, separator).trim(), line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "")];
  }));
const apiKey = (process.env.HUMANLY_API_KEY ?? fileEnv.HUMANLY_API_KEY ?? "").trim();
const port = process.env.HUMANLY_PORT ?? fileEnv.HUMANLY_PORT ?? "5000";
const baseUrl = (process.env.HUMANLY_BASE_URL ?? `http://localhost:${port}`).replace(/\/$/, "");
const composeFiles = ["-f", "docker-compose.yml", "-f", "docker-compose.smoke.yml"];

if (!apiKey) {
  throw new Error("HUMANLY_API_KEY is required. Copy .env.example to .env and set a long random value.");
}

const sleep = (milliseconds) => new Promise((resolveSleep) => setTimeout(resolveSleep, milliseconds));

function run(command, args) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, {
      cwd: workspace,
      env: { ...fileEnv, ...process.env },
      stdio: "inherit",
    });
    child.on("error", rejectRun);
    child.on("close", (code) => code === 0
      ? resolveRun()
      : rejectRun(new Error(`${command} ${args.join(" ")} exited with ${code}`)));
  });
}

async function api(method, path, body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`${method} ${path} failed (${response.status}): ${data.error ?? "unknown error"}`);
  }
  return data;
}

async function waitForHealth() {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    try {
      const health = await new Promise((resolveHealth, rejectHealth) => {
        const request = http.get(`${baseUrl}/health`, (response) => {
          let body = "";
          response.setEncoding("utf8");
          response.on("data", (chunk) => body += chunk);
          response.on("end", () => {
            if (response.statusCode !== 200) {
              rejectHealth(new Error(`Health returned HTTP ${response.statusCode}`));
              return;
            }
            try {
              resolveHealth(JSON.parse(body));
            } catch (error) {
              rejectHealth(error);
            }
          });
        });
        request.setTimeout(2_000, () => request.destroy(new Error("Health request timed out")));
        request.on("error", rejectHealth);
      });
      if (health.ready === true) return;
    } catch {
      // The stack is still starting.
    }
    await sleep(1_000);
  }
  throw new Error(`Timed out waiting for ${baseUrl}/health`);
}

async function waitForReport(runId) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const run = await api("GET", `/v1/runs/${runId}`);
    if (run.status === "completed") return api("GET", `/v1/runs/${runId}/report`);
    if (run.status === "failed" || run.status === "cancelled") {
      throw new Error(`Run ${runId} ended with ${run.status}`);
    }
    await sleep(250);
  }
  throw new Error(`Timed out waiting for run ${runId}`);
}

console.log("Starting Humanly OSS and the included deterministic demo agent...");
await run("docker", ["compose", ...composeFiles, "up", "-d", "--build"]);
await waitForHealth();

const agent = await api("POST", "/v1/agents", { name: "Humanly demo agent" });
const connector = await api("POST", "/v1/connectors", {
  name: "Included demo connector",
  agentId: agent.id,
  endpointUrl: "http://smoke-agent:3001",
});

const passingSuite = await api("POST", "/v1/suites", {
  name: "Demo baseline suite",
  agentId: agent.id,
  connectorId: connector.id,
  testGoal: "Reply with a customer greeting.",
});
const passingRun = await api("POST", "/v1/runs", { suiteId: passingSuite.id });
const passingReport = await waitForReport(passingRun.id);
if (passingReport.overallScore !== 1) throw new Error("The baseline demo run did not pass");

const baseline = await api("POST", "/v1/baselines", {
  name: "Demo passing baseline",
  runId: passingRun.id,
  threshold: 0,
});
const failingSuite = await api("POST", "/v1/suites", {
  name: "Demo regression suite",
  agentId: agent.id,
  connectorId: connector.id,
  testGoal: "[DEMO_FAIL] Return an intentionally empty response.",
});
const failingRun = await api("POST", "/v1/runs", {
  suiteId: failingSuite.id,
  baselineId: baseline.id,
  label: "intentional-regression",
});
const regressionReport = await waitForReport(failingRun.id);
if (regressionReport.overallScore !== 0 || regressionReport.baselineBreach !== true) {
  throw new Error("The demo regression did not produce the expected failed check and baseline breach");
}

const outputDirectory = resolve(workspace, "demo-output");
await mkdir(outputDirectory, { recursive: true });
await writeFile(
  resolve(outputDirectory, "report.json"),
  `${JSON.stringify({ baseline, passingReport, regressionReport }, null, 2)}\n`,
);

console.log("");
console.log("Humanly OSS demo completed.");
console.log(`Baseline score: ${passingReport.overallScore}`);
console.log(`Regression score: ${regressionReport.overallScore}`);
console.log(`Baseline breached: ${regressionReport.baselineBreach}`);
console.log("Failed check: non_empty_response");
console.log("Report: demo-output/report.json");