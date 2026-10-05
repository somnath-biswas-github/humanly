export type AgentResponseEvaluation = {
  responseText: string;
  passed: boolean;
  explanation: string;
};

export function extractAgentResponse(body: string): string {
  const trimmed = body.trim();
  if (!trimmed) return "";

  try {
    const parsed = JSON.parse(trimmed);
    if (typeof parsed === "string") return parsed.trim();
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      // Match workflow/Studio aliases, retaining the legacy OSS output alias.
      // First string wins even when blank: fallback must not hide an empty reply.
      const candidate = [
        parsed.reply, parsed.response, parsed.message, parsed.content,
        parsed.text, parsed.answer, parsed.output,
      ].find((value) => typeof value === "string");
      return typeof candidate === "string" ? candidate.trim() : "";
    }
    return "";
  } catch {
    // Plain-text responses are part of the AgentConnector contract.
  }

  return trimmed;
}

export function evaluateAgentResponse(
  responseOk: boolean,
  status: number,
  body: string,
): AgentResponseEvaluation {
  const responseText = extractAgentResponse(body);
  const passed = responseOk && responseText.length > 0;
  return {
    responseText,
    passed,
    explanation: passed
      ? "The HTTP agent returned a non-empty response."
      : `Agent returned HTTP ${status} or an empty response.`,
  };
}