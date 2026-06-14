// ─────────────────────────────────────────────────────────────────────────────
//  @humanly/sdk — Type definitions
// ─────────────────────────────────────────────────────────────────────────────

export interface HumanlyClientOptions {
  /** Your Humanly API key (prefix: hmnly_) */
  apiKey: string;
  /** Base URL of your Humanly instance. Defaults to https://humanly.ai */
  baseUrl?: string;
  /** Request timeout in milliseconds. Defaults to 30000 */
  timeout?: number;
}

// ── Agents ───────────────────────────────────────────────────────────────────

export interface Agent {
  id: string;
  name: string;
  model: string;
  systemPrompt: string;
  createdAt: string;
}

// ── Personas ─────────────────────────────────────────────────────────────────

export interface Persona {
  id: string;
  name: string;
  description: string;
  behaviorMode: "good" | "bad" | "liar";
  createdAt: string;
}

// ── Connectors ───────────────────────────────────────────────────────────────

export interface Connector {
  id: string;
  name: string;
  endpointUrl: string;
  environment: string;
  createdAt: string;
}

// ── Test Suites ───────────────────────────────────────────────────────────────

export interface Suite {
  id: string;
  name: string;
  description?: string;
  conversationCount: number;
  createdAt: string;
}

// ── Runs ─────────────────────────────────────────────────────────────────────

export type RunStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export interface TriggerRunOptions {
  /** ID of the test suite to run */
  suiteId: string;
  /** ID of the AgentConnector to test against */
  connectorId: string;
  /** Optional: compare results against this baseline ID */
  baselineId?: string;
  /** Optional label for this run (e.g. git SHA, branch name) */
  label?: string;
}

export interface Run {
  id: string;
  status: RunStatus;
  suiteId: string;
  connectorId: string;
  label?: string;
  createdAt: string;
  completedAt?: string;
}

// ── Reports ──────────────────────────────────────────────────────────────────

export interface CheckScore {
  checkName: string;
  score: number;
  passed: boolean;
  explanation: string;
}

export interface ConversationResult {
  id: string;
  personaName: string;
  turnCount: number;
  overallScore: number;
  passed: boolean;
  checkScores: CheckScore[];
}

export interface Report {
  runId: string;
  status: RunStatus;
  overallScore: number;
  passRate: number;
  conversationCount: number;
  conversations: ConversationResult[];
  /** True if this run breached a registered baseline */
  baselineBreach: boolean;
  baselineId?: string;
  baselineDelta?: number;
  createdAt: string;
  completedAt?: string;
}

// ── Baselines ────────────────────────────────────────────────────────────────

export interface CreateBaselineOptions {
  /** The run ID to create a baseline from */
  runId: string;
  /** Human-readable name for this baseline */
  name: string;
  /**
   * How much the score can drop before triggering a breach (0–1).
   * E.g. 0.05 = allow up to 5% regression. Defaults to 0.
   */
  threshold?: number;
}

export interface Baseline {
  id: string;
  name: string;
  runId: string;
  overallScore: number;
  threshold: number;
  createdAt: string;
}

// ── Errors ───────────────────────────────────────────────────────────────────

export interface HumanlyApiError {
  status: number;
  message: string;
  code?: string;
}
