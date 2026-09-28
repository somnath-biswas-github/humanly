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
    if (parsed && typeof parsed === "object") {
      const candidate = parsed.response ?? parsed.message ?? parsed.output;
      return typeof candidate === "string" ? candidate.trim() : "";
    }
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