// ─────────────────────────────────────────────────────────────────────────────
//  @humanly/sdk — Humanly AI Agent Testing Platform
//  TypeScript SDK wrapping the v1 REST API
// ─────────────────────────────────────────────────────────────────────────────

export type {
  HumanlyClientOptions,
  Agent,
  Persona,
  Connector,
  Suite,
  Run,
  RunStatus,
  Report,
  Baseline,
  CheckScore,
  ConversationResult,
  TriggerRunOptions,
  CreateBaselineOptions,
  HumanlyApiError,
} from "./types.js";

import type {
  HumanlyClientOptions,
  Agent,
  Persona,
  Connector,
  Suite,
  Run,
  Report,
  Baseline,
  TriggerRunOptions,
  CreateBaselineOptions,
} from "./types.js";

const DEFAULT_BASE_URL = "https://humanly.ai";
const DEFAULT_TIMEOUT = 30_000;
const DEFAULT_POLL_INTERVAL = 3_000;
const DEFAULT_POLL_TIMEOUT = 600_000; // 10 minutes

class HumanlyError extends Error {
  status: number;
  code?: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = "HumanlyError";
    this.status = status;
    this.code = code;
  }
}

/**
 * Humanly API client.
 *
 * @example
 * ```typescript
 * const client = new HumanlyClient({ apiKey: process.env.HUMANLY_API_KEY! });
 * const run = await client.triggerRun({ suiteId: 's_abc', connectorId: 'c_xyz' });
 * const report = await client.waitForRun(run.id);
 * ```
 */
export class HumanlyClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeout: number;

  constructor(options: HumanlyClientOptions) {
    if (!options.apiKey) throw new Error("HumanlyClient: apiKey is required");
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
    this.timeout = options.timeout ?? DEFAULT_TIMEOUT;
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);

    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      if (res.status === 429) {
        const retryAfter = Number(res.headers.get("Retry-After") ?? 5);
        await sleep(retryAfter * 1000);
        return this.request(method, path, body);
      }

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new HumanlyError(
          res.status,
          (data as { message?: string }).message ?? `HTTP ${res.status}`,
          (data as { code?: string }).code,
        );
      }

      return data as T;
    } finally {
      clearTimeout(timer);
    }
  }

  // ── Agents ────────────────────────────────────────────────────────────────

  /**
   * List all agents in your workspace.
   */
  async listAgents(): Promise<Agent[]> {
    return this.request<Agent[]>("GET", "/v1/agents");
  }

  // ── Personas ──────────────────────────────────────────────────────────────

  /**
   * List all test personas in your workspace.
   */
  async listPersonas(): Promise<Persona[]> {
    return this.request<Persona[]>("GET", "/v1/personas");
  }

  // ── Connectors ────────────────────────────────────────────────────────────

  /**
   * List all AgentConnectors in your workspace.
   */
  async listConnectors(): Promise<Connector[]> {
    return this.request<Connector[]>("GET", "/v1/connectors");
  }

  // ── Suites ────────────────────────────────────────────────────────────────

  /**
   * List all test suites in your workspace.
   */
  async listSuites(): Promise<Suite[]> {
    return this.request<Suite[]>("GET", "/v1/suites");
  }

  // ── Runs ──────────────────────────────────────────────────────────────────

  /**
   * Trigger a new test run.
   *
   * @example
   * ```typescript
   * const run = await client.triggerRun({
   *   suiteId: 'suite_abc123',
   *   connectorId: 'conn_xyz456',
   *   label: process.env.GITHUB_SHA,
   * });
   * ```
   */
  async triggerRun(options: TriggerRunOptions): Promise<Run> {
    return this.request<Run>("POST", "/v1/runs", options);
  }

  /**
   * Get the status of a run.
   */
  async getRun(runId: string): Promise<Run> {
    return this.request<Run>("GET", `/v1/runs/${runId}`);
  }

  /**
   * List all runs in your workspace.
   */
  async listRuns(): Promise<Run[]> {
    return this.request<Run[]>("GET", "/v1/runs");
  }

  /**
   * Get the full evaluation report for a completed run.
   */
  async getReport(runId: string): Promise<Report> {
    return this.request<Report>("GET", `/v1/runs/${runId}/report`);
  }

  /**
   * Poll until a run completes, then return its report.
   * Throws if the run fails or the poll timeout is exceeded.
   *
   * @param runId - The run ID to wait for.
   * @param pollIntervalMs - How often to poll (default: 3000ms).
   * @param timeoutMs - Maximum wait time in ms (default: 600000 = 10 min).
   *
   * @example
   * ```typescript
   * const report = await client.waitForRun(run.id);
   * if (report.baselineBreach) process.exit(1);
   * ```
   */
  async waitForRun(
    runId: string,
    pollIntervalMs = DEFAULT_POLL_INTERVAL,
    timeoutMs = DEFAULT_POLL_TIMEOUT,
  ): Promise<Report> {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      const run = await this.getRun(runId);

      if (run.status === "completed") {
        return this.getReport(runId);
      }

      if (run.status === "failed") {
        throw new HumanlyError(500, `Run ${runId} failed`);
      }

      if (run.status === "cancelled") {
        throw new HumanlyError(409, `Run ${runId} was cancelled`);
      }

      await sleep(pollIntervalMs);
    }

    throw new HumanlyError(408, `Timed out waiting for run ${runId}`);
  }

  // ── Baselines ─────────────────────────────────────────────────────────────

  /**
   * Register a run as a quality baseline.
   * Future runs can be compared against this baseline.
   *
   * @example
   * ```typescript
   * const baseline = await client.createBaseline({
   *   runId: run.id,
   *   name: 'Production baseline v1.2',
   *   threshold: 0.05, // allow up to 5% regression
   * });
   * ```
   */
  async createBaseline(options: CreateBaselineOptions): Promise<Baseline> {
    return this.request<Baseline>("POST", "/v1/baselines", options);
  }

  /**
   * Get a specific baseline by ID.
   */
  async getBaseline(baselineId: string): Promise<Baseline> {
    return this.request<Baseline>("GET", `/v1/baselines/${baselineId}`);
  }

  /**
   * List all baselines in your workspace.
   */
  async listBaselines(): Promise<Baseline[]> {
    return this.request<Baseline[]>("GET", "/v1/baselines");
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
