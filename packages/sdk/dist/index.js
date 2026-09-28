"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  HumanlyClient: () => HumanlyClient
});
module.exports = __toCommonJS(index_exports);
var DEFAULT_BASE_URL = "http://localhost:5000";
var DEFAULT_TIMEOUT = 3e4;
var DEFAULT_POLL_INTERVAL = 3e3;
var DEFAULT_POLL_TIMEOUT = 6e5;
var HumanlyError = class extends Error {
  constructor(status, message, code) {
    super(message);
    this.name = "HumanlyError";
    this.status = status;
    this.code = code;
  }
};
var HumanlyClient = class {
  constructor(options) {
    if (!options.apiKey) throw new Error("HumanlyClient: apiKey is required");
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
    this.timeout = options.timeout ?? DEFAULT_TIMEOUT;
  }
  // ── Internal ──────────────────────────────────────────────────────────────
  async request(method, path, body) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);
    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`
        },
        body: body !== void 0 ? JSON.stringify(body) : void 0,
        signal: controller.signal
      });
      if (res.status === 429) {
        const retryAfter = Number(res.headers.get("Retry-After") ?? 5);
        await sleep(retryAfter * 1e3);
        return this.request(method, path, body);
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new HumanlyError(
          res.status,
          data.message ?? `HTTP ${res.status}`,
          data.code
        );
      }
      return data;
    } finally {
      clearTimeout(timer);
    }
  }
  // ── Agents ────────────────────────────────────────────────────────────────
  /** Create a logical agent to associate with a connector and suite. */
  async createAgent(options) {
    return this.request("POST", "/v1/agents", options);
  }
  /**
   * List all agents in your workspace.
   */
  async listAgents() {
    return this.request("GET", "/v1/agents");
  }
  // ── Personas ──────────────────────────────────────────────────────────────
  /**
   * List all test personas in your workspace.
   */
  async listPersonas() {
    return this.request("GET", "/v1/personas");
  }
  // ── Connectors ────────────────────────────────────────────────────────────
  /** Create an HTTP AgentConnector. */
  async createConnector(options) {
    return this.request("POST", "/v1/connectors", options);
  }
  /**
   * List all AgentConnectors in your workspace.
   */
  async listConnectors() {
    return this.request("GET", "/v1/connectors");
  }
  // ── Suites ────────────────────────────────────────────────────────────────
  /** Create a repeatable HTTP-agent test suite. */
  async createSuite(options) {
    return this.request("POST", "/v1/suites", options);
  }
  /**
   * List all test suites in your workspace.
   */
  async listSuites() {
    return this.request("GET", "/v1/suites");
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
  async triggerRun(options) {
    return this.request("POST", "/v1/runs", options);
  }
  /**
   * Get the status of a run.
   */
  async getRun(runId) {
    return this.request("GET", `/v1/runs/${runId}`);
  }
  /**
   * List all runs in your workspace.
   */
  async listRuns() {
    return this.request("GET", "/v1/runs");
  }
  /**
   * Get the full evaluation report for a completed run.
   */
  async getReport(runId) {
    return this.request("GET", `/v1/runs/${runId}/report`);
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
  async waitForRun(runId, pollIntervalMs = DEFAULT_POLL_INTERVAL, timeoutMs = DEFAULT_POLL_TIMEOUT) {
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
  async createBaseline(options) {
    return this.request("POST", "/v1/baselines", options);
  }
  /**
   * Get a specific baseline by ID.
   */
  async getBaseline(baselineId) {
    return this.request("GET", `/v1/baselines/${baselineId}`);
  }
  /**
   * List all baselines in your workspace.
   */
  async listBaselines() {
    return this.request("GET", "/v1/baselines");
  }
};
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  HumanlyClient
});
