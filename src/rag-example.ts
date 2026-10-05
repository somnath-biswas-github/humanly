import type { RagSuite, Observation } from "./rag-contract.js";

export function ragExample(faulty = false): { suite: RagSuite; observations: Record<string, Observation> } {
  return {
    suite: { version: 1, name: "Refund eligibility", cases: [{
      id: "electronics", question: "Can I return opened headphones after 20 days?",
      answerable: true,
      referenceAnswer: "No. The general return window is 30 days, but opened electronics are excluded unless defective.",
      expectedFacts: ["General returns are allowed within 30 days.", "Opened electronics are excluded unless defective."],
      expectedChunkIds: ["returns", "electronics-exception"],
      prohibitedClaims: ["Opened electronics can always be returned within 30 days."],
    }] },
    observations: { electronics: {
      answer: faulty ? "Yes, opened electronics can always be returned within 30 days." :
        "No. General returns are allowed within 30 days [policy/returns], but opened electronics are excluded unless defective [policy/electronics-exception].",
      retrievedChunks: [
        { documentId: "policy", chunkId: "returns", content: "General returns are allowed within 30 days." },
        ...(!faulty ? [{ documentId: "policy", chunkId: "electronics-exception", content: "Opened electronics are excluded unless defective." }] : []),
      ],
      citations: [{ documentId: "policy", chunkId: "returns" }, ...(!faulty ? [{ documentId: "policy", chunkId: "electronics-exception" }] : [])],
    } },
  };
}
