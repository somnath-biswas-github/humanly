export type Chunk = { id?: string; chunkId?: string; documentId?: string; content: string };
export type Citation = { id?: string; chunkId?: string; documentId?: string };
export type Observation = { answer: string; retrievedChunks?: Chunk[]; citations?: Citation[] };
export type RagCase = {
  id: string; question: string; answerable: boolean; referenceAnswer?: string;
  expectedFacts?: string[]; expectedChunkIds?: string[]; prohibitedClaims?: string[];
};
export const defaultThresholds = {
  retrievalRecall: 80, expectedFactCoverage: 90, referenceCorrectness: 90,
  groundedness: 90, citations: 90, answerHandling: 100, prohibitedClaims: 100,
};
export type Metric = keyof typeof defaultThresholds;
export type RagSuite = {
  version: 1; name: string; cases: RagCase[];
  thresholds?: Partial<Record<Metric, number>>;
};
export type Finding = { score: number; explanation: string; findings: string[] };
export type Assessment = {
  expectedFactCoverage: Finding; referenceCorrectness: Finding; prohibitedClaims: Finding;
  answerHandling: Finding & { responseKind: "insufficient_evidence" | "explicit_refusal" | "substantive_answer" | "disclaimer_with_answer" };
  groundedness: Finding | null; citations: Finding | null;
};
export type JudgeInput = { case: RagCase; observation: Observation };
export type JudgeResult = {
  assessment: Assessment;
  usage?: { model: string; promptTokens: number; completionTokens: number; totalTokens: number };
};
export type Judge = (input: JudgeInput) => Promise<JudgeResult>;
export class RagJudgeError extends Error {
  constructor(public readonly code: string, public readonly usage?: JudgeResult["usage"]) {
    super(code);
  }
}

export function object(value: unknown): value is Record<string, any> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function string(value: unknown, max: number, empty = false): value is string {
  return typeof value === "string" && value.length <= max && (empty || !!value.trim());
}
function strings(value: unknown): boolean {
  return Array.isArray(value) && value.length <= 100 && value.every(v => string(v, 1000));
}
export function validateSuite(value: unknown): asserts value is RagSuite {
  if (!object(value) || value.version !== 1 || !string(value.name, 200) ||
      !Array.isArray(value.cases) || !value.cases.length || value.cases.length > 20) {
    throw new Error("RAG suite requires version:1, name and 1–20 cases");
  }
  if (JSON.stringify(value).length > 200000) throw new Error("RAG suite exceeds 200000 characters");
  const ids = new Set<string>();
  for (const c of value.cases) {
    if (!object(c) || !string(c.id, 100) || ids.has(c.id) || !string(c.question, 4000) ||
        typeof c.answerable !== "boolean") throw new Error("Each RAG case needs a unique id, question and boolean answerable");
    ids.add(c.id);
    if (c.referenceAnswer !== undefined && !string(c.referenceAnswer, 8000)) throw new Error("Invalid referenceAnswer");
    for (const k of ["expectedFacts", "expectedChunkIds", "prohibitedClaims"]) {
      if (c[k] !== undefined && !strings(c[k])) throw new Error(`Invalid ${k}`);
    }
    if (c.answerable && !c.referenceAnswer && !c.expectedFacts?.length) {
      throw new Error("Answerable cases require referenceAnswer or expectedFacts");
    }
  }
  if (value.thresholds !== undefined) {
    if (!object(value.thresholds)) throw new Error("thresholds must be an object");
    for (const [key, score] of Object.entries(value.thresholds)) {
      if (!Object.hasOwn(defaultThresholds, key) || typeof score !== "number" ||
          !Number.isFinite(score) || score < 0 || score > 100) throw new Error("Thresholds must be known metric names with scores from 0 to 100");
    }
  }
}

export function validateObservation(value: unknown): asserts value is Observation {
  if (!object(value) || !string(value.answer, 12000, true)) throw new Error("Observation requires an answer string (max 12000 characters)");
  for (const key of ["retrievedChunks", "citations"]) {
    const entries = value[key];
    if (entries === undefined) continue;
    if (!Array.isArray(entries) || entries.length > 100) throw new Error(`Invalid ${key}`);
    for (const e of entries) {
      if (!object(e) || ![e.id, e.chunkId, e.documentId].some(x => string(x, 500))) throw new Error(`Each ${key} entry needs a source identifier`);
      for (const id of ["id", "chunkId", "documentId"]) {
        if (e[id] !== undefined && !string(e[id], 500)) throw new Error(`Invalid ${key} identifier`);
      }
      if (key === "retrievedChunks" && !string(e.content, 30000)) throw new Error("Retrieved chunks require non-empty content");
    }
    if (JSON.stringify(entries).length > (key === "retrievedChunks" ? 30000 : 10000)) throw new Error(`${key} exceeds evaluation limit`);
  }
}

export function validateAssessment(value: unknown, hasEvidence: boolean): asserts value is Assessment {
  if (!object(value)) throw new Error("Invalid judge assessment");
  for (const key of ["expectedFactCoverage", "referenceCorrectness", "prohibitedClaims", "answerHandling", "groundedness", "citations"]) {
    const finding = value[key];
    if ((key === "groundedness" || key === "citations") && !hasEvidence) {
      if (finding !== null) throw new Error("Judge must not invent an assessment without evidence");
      continue;
    }
    if (!object(finding) || typeof finding.score !== "number" || !Number.isFinite(finding.score) ||
        finding.score < 0 || finding.score > 100 || !string(finding.explanation, 8000) ||
        !Array.isArray(finding.findings) || finding.findings.length > 100 ||
        !finding.findings.every((v: unknown) => string(v, 8000))) throw new Error(`Invalid judge ${key}`);
    if (finding.score === 100 && finding.findings.length) throw new Error(`Contradictory judge ${key}`);
  }
  if (!["insufficient_evidence", "explicit_refusal", "substantive_answer", "disclaimer_with_answer"].includes(value.answerHandling.responseKind)) {
    throw new Error("Invalid judge response classification");
  }
}
