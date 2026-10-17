import "dotenv/config";
import {readFile,writeFile} from "node:fs/promises";
import {randomUUID} from "node:crypto";
import {conversationExample,exportConversationScript,runConversation} from "./conversation.js";
import {configuredConversationModel} from "./conversation-model.js";
import {postJsonToConnector} from "./connector-http.js";

async function main(){
  const [command,path,target,output]=process.argv.slice(2);
  if(command==="example"){console.log(JSON.stringify(conversationExample(),null,2));return;}
  if(!path||!["run","replay","export-script"].includes(command)||command==="run"&&!target)
    throw new Error("Usage: conversation example | run definition.json https://agent/chat [report.json] | replay report.json [replay.json] | export-script report.json [definition.json]");
  const input=JSON.parse(await readFile(path,"utf8"));
  if(command==="export-script"){
    await writeFile(target??"scripted-conversation.json",JSON.stringify(exportConversationScript(input),null,2));
    console.log("Scripted candidate exported. Review before using as a regression baseline.");return;
  }
  const result=await runConversation({
    definition:command==="replay"?input.definition:input,runId:randomUUID(),model:configuredConversationModel(),
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
