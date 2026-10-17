import test from "node:test";
import assert from "node:assert/strict";
import {createServer} from "node:http";
import {once} from "node:events";
import {execFile} from "node:child_process";
import {promisify} from "node:util";
import {mkdtemp,readFile,writeFile,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {fileURLToPath} from "node:url";
import {createRequire} from "node:module";
import {conversationExample} from "./conversation.js";
const exec=promisify(execFile);
test("CLI live synthetic run, replay and script export use local fixtures only",async()=>{
  const folder=await mkdtemp(join(tmpdir(),"humanly-conversation-"));
  let agentCalls=0,simulations=0;let rejectJudge=false;
  const server=createServer(async(req,res)=>{
    let raw="";for await(const chunk of req)raw+=chunk;
    const input=JSON.parse(raw);
    res.setHeader("content-type","application/json");
    if(req.url==="/agent"){
      agentCalls++;assert.equal("criteria" in input,false);
      res.end(JSON.stringify({reply:"Contact support."}));return;
    }
    const content=JSON.parse(input.messages[1].content);
    let output;
    if(content.purpose==="simulate"){
      simulations++;assert.equal("criteria" in content,false);
      output={done:content.messages.length>0,message:content.messages.length?"":"Can I return this?"};
    }else output={assessments:content.criteria.map((c:any)=>({id:c.id,score:rejectJudge?0:100,explanation:"Local fixture.",quote:"Contact support."}))};
    res.end(JSON.stringify({choices:[{finish_reason:"stop",message:{content:JSON.stringify(output)}}],
      usage:{prompt_tokens:2,completion_tokens:2,total_tokens:4}}));
  });
  server.listen(0,"127.0.0.1");await once(server,"listening");
  const base=`http://127.0.0.1:${(server.address() as any).port}`;
  const cli=fileURLToPath(new URL("./conversation-cli.ts",import.meta.url));
  const tsx=createRequire(import.meta.url).resolve("tsx/cli");
  const env={PATH:process.env.PATH,NODE_ENV:"test",DOTENV_CONFIG_PATH:join(folder,"absent.env"),
    CONVERSATION_MODEL_BASE_URL:base,CONVERSATION_MODEL_ALLOW_PRIVATE:"true",HUMANLY_ALLOW_PRIVATE_CONNECTORS:"true"};
  const run=(args:string[])=>exec(process.execPath,[tsx,cli,...args],{cwd:folder,env,timeout:15000});
  try{
    const definition=join(folder,"definition.json"),report=join(folder,"report.json"),replay=join(folder,"replay.json"),script=join(folder,"script.json");
    await writeFile(definition,JSON.stringify(conversationExample()));
    await run(["run",definition,base+"/agent",report]);
    assert.equal(JSON.parse(await readFile(report,"utf8")).status,"pass");
    assert.equal(agentCalls,1);assert.equal(simulations,2);
    await run(["replay",report,replay]);
    assert.equal(agentCalls,1);assert.equal(simulations,2);
    await run(["export-script",report,script]);
    assert.equal(JSON.parse(await readFile(script,"utf8")).mode,"scripted");
    rejectJudge=true;
    await assert.rejects(run(["run",script,base+"/agent",report]),(e:any)=>e.code===1);
    assert.equal(JSON.parse(await readFile(report,"utf8")).status,"fail");
    await writeFile(definition,"{}");
    await assert.rejects(run(["run",definition,base+"/agent",report]),(e:any)=>e.code===2);
  }finally{server.close();await rm(folder,{recursive:true,force:true});}
});
