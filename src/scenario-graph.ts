import type { ScenarioContract } from "./evaluation-contracts.js";
export type BranchDecision = { turn: number; stageId: string; nextStageId?: string; reason: string };
export class ScenarioGraph {
  private visits = new Map<string, number>();
  private current: string;
  readonly history: BranchDecision[] = [];
  constructor(private graph: ScenarioContract) { this.current = graph.start; }
  enter() {
    const stage = this.graph.stages.find(s => s.id === this.current)!;
    const count = (this.visits.get(stage.id) ?? 0) + 1;
    if (count > stage.maxVisits) throw new Error("Stage visit limit reached");
    this.visits.set(stage.id, count); return stage;
  }
  async advance(turn: number, answer: string, route: (conditions: string[]) => Promise<boolean[]>): Promise<boolean> {
    const stage = this.graph.stages.find(s => s.id === this.current)!;
    if (stage.terminal) {
      this.history.push({ turn, stageId: stage.id, reason: "terminal" }); return true;
    }
    const modelEdges = stage.transitions.filter(e => e.routing === "model");
    const matched = modelEdges.length ? await route(modelEdges.map(e => e.condition)) : [];
    if (!Array.isArray(matched) || matched.length !== modelEdges.length || matched.some(x => typeof x !== "boolean"))
      throw new Error("Invalid branch decision");
    let index = 0;
    const matches = stage.transitions.filter(e => e.routing === "model" ? matched[index++] :
      e.condition === "always" ? true :
        e.condition.startsWith("contains:") ? answer.toLowerCase().includes(e.condition.slice(9).toLowerCase()) :
          !answer.toLowerCase().includes(e.condition.slice(13).toLowerCase()));
    if (matches.length > 1) {
      this.history.push({ turn, stageId: stage.id, reason: "ambiguous" });
      throw new Error("Ambiguous branch decision");
    }
    if (!matches.length && stage.onNoMatch === "stop_inconclusive") {
      this.history.push({ turn, stageId: stage.id, reason: "unmatched" });
      throw new Error("No branch matched");
    }
    const nextStageId = matches[0]?.to ?? stage.id;
    this.history.push({ turn, stageId: stage.id, nextStageId, reason: matches.length ? "matched" : "repeat" });
    this.current = nextStageId; return false;
  }
}
