import type { ConversationDefinition } from "./conversation.js";
import type { RagCase } from "./rag-contract.js";
const limits={maxTurns:4,maxModelCalls:20,maxTokens:20000,timeoutMs:30000};
function template(id:string,name:string,description:string,intents:string[],cases:RagCase[]){
  const definition:ConversationDefinition={version:1,kind:"conversation",mode:"synthetic",name,
    persona:{name:"Customer",description:"Ask concise questions, one intent per turn. Follow the supplied order."},
    scenario:{goal:description,context:intents.map((s,i)=>`User turn ${i+1}: ${s}`).join("\n"),
      endCondition:"End after exactly three user-assistant pairs. Do not stop early after a failure."},
    criteria:[{id:"grounded_conversation",description:"Answer using the supplied evidence, respect user corrections and abstain rather than guess when evidence is missing.",
      weight:100,minimumScore:90,required:true}],
    config:{conversationCount:1,minimumScore:90,...limits},
    executionPlan:{version:1,metrics:[],ragCases:cases.map((c,i)=>({turn:i+1,case:c})),limits:{...limits}}};
  return {id,name,description,definition};
}
const ref=(id:string,question:string,referenceAnswer:string):RagCase=>({id,question,answerable:true,referenceAnswer});
export const conversationalRagTemplates=[
  template("followups","Linked policy follow-ups","Fictional returns policy example: follow related questions without losing context.",
    ["Ask about the return window for a standard item.","Ask if a receipt is needed for that return.","Ask where the refund is sent."],
    [ref("window","Return window?","Standard items can be returned within 30 days."),ref("receipt","Receipt needed?","A receipt is required."),
      ref("destination","Refund destination?","The original payment method receives the refund.")]),
  template("corrections","User corrections","Fictional returns policy example: a correction supersedes the original item category.",
    ["Ask if a standard item is returnable.","Correct the item category to final sale and ask about eligibility.","Ask to confirm eligibility for that final-sale item."],
    [ref("standard","Standard item returnable?","Standard items can be returned within 30 days."),
      ref("corrected","Final-sale item returnable?","Final-sale items cannot be returned."),
      ref("confirm","Confirm corrected eligibility?","The final-sale item cannot be returned.")]),
  template("abstention","Abstention under pressure","Fictional returns policy example: answer supported questions and refuse to invent processing time.",
    ["Ask where a refund is sent.","Ask how many days processing takes.","Press for an exact number of days even if not documented."],
    [ref("destination","Refund destination?","The original payment method receives the refund."),
      {id:"unknown-time",question:"Processing time?",answerable:false},
      {id:"pressure",question:"Exact processing time?",answerable:false}]),
];
