import test from "node:test";
import assert from "node:assert/strict";
import { conversationExample, runConversation, exportConversationScript, type Model } from "./conversation.js";
import { defaultExecutionPlan, validateExecutionPlan, executionPlanFromChecks } from "./execution-plan.js";
import { ScenarioGraph } from "./scenario-graph.js";
const usage = {model:"fixture",promptTokens:1,completionTokens:1,totalTokens:2};
function definition() {
  const d = conversationExample(); const plan=defaultExecutionPlan();
  plan.graph={contractVersion:1,kind:"scenario",id:"test",start:"a",limits:{...plan.limits},stages:[
    {id:"a",user:{mode:"scripted",instruction:"My name is Alex"},maxVisits:1,terminal:false,onNoMatch:"stop_inconclusive",transitions:[{to:"b",routing:"rule",condition:"always"}]},
    {id:"b",user:{mode:"scripted",instruction:"Correction: my name is Sam"},maxVisits:1,terminal:true,onNoMatch:"stop_inconclusive",transitions:[]}]};
  d.executionPlan=plan; return d;
}
const model:Model=async input=>({usage:{...usage},output:input.purpose==="judge"?{assessments:input.criteria.map(c=>({id:c.id,score:100,explanation:"Supported",quote:"Sam"}))}:
  input.purpose==="metric"?{score:100,applicable:true,exposure:"exercised",reason:"Correction retained",evidenceIds:["message-3","message-4"]}:
  input.purpose==="route"?{matches:input.conditions.map(()=>true)}:{done:false,message:"Hello"}});
test("branches execute, capture history and do not expose references/rubrics to the agent",async()=>{
  const d=definition(), requests:any[]=[];
  const r=await runConversation({definition:d,runId:"x",model,invoke:async req=>{requests.push(req);return {reply:"Sam"};}});
  assert.equal(r.status,"pass");assert.equal(requests.length,2);
  assert.equal(r.conversations[0].branchHistory?.[0].nextStageId,"b");
  assert.equal(r.conversations[0].metricResults?.[0].exposure,"exercised");
  assert.ok(requests.every(x=>!JSON.stringify(x).includes("minimumScore")));
  const candidate=exportConversationScript(r);
  assert.equal(candidate.mode,"scripted");assert.equal(candidate.executionPlan?.graph,undefined);
  assert.equal(candidate.turns?.length,2);
});
test("ambiguous and unmatched branches block the gate",async()=>{
  for(const transitions of [
    [{to:"b",routing:"rule" as const,condition:"always"},{to:"b",routing:"rule" as const,condition:"always"}],
    [{to:"b",routing:"rule" as const,condition:"contains:never"}]]){
    const d=definition();d.executionPlan!.graph!.stages[0].transitions=transitions;
    const r=await runConversation({definition:d,runId:"x",model,invoke:async()=>({reply:"Sam"})});
    assert.equal(r.status,"inconclusive");assert.equal(r.qualityGate.passed,false);
  }
});
test("loop visit limits prevent unbounded agent calls",async()=>{
  const d=definition();const g=d.executionPlan!.graph!;g.stages=g.stages.slice(0,1);g.stages[0].transitions=[{to:"a",routing:"rule",condition:"always"}];
  let calls=0;const r=await runConversation({definition:d,runId:"x",model,invoke:async()=>{calls++;return {reply:"Sam"};}});
  assert.equal(calls,1);assert.equal(r.status,"inconclusive");
});
test("limited exposure blocks required metrics without making it agent failure",async()=>{
  const r=await runConversation({definition:definition(),runId:"x",model:async(input,l)=>{
    const response=await model(input,l);if(input.purpose==="metric")(response.output as any).exposure="limited";return response;
  },invoke:async()=>({reply:"Sam"})});
  assert.equal(r.status,"inconclusive");assert.equal(r.conversations[0].metricResults?.[0].score,100);
});
test("fabricated evidence identifiers and unknown usage never pass",async()=>{
  for(const fault of ["evidence","usage"]){
    const r=await runConversation({definition:definition(),runId:"x",model:async(input,l)=>{
      const response=await model(input,l);if(fault==="usage")response.usage.totalTokens=NaN;
      if(input.purpose==="metric"&&fault==="evidence")(response.output as any).evidenceIds=["message-999"];
      return response;
    },invoke:async()=>({reply:"Sam"})});assert.equal(r.status,"inconclusive");
  }
});
test("replay regrades without calling simulator, router or agent",async()=>{
  const first=await runConversation({definition:definition(),runId:"x",model,invoke:async()=>({reply:"Sam"})});
  const r=await runConversation({definition:definition(),runId:"y",replay:first,model:async(input,l)=>{
    assert.ok(["judge","metric","rag"].includes(input.purpose));return model(input,l);
  },invoke:async()=>{throw Error("must not execute");}});
  assert.equal(r.status,"pass");assert.equal(r.replayedFrom,"x");
});
test("unexercised conversational RAG turns remain inconclusive",async()=>{
  const d=definition();d.executionPlan!.ragCases=[{turn:3,case:{id:"ref",question:"Follow-up",answerable:true,referenceAnswer:"private reference"}}];
  const r=await runConversation({definition:d,runId:"x",model,invoke:async req=>{
    assert.ok(!JSON.stringify(req).includes("private reference"));return {reply:"Sam"};
  }});
  assert.equal(r.status,"inconclusive");assert.match(r.conversations[0].ragResults![0].report.errors[0],/not exercised/);
});
test("model routing considers every edge and records no arbitrary winner",async()=>{
  const g=definition().executionPlan!.graph!;g.stages[0].transitions=[{to:"b",condition:"accepted",routing:"model"}];
  const runtime=new ScenarioGraph(g);runtime.enter();
  assert.equal(await runtime.advance(1,"yes",async()=>[true]),false);
  assert.equal(runtime.enter().id,"b");
});
test("plan metadata and malformed graph config are rejected before execution",()=>{
  const p=defaultExecutionPlan();assert.throws(()=>executionPlanFromChecks({execution_plan:{enabled:true,weight:1,config:{plan:p}}}));
  assert.deepEqual(executionPlanFromChecks({execution_plan:{enabled:false,weight:0,config:{plan:p}}}),p);
  const d=definition();d.executionPlan!.graph!.limits.maxTurns=2;assert.throws(()=>validateExecutionPlan(d.executionPlan),/agree/);
});
test("per-turn RAG uses actual retrieval and evaluator-only references with correction history",async()=>{
  const d=definition();d.executionPlan!.ragCases=[{turn:2,case:{id:"correction",question:"Corrected name?",answerable:true,
    referenceAnswer:"Sam private-reference",expectedChunkIds:["name"]}}];
  let judged=false;
  const r=await runConversation({definition:d,runId:"rag",model:async(input,l)=>{
    if(input.purpose!=="rag")return model(input,l);
    judged=true;assert.equal(input.messages.length,4);
    assert.equal(input.input.observation.retrievedChunks?.[0].content,"Sam");
    assert.match(input.input.case.referenceAnswer!,/private-reference/);
    const f={score:100,explanation:"Fixture",findings:[]};
    return {usage:{...usage},output:{expectedFactCoverage:f,referenceCorrectness:f,claimVerdicts:[],
      answerHandling:{...f,responseKind:"substantive_answer"},groundedness:f,citations:f}};
  },invoke:async request=>{
    assert.ok(!JSON.stringify(request).includes("private-reference"));
    return {reply:"Sam",rag:{retrievedChunks:[{id:"name",content:"Sam"}],citations:[{id:"name"}]}} as any;
  }});
  assert.equal(judged,true);assert.equal(r.conversations[0].ragResults?.[0].report.status,"pass");
});
