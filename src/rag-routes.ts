import { randomUUID } from "node:crypto";
import type { RequestHandler } from "express";
import { object, validateSuite, type Judge } from "./rag-contract.js";
import { runRagSuite, type InvokeAgent } from "./rag.js";

export function ragRunHandler(dependencies: {
  judge: () => Judge;
  connector: (id: string) => Promise<InvokeAgent | undefined>;
  save: (report: any) => Promise<void>;
}): RequestHandler {
  return async (req, res, next) => {
    const body = req.body;
    try {
      if (!object(body)) throw new Error("Expected JSON object");
      validateSuite(body.suite);
      if ((body.observations === undefined) === (body.connectorId === undefined)) throw new Error("Supply observations OR connectorId");
      if (body.connectorId !== undefined && (typeof body.connectorId !== "string" || !body.connectorId.trim())) throw new Error("Invalid connectorId");
      if (body.observations !== undefined && (!object(body.observations) ||
          Object.keys(body.observations).some(id => !body.suite.cases.some((c: { id: string }) => c.id === id)))) throw new Error("Invalid observations or unknown case ID");
    } catch (error) {
      res.status(400).json({ error: (error as Error).message }); return;
    }
    try {
      let judge: Judge;
      try { judge = dependencies.judge(); }
      catch { res.status(503).json({ error: "RAG judge is not configured; configure the server's RAG_JUDGE settings." }); return; }
      const invoke = body.connectorId === undefined ? undefined : await dependencies.connector(body.connectorId);
      if (body.connectorId !== undefined && !invoke) { res.status(404).json({ error: "connector not found" }); return; }
      const runId = `rag_${randomUUID()}`;
      const createdAt = new Date().toISOString();
      const result = await runRagSuite({ suite: body.suite, observations: body.observations, invoke, judge, runId });
      const passed = result.qualityGate.passed;
      const report = {
        ...result, report: result, status: "completed", overallScore: passed ? 1 : 0,
        passRate: result.cases.filter(c => c.status === "pass").length / result.cases.length,
        conversationCount: result.cases.length, conversations: [], baselineBreach: false,
        createdAt, completedAt: new Date().toISOString(),
      };
      await dependencies.save(report);
      res.status(201).json(report);
    } catch (error) { next(error); }
  };
}
