import type { RagCase, RagSuite, Metric } from "./rag-contract.js";
import type { Model } from "./conversation.js";

const metrics = ["retrievalRecall", "expectedFactCoverage", "referenceCorrectness", "groundedness", "citations", "answerHandling", "prohibitedClaims"];
export type RagPersona = { name: string; description: string; questionTemplate: string };
export type PersonaRagConfig = {
  name: string; personas: RagPersona[];
  topics: Array<{ subject: string; criteria: Metric[] }>;
  thresholds?: RagSuite["thresholds"];
};
export type PersonaRagCandidate = {
  id: string; persona: RagPersona; topic: string; criteria: Metric[];
  question: string;
  generation?: "model";
};
export type PersonaRagProvenance = {
  kind: "persona-template" | "persona-model"; persona: RagPersona; topic: string; criteria: Metric[];
  reviewer: string; referenceSource: string; reviewedContent: string;
};
export type PersonaRagDraft = {
  version: 1; kind: "persona-rag-draft"; name: string;
  thresholds?: RagSuite["thresholds"];
  generationUsage?: Array<{ model: string; promptTokens: number; completionTokens: number; totalTokens: number }>;
  candidates: Array<PersonaRagCandidate & { review?: {
    reviewer: string; referenceSource: string; case: RagCase;
  } }>;
};
function text(value: unknown, max: number): value is string {
  return typeof value === "string" && !!value.trim() && value.length <= max;
}
/** Explicit opt-in model drafting. Never calls an agent or generates reference truth. */
export async function generatePersonaRag(input: unknown, model: Model, maxTokens = 10000): Promise<PersonaRagDraft> {
  if (!Number.isSafeInteger(maxTokens) || maxTokens < 1 || maxTokens > 100000)
    throw new Error("Invalid drafting token budget");
  const draft = draftPersonaRag(input);
  draft.generationUsage = [];
  let spent = 0;
  for (const candidate of draft.candidates) {
    if (spent >= maxTokens) throw new Error("Drafting token budget exhausted");
    const result = await model({
      purpose: "simulate", persona: { name: candidate.persona.name,
        description: `${candidate.persona.description}\nAuthored speaking style: ${candidate.persona.questionTemplate}` },
      scenario: { goal: `Ask one realistic independent question about: ${candidate.topic}`,
        context: "Draft only the user's question. Do not answer it or invent reference facts.",
        endCondition: "Return exactly one question with done:false; do not terminate." }, messages: [], turn: 1,
    }, { timeoutMs: 30000, maxOutputTokens: Math.min(512, maxTokens - spent) });
    const u = result.usage;
    if (!u || !text(u.model, 200) || ![u.promptTokens, u.completionTokens, u.totalTokens].every(n => Number.isSafeInteger(n) && n >= 0) ||
      u.totalTokens < u.promptTokens + u.completionTokens) throw new Error("Drafting usage unavailable");
    draft.generationUsage.push(structuredClone(u)); spent += u.totalTokens;
    if (spent > maxTokens) throw new Error("Reported drafting usage exceeded budget; no further requests made");
    const answer = result.output as any;
    if (answer?.done !== false || !text(answer?.message, 4000)) throw new Error("Invalid drafted question");
    candidate.question = answer.message; candidate.generation = "model";
  }
  return draft;
}
function persona(value: any): value is RagPersona {
  return value && text(value.name, 200) && text(value.description, 2000) &&
    text(value.questionTemplate, 2000) && value.questionTemplate.includes("{{topic}}");
}
function criteria(value: unknown): value is Metric[] {
  return Array.isArray(value) && value.length > 0 && value.length <= metrics.length &&
    new Set(value).size === value.length && value.every(v => metrics.includes(v));
}
function thresholds(value: any) {
  if (value !== undefined && (!value || Array.isArray(value) || typeof value !== "object" ||
    Object.entries(value).some(([key, score]) => !metrics.includes(key) || typeof score !== "number" ||
      !Number.isFinite(score) || score < 0 || score > 100))) throw new Error("Invalid RAG thresholds");
}
/** Deterministic authored-persona phrasing, not AI generation or reference truth. */
export function draftPersonaRag(input: unknown): PersonaRagDraft {
  const c = input as PersonaRagConfig;
  if (!c || !text(c.name, 200) || !Array.isArray(c.personas) || !c.personas.length ||
    !c.personas.every(persona) || new Set(c.personas.map(p => p.name)).size !== c.personas.length ||
    !Array.isArray(c.topics) || !c.topics.length || c.personas.length * c.topics.length > 20 ||
    !c.topics.every(t => t && text(t.subject, 1500) && criteria(t.criteria)))
    throw new Error("Provide named personas with {{topic}} question templates and topics with criteria; maximum 20 combinations");
  thresholds(c.thresholds);
  return { version: 1, kind: "persona-rag-draft", name: c.name,
    thresholds: structuredClone(c.thresholds),
    candidates: c.personas.flatMap((p, i) => c.topics.map((t, j) => ({
      id: `persona-${i + 1}-topic-${j + 1}`, persona: structuredClone(p), topic: t.subject,
      criteria: [...t.criteria], question: p.questionTemplate.replaceAll("{{topic}}", t.subject),
    }))),
  };
}
export function ragReviewContent(c: Omit<RagCase, "id">): string {
  return JSON.stringify({ question: c.question, answerable: c.answerable,
    referenceAnswer: c.referenceAnswer || "", expectedFacts: c.expectedFacts ?? [],
    expectedChunkIds: c.expectedChunkIds ?? [], prohibitedClaims: c.prohibitedClaims ?? [] });
}
export function reviewPersonaRagCandidate(
  candidate: PersonaRagCandidate, value: RagCase, reviewer: string, referenceSource: string,
): RagCase {
  if (!candidate || !text(candidate.id, 100) || !persona(candidate.persona) ||
    !text(candidate.topic, 1500) || !criteria(candidate.criteria) ||
    !text(reviewer, 200) || !text(referenceSource, 2000))
    throw new Error("Review requires persona, topic, criteria, reviewer and reference provenance");
  if (!text(value.question, 4000) || typeof value.answerable !== "boolean" ||
    (value.answerable && !value.referenceAnswer?.trim() && !value.expectedFacts?.some(f => f.trim())))
    throw new Error("Review the question, answerability and independent reference answer/facts first");
  const reviewed = structuredClone(value);
  if (!reviewed.referenceAnswer?.trim()) delete reviewed.referenceAnswer;
  reviewed.id = candidate.id;
  reviewed.provenance = { kind: candidate.generation === "model" ? "persona-model" : "persona-template", persona: structuredClone(candidate.persona),
    topic: candidate.topic, criteria: [...candidate.criteria], reviewer: reviewer.trim(),
    referenceSource: referenceSource.trim(), reviewedContent: ragReviewContent(value) };
  return reviewed;
}
export function validatePersonaRagReview(c: RagCase): void {
  if (c.provenance === undefined) return; // Legacy authored cases remain supported.
  const p = c.provenance;
  if (!p || !["persona-template", "persona-model"].includes(p.kind) || !persona(p.persona) ||
    !text(p.topic, 1500) || !criteria(p.criteria) || !text(p.reviewer, 200) ||
    !text(p.referenceSource, 2000) || p.reviewedContent !== ragReviewContent(c))
    throw new Error("Persona case changed or lacks review; review its question and reference evidence again");
}
export function approvePersonaRagDraft(input: unknown): RagSuite {
  const d = input as PersonaRagDraft;
  if (!d || d.version !== 1 || d.kind !== "persona-rag-draft" || !text(d.name, 200) ||
    !Array.isArray(d.candidates) || !d.candidates.length || d.candidates.length > 20)
    throw new Error("Invalid persona RAG draft");
  thresholds(d.thresholds);
  const cases = d.candidates.map(c => {
    if (!c.review?.case) throw new Error(`Candidate ${c.id} requires explicit human review`);
    return reviewPersonaRagCandidate(c, c.review.case, c.review.reviewer, c.review.referenceSource);
  });
  if (new Set(cases.map(c => c.id)).size !== cases.length) throw new Error("Duplicate candidate identifiers");
  return { version: 1, name: d.name, thresholds: d.thresholds, cases };
}
