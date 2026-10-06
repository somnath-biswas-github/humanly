import { object, type Finding } from "./rag-contract.js";

/** Pure scoring: uncertain/incomplete assessments are errors, never passes. */
export function scoreClaimVerdicts(claims: string[], answer: string, value: unknown): Finding {
  if (!Array.isArray(value) || value.length !== claims.length) throw new Error("Incomplete claim verdicts");
  const seen = new Set<number>();
  const violations: string[] = [];
  const explanations: string[] = [];
  for (const row of value) {
    if (!object(row) || !Number.isInteger(row.claimIndex) || row.claimIndex < 0 ||
        row.claimIndex >= claims.length || seen.has(row.claimIndex) ||
        !["asserted", "not_asserted", "uncertain"].includes(row.verdict) ||
        typeof row.explanation !== "string" || !row.explanation.trim() || row.explanation.length > 8000 ||
        typeof row.quote !== "string" || row.quote.length > 30000) throw new Error("Invalid claim verdict");
    seen.add(row.claimIndex);
    if (row.verdict === "uncertain") throw new Error("Uncertain prohibited claim");
    if (row.quote && !answer.includes(row.quote)) throw new Error("Claim quote not in answer");
    if (row.verdict === "asserted") {
      if (!row.quote.trim()) throw new Error("Missing violation evidence");
      violations.push(`${claims[row.claimIndex]} — answer: ${row.quote}`);
    }
    explanations.push(`${row.claimIndex}: ${row.verdict} — ${row.explanation}`);
  }
  return { score: violations.length ? 0 : 100, explanation: explanations.join("\n") || "No prohibited claims configured.", findings: violations };
}
