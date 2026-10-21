import { validateConversationDefinition, type ConversationReport } from "./conversation.js";
export type Summary = {
  version:1;runner:"conversation"|"workflow"|"rag";runId:string;status:"pass"|"fail"|"inconclusive";
  configurationKey:string;configuration:unknown;
  metrics:Array<{id:string;revision:string;status:string;score:number|null;exposure:string;reason:string}>;
  usage:{known:boolean;totalTokens:number|null};gateReasons:string[];executed:{conversations:number;turns:number};
};
export type Comparison = {comparable:boolean;warnings:string[];changes:Array<{id:string;before:number|null;after:number|null;delta:number|null;beforeStatus?:string;afterStatus?:string;beforeExposure?:string;afterExposure?:string;findingsChanged:boolean}>};
function canonical(v:any):string {
  if(v === undefined)return "null";
  if(Array.isArray(v))return "["+v.map(canonical).join(",")+"]";
  if(v && typeof v === "object")return "{"+Object.keys(v).sort().map(k=>JSON.stringify(k)+":"+canonical(v[k])).join(",")+"}";
  return JSON.stringify(v);
}
export function summarizeConversation(report:ConversationReport):Summary {
  if(!report || report.version!==1 || report.kind!=="conversation-report" ||
    !["pass","fail","inconclusive"].includes(report.status) || !Array.isArray(report.conversations) || !report.conversations.length)
    throw new Error("Expected a version-1 conversation report");
  validateConversationDefinition(report.definition);
  const metrics:Summary["metrics"] = [];
  const gateReasons:string[] = [];
  for(const [index,r] of report.conversations.entries()){
    if(!Array.isArray(r.messages)||!Array.isArray(r.assessments))throw new Error("Malformed conversation report");
    if(r.status!=="pass")gateReasons.push(`Conversation ${index+1}: ${r.status}; termination ${r.termination}${r.error?"; execution/evaluation error":""}`);
    for(const m of r.metricResults??[]){
      metrics.push({id:`${index+1}:${m.metricId}`,revision:m.metricRevision,status:m.status,score:m.score,exposure:m.exposure,reason:m.reason});
      if(m.status!=="pass" && report.definition.executionPlan?.metrics.find(c=>c.id===m.metricId)?.required)
        gateReasons.push(`Required metric ${m.metricId}: ${m.status}`);
    }
    for(const a of r.assessments)metrics.push({id:`${index+1}:criterion:${a.id}`,revision:"legacy-1",status:
      a.score>=(report.definition.criteria.find(c=>c.id===a.id)?.minimumScore??100)?"pass":"fail",score:a.score,exposure:"unknown",reason:a.explanation});
    for(const rag of r.ragResults??[])if(rag.report.status!=="pass")gateReasons.push(`RAG turn ${rag.turn}: ${rag.report.status}`);
    if(r.workflow?.status && r.workflow.status!=="pass")gateReasons.push(`Workflow gate: ${r.workflow.status}`);
  }
  const known=Array.isArray(report.usage) && report.usage.every(u=>Number.isSafeInteger(u.totalTokens)&&u.totalTokens>=0) &&
    !report.conversations.some(r=>r.error);
  return {version:1,runner:"conversation",runId:report.runId,status:report.status,configurationKey:canonical(report.definition),
    configuration:structuredClone(report.definition),metrics,gateReasons:[...new Set(gateReasons)],
    usage:{known,totalTokens:known?report.usage.reduce((n,u)=>n+u.totalTokens,0):null},
    executed:{conversations:report.conversations.length,turns:report.conversations.reduce((n,r)=>n+r.messages.filter(m=>m.role==="assistant").length,0)}};
}
export function compareSummaries(a:Summary,b:Summary):Comparison {
  const warnings:string[]=[];
  if(a.version!==1||b.version!==1||a.runner!==b.runner)warnings.push("Report versions or runners differ.");
  if(a.configurationKey!==b.configurationKey)warnings.push("Configurations, criteria, provider or metric revisions differ. Numerical deltas are not comparable.");
  if((a.configuration as any)?.unversioned || (b.configuration as any)?.unversioned)warnings.push("Historical evaluator/configuration revisions were not recorded; numerical comparability cannot be established.");
  const changes=[...new Set([...a.metrics,...b.metrics].map(m=>m.id))].map(id=>{
    const before=a.metrics.find(m=>m.id===id),after=b.metrics.find(m=>m.id===id);
    if(!before||!after||before.revision!==after.revision)warnings.push(`Metric ${id} is absent or has a different revision.`);
    return {id,before:before?.score??null,after:after?.score??null,delta:null as number|null,
      beforeStatus:before?.status,afterStatus:after?.status,beforeExposure:before?.exposure,afterExposure:after?.exposure,
      findingsChanged:before?.reason!==after?.reason||before?.status!==after?.status};
  });
  const comparable=!warnings.length;
  if(comparable)for(const c of changes)if(c.before!==null&&c.after!==null)c.delta=c.after-c.before;
  return {comparable,warnings:[...new Set(warnings)],changes};
}
/** Adapt persisted OSS report shapes without re-running their evaluators. */
export function summarizeReport(report:any):Summary {
  if(report?.kind==="studio-rag-report"&&report.version===1)return summarizeStudioRag(report.run);
  if(report?.kind==="conversation-report")return summarizeConversation(report);
  if(!report || report.version!==1)throw new Error("Unsupported report version");
  const rag=Array.isArray(report.cases)&&report.suite;
  const workflow=report.case&&report.report&&Array.isArray(report.report.findings);
  if(!rag&&!workflow)throw new Error("Unsupported report shape; use the original runner's inspection view");
  const status=rag?report.status:report.report.status;
  if(!["pass","fail","inconclusive"].includes(status))throw new Error("Invalid report status");
  const configuration=rag?report.suite:report.case;
  const metrics:Summary["metrics"]=rag?report.cases.flatMap((c:any)=>Object.entries(c.checks??{}).map(([id,v]:[string,any])=>({
    id:`${c.caseId}:${id}`,revision:"rag-1",status:v.state==="available"?(v.score>=v.threshold?"pass":"fail"):"inconclusive",
    score:v.score??null,exposure:v.state==="available"?"exercised":"unknown",reason:v.explanation??"Not recorded",
  }))):report.report.findings.map((f:any)=>({id:f.check,revision:"workflow-1",status:f.status,score:null,
    exposure:f.eventSeqs?.length?"exercised":"unknown",reason:f.explanation}));
  const usage=rag?report.cases.map((c:any)=>c.usage):[];
  const known=!!rag&&usage.length>0&&usage.every((u:any)=>u&&Number.isSafeInteger(u.totalTokens)&&u.totalTokens>=0);
  return {version:1,runner:rag?"rag":"workflow",runId:report.runId??"unrecorded",status,configuration,
    configurationKey:canonical(configuration),metrics,usage:{known,totalTokens:known?usage.reduce((n:number,u:any)=>n+u.totalTokens,0):null},
    gateReasons:status==="pass"?[]:metrics.filter(m=>m.status!=="pass").map(m=>`${m.id}: ${m.status}`),
    executed:{conversations:rag?report.cases.length:1,turns:rag?report.cases.length:report.transcript?.length/2||0}};
}
/** Historical Studio runs retain recorded outcomes; no rejudging or invented revisions. */
export function summarizeStudioRag(run:any):Summary {
  if(!run||typeof run.id!=="string"||!Array.isArray(run.results??run.caseResults))throw new Error("Expected a saved Studio RAG run");
  const rows=run.results??run.caseResults;
  const metrics:Summary["metrics"]=rows.map((r:any)=>({id:String(r.caseId??r.id),revision:"studio-rag-unrecorded",
    status:r.error||r.evaluatorError?"inconclusive":r.passed===true?"pass":r.passed===false?"fail":"inconclusive",
    score:null,exposure:r.error?"unknown":"exercised",
    reason:Array.isArray(r.failures)?r.failures.map((f:any)=>typeof f==="string"?f:JSON.stringify(f)).join("; "):"Recorded case outcome"}));
  const status:Summary["status"]=run.status!=="completed"||metrics.some(m=>m.status==="inconclusive")||!metrics.length?"inconclusive":metrics.some(m=>m.status==="fail")?"fail":"pass";
  const configuration={surface:"studio-rag",unversioned:true,thresholds:run.thresholdsJson,requireEvidence:run.requireEvidence,
    requireCitations:run.requireCitations,connectorId:run.connectorId,cases:rows.map((r:any)=>({id:r.caseId,question:r.question,
      referenceAnswer:r.referenceAnswer,expectedFacts:r.expectedFacts,expectedSources:r.expectedSources,mustNotInclude:r.mustNotInclude,answerable:r.answerable}))};
  return {version:1,runner:"rag",runId:run.id,status,configuration,configurationKey:canonical(configuration),metrics,
    usage:{known:false,totalTokens:null},gateReasons:status==="pass"?[]:[`Recorded run status: ${run.status}`,...metrics.filter(m=>m.status!=="pass").map(m=>`${m.id}: ${m.status}`)],
    executed:{conversations:rows.length,turns:rows.length}};
}
/** Allowlist export, not an attempt to regex-redact arbitrary prompts or transcripts. */
export function safeSummary(summary:Summary) {
  const status=(value:unknown)=>["pass","fail","inconclusive"].includes(String(value))?value:"inconclusive";
  const count=(value:unknown)=>Number.isSafeInteger(value)&&Number(value)>=0?Number(value):null;
  return {version:1,runner:["conversation","rag","workflow"].includes(summary.runner)?summary.runner:"unknown",
    status:status(summary.status),executed:{conversations:count(summary.executed.conversations),turns:count(summary.executed.turns)},
    usage:{known:summary.usage.known===true&&count(summary.usage.totalTokens)!==null,
      totalTokens:summary.usage.known===true?count(summary.usage.totalTokens):null},
    findings:summary.metrics.map(m=>({status:status(m.status),score:typeof m.score==="number"&&Number.isFinite(m.score)?m.score:null,
      exposure:["exercised","limited","not_exercised","unknown"].includes(m.exposure)?m.exposure:"unknown"})),
    gate:{passed:summary.status==="pass",blockedConditions:summary.gateReasons.length},
    omitted:["runId","configuration","metric IDs","free-text reasons","transcripts","runtime arguments","retrieval passages"]};
}
