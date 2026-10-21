import test from "node:test";
import assert from "node:assert/strict";
import {generateCandidate,approveCandidate} from "./candidate-tests.js";
import {inspectEvidence} from "./evidence-diagnostics.js";
import {compareSummaries,safeSummary,summarizeConversation} from "./report-summary.js";
import {runConversation,type Model} from "./conversation.js";
import {withLocalMetrics} from "./local-metrics.js";
import {createProvider,classifyProviderError,PROVIDER_CAPABILITIES} from "./conversation-provider.js";
import { createServer } from "node:http";
import { once } from "node:events";
import {summarizeReport} from "./report-summary.js";
import {validateExecutionPlan} from "./execution-plan.js";

test("reviewed candidates persist full validated inputs without implying trusted runtime approval",()=>{
  const d=approveCandidate(generateCandidate("Do not invent successful refunds."));
  const plan=d.executionPlan!;
  plan.reviewedCandidate={generated:true,reviewed:true,name:d.name,persona:d.persona,scenario:d.scenario,criteria:d.criteria,minimumScore:d.config.minimumScore};
  validateExecutionPlan(plan);
  assert.throws(()=>validateExecutionPlan({...plan,reviewedCandidate:{...plan.reviewedCandidate,reviewed:false}}));
});

test("historical Studio RAG summaries retain failures, unknown usage and comparison limits",()=>{
  const wrap={version:1,kind:"studio-rag-report",run:{id:"saved",status:"completed",results:[
    {caseId:"case",passed:false,failures:["unsupported claim"],question:"private question"}]}};
  const summary=summarizeReport(wrap);
  assert.equal(summary.status,"fail");
  assert.equal(summary.usage.known,false);
  assert.equal(compareSummaries(summary,summary).comparable,false);
  assert.ok(!JSON.stringify(safeSummary(summary)).includes("private question"));
});

test("draft generation cannot produce verified truth or execute; approval validates edited definition",()=>{
  const draft=generateCandidate("Allow changes after customer confirmation");
  assert.equal(draft.approved,false);
  assert.equal(draft.definition.executionPlan?.ragCases.length,0);
  assert.equal(approveCandidate(draft).kind,"conversation");
  draft.definition.config.maxTurns=-1;
  assert.throws(()=>approveCandidate(draft));
  assert.throws(()=>generateCandidate(""));
});
test("diagnostics reject malformed ordering and unresolved outcomes",()=>{
  const base={version:1,source:"runtime",complete:true,events:[{seq:1,turn:1,type:"action",callId:"c",operationId:"o",binding:{action:"read",target:"x",params:{}}}]};
  assert.equal(inspectEvidence(base).complete,false);
  assert.equal(inspectEvidence({...base,events:[...base.events,{seq:2,turn:1,type:"outcome",callId:"c",status:"success"}]}).complete,true);
  assert.equal(inspectEvidence({...base,events:[...base.events,...base.events]}).valid,false);
});
test("providers declare capabilities and reject unsupported selections and URL credentials",()=>{
  assert.equal(PROVIDER_CAPABILITIES.anthropic.usage,"reported");
  assert.equal(classifyProviderError(429),"rate_limit");
  assert.throws(()=>createProvider({provider:"unknown" as any}));
  assert.throws(()=>createProvider({provider:"anthropic",apiKey:"test",baseUrl:"https://user:pass@example.com"}));
});
test("Anthropic transport validates structured output and unknown usage against a controlled local server",async()=>{
  let invalid=false;
  const server=createServer((req,res)=>{
    let body="";req.on("data",chunk=>body+=chunk);req.on("end",()=>{
      const data=JSON.parse(body);assert.equal(data.tool_choice.name,"evaluation");
      res.setHeader("content-type","application/json");
      res.end(JSON.stringify({stop_reason:"tool_use",content:[{type:"tool_use",name:"evaluation",input:{done:false,message:"test"}}],
        ...(invalid?{}:{usage:{input_tokens:4,output_tokens:2}})}));
    });
  }).listen(0,"127.0.0.1");
  await once(server,"listening");
  try{
    const provider=createProvider({provider:"anthropic",baseUrl:`http://127.0.0.1:${(server.address() as any).port}`,allowPrivate:true});
    const input={purpose:"simulate" as const,persona:{name:"test",description:"test"},scenario:{goal:"test",context:"",endCondition:"stop"},messages:[],turn:1};
    assert.equal((await provider(input,{maxOutputTokens:100,timeoutMs:1000})).usage.totalTokens,6);
    invalid=true;await assert.rejects(()=>provider(input,{maxOutputTokens:100,timeoutMs:1000}),/usage unavailable/);
  }finally{server.close();}
});
test("cross-runner summaries never imply numerical parity and preserve inconclusive evidence",()=>{
  const workflow=summarizeReport({version:1,case:{name:"workflow"},report:{status:"inconclusive",findings:[{check:"L1",status:"inconclusive",explanation:"Missing",eventSeqs:[]}]}});
  const rag=summarizeReport({version:1,runId:"rag",suite:{name:"rag"},status:"pass",cases:[{caseId:"one",checks:{answerHandling:{state:"available",score:100,threshold:80,explanation:"Supported"}}}]});
  assert.equal(workflow.runner,"workflow");assert.equal(workflow.usage.known,false);
  assert.equal(compareSummaries(workflow,rag).comparable,false);
});
const fixed:Model=async input=>({usage:{model:"fixture",promptTokens:0,completionTokens:0,totalTokens:0},output:
  input.purpose==="judge"?{assessments:input.criteria.map(c=>({id:c.id,score:100,explanation:"fixture",quote:"OK"}))}:
  input.purpose==="metric"?{score:100,applicable:true,exposure:"exercised",reason:"fixture",evidenceIds:["message-2"]}:
  {done:false,message:"help"}});
test("local extension failures are inconclusive; summary comparisons reject config mismatch and diagnostics omit text",async()=>{
  const d=approveCandidate(generateCandidate("PRIVATE SOURCE"));
  d.executionPlan!.graph!.stages=d.executionPlan!.graph!.stages.slice(0,1);
  d.executionPlan!.graph!.stages[0].terminal=true;d.executionPlan!.graph!.stages[0].transitions=[];
  const good=await runConversation({definition:d,runId:"a",model:fixed,invoke:async()=>({reply:"OK"})});
  const s=summarizeConversation(good);
  assert.equal(s.status,"pass");
  assert.equal(compareSummaries(s,s).comparable,true);
  assert.ok(!JSON.stringify(safeSummary(s)).includes("PRIVATE SOURCE"));
  const unsafe=structuredClone(s);unsafe.metrics[0].status="PRIVATE SOURCE";unsafe.metrics[0].exposure="PRIVATE SOURCE";
  assert.ok(!JSON.stringify(safeSummary(unsafe)).includes("PRIVATE SOURCE"));
  const changed=structuredClone(good);changed.definition.criteria[0].minimumScore=50;
  assert.equal(compareSummaries(s,summarizeConversation(changed)).comparable,false);
  assert.ok(compareSummaries(s,summarizeConversation(changed)).changes.every(c=>c.delta===null));
  const bad=await runConversation({definition:d,runId:"b",model:withLocalMetrics(fixed,{goal_completion:async()=>{throw Error("private failure");}}),invoke:async()=>({reply:"OK"})});
  assert.equal(bad.status,"inconclusive");
  assert.ok(!JSON.stringify(bad).includes("private failure"));
});
