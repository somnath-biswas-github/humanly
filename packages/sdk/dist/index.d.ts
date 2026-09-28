interface HumanlyClientOptions {
    /** Your Humanly API key (prefix: hmnly_) */
    apiKey: string;
    /** Base URL of your Humanly OSS instance. Defaults to http://localhost:5000 */
    baseUrl?: string;
    /** Request timeout in milliseconds. Defaults to 30000 */
    timeout?: number;
}
interface Agent {
    id: string;
    name: string;
    model: string;
    systemPrompt: string;
    createdAt: string;
}
interface CreateAgentOptions {
    name: string;
    systemPrompt?: string;
    model?: string;
}
interface Persona {
    id: string;
    name: string;
    description: string;
    behaviorMode: "good" | "bad" | "liar";
    createdAt: string;
}
interface Connector {
    id: string;
    name: string;
    endpointUrl: string;
    environment: string;
    createdAt: string;
}
interface CreateConnectorOptions {
    name: string;
    endpointUrl: string;
    agentId?: string;
    environment?: string;
    authType?: "none" | "bearer" | "api_key";
    authValue?: string;
    timeoutMs?: number;
}
interface Suite {
    id: string;
    name: string;
    description?: string;
    conversationCount: number;
    createdAt: string;
}
interface CreateSuiteOptions {
    name: string;
    description?: string;
    agentId?: string;
    connectorId?: string;
    personaId?: string;
    conversationCount?: number;
    testGoal?: string;
    successCriteria?: string;
}
type RunStatus = "pending" | "running" | "completed" | "failed" | "cancelled";
interface TriggerRunOptions {
    /** ID of the test suite to run */
    suiteId: string;
    /** Optional override for the AgentConnector configured on the suite */
    connectorId?: string;
    /** Optional: compare results against this baseline ID */
    baselineId?: string;
    /** Optional label for this run (e.g. git SHA, branch name) */
    label?: string;
}
interface Run {
    id: string;
    status: RunStatus;
    suiteId: string;
    connectorId: string;
    label?: string;
    createdAt: string;
    completedAt?: string;
}
interface CheckScore {
    checkName: string;
    score: number;
    passed: boolean;
    explanation: string;
}
interface ConversationResult {
    id: string;
    personaName: string;
    turnCount: number;
    overallScore: number;
    passed: boolean;
    checkScores: CheckScore[];
}
interface Report {
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
interface CreateBaselineOptions {
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
interface Baseline {
    id: string;
    name: string;
    runId: string;
    overallScore: number;
    threshold: number;
    createdAt: string;
}
interface HumanlyApiError {
    status: number;
    message: string;
    code?: string;
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
declare class HumanlyClient {
    private readonly apiKey;
    private readonly baseUrl;
    private readonly timeout;
    constructor(options: HumanlyClientOptions);
    private request;
    /** Create a logical agent to associate with a connector and suite. */
    createAgent(options: CreateAgentOptions): Promise<Agent>;
    /**
     * List all agents in your workspace.
     */
    listAgents(): Promise<Agent[]>;
    /**
     * List all test personas in your workspace.
     */
    listPersonas(): Promise<Persona[]>;
    /** Create an HTTP AgentConnector. */
    createConnector(options: CreateConnectorOptions): Promise<Connector>;
    /**
     * List all AgentConnectors in your workspace.
     */
    listConnectors(): Promise<Connector[]>;
    /** Create a repeatable HTTP-agent test suite. */
    createSuite(options: CreateSuiteOptions): Promise<Suite>;
    /**
     * List all test suites in your workspace.
     */
    listSuites(): Promise<Suite[]>;
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
    triggerRun(options: TriggerRunOptions): Promise<Run>;
    /**
     * Get the status of a run.
     */
    getRun(runId: string): Promise<Run>;
    /**
     * List all runs in your workspace.
     */
    listRuns(): Promise<Run[]>;
    /**
     * Get the full evaluation report for a completed run.
     */
    getReport(runId: string): Promise<Report>;
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
    waitForRun(runId: string, pollIntervalMs?: number, timeoutMs?: number): Promise<Report>;
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
    createBaseline(options: CreateBaselineOptions): Promise<Baseline>;
    /**
     * Get a specific baseline by ID.
     */
    getBaseline(baselineId: string): Promise<Baseline>;
    /**
     * List all baselines in your workspace.
     */
    listBaselines(): Promise<Baseline[]>;
}

export { type Agent, type Baseline, type CheckScore, type Connector, type ConversationResult, type CreateAgentOptions, type CreateBaselineOptions, type CreateConnectorOptions, type CreateSuiteOptions, type HumanlyApiError, HumanlyClient, type HumanlyClientOptions, type Persona, type Report, type Run, type RunStatus, type Suite, type TriggerRunOptions };
