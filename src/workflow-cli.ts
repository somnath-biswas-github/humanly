import {readFile,writeFile} from "node:fs/promises";
import {randomUUID} from "node:crypto";
import {evaluateWorkflow,runWorkflow,validateWorkflowCase} from "./workflow.js";
import {workflowExample} from "./workflow-examples.js";
import {postJsonToConnector} from "./connector-http.js";

async function main(){
  const [mode,path,url,out="workflow-report.json"]=process.argv.slice(2);
  if(mode==="example"){
    const example=workflowExample(path==="faulty");
    console.log(JSON.stringify({...example,report:evaluateWorkflow(example.case,example.evidence)},null,2));return;
  }
  if(!path || !["evaluate","run"].includes(mode)) throw new Error("Usage: workflow example [faulty|fixed] | evaluate evidence-bundle.json | run case.json https://agent/v1/chat [report.json]");
  const input=JSON.parse(await readFile(path,"utf8"));
  let result:any;
  if(mode==="evaluate") result={...input,report:evaluateWorkflow(input.case,input.evidence)};
  else {
    validateWorkflowCase(input);
    result=await runWorkflow(input,async request=>{
      const response=await postJsonToConnector({endpointUrl:url,body:JSON.stringify(request),headers:{"content-type":"application/json",...(process.env.WORKFLOW_AGENT_TOKEN?{authorization:`Bearer ${process.env.WORKFLOW_AGENT_TOKEN}`}:{})},timeoutMs:30000,allowPrivate:process.env.HUMANLY_ALLOW_PRIVATE_CONNECTORS==="true"});
      if(!response.ok) throw new Error(`Agent HTTP ${response.status}`);
      return JSON.parse(response.body);
    },randomUUID());
  }
  await writeFile(out,JSON.stringify(result,null,2));
  console.log(JSON.stringify(result.report,null,2));
  process.exitCode=result.report.status==="pass"?0:result.report.status==="fail"?1:2;
}
main().catch(e=>{console.error(e.message);process.exitCode=2;});