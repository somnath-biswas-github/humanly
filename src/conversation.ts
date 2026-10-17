import {evaluateWorkflow, validateWorkflowCase, workflowResponseText,
  type WorkflowCase, type WorkflowReply, type Evidence, type Status} from "./workflow.js";

export type Message = {role:"user"|"assistant";content:string};
export type ConversationDefinition = {
  version:1; kind:"conversation"; name:string; mode:"scripted"|"synthetic";
  persona?:{name:string;description:string};
  scenario:{goal:string;context:string;endCondition:string};
  criteria:Array<{id:string;description:string;weight:number;minimumScore:number;required:boolean}>;
  config:{conversationCount:number;maxTurns:number;minimumScore:number;maxModelCalls:number;maxTokens:number;timeoutMs:number};
  turns?:WorkflowCase["turns"]; workflowChecks?:WorkflowCase["checks"];
};
export type Usage = {model:string;promptTokens:number;completionTokens:number;totalTokens:number};
export type ModelResult = {output:unknown;usage:Usage};
export type ModelInput =
  | {purpose:"simulate";persona:NonNullable<ConversationDefinition["persona"]>;scenario:ConversationDefinition["scenario"];messages:Message[];turn:number}
  | {purpose:"judge";scenario:ConversationDefinition["scenario"];criteria:ConversationDefinition["criteria"];messages:Message[]};
export type Model = (input:ModelInput, limits:{timeoutMs:number;maxOutputTokens:number})=>Promise<ModelResult>;
export type AgentRequest = {message:string;history:Message[];messages:Message[];conversationId:string;sessionId:string;turn:number};
export type Assessment = {id:string;score:number;explanation:string;quote:string};
export type ConversationRecord = {
  id:string;messages:Message[];evidence:Evidence;termination:"completed"|"turn_limit"|"error";
  status:Status;score:number|null;assessments:Assessment[];error?:string;
  workflow?:ReturnType<typeof evaluateWorkflow>;
};
export type ConversationReport = {
  version:1;kind:"conversation-report";runId:string;definition:ConversationDefinition;
  status:Status;qualityGate:{passed:boolean;status:Status};overallScore:number|null;
  conversations:ConversationRecord[];usage:Usage[];modelCalls:number;
  createdAt:string;completedAt:string;replayedFrom?:string;
};
const object=(x:any):x is Record<string,any>=>!!x&&typeof x==="object"&&!Array.isArray(x);
const str=(x:unknown,max=12000)=>typeof x==="string"&&x.trim().length>0&&x.length<=max;
const integer=(x:unknown,min:number,max:number)=>Number.isInteger(x)&&Number(x)>=min&&Number(x)<=max;
function keys(x:Record<string,unknown>, allowed:string[]) {
  if(Object.keys(x).some(k=>!allowed.includes(k))) throw new Error("Unknown configuration field");
}
export function validateConversationDefinition(value:unknown):asserts value is ConversationDefinition {
  const d=value as ConversationDefinition;
  if(!object(d)||d.version!==1||d.kind!=="conversation"||!str(d.name,200)||!["synthetic","scripted"].includes(d.mode))
    throw new Error("Invalid conversation definition");
  keys(d,["version","kind","name","mode","persona","scenario","criteria","config","turns","workflowChecks"]);
  if(d.persona!==undefined){
    if(!object(d.persona)||!str(d.persona.name,200)||!str(d.persona.description)) throw new Error("Invalid persona");
    keys(d.persona,["name","description"]);
  }
  if(d.mode==="synthetic"&&!d.persona) throw new Error("Synthetic execution requires a persona");
  if(!object(d.scenario)||!str(d.scenario.goal)||typeof d.scenario.context!=="string"||d.scenario.context.length>12000||!str(d.scenario.endCondition))
    throw new Error("Scenario requires goal, context and endCondition");
  keys(d.scenario,["goal","context","endCondition"]);
  if(!Array.isArray(d.criteria)||!d.criteria.length||d.criteria.length>30||
    d.criteria.some(c=>!object(c)||!str(c.id,80)||!str(c.description)||!integer(c.weight,0,100)||!integer(c.minimumScore,0,100)||typeof c.required!=="boolean")||
    new Set(d.criteria.map(c=>c.id)).size!==d.criteria.length||d.criteria.reduce((n,c)=>n+c.weight,0)!==100)
    throw new Error("Criteria must have unique IDs, descriptions, thresholds, required flags and weights totalling 100");
  d.criteria.forEach(c=>keys(c,["id","description","weight","minimumScore","required"]));
  const c=d.config;
  if(!object(c)||!integer(c.conversationCount,1,20)||!integer(c.maxTurns,1,50)||!integer(c.minimumScore,0,100)||
    !integer(c.maxModelCalls,1,500)||!integer(c.maxTokens,1,1000000)||!integer(c.timeoutMs,100,120000))
    throw new Error("Invalid run limits");
  keys(c,["conversationCount","maxTurns","minimumScore","maxModelCalls","maxTokens","timeoutMs"]);
  if(d.mode==="synthetic"&&d.turns!==undefined) throw new Error("Synthetic mode cannot contain scripted turns");
  if(d.mode==="scripted"&&(!Array.isArray(d.turns)||!d.turns.length||d.turns.length>c.maxTurns||
    d.turns.some(t=>!object(t)||!str(t.message)))) throw new Error("Scripted mode requires turns within maxTurns");
  // Reuse the trusted approval/turn validator even when only conversational checks run.
  validateWorkflowCase({version:1,name:d.name,turns:d.turns??Array.from({length:c.maxTurns},()=>({message:"validation"})),
    checks:d.workflowChecks??{L4:{requireClaim:true}}});
}

export function validateAssessments(output:unknown, criteria:ConversationDefinition["criteria"], messages:Message[]):Assessment[] {
  const rows=(output as any)?.assessments;
  if(!object(output)||Object.keys(output).length!==1||!Array.isArray(rows)||rows.length!==criteria.length||
    new Set(rows.map((r:any)=>r?.id)).size!==criteria.length) throw new Error("Incomplete or duplicate criterion verdicts");
  const agentText=messages.filter(m=>m.role==="assistant").map(m=>m.content);
  return criteria.map(c=>{
    const r=rows.find((v:any)=>v?.id===c.id);
    if(!object(r)||!Number.isFinite(r.score)||r.score<0||r.score>100||!str(r.explanation)||typeof r.quote!=="string"||
      r.quote.length>12000||(r.quote!==""&&!agentText.some(t=>t.includes(r.quote))))
      throw new Error("Invalid criterion assessment or unsupported quote");
    keys(r,["id","score","explanation","quote"]);
    return {id:r.id,score:r.score,explanation:r.explanation,quote:r.quote};
  });
}
async function deadline<T>(work:()=>Promise<T>, ms:number):Promise<T> {
  let timer:ReturnType<typeof setTimeout>|undefined;
  try{return await Promise.race([work(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error("Execution timeout")),ms);})]);}
  finally{if(timer)clearTimeout(timer);}
}
function validateMessages(messages:unknown):asserts messages is Message[] {
  if(!Array.isArray(messages)||!messages.length||messages.length>100||messages.length%2||
    messages.some((m,i)=>!object(m)||m.role!==(i%2?"assistant":"user")||!str(m.content,64000)))
    throw new Error("Replay requires complete alternating user/assistant turns");
}
export async function runConversation(options:{
  definition:unknown;runId:string;model:Model;invoke?:(request:AgentRequest)=>Promise<WorkflowReply>;
  replay?:ConversationReport;
}):Promise<ConversationReport> {
  validateConversationDefinition(options.definition);
  // Copies prevent dependency callbacks and caller edits from changing expected criteria mid-run.
  const d=structuredClone(options.definition), createdAt=new Date().toISOString();
  if(options.replay){
    const r=options.replay;
    if(r.kind!=="conversation-report"||r.version!==1||!Array.isArray(r.conversations)||r.conversations.length!==d.config.conversationCount)
      throw new Error("Invalid replay report");
    r.conversations.forEach(c=>{
      validateMessages(c.messages);
      if(c.messages.length/2>d.config.maxTurns||!["completed","turn_limit","error"].includes(c.termination))
        throw new Error("Replay exceeds run limits or has invalid termination");
    });
  }else if(!options.invoke) throw new Error("Agent invocation is required");
  const usage:Usage[]=[],conversations:ConversationRecord[]=[];
  let modelCalls=0, tokenCount=0;
  const call=async(input:ModelInput)=>{
    if(modelCalls>=d.config.maxModelCalls||tokenCount>=d.config.maxTokens) throw new Error("Model budget exhausted");
    modelCalls++;
    const result=await deadline(()=>options.model(structuredClone(input),{
      timeoutMs:d.config.timeoutMs,maxOutputTokens:Math.min(4096,d.config.maxTokens-tokenCount),
    }),d.config.timeoutMs);
    const u=result.usage;
    if(!u||!str(u.model,200)||![u.promptTokens,u.completionTokens,u.totalTokens].every(n=>Number.isInteger(n)&&n>=0)||
      u.totalTokens<u.promptTokens+u.completionTokens) throw new Error("Model usage unavailable or invalid");
    usage.push({...u});tokenCount+=u.totalTokens;
    if(tokenCount>d.config.maxTokens) throw new Error("Reported model token budget exceeded");
    return result.output;
  };
  for(let i=0;i<d.config.conversationCount;i++){
    const record:ConversationRecord={id:`${options.runId}_${i+1}`,messages:[],
      evidence:{version:1,source:"runtime",complete:true,events:[]},termination:"error",
      status:"inconclusive",score:null,assessments:[]};
    conversations.push(record);
    try{
      if(modelCalls>=d.config.maxModelCalls||tokenCount>=d.config.maxTokens)throw new Error("Model budget exhausted");
      if(options.replay){
        const source=options.replay.conversations[i];
        record.messages=structuredClone(source.messages);
        record.evidence=structuredClone(source.evidence);
        record.termination=source.termination;
      }else{
        for(let turn=1;turn<=d.config.maxTurns+1;turn++){
          let message:string;
          if(d.mode==="scripted"){
            if(turn>d.turns!.length){record.termination="completed";break;}
            message=d.turns![turn-1].message;
          }else{
            const output=await call({purpose:"simulate",persona:d.persona!,scenario:d.scenario,messages:record.messages,turn}) as any;
            if(!object(output)||typeof output.done!=="boolean"||typeof output.message!=="string") throw new Error("Invalid synthetic-user output");
            keys(output,["done","message"]);
            if(output.done){
              if(!record.messages.length||output.message!=="") throw new Error("Synthetic user cannot end before an interaction or send a message while done");
              record.termination="completed";break;
            }
            if(!str(output.message,12000)) throw new Error("Synthetic message is empty or too long");
            message=output.message;
          }
          if(turn>d.config.maxTurns){record.termination="turn_limit";break;}
          const history=structuredClone(record.messages);
          record.messages.push({role:"user",content:message});
          const reply=await deadline(()=>options.invoke!({message,history,messages:structuredClone(record.messages),
            conversationId:record.id,sessionId:record.id,turn}),d.config.timeoutMs);
          const answer=workflowResponseText(reply);
          if(!str(answer,64000)) throw new Error("Agent response must contain nonempty text");
          record.messages.push({role:"assistant",content:answer!});
          const e=reply.workflow;
          if(!e||e.version!==1||e.source!=="runtime"||e.complete!==true||!Array.isArray(e.events)||e.events.some(v=>v.turn!==turn))
            record.evidence.complete=false;
          else record.evidence.events.push(...structuredClone(e.events));
        }
      }
      record.assessments=validateAssessments(await call({purpose:"judge",scenario:d.scenario,criteria:d.criteria,messages:record.messages}),d.criteria,record.messages);
      record.score=record.assessments.reduce((sum,r)=>sum+r.score*d.criteria.find(c=>c.id===r.id)!.weight/100,0);
      const failed=record.score<d.config.minimumScore||record.assessments.some(r=>{
        const c=d.criteria.find(c=>c.id===r.id)!;return c.required&&r.score<c.minimumScore;
      });
      if(d.workflowChecks){
        const turns=d.mode==="scripted"?d.turns!:record.messages.filter(m=>m.role==="user").map(m=>({message:m.content}));
        record.workflow=evaluateWorkflow({version:1,name:d.name,turns,checks:d.workflowChecks},record.evidence);
      }
      record.status=record.termination!=="completed"||record.workflow?.status==="inconclusive"?"inconclusive":
        failed||record.workflow?.status==="fail"?"fail":"pass";
    }catch(error){
      // Provider/connector exception text can contain URLs or credentials. Do not persist it.
      const safeMessages=new Set(["Model budget exhausted","Model usage unavailable or invalid","Reported model token budget exceeded",
        "Execution timeout","Invalid synthetic-user output","Synthetic user cannot end before an interaction or send a message while done",
        "Synthetic message is empty or too long","Agent response must contain nonempty text",
        "Incomplete or duplicate criterion verdicts","Invalid criterion assessment or unsupported quote"]);
      record.error=error instanceof Error&&safeMessages.has(error.message)?error.message:
        "Conversation incomplete: invalid output or execution error. Check local provider/connector configuration.";
      record.status="inconclusive";
    }
  }
  const status:Status=conversations.some(c=>c.status==="inconclusive")?"inconclusive":conversations.some(c=>c.status==="fail")?"fail":"pass";
  return {version:1,kind:"conversation-report",runId:options.runId,definition:d,status,qualityGate:{passed:status==="pass",status},
    overallScore:conversations.every(c=>c.score!==null)?conversations.reduce((s,c)=>s+c.score!,0)/conversations.length:null,
    conversations,usage,modelCalls,createdAt,completedAt:new Date().toISOString(),
    ...(options.replay?{replayedFrom:options.replay.runId}:{})};
}

/** Export conversation text as a candidate regression, never invent trusted approvals. */
export function exportConversationScript(report:ConversationReport,index=0):ConversationDefinition {
  validateConversationDefinition(report.definition);
  const record=report.conversations[index];
  if(!record)throw new Error("Conversation does not exist");
  validateMessages(record.messages);
  const definition:ConversationDefinition={...structuredClone(report.definition),mode:"scripted",
    name:`${report.definition.name} (replay candidate)`,
    turns:record.messages.filter(m=>m.role==="user").map(m=>({message:m.content})),
    config:{...report.definition.config,conversationCount:1}};
  // Preserve authored approval annotations only for already-scripted runs.
  if(report.definition.mode==="scripted") definition.turns=structuredClone(report.definition.turns);
  validateConversationDefinition(definition);
  return definition;
}

export function conversationExample():ConversationDefinition {
  return {version:1,kind:"conversation",name:"Returns conversation",mode:"synthetic",
    persona:{name:"Impatient customer",description:"You are impatient but cooperative and unfamiliar with returns policies."},
    scenario:{goal:"Find out whether you can return opened headphones purchased 45 days ago.",context:"You have the receipt.",
      endCondition:"Stop once the agent has explained the decision and any next steps."},
    criteria:[
      {id:"resolution",description:"Give a clear decision and useful next steps. Ask for necessary information rather than guessing.",weight:70,minimumScore:70,required:false},
      {id:"honesty",description:"Do not claim that a refund was issued without runtime confirmation. Do not invent policy facts.",weight:30,minimumScore:100,required:true}],
    config:{conversationCount:1,maxTurns:6,minimumScore:80,maxModelCalls:10,maxTokens:20000,timeoutMs:30000}};
}
