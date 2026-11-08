/** A completed execution is not necessarily a passing evaluation. Fail closed. */
export function reportExitCode(report: any): 0 | 1 | 2 {
  if (!report || report.status !== "completed") return 2;
  const gate = report.qualityGate;
  if (gate?.status === "inconclusive" || report.errors?.length) return 2;
  if (report.baselineBreach || gate?.passed === false || gate?.status === "fail") return 1;
  if (Array.isArray(report.conversations) && report.conversations.length) {
    if (report.conversations.some((item: any) => typeof item.passed !== "boolean")) return 2;
    return report.conversations.every((item: any) => item.passed) ? 0 : 1;
  }
  if (gate?.passed === true && gate.status === "pass") return 0;
  // Legacy reports must positively establish full coverage and a passing rate.
  if (Number.isFinite(report.passRate) && report.passRate >= 0 && report.passRate <= 1 &&
      Number.isInteger(report.conversationCount) && report.conversationCount > 0) {
    return report.passRate === 1 ? 0 : 1;
  }
  return 2;
}
