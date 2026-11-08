// Release-level switch, deliberately not controlled by requests or environment.
// Retain implementations and stored reports for a future reviewed restoration.
export const SCRIPTED_TESTS_ENABLED: boolean = false;
export const SCRIPTED_TESTS_UNAVAILABLE =
  "Scripted Tests and scripted conversations are temporarily unavailable. Use adaptive (synthetic-user) testing or RAG evaluation instead. Existing reports are preserved.";

export function assertScriptedTestsAvailable(): void {
  if (!SCRIPTED_TESTS_ENABLED) throw new Error(SCRIPTED_TESTS_UNAVAILABLE);
}

export function assertConversationModeAvailable(definition: unknown): void {
  const d = definition as any;
  if (d?.mode === "scripted" || d?.executionPlan?.graph?.stages?.some((stage: any) => stage?.user?.mode === "scripted"))
    assertScriptedTestsAvailable();
}
