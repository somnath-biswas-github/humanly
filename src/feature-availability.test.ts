import test from "node:test";
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {assertConversationModeAvailable, assertScriptedTestsAvailable} from "./feature-availability.js";
import {conversationRunHandler} from "./conversation-routes.js";
import {conversationExample} from "./conversation.js";

test("scripted modes and stages fail closed, synthetic definitions remain available",()=>{
  assert.throws(assertScriptedTestsAvailable,/temporarily unavailable/);
  assert.throws(()=>assertConversationModeAvailable({mode:"scripted"}),/temporarily unavailable/);
  assert.throws(()=>assertConversationModeAvailable({mode:"synthetic",executionPlan:{graph:{stages:[{user:{mode:"scripted"}}]}}}),/temporarily unavailable/);
  assert.doesNotThrow(()=>assertConversationModeAvailable(conversationExample()));
});
test("API refuses scripted definitions or replays before any external side effects",async()=>{
  const forbidden=async()=>{throw new Error("must not run");};
  const handler=conversationRunHandler({model:()=>{throw new Error("must not run");},connector:forbidden,save:forbidden});
  for(const body of [{definition:{mode:"scripted"}},{definition:conversationExample(),replay:{definition:{mode:"scripted"}}}]){
    const res:any={code:200,status(code:number){this.code=code;return this;},json(value:any){this.body=value;return this;}};
    await handler({body} as any,res);
    assert.equal(res.code,403);assert.match(res.body.error,/temporarily unavailable/);
  }
});
test("disabled CLI entry points return exit 2 with an actionable message",()=>{
  for(const [file,args] of [["workflow-cli.ts",["example"]],["conversation-cli.ts",["export-script","missing.json"]]] as const){
    try { execFileSync(process.execPath,["--import","tsx",new URL(file,import.meta.url).pathname,...args],{encoding:"utf8",stdio:"pipe"});assert.fail("must exit nonzero"); }
    catch(error:any){assert.equal(error.status,2);assert.match(error.stderr,/temporarily unavailable/);}
  }
});
