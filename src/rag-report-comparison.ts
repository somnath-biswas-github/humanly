type Row={conversationIndex:number;turn:number;caseId:string;beforeStatus:string;afterStatus:string;changes:string[]};
const object=(v:any)=>v&&typeof v==="object"&&!Array.isArray(v);
function unwrap(input:any){
  const report=input?.advancedEvaluation?.report??input?.report??input;
  if(!object(report)||report.kind!=="conversation-report"||report.version!==1||
    !Array.isArray(report.conversations)||report.conversations.length>20)throw Error("Expected a version 1 conversation report or Studio advanced snapshot.");
  return report;
}
function canonical(v:any):string {
  if(v===undefined)return "not recorded";
  if(Array.isArray(v))return "["+v.map(canonical).join(",")+"]";
  if(object(v))return "{"+Object.keys(v).sort().map(k=>JSON.stringify(k)+":"+canonical(v[k])).join(",")+"}";
  return JSON.stringify(v);
}
function entries(report:any){
  const out=new Map<string,{conversationIndex:number;turn:number;caseId:string;value:any;reference:any}>();
  report.conversations.forEach((c:any,i:number)=>{
    if(!object(c)||!Array.isArray(c.ragResults??[])||(c.ragResults??[]).length>50)throw Error("Invalid conversational RAG results.");
    for(const r of c.ragResults??[]){
      if(!object(r)||!Number.isInteger(r.turn)||r.turn<1||!object(r.report)||typeof r.report.caseId!=="string"||
        !["pass","fail","inconclusive"].includes(r.report.status))throw Error("Invalid RAG turn.");
      const key=JSON.stringify([i,r.turn,r.report.caseId]);
      if(out.has(key))throw Error("Duplicate RAG turn.");
      out.set(key,{conversationIndex:i+1,turn:r.turn,caseId:r.report.caseId,value:r.report,
        reference:report.definition?.executionPlan?.ragCases?.find((e:any)=>e.turn===r.turn)?.case});
    }
  });return out;
}
/** Compare recorded data, never infer a changed score is improved semantic accuracy. */
export function compareRagReports(before:unknown,after:unknown):Row[]{
  const first=unwrap(before),second=unwrap(after),a=entries(first),b=entries(second);
  const configChanged=canonical(first.definition)!==canonical(second.definition);
  return [...new Set([...a.keys(),...b.keys()])].map(key=>{
    const prev=a.get(key),next=b.get(key),identity=next??prev!;
    const changes:string[]=[];
    if(configChanged)changes.push("Conversation configuration changed; review comparability");
    if(!prev)changes.push("Turn added");
    else if(!next)changes.push("Turn removed");
    else{
      for(const [field,label] of [["status","Verdict"],["checks","Scores or requirements"],["issues","Failure categories"],
        ["observation","Answer or retrieval evidence"],["failures","Failed requirements"],["errors","Evaluation errors"]] as const){
        if(canonical(prev.value[field])!==canonical(next.value[field]))changes.push(label+" changed");
      }
      if(canonical(prev.reference)!==canonical(next.reference))changes.push("Reference configuration changed; not a matched comparison");
      if(canonical(prev.value.judge?.diagnostics)!==canonical(next.value.judge?.diagnostics))changes.push("Claim or context diagnostics changed");
    }
    return {conversationIndex:identity.conversationIndex,turn:identity.turn,caseId:identity.caseId,
      beforeStatus:prev?.value.status??"not recorded",afterStatus:next?.value.status??"not recorded",changes};
  }).sort((a,b)=>a.conversationIndex-b.conversationIndex||a.turn-b.turn||a.caseId.localeCompare(b.caseId));
}
