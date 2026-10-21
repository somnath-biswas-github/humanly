import "dotenv/config";
import {readFile,writeFile} from "node:fs/promises";
import {randomUUID} from "node:crypto";
import {conversationExample,exportConversationScript,runConversation} from "./conversation.js";
import {configuredConversationModel} from "./conversation-model.js";
import {postJsonToConnector} from "./connector-http.js";
import { createProvider } from "./conversation-provider.js";
import { summarizeConversation, compareSummaries, safeSummary } from "./report-summary.js";
import { generateCandidate, approveCandidate } from "./candidate-tests.js";
import { withLocalMetrics } from "./local-metrics.js";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

async function main(){
  const [command,path,target,output]=process.argv.slice(2);
  if(command==="example"){console.log(JSON.stringify(conversationExample(),null,2));return;}
  if(command==="generate"&&path){
    console.log(JSON.stringify(generateCandidate(await readFile(path,"utf8")),null,2));return;
  }
  if(command==="approve"&&path){
    console.log(JSON.stringify(approveCandidate(JSON.parse(await readFile(path,"utf8"))),null,2));return;
  }
  if(command==="inspect"&&path){console.log(JSON.stringify(summarizeConversation(JSON.parse(await readFile(path,"utf8"))),null,2));return;}
  if(command==="diagnostic"&&path){console.log(JSON.stringify(safeSummary(summarizeConversation(JSON.parse(await readFile(path,"utf8")))),null,2));return;}
  if(command==="compare"&&path&&target){
    const comparison=compareSummaries(summarizeConversation(JSON.parse(await readFile(path,"utf8"))),summarizeConversation(JSON.parse(await readFile(target,"utf8"))));
    console.log(JSON.stringify(comparison,null,2));process.exitCode=comparison.comparable?0:2;return;
  }
  if(!path||!["run","replay","export-script"].includes(command)||command==="run"&&!target)
    throw new Error("Usage: conversation example | run definition.json https://agent/chat [report.json] | replay report.json [replay.json] | export-script report.json [definition.json]");
  const input=JSON.parse(await readFile(path,"utf8"));
  if(command==="export-script"){
    await writeFile(target??"scripted-conversation.json",JSON.stringify(exportConversationScript(input),null,2));
    console.log("Scripted candidate exported. Review before using as a regression baseline.");return;
  }
  const definition=command==="replay"?input.definition:input;
  let model=definition.executionPlan?.provider==="anthropic"
    ?createProvider({provider:"anthropic",apiKey:process.env.CONVERSATION_MODEL_API_KEY,model:process.env.CONVERSATION_MODEL})
    :configuredConversationModel();
  // An explicitly supplied local module is trusted operator code, not sandboxed.
  // Never load plugin paths from untrusted JSON configurations or an HTTP request.
  if(process.env.HUMANLY_LOCAL_METRICS){
    const plugin=await import(pathToFileURL(resolve(process.env.HUMANLY_LOCAL_METRICS)).href);
    if(!plugin.metrics||typeof plugin.metrics!=="object"||Object.values(plugin.metrics).some(x=>typeof x!=="function"))throw new Error("Invalid local metric module");
    model=withLocalMetrics(model,plugin.metrics);
  }
  const result=await runConversation({
    definition,runId:randomUUID(),model,
    ...(command==="replay"?{replay:input}:{invoke:async(request)=>{
      const response=await postJsonToConnector({endpointUrl:target,
        body:JSON.stringify(request),headers:{"content-type":"application/json",
          ...(process.env.CONVERSATION_AGENT_TOKEN?{authorization:`Bearer ${process.env.CONVERSATION_AGENT_TOKEN}`}:{})},
        timeoutMs:input.config.timeoutMs,allowPrivate:process.env.HUMANLY_ALLOW_PRIVATE_CONNECTORS==="true"});
      if(!response.ok)throw new Error("Agent request failed");
      return JSON.parse(response.body);
    }}),
  });
  await writeFile((command==="replay"?target:output)??"conversation-report.json",JSON.stringify(result,null,2));
  console.log(JSON.stringify({runId:result.runId,status:result.status,overallScore:result.overallScore,modelCalls:result.modelCalls},null,2));
  process.exitCode=result.status==="pass"?0:result.status==="fail"?1:2;
}
main().catch(()=>{console.error("Conversation command failed. Check arguments, JSON, provider configuration and local file permissions. No successful gate was established.");process.exitCode=2;});
