export type RunStatus = "pending" | "running" | "completed" | "failed" | "cancelled";

export interface Report {
  runId: string;
  status: RunStatus;
  overallScore: number;
  passRate: number;
  conversationCount: number;
  conversations: ConversationResult[];
  baselineBreach: boolean;
  baselineId?: string;
  baselineDelta?: number;
  createdAt: string;
  completedAt?: string;
}

export interface ConversationResult {
  id: string;
  personaName: string;
  turnCount: number;
  overallScore: number;
  passed: boolean;
  checkScores: Array<{
    checkName: string;
    score: number;
    passed: boolean;
    explanation: string;
  }>;
  request: { message: string; conversationId: string };
  response?: string;
  error?: string;
}