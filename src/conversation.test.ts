import test from "node:test";
import assert from "node:assert/strict";
import {conversationExample,runConversation,exportConversationScript,validateConversationDefinition,type Model} from "./conversation.js";
import {conversationRunHandler} from "./conversation-routes.js";
import {conversationModelSchema,createConversationModel,CONVERSATION_JUDGE_PROMPT} from "./conversation-model.js";

test("judge separates behaviour, test exposure and configured policy",()=>{
  assert.match(CONVERSATION_JUDGE_PROMPT,/not test difficulty/);
  assert.match(CONVERSATION_JUDGE_PROMPT,/do not invent MFA/);
  assert.match(CONVERSATION_JUDGE_PROMPT,/evidence required by a configured criterion is missing/);
});
const usage={model:"fixture",promptTokens:1,completionTokens:1,totalTokens:2};
const model:Model=async input=>({usage,output:input.purpose==="simulate"?
  {done:input.messages.length>0,message:input.messages.length?"":"Can I return these headphones?"}:
  {assessments:input.criteria.map(c=>({id:c.id,score:100,explanation:"Fixture meets the requested criterion.",quote:"Contact support."}))}});
const invoke=async()=>({reply:"Contact support."});

test("synthetic persona/scenario drive messages; criteria never reach simulator or agent; each session is isolated",async()=>{
  const definition=conversationExample();definition.config.conversationCount=2;
  const requests:any[]=[];const seen:any[]=[];
  const result=await runConversation({definition,runId:"test",model:async(input,l)=>{
    seen.push(input);if(input.purpose==="simulate"){assert.equal("criteria" in input,false);assert.equal(input.persona.name,definition.persona!.name);}
    return model(input,l);
  },invoke:async request=>{requests.push(request);assert.equal("criteria" in request,false);assert.equal("persona" in request,false);return invoke();}});
  assert.equal(result.status,"pass");assert.equal(result.modelCalls,6);
  assert.equal(new Set(requests.map(r=>r.conversationId)).size,2);
  assert.ok(requests.every(r=>r.history.length===0));
  assert.equal(result.definition.criteria.length,2);assert.equal(seen.filter(x=>x.purpose==="judge").length,2);
});
test("scripted mode never calls simulator and sends actual history",async()=>{
  const definition=conversationExample();definition.mode="scripted";definition.turns=[{message:"First"},{message:"Second"}];
  const requests:any[]=[];
  const r=await runConversation({definition,runId:"script",model:async(i,l)=>{assert.equal(i.purpose,"judge");return model(i,l);},
    invoke:async request=>{requests.push(request);return invoke();}});
  assert.equal(r.status,"pass");assert.equal(requests[1].history.length,2);assert.equal(r.modelCalls,1);
});
test("configured weights and required thresholds determine the gate",async()=>{
  const d=conversationExample();
  const result=await runConversation({definition:d,runId:"fail",invoke,model:async(i,l)=>{
    const r=await model(i,l);if(i.purpose==="judge")(r.output as any).assessments[1].score=0;return r;
  }});
  assert.equal(result.status,"fail");assert.equal(result.overallScore,70);assert.equal(result.qualityGate.passed,false);
});
test("missing, duplicate, extra and invented-quote assessments never pass",async()=>{
  for(const change of ["missing","duplicate","extra","quote","nan"]){
    const r=await runConversation({definition:conversationExample(),runId:change,invoke,model:async(i,l)=>{
      const result=await model(i,l);
      if(i.purpose==="judge"){
        const a=(result.output as any).assessments;
        if(change==="missing")a.pop();
        if(change==="duplicate")a[1]=a[0];
        if(change==="extra")a.push({...a[0],id:"unknown"});
        if(change==="quote")a[0].quote="Invented evidence";
        if(change==="nan")a[0].score=NaN;
      }return result;
    }});
    assert.equal(r.status,"inconclusive",change);
  }
});
test("turn and model budgets cannot silently produce a pass",async()=>{
  for(const limit of ["maxTurns","maxModelCalls","maxTokens"] as const){
    const d=conversationExample();d.config[limit]=1;
    const r=await runConversation({definition:d,runId:limit,invoke,model:async(i,l)=>{
      if(i.purpose==="simulate")return {usage,output:{done:false,message:"Keep going"}};
      return model(i,l);
    }});
    assert.equal(r.status,"inconclusive",limit);assert.ok(r.modelCalls<=d.config.maxModelCalls);
  }
});
test("timeouts, unknown usage and raw provider secrets are not reported as success",async()=>{
  for(const failure of ["timeout","usage","secret"]){
    const d=conversationExample();d.config.timeoutMs=100;
    const r=await runConversation({definition:d,runId:failure,invoke,model:async()=>{
      if(failure==="timeout")return new Promise(()=>{});
      if(failure==="secret")throw new Error("Bearer customer-secret");
      return {usage:{} as any,output:{done:false,message:"Hi"}};
    }});
    assert.equal(r.status,"inconclusive");assert.ok(!JSON.stringify(r).includes("customer-secret"));
  }
});
test("runtime workflow checks remain evidence-based in synthetic mode",async()=>{
  const d=conversationExample();d.workflowChecks={L4:{requireClaim:true}};
  const r=await runConversation({definition:d,runId:"no-evidence",invoke,model});
  assert.equal(r.status,"inconclusive");assert.equal(r.conversations[0].workflow?.status,"inconclusive");
});
test("synthetic checkpoints can target later turns within the configured budget",async()=>{
  const d=conversationExample();
  d.workflowChecks={L3:{checkpoints:[{turn:2,values:{resolved:true}}],targets:[]}};
  const result=await runConversation({definition:d,runId:"later-state",model:async(i,l)=>
    i.purpose==="simulate"?{usage,output:{done:i.messages.length>=4,message:i.messages.length>=4?"":"Next question"}}:model(i,l),
    invoke:async request=>({reply:"Contact support.",workflow:{version:1,source:"runtime",complete:true,
      events:[{seq:request.turn,turn:request.turn,type:"state",values:{resolved:request.turn===2}}]}})});
  assert.equal(result.status,"pass");
  assert.equal(result.conversations[0].workflow?.status,"pass");
  d.workflowChecks.L3!.checkpoints[0].turn=d.config.maxTurns+1;
  assert.throws(()=>validateConversationDefinition(d));
});
test("replay calls only evaluator; script export preserves user turns not fabricated approvals",async()=>{
  const original=await runConversation({definition:conversationExample(),runId:"original",invoke,model});
  const replay=await runConversation({definition:original.definition,replay:original,runId:"replay",
    invoke:async()=>{assert.fail("Replay must not call agent");},model:async(i,l)=>{assert.equal(i.purpose,"judge");return model(i,l);}});
  assert.equal(replay.status,"pass");assert.equal(replay.replayedFrom,"original");
  const script=exportConversationScript(original);
  assert.equal(script.mode,"scripted");assert.deepEqual(script.turns,[{message:"Can I return these headphones?"}]);
  original.conversations[0].termination="turn_limit";
  assert.equal((await runConversation({definition:original.definition,replay:original,runId:"truncated",model})).status,"inconclusive");
});
test("invalid definitions rejected before any execution",async()=>{
  for(const mutate of [
    (d:any)=>d.criteria[0].weight=1,(d:any)=>d.config.conversationCount=0,
    (d:any)=>d.criteria.push(d.criteria[0]),(d:any)=>delete d.persona,(d:any)=>d.config.apiKey="not-allowed",
    (d:any)=>d.mode="unknown",
  ]){
    const d=conversationExample();mutate(d);assert.throws(()=>validateConversationDefinition(d));
    await assert.rejects(()=>runConversation({definition:d,runId:"invalid",model:async()=>assert.fail(),invoke:async()=>assert.fail()}));
  }
});
test("model endpoints reject credential-bearing URLs; schema separates simulation from judgement",()=>{
  assert.throws(()=>createConversationModel({baseUrl:"https://user:secret@example.com/v1",apiKey:"fixture"}));
  assert.throws(()=>createConversationModel({baseUrl:"http://example.com/v1",apiKey:"fixture"}));
  const d=conversationExample();
  assert.deepEqual(conversationModelSchema({purpose:"simulate",persona:d.persona!,scenario:d.scenario,messages:[],turn:1}).required,["done","message"]);
});
test("API requires a single source and saves actual report",async()=>{
  let saved:any;let status=0;let body:any;
  const handler=conversationRunHandler({model:()=>model,connector:async()=>invoke,save:async r=>{saved=r;}});
  const res:any={status(n:number){status=n;return this;},json(v:any){body=v;return this;}};
  await handler({body:{definition:conversationExample(),connectorId:"fixture"}} as any,res);
  assert.equal(status,201);assert.equal(body.status,"pass");assert.equal(saved.runId,body.runId);
  await handler({body:{definition:conversationExample(),connectorId:"fixture",replay:body}} as any,res);
  assert.equal(status,400);
});
