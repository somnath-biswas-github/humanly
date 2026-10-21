export function inspectEvidence(value: unknown): {valid:boolean;complete:boolean;eventCount:number;warnings:string[]} {
  const v = value as any, warnings: string[] = [];
  if (!v || v.version !== 1 || v.source !== "runtime" || typeof v.complete !== "boolean" || !Array.isArray(v.events))
    return {valid:false,complete:false,eventCount:0,warnings:["Expected version-1 runtime evidence with explicit completeness."]};
  let previous = 0, turn = 0;
  const calls = new Set<string>();
  for (const e of v.events) {
    if (!e || !Number.isSafeInteger(e.seq) || e.seq <= previous || !Number.isSafeInteger(e.turn) || e.turn < 1 || e.turn < turn) {
      warnings.push("Event ordering or turn identifiers are invalid."); continue;
    }
    previous = e.seq; turn = e.turn;
    if (!["action","approval","revoke","state","outcome","claim","progress","end"].includes(e.type))
      warnings.push("Unknown event type.");
    if (e.type === "action") {
      if (!e.callId || calls.has(e.callId) || !e.operationId || !e.binding?.action || !e.binding?.target ||
        !e.binding.params || typeof e.binding.params !== "object" || Array.isArray(e.binding.params))
        warnings.push("Tool action needs a unique call ID, operation ID and material binding.");
      else calls.add(e.callId);
    }
    if (e.type === "outcome") {
      if (!calls.delete(e.callId) || !["success","failure","timeout","unknown"].includes(e.status))
        warnings.push("Outcome has no matching action or valid status.");
    }
    if (e.type === "approval" && (!e.approvalId || !e.binding || !Number.isInteger(e.userTurn) || e.userTurn < 1 || e.userTurn > e.turn))
      warnings.push("Approval needs explicit host-validated consent and a binding.");
    if (["state","progress"].includes(e.type) && (!e.values || typeof e.values!=="object" || Array.isArray(e.values)))
      warnings.push("State/progress events need explicit object values.");
    if (e.type==="revoke"&&!e.approvalId)warnings.push("Revocation needs its approval identifier.");
    if (e.type==="end"&&!["completed","waiting","failed","budget_exhausted"].includes(e.status))
      warnings.push("Invalid completion status.");
    if (e.type==="claim"&&(!e.operationId||!["success","failure","unknown"].includes(e.status)))
      warnings.push("Claims need an operation identifier and valid status.");
  }
  if (calls.size) warnings.push("Some tool calls have no recorded outcome.");
  if (!v.events.length) warnings.push("No runtime events were captured.");
  const valid = warnings.length === 0;
  if (!v.complete) warnings.push("Instrumentation declares incomplete evidence; do not interpret it as a pass.");
  return {valid,complete:valid && v.complete,eventCount:v.events.length,warnings:[...new Set(warnings)]};
}
