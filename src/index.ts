import crypto from "node:crypto";
import "dotenv/config";
import express, {
  type NextFunction,
  type Request,
  type RequestHandler,
  type Response,
} from "express";
import {
  postJsonToConnector,
  resolveConnectorTarget,
} from "./connector-http.js";
import { migrate, pool, closeDb } from "./db.js";
import { evaluateAgentResponse } from "./evaluator.js";
import { evaluateWorkflow, runWorkflow, validateWorkflowCase } from "./workflow.js";
import { workflowExample } from "./workflow-examples.js";
import { ragExample } from "./rag-example.js";
import { ragRunHandler } from "./rag-routes.js";
import { configuredRagJudge } from "./rag-judge.js";
import type { ConversationResult, Report, RunStatus } from "./types.js";

const app = express();
const port = Number(process.env.PORT ?? 5000);
const startTime = Date.now();
const configuredApiKey = process.env.HUMANLY_API_KEY?.trim();
const bootstrapKey = configuredApiKey || (
  process.env.NODE_ENV === "production" ? "" : "hmnly_local_dev_key"
);

app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));

function id(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "").slice(0, 20)}`;
}

function hashKey(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function error(res: Response, status: number, message: string): void {
  res.status(status).json({ error: message, message });
}

async function ensureBootstrapKey(): Promise<void> {
  await pool.query(
    `INSERT INTO api_keys (id, name, key_hash, scopes)
     VALUES ($1, 'Local development key', $2, ARRAY['*']::TEXT[])
     ON CONFLICT (key_hash) DO NOTHING`,
    [id("key"), hashKey(bootstrapKey)],
  );
}

type AuthRequest = Request & { apiKey?: { id: string; scopes: string[] } };

type AsyncRequestHandler = (
  req: any,
  res: Response,
  next: NextFunction,
) => Promise<unknown>;

function asyncRoute(handler: AsyncRequestHandler): RequestHandler {
  return (req, res, next) => {
    void Promise.resolve(handler(req, res, next)).catch(next);
  };
}

function requireApiKey(requiredScope: string): RequestHandler {
  return asyncRoute(async (req: AuthRequest, res: Response, next: NextFunction) => {
    const header = req.header("authorization");
    const token = header?.startsWith("Bearer ") ? header.slice(7).trim() : "";
    if (!token) return error(res, 401, "Authorization: Bearer <HUMANLY_API_KEY> is required");

    const result = await pool.query<{ id: string; scopes: string[] }>(
      "SELECT id, scopes FROM api_keys WHERE key_hash = $1",
      [hashKey(token)],
    );
    const key = result.rows[0];
    if (!key || (!key.scopes.includes("*") && !key.scopes.includes(requiredScope))) {
      return error(res, 403, `API key does not have the ${requiredScope} scope`);
    }
    req.apiKey = key;
    await pool.query("UPDATE api_keys SET last_used_at = NOW() WHERE id = $1", [key.id]);
    next();
  });
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

function asInt(value: unknown, fallback: number, min: number, max: number): number {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, Math.floor(number))) : fallback;
}

async function validateEndpointUrl(value: string): Promise<string> {
  const target = await resolveConnectorTarget(
    value,
    process.env.HUMANLY_ALLOW_PRIVATE_CONNECTORS === "true",
  );
  return target.url.toString();
}

function publicAgent(row: any) {
  return { id: row.id, name: row.name, model: row.model, systemPrompt: row.system_prompt, createdAt: row.created_at };
}

function publicConnector(row: any) {
  return {
    id: row.id,
    name: row.name,
    agentId: row.agent_id,
    endpointUrl: row.endpoint_url,
    environment: row.environment,
    createdAt: row.created_at,
  };
}

function publicSuite(row: any) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    agentId: row.agent_id,
    connectorId: row.connector_id,
    personaId: row.persona_id,
    conversationCount: row.conversation_count,
    testGoal: row.test_goal,
    successCriteria: row.success_criteria,
    createdAt: row.created_at,
  };
}

app.get("/health", asyncRoute(async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok", ready: true, uptime: Date.now() - startTime, version: "0.1.0" });
  } catch {
    res.status(503).json({ status: "degraded", ready: false });
  }
}));

app.get("/", (_req, res) => {
  res.json({
    name: "Humanly OSS",
    version: "0.1.0",
    docs: "/docs",
    health: "/health",
    api: "/v1",
  });
});

app.get("/docs", (_req, res) => {
  res.json({
    name: "Humanly OSS API",
    authentication: "Authorization: Bearer <HUMANLY_API_KEY>",
    endpoints: [
      "POST /v1/agents",
      "GET /v1/agents",
      "POST /v1/connectors",
      "GET /v1/connectors",
      "POST /v1/suites",
      "GET /v1/suites",
      "POST /v1/runs",
      "GET /v1/runs/:id",
      "GET /v1/runs/:id/report",
      "POST /v1/baselines",
      "GET /v1/baselines",
    ],
  });
});

app.post("/v1/agents", requireApiKey("agents:write"), asyncRoute(async (req, res) => {
  const name = text(req.body?.name);
  if (!name) return error(res, 400, "name is required");
  const result = await pool.query(
    `INSERT INTO agents (id, name, system_prompt, model) VALUES ($1, $2, $3, $4) RETURNING *`,
    [id("agent"), name, text(req.body?.systemPrompt), text(req.body?.model, "http")],
  );
  res.status(201).json(publicAgent(result.rows[0]));
}));

app.get("/v1/agents", requireApiKey("agents:read"), asyncRoute(async (_req, res) => {
  const result = await pool.query("SELECT * FROM agents ORDER BY created_at DESC");
  res.json(result.rows.map(publicAgent));
}));

app.get("/v1/personas", requireApiKey("personas:read"), asyncRoute(async (_req, res) => {
  const result = await pool.query("SELECT * FROM personas ORDER BY created_at DESC");
  res.json(result.rows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    behaviorMode: "good",
    createdAt: row.created_at,
  })));
}));

app.post("/v1/connectors", requireApiKey("connectors:write"), asyncRoute(async (req, res) => {
  const name = text(req.body?.name);
  const endpointValue = text(req.body?.endpointUrl);
  if (!name || !endpointValue) return error(res, 400, "name and endpointUrl are required");
  let endpointUrl: string;
  try {
    endpointUrl = await validateEndpointUrl(endpointValue);
  } catch (validationError) {
    return error(res, 400, validationError instanceof Error ? validationError.message : "Invalid connector URL");
  }
  const result = await pool.query(
    `INSERT INTO connectors
      (id, agent_id, name, endpoint_url, environment, auth_type, auth_value, timeout_ms)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [
      id("conn"),
      text(req.body?.agentId) || null,
      name,
      endpointUrl,
      text(req.body?.environment, "production"),
      text(req.body?.authType, "none"),
      text(req.body?.authValue) || null,
      asInt(req.body?.timeoutMs, 30000, 1000, 120000),
    ],
  );
  res.status(201).json(publicConnector(result.rows[0]));
}));

app.get("/v1/connectors", requireApiKey("connectors:read"), asyncRoute(async (req, res) => {
  const params: string[] = [];
  let query = "SELECT * FROM connectors";
  if (text(req.query.env)) {
    params.push(text(req.query.env));
    query += " WHERE environment = $1";
  }
  query += " ORDER BY created_at DESC";
  const result = await pool.query(query, params);
  res.json(result.rows.map(publicConnector));
}));

app.post("/v1/suites", requireApiKey("suites:write"), asyncRoute(async (req, res) => {
  const name = text(req.body?.name);
  if (!name) return error(res, 400, "name is required");
  const connectorId = text(req.body?.connectorId) || null;
  const agentId = text(req.body?.agentId) || null;
  if (!connectorId && !agentId) return error(res, 400, "connectorId or agentId is required");
  const result = await pool.query(
    `INSERT INTO suites
      (id, name, description, connector_id, agent_id, persona_id, conversation_count, test_goal, success_criteria)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
    [
      id("suite"),
      name,
      text(req.body?.description),
      connectorId,
      agentId,
      text(req.body?.personaId, "persona-default"),
      asInt(req.body?.conversationCount, 1, 1, 100),
      text(req.body?.testGoal, "Receive a useful response from the agent."),
      text(req.body?.successCriteria, "The agent returns a non-empty response."),
    ],
  );
  res.status(201).json(publicSuite(result.rows[0]));
}));

app.get("/v1/suites", requireApiKey("suites:read"), asyncRoute(async (_req, res) => {
  const result = await pool.query("SELECT * FROM suites ORDER BY created_at DESC");
  res.json(result.rows.map(publicSuite));
}));

app.get("/v1/rag/examples", requireApiKey("suites:read"), (_req, res) => res.json({ fixed: ragExample(), faulty: ragExample(true) }));
app.post("/v1/rag/runs", requireApiKey("runs:write"), ragRunHandler({
  judge: configuredRagJudge,
  connector: async connectorId => {
    const connector = (await pool.query("SELECT * FROM connectors WHERE id=$1", [connectorId])).rows[0];
    if (!connector) return undefined;
    return async request => {
      const headers: Record<string, string> = { "content-type": "application/json" };
      if (connector.auth_type === "bearer" && connector.auth_value) headers.authorization = `Bearer ${connector.auth_value}`;
      if (connector.auth_type === "api_key" && connector.auth_value) headers["x-api-key"] = connector.auth_value;
      const response = await postJsonToConnector({
        endpointUrl: connector.endpoint_url, headers, body: JSON.stringify(request),
        timeoutMs: Math.min(connector.timeout_ms, 30000),
        allowPrivate: process.env.HUMANLY_ALLOW_PRIVATE_CONNECTORS === "true",
      });
      if (!response.ok) throw new Error(`Agent HTTP ${response.status}`);
      return JSON.parse(response.body);
    };
  },
  save: async report => {
    await pool.query("INSERT INTO runs (id,status,label,overall_score,report,completed_at) VALUES ($1,'completed',$2,$3,$4,NOW())",
      [report.runId, report.suite.name, report.overallScore, JSON.stringify(report)]);
  },
}));

app.get("/v1/workflow/examples", requireApiKey("suites:read"), (_req,res) => res.json({fixed:workflowExample(),faulty:workflowExample(true)}));
app.post("/v1/workflow/runs", requireApiKey("runs:write"), asyncRoute(async (req,res) => {
  try { validateWorkflowCase(req.body.case); } catch(e) { return error(res,400,(e as Error).message); }
  const c=req.body.case, runId=id("workflow");
  let result:any;
  if(req.body.evidence!==undefined) result={case:c,evidence:req.body.evidence,report:evaluateWorkflow(c,req.body.evidence)};
  else {
    const connector=(await pool.query("SELECT * FROM connectors WHERE id=$1",[req.body.connectorId])).rows[0];
    if(!connector) return error(res,404,"connector not found");
    result=await runWorkflow(c,async request=>{
      const headers:Record<string,string>={"content-type":"application/json"};
      if(connector.auth_type==="bearer"&&connector.auth_value) headers.authorization=`Bearer ${connector.auth_value}`;
      if(connector.auth_type==="api_key"&&connector.auth_value) headers["x-api-key"]=connector.auth_value;
      const response=await postJsonToConnector({endpointUrl:connector.endpoint_url,headers,body:JSON.stringify(request),timeoutMs:connector.timeout_ms,allowPrivate:process.env.HUMANLY_ALLOW_PRIVATE_CONNECTORS==="true"});
      if(!response.ok) throw new Error(`Agent HTTP ${response.status}`);
      return JSON.parse(response.body);
    },runId);
  }
  const report={...result,runId,status:"completed",overallScore:result.report.status==="pass"?1:0,passRate:result.report.status==="pass"?1:0,conversationCount:1,conversations:[],baselineBreach:false,qualityGate:{passed:result.report.status==="pass",status:result.report.status},createdAt:new Date().toISOString(),completedAt:new Date().toISOString()};
  await pool.query("INSERT INTO runs (id,status,label,overall_score,report,completed_at) VALUES ($1,'completed',$2,$3,$4,NOW())",[runId,c.name,report.overallScore,JSON.stringify(report)]);
  res.status(201).json(report);
}));

app.post("/v1/runs", requireApiKey("runs:write"), asyncRoute(async (req, res) => {
  const suiteId = text(req.body?.suiteId);
  const connectorId = text(req.body?.connectorId);
  let suite: any;
  if (suiteId) {
    suite = (await pool.query("SELECT * FROM suites WHERE id = $1", [suiteId])).rows[0];
  } else if (text(req.body?.suiteName)) {
    suite = (await pool.query("SELECT * FROM suites WHERE name = $1", [text(req.body.suiteName)])).rows[0];
  }
  if (!suite) return error(res, 404, "suite not found; create one with POST /v1/suites");

  const selectedConnectorId = connectorId || suite.connector_id;
  const connector = (
    await pool.query("SELECT * FROM connectors WHERE id = $1", [selectedConnectorId])
  ).rows[0];
  if (!connector) return error(res, 404, "connector not found; create one with POST /v1/connectors");

  const baselineId = text(req.body?.baselineId) || null;
  if (baselineId) {
    const baseline = (
      await pool.query("SELECT id FROM baselines WHERE id = $1", [baselineId])
    ).rows[0];
    if (!baseline) return error(res, 400, "baseline not found");
  }

  const runId = id("run");
  const result = await pool.query(
    `INSERT INTO runs (id, suite_id, connector_id, status, label, baseline_id)
     VALUES ($1, $2, $3, 'pending', $4, $5) RETURNING *`,
    [runId, suite.id, connector.id, text(req.body?.label) || null, baselineId],
  );
  void executeRun(result.rows[0], suite, connector).catch(async (runError) => {
    console.error(`[run ${runId}] ${runError instanceof Error ? runError.message : runError}`);
    try {
      await pool.query(
        "UPDATE runs SET status = 'failed', error_message = $2, completed_at = NOW() WHERE id = $1",
        [runId, runError instanceof Error ? runError.message : "Run execution failed"],
      );
    } catch (statusError) {
      console.error(`[run ${runId}] failed to record failure:`, statusError);
    }
  });
  res.status(202).json(publicRun(result.rows[0]));
}));

app.get("/v1/runs", requireApiKey("runs:read"), asyncRoute(async (_req, res) => {
  const result = await pool.query("SELECT * FROM runs ORDER BY created_at DESC");
  res.json(result.rows.map(publicRun));
}));

app.get("/v1/runs/:id", requireApiKey("runs:read"), asyncRoute(async (req, res) => {
  const result = await pool.query("SELECT * FROM runs WHERE id = $1", [req.params.id]);
  if (!result.rows[0]) return error(res, 404, "run not found");
  res.json(publicRun(result.rows[0]));
}));

app.get("/v1/runs/:id/report", requireApiKey("reports:read"), asyncRoute(async (req, res) => {
  const result = await pool.query("SELECT * FROM runs WHERE id = $1", [req.params.id]);
  const run = result.rows[0];
  if (!run) return error(res, 404, "run not found");
  if (run.status === "pending" || run.status === "running") return error(res, 409, "run is not complete");
  if (run.status === "failed") return error(res, 500, run.error_message || "run failed");
  res.json(run.report);
}));

app.post("/v1/baselines", requireApiKey("baselines:write"), asyncRoute(async (req, res) => {
  const runId = text(req.body?.runId);
  const run = (await pool.query("SELECT * FROM runs WHERE id = $1 AND status = 'completed'", [runId])).rows[0];
  if (!run) return error(res, 404, "a completed runId is required");
  const threshold = Number(req.body?.threshold ?? 0);
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
    return error(res, 400, "threshold must be a finite number from 0 to 1");
  }
  const result = await pool.query(
    `INSERT INTO baselines (id, name, run_id, overall_score, threshold)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [id("baseline"), text(req.body?.name, "Baseline"), runId, run.overall_score, threshold],
  );
  res.status(201).json(publicBaseline(result.rows[0]));
}));

app.get("/v1/baselines", requireApiKey("baselines:read"), asyncRoute(async (_req, res) => {
  const result = await pool.query("SELECT * FROM baselines ORDER BY created_at DESC");
  res.json(result.rows.map(publicBaseline));
}));

app.get("/v1/baselines/:id", requireApiKey("baselines:read"), asyncRoute(async (req, res) => {
  const result = await pool.query("SELECT * FROM baselines WHERE id = $1", [req.params.id]);
  if (!result.rows[0]) return error(res, 404, "baseline not found");
  res.json(publicBaseline(result.rows[0]));
}));

function publicRun(row: any) {
  return {
    id: row.id,
    status: row.status,
    suiteId: row.suite_id,
    connectorId: row.connector_id,
    label: row.label || undefined,
    createdAt: row.created_at,
    completedAt: row.completed_at || undefined,
  };
}

function publicBaseline(row: any) {
  return {
    id: row.id,
    name: row.name,
    runId: row.run_id,
    overallScore: Number(row.overall_score),
    threshold: Number(row.threshold),
    createdAt: row.created_at,
  };
}

async function executeRun(run: any, suite: any, connector: any): Promise<void> {
  await pool.query("UPDATE runs SET status = 'running' WHERE id = $1", [run.id]);
  const conversations: ConversationResult[] = [];
  const count = asInt(suite.conversation_count, 1, 1, 100);
  for (let index = 0; index < count; index += 1) {
    conversations.push(await evaluateConversation(run.id, connector, suite, index));
  }
  const overallScore = conversations.reduce((sum, item) => sum + item.overallScore, 0) / conversations.length;
  const baseline = run.baseline_id
    ? (await pool.query("SELECT * FROM baselines WHERE id = $1", [run.baseline_id])).rows[0]
    : null;
  if (run.baseline_id && !baseline) {
    throw new Error("The selected baseline no longer exists");
  }
  const baselineDelta = baseline ? overallScore - Number(baseline.overall_score) : undefined;
  const baselineBreach = Boolean(baseline && baselineDelta! < -Number(baseline.threshold));
  const completedAt = new Date().toISOString();
  const report: Report = {
    runId: run.id,
    status: "completed",
    overallScore,
    passRate: conversations.filter((item) => item.passed).length / conversations.length,
    conversationCount: conversations.length,
    conversations,
    baselineBreach,
    baselineId: baseline?.id,
    baselineDelta,
    createdAt: run.created_at,
    completedAt,
  };
  await pool.query(
    `UPDATE runs SET status = 'completed', overall_score = $2, report = $3, completed_at = $4 WHERE id = $1`,
    [run.id, overallScore, JSON.stringify(report), completedAt],
  );
}

async function evaluateConversation(runId: string, connector: any, suite: any, index: number): Promise<ConversationResult> {
  const message = text(suite.test_goal, "Hello, can you help me?");
  const conversationId = `${runId}_conversation_${index + 1}`;
  const requestBody = { message, conversationId, history: [] };
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (connector.auth_type === "bearer" && connector.auth_value) headers.authorization = `Bearer ${connector.auth_value}`;
  if (connector.auth_type === "api_key" && connector.auth_value) headers["x-api-key"] = connector.auth_value;
  try {
    const response = await postJsonToConnector({
      endpointUrl: connector.endpoint_url,
      headers,
      body: JSON.stringify(requestBody),
      timeoutMs: connector.timeout_ms,
      allowPrivate: process.env.HUMANLY_ALLOW_PRIVATE_CONNECTORS === "true",
    });
    const evaluation = evaluateAgentResponse(
      response.ok,
      response.status,
      response.body,
    );
    return {
      id: `${runId}_conversation_${index + 1}`,
      personaName: "Curious customer",
      turnCount: 1,
      overallScore: evaluation.passed ? 1 : 0,
      passed: evaluation.passed,
      checkScores: [{
        checkName: "non_empty_response",
        score: evaluation.passed ? 1 : 0,
        passed: evaluation.passed,
        explanation: evaluation.explanation,
      }],
      request: { message, conversationId },
      response: evaluation.responseText,
    };
  } catch (runError) {
    return {
      id: `${runId}_conversation_${index + 1}`,
      personaName: "Curious customer",
      turnCount: 0,
      overallScore: 0,
      passed: false,
      checkScores: [{ checkName: "non_empty_response", score: 0, passed: false, explanation: "The HTTP agent could not be reached." }],
      request: { message, conversationId },
      error: runError instanceof Error ? runError.message : "Agent request failed",
    };
  }
}

app.use((_req, res) => error(res, 404, "not found"));
app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
  if (res.headersSent) {
    next(err);
    return;
  }
  const details = typeof err === "object" && err !== null
    ? err as { code?: unknown; status?: unknown; type?: unknown; name?: unknown }
    : {};
  const status = Number(details.status);
  if (status === 413 || details.type === "entity.too.large") {
    return error(res, 413, "request body is too large");
  }
  if (status === 400 || details.type === "entity.parse.failed") {
    return error(res, 400, "request body is invalid");
  }
  if (details.code === "23503") {
    return error(res, 400, "referenced resource does not exist");
  }
  if (details.code === "23505") {
    return error(res, 409, "resource already exists");
  }
  console.error("Unhandled request error", {
    name: details.name ?? "Error",
    code: details.code ?? "unknown",
  });
  return error(res, 500, "internal server error");
});

async function start(): Promise<void> {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  if (!bootstrapKey) throw new Error("HUMANLY_API_KEY is required in production");
  await migrateWithRetry();
  await ensureBootstrapKey();
  const server = app.listen(port, "0.0.0.0", () => {
    console.log(`Humanly OSS listening on http://0.0.0.0:${port}`);
    if (!configuredApiKey) console.warn("HUMANLY_API_KEY is not set; using hmnly_local_dev_key for local development.");
  });
  const shutdown = async () => {
    server.close();
    await closeDb();
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
}

async function migrateWithRetry(): Promise<void> {
  const attempts = Number(process.env.DB_STARTUP_ATTEMPTS ?? 30);
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await migrate();
      return;
    } catch (migrationError) {
      lastError = migrationError;
      console.warn(`Database is not ready (attempt ${attempt}/${attempts}); retrying...`);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("Database did not become ready before the startup timeout");
}

start().catch(async (startupError) => {
  console.error("Humanly OSS failed to start:", startupError);
  await closeDb();
  process.exit(1);
});