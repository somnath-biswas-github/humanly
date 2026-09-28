import { access, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const workspace = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const baseUrl = (process.env.HUMANLY_BASE_URL ?? "http://localhost:5000").replace(/\/$/, "");
const apiKey = process.env.HUMANLY_API_KEY;
const npm = process.platform === "win32" ? "npm.cmd" : "npm";

if (!apiKey) throw new Error("HUMANLY_API_KEY is required for the self-hosted smoke test");

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function run(command, args, options = {}) {
  const { quiet = false, ...spawnOptions } = options;
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, {
      cwd: workspace,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
      ...spawnOptions,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      if (!quiet) process.stdout.write(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
      if (!quiet) process.stderr.write(chunk);
    });
    child.on("error", rejectRun);
    child.on("close", (code) => {
      if (code === 0) resolveRun({ stdout, stderr });
      else rejectRun(new Error(`${command} ${args.join(" ")} exited with ${code}\n${stderr}`));
    });
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
    throw new Error(`${method} ${path} failed (${response.status}): ${data.error ?? data.message ?? "unknown error"}`);
  }
  return data;
}

async function expectApiError(method, path, body, expectedStatus) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  assert(
    response.status === expectedStatus,
    `${method} ${path} returned ${response.status}, expected ${expectedStatus}: ${JSON.stringify(data)}`,
  );
}

async function waitForHealth() {
  const deadline = Date.now() + 120_000;
  let lastError = "no response";
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/health`);
      const health = await response.json();
      if (response.ok && health.ready === true) return;
      lastError = `status ${response.status}: ${JSON.stringify(health)}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await sleep(1_000);
  }
  throw new Error(`Timed out waiting for ${baseUrl}/health: ${lastError}`);
}

async function waitForReport(runId) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const run = await api("GET", `/v1/runs/${runId}`);
    if (run.status === "completed") return api("GET", `/v1/runs/${runId}/report`);
    if (run.status === "failed" || run.status === "cancelled") {
      throw new Error(`Run ${runId} ended with ${run.status}`);
    }
    await sleep(500);
  }
  throw new Error(`Timed out waiting for run ${runId}`);
}

function assertReport(report, source) {
  assert(report.status === "completed", `${source} report was not completed`);
  assert(report.overallScore === 1, `${source} report did not receive a successful response`);
  assert(Array.isArray(report.conversations) && report.conversations.length === 1, `${source} report is missing its conversation`);
}

async function packPackages(tempDirectory) {
  const packages = [
    { directory: "packages/sdk", name: "@humanlyai/sdk" },
    { directory: "packages/cli", name: "@humanlyai/cli" },
  ];
  const archives = [];
  for (const pkg of packages) {
    const { stdout } = await run(npm, ["pack", "--pack-destination", tempDirectory, "--json"], {
      cwd: join(workspace, pkg.directory),
      quiet: true,
    });
    const packed = JSON.parse(stdout);
    assert(packed.length === 1 && packed[0].filename, `Could not pack ${pkg.name}`);
    archives.push(join(tempDirectory, packed[0].filename));
  }
  return archives;
}

async function main() {
  console.log(`Waiting for self-hosted stack at ${baseUrl}…`);
  await waitForHealth();

  console.log("Exercising the documented HTTP API flow…");
  const httpAgent = await api("POST", "/v1/agents", { name: "Smoke REST agent" });
  const httpConnector = await api("POST", "/v1/connectors", {
    name: "Smoke Docker-network connector",
    agentId: httpAgent.id,
    endpointUrl: "http://smoke-agent:3001",
  });
  const httpSuite = await api("POST", "/v1/suites", {
    name: "Smoke REST suite",
    agentId: httpAgent.id,
    connectorId: httpConnector.id,
    testGoal: "Say hello from the REST smoke test.",
  });
  const httpRun = await api("POST", "/v1/runs", { suiteId: httpSuite.id });
  const httpReport = await waitForReport(httpRun.id);
  assertReport(httpReport, "REST");
  await api("POST", "/v1/baselines", {
    name: "Smoke baseline",
    runId: httpRun.id,
    threshold: 0,
  });

  console.log("Exercising invalid-input containment and fail-closed baselines…");
  await expectApiError("POST", "/v1/runs", {
    suiteId: httpSuite.id,
    baselineId: "baseline_does_not_exist",
  }, 400);
  await expectApiError("POST", "/v1/suites", {
    name: "Invalid foreign-key suite",
    agentId: "agent_does_not_exist",
    connectorId: httpConnector.id,
  }, 400);
  await expectApiError("POST", "/v1/baselines", {
    name: "Invalid threshold",
    runId: httpRun.id,
    threshold: 2,
  }, 400);
  await waitForHealth();

  const tempDirectory = await mkdtemp(join(tmpdir(), "humanly-self-hosted-smoke-"));
  try {
    console.log("Packing and installing the TypeScript SDK and CLI…");
    const [sdkArchive, cliArchive] = await packPackages(tempDirectory);
    const consumerDirectory = join(tempDirectory, "consumer");
    await mkdir(consumerDirectory);
    await writeFile(join(consumerDirectory, "package.json"), JSON.stringify({ private: true, type: "module" }));
    await run(npm, [
      "install",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      "--no-package-lock",
      "--prefix",
      consumerDirectory,
      sdkArchive,
      cliArchive,
    ]);

    await writeFile(
      join(consumerDirectory, "sdk-consumer.mjs"),
      'export { HumanlyClient } from "@humanlyai/sdk";\n',
    );
    const { HumanlyClient } = await import(
      pathToFileURL(join(consumerDirectory, "sdk-consumer.mjs")).href,
    );
    await writeFile(
      join(consumerDirectory, "sdk-consumer.mts"),
      [
        'import { HumanlyClient, type Report } from "@humanlyai/sdk";',
        'const client = new HumanlyClient({ apiKey: "smoke-key", baseUrl: "http://127.0.0.1:5000" });',
        'const report: Promise<Report> = client.waitForRun("run_smoke");',
        "void report;",
        "",
      ].join("\n"),
    );
    await writeFile(
      join(consumerDirectory, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: {
          target: "ES2020",
          module: "NodeNext",
          moduleResolution: "NodeNext",
          strict: true,
          noEmit: true,
          skipLibCheck: true,
        },
        include: ["sdk-consumer.mts"],
      }),
    );
    const tsc = join(workspace, "packages", "sdk", "node_modules", "typescript", "bin", "tsc");
    await access(tsc, constants.R_OK);
    await run(process.execPath, [tsc, "--project", join(consumerDirectory, "tsconfig.json")]);

    const client = new HumanlyClient({ apiKey, baseUrl });

    console.log("Exercising the installed TypeScript SDK ESM interface…");
    const sdkAgent = await client.createAgent({ name: "Smoke SDK agent" });
    const sdkConnector = await client.createConnector({
      name: "Smoke SDK connector",
      agentId: sdkAgent.id,
      endpointUrl: "http://smoke-agent:3001",
    });
    const sdkSuite = await client.createSuite({
      name: "Smoke SDK suite",
      agentId: sdkAgent.id,
      connectorId: sdkConnector.id,
      testGoal: "Say hello from the SDK smoke test.",
    });
    const sdkRun = await client.triggerRun({ suiteId: sdkSuite.id });
    assertReport(await client.waitForRun(sdkRun.id, 500, 60_000), "SDK");

    console.log("Building and exercising the installed Python SDK…");
    const pythonSdkDirectory = join(workspace, "packages", "python-sdk");
    const pythonWheelsDirectory = join(tempDirectory, "python-wheels");
    const pythonVenvDirectory = join(tempDirectory, "python-consumer");
    await mkdir(pythonWheelsDirectory);
    await run(
      "python3",
      ["-m", "pip", "wheel", "--no-cache-dir", "--wheel-dir", pythonWheelsDirectory, pythonSdkDirectory],
      { quiet: true },
    );

    const pythonWheel = (await readdir(pythonWheelsDirectory)).find(
      (file) => file.startsWith("humanly-") && file.endsWith(".whl"),
    );
    assert(pythonWheel, "Could not build the Python SDK wheel");

    await run("python3", ["-m", "venv", pythonVenvDirectory]);
    const python = join(pythonVenvDirectory, "bin", "python");
    const pip = join(pythonVenvDirectory, "bin", "pip");
    await run(pip, [
      "install",
      "--no-index",
      "--find-links",
      pythonWheelsDirectory,
      join(pythonWheelsDirectory, pythonWheel),
    ], {
      env: { ...process.env, PIP_USER: "0" },
    });

    const pythonConsumer = join(tempDirectory, "python-consumer.py");
    await writeFile(
      pythonConsumer,
      [
        "import asyncio",
        "import importlib.metadata",
        "import os",
        "from humanly import AsyncHumanlyClient, HumanlyClient, Report, Run, __version__",
        "",
        'assert importlib.metadata.version("humanly") == __version__, "Python SDK package metadata is inconsistent"',
        "",
        'with HumanlyClient(api_key=os.environ["HUMANLY_API_KEY"], base_url=os.environ["HUMANLY_BASE_URL"]) as client:',
        `    run = client.trigger_run(suite_id="${sdkSuite.id}", connector_id="${sdkConnector.id}")`,
        '    assert isinstance(run, Run) and run.id, "Python SDK trigger_run returned an invalid Run model"',
        "    retrieved_run = client.get_run(run.id)",
        '    assert isinstance(retrieved_run, Run) and retrieved_run.id == run.id, "Python SDK get_run returned the wrong Run model"',
        "    report = client.wait_for_run(run.id, poll_interval=0.5, timeout=60)",
        '    assert isinstance(report, Report), "Python SDK wait_for_run returned an invalid Report model"',
        "    retrieved_report = client.get_report(run.id)",
        '    assert isinstance(retrieved_report, Report) and retrieved_report.run_id == run.id, "Python SDK get_report returned the wrong Report model"',
        '    assert report.status == "completed", f"Python SDK report status was {report.status}"',
        '    assert report.overall_score == 1, f"Python SDK report score was {report.overall_score}"',
        '    assert len(report.conversations) == 1, "Python SDK report is missing its conversation"',
        "",
        "async def exercise_async_client():",
        '    async with AsyncHumanlyClient(api_key=os.environ["HUMANLY_API_KEY"], base_url=os.environ["HUMANLY_BASE_URL"]) as client:',
        `        run = await client.trigger_run(suite_id="${sdkSuite.id}", connector_id="${sdkConnector.id}")`,
        '        assert isinstance(run, Run) and run.id, "Async Python SDK trigger_run returned an invalid Run model"',
        "        retrieved_run = await client.get_run(run.id)",
        '        assert isinstance(retrieved_run, Run) and retrieved_run.id == run.id, "Async Python SDK get_run returned the wrong Run model"',
        "        report = await client.wait_for_run(run.id, poll_interval=0.5, timeout=60)",
        '        assert isinstance(report, Report), "Async Python SDK wait_for_run returned an invalid Report model"',
        "        retrieved_report = await client.get_report(run.id)",
        '        assert isinstance(retrieved_report, Report) and retrieved_report.run_id == run.id, "Async Python SDK get_report returned the wrong Report model"',
        '        assert report.status == "completed", f"Async Python SDK report status was {report.status}"',
        '        assert report.overall_score == 1, f"Async Python SDK report score was {report.overall_score}"',
        '        assert len(report.conversations) == 1, "Async Python SDK report is missing its conversation"',
        "",
        "asyncio.run(exercise_async_client())",
        "",
        'print("Python SDK smoke passed")',
        "",
      ].join("\n"),
    );
    await run(python, [pythonConsumer], {
      env: { ...process.env, HUMANLY_BASE_URL: baseUrl },
    });

    const cli = join(consumerDirectory, "node_modules", ".bin", "humanly");
    await access(cli, constants.X_OK);
    const cliOutput = join(tempDirectory, "cli-run");
    console.log("Exercising the installed CLI…");
    const cliRun = await run(process.execPath, [cli, "run", "--suite", sdkSuite.id, "--timeout", "60", "--out", cliOutput]);
    const cliRunId = cliRun.stdout.match(/Run started:\s+(\S+)/)?.[1];
    assert(cliRunId, "CLI did not report its run ID");
    assertReport(JSON.parse(await readFile(join(cliOutput, "report.json"), "utf8")), "CLI run");

    const cliReportOutput = join(tempDirectory, "cli-report");
    await run(process.execPath, [cli, "report", "--run", cliRunId, "--out", cliReportOutput]);
    assertReport(JSON.parse(await readFile(join(cliReportOutput, "report.json"), "utf8")), "CLI report");
  } finally {
    await rm(tempDirectory, { recursive: true, force: true });
  }
}

await main();
console.log("Self-hosted smoke test passed.");