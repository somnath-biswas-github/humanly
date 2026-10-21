import { validateConversationDefinition, type ConversationDefinition } from "./conversation.js";
import { defaultExecutionPlan } from "./execution-plan.js";
export type Candidate = {version:1;generated:true;approved:false;requirements:string;definition:ConversationDefinition};
/** Deliberately template-derived: no model calls, invented truth or automatic execution. */
export function generateCandidate(requirements: string): Candidate {
  if (typeof requirements !== "string" || !requirements.trim() || requirements.length > 10000)
    throw new Error("Supply 1–10,000 characters of requirements or document text.");
  const plan = defaultExecutionPlan();
  plan.graph = {contractVersion:1,kind:"scenario",id:"generated-draft",start:"request",limits:{...plan.limits},stages:[
    {id:"request",user:{mode:"synthetic",instruction:"Ask for help with the supplied requirements. Do not invent customer facts."},
      terminal:false,maxVisits:1,onNoMatch:"stop_inconclusive",transitions:[{to:"clarify",routing:"rule",condition:"always"}]},
    {id:"clarify",user:{mode:"synthetic",instruction:"Ask one relevant follow-up based on the actual response."},
      terminal:true,maxVisits:1,onNoMatch:"stop_inconclusive",transitions:[]},
  ]};
  return {version:1,generated:true,approved:false,requirements,definition:{
    version:1,kind:"conversation",name:"Generated candidate — review required",mode:"synthetic",
    persona:{name:"Draft customer",description:"Cooperative user seeking help; review this persona for your target audience."},
    scenario:{goal:"Resolve the supplied request or explain limitations.",context:requirements,endCondition:"The configured stages have finished."},
    criteria:[{id:"requirements",description:"Address the supplied requirements without inventing facts or claiming unperformed actions.",weight:100,minimumScore:80,required:true}],
    config:{conversationCount:1,minimumScore:80,...plan.limits},executionPlan:plan,
  }};
}
export function approveCandidate(candidate: Candidate): ConversationDefinition {
  if (!candidate || candidate.version !== 1 || candidate.generated !== true || candidate.approved !== false)
    throw new Error("Expected an editable generated candidate awaiting review.");
  validateConversationDefinition(candidate.definition);
  // Approval returns only the reviewed executable definition; it never dispatches a run.
  return structuredClone(candidate.definition);
}
