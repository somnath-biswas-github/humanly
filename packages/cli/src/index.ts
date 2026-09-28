import { Command } from "commander";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const program = new Command()
  .name("humanly")
  .description("Run Humanly OSS HTTP-agent suites from a terminal or CI")
  .version("0.1.0");

function config() {
  const apiKey = process.env.HUMANLY_API_KEY;
  if (!apiKey) throw new Error("HUMANLY_API_KEY is required");
  return {
    apiKey,
    baseUrl: (process.env.HUMANLY_BASE_URL || "http://localhost:5000").replace(/\/$/, ""),
  };
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const { apiKey, baseUrl } = config();
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || data.message || `HTTP ${response.status}`);
  return data as T;
}

async function waitForReport(runId: string, timeoutSeconds: number): Promise<any> {
  const deadline = Date.now() + timeoutSeconds * 1000;
  while (Date.now() < deadline) {
    const run = await request<any>("GET", `/v1/runs/${runId}`);
    if (run.status === "completed") return request<any>("GET", `/v1/runs/${runId}/report`);
    if (run.status === "failed" || run.status === "cancelled") throw new Error(`Run ${runId} ${run.status}`);
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`Timed out waiting for run ${runId}`);
}

program.command("run")
  .description("Trigger a suite and write its JSON report")
  .requiredOption("--suite <id>", "Suite ID")
  .option("--connector <id>", "Override the connector configured on the suite")
  .option("--baseline <id>", "Baseline ID for regression comparison")
  .option("--label <label>", "Optional run label")
  .option("--timeout <seconds>", "Wait limit", "120")
  .option("--out <directory>", "Report directory", "./humanly-results")
  .action(async (options) => {
    try {
      const run = await request<any>("POST", "/v1/runs", {
        suiteId: options.suite,
        connectorId: options.connector,
        baselineId: options.baseline,
        label: options.label,
      });
      console.log(`Run started: ${run.id}`);
      const report = await waitForReport(run.id, Number(options.timeout));
      mkdirSync(options.out, { recursive: true });
      const reportPath = join(options.out, "report.json");
      writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
      console.log(`Report: ${reportPath}`);
      console.log(`Score: ${(report.overallScore * 100).toFixed(0)}%`);
      if (report.baselineBreach) process.exitCode = 1;
    } catch (cliError) {
      console.error(`Error: ${cliError instanceof Error ? cliError.message : cliError}`);
      process.exitCode = 2;
    }
  });

program.command("report")
  .description("Download a completed report")
  .requiredOption("--run <id>", "Run ID")
  .option("--out <directory>", "Report directory", "./humanly-results")
  .action(async (options) => {
    try {
      const report = await request<any>("GET", `/v1/runs/${options.run}/report`);
      mkdirSync(options.out, { recursive: true });
      const reportPath = join(options.out, "report.json");
      writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
      console.log(`Report: ${reportPath}`);
    } catch (cliError) {
      console.error(`Error: ${cliError instanceof Error ? cliError.message : cliError}`);
      process.exitCode = 2;
    }
  });

for (const [name, endpoint] of [["agents", "agents"], ["connectors", "connectors"], ["suites", "suites"], ["baselines", "baselines"]] as const) {
  program.command(`list-${name}`).description(`List ${name}`).action(async () => {
    try {
      const records = await request<any[]>("GET", `/v1/${endpoint}`);
      console.table(records.map((record) => ({ id: record.id, name: record.name, status: record.status })));
    } catch (cliError) {
      console.error(`Error: ${cliError instanceof Error ? cliError.message : cliError}`);
      process.exitCode = 2;
    }
  });
}

program.parseAsync(process.argv).catch((cliError) => {
  console.error(`Error: ${cliError instanceof Error ? cliError.message : cliError}`);
  process.exitCode = 2;
});