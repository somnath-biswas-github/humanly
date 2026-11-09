import test from "node:test";
import assert from "node:assert/strict";
import { judgeSchema } from "./rag-judge.js";
import { conversationModelSchema } from "./conversation-model.js";
import { validateAssessments, type Message } from "./conversation.js";
import { scoreClaimVerdicts } from "./rag-claim-verdicts.js";

test("standalone and conversational schemas bind verdict count to configured claims", () => {
  for (const claims of [undefined, [], ["No free refunds"], ["No free refunds", "No instant refunds"]]) {
    const schema = judgeSchema(true, claims?.length ?? 0);
    assert.equal(schema.properties.claimVerdicts.minItems, claims?.length ?? 0);
    assert.equal(schema.properties.claimVerdicts.maxItems, claims?.length ?? 0);
    const input: any = {purpose:"rag",input:{case:{prohibitedClaims:claims},observation:{retrievedChunks:[{id:"policy",content:"Policy"}]}},messages:[]};
    assert.deepEqual(conversationModelSchema(input), schema);
    if (claims?.length) assert.deepEqual(schema.properties.claimVerdicts.items.properties.claimIndex.enum, claims.map((_,i)=>i));
  }
  for (const n of [-1, 1.5, 101, NaN]) assert.throws(()=>judgeSchema(true,n));
});

test("zero-claim placeholder verdicts and nonempty-claim omissions remain rejected", () => {
  const row={claimIndex:0,verdict:"not_asserted",quote:"",explanation:"No prohibited claims."};
  assert.throws(()=>scoreClaimVerdicts([], "Hello", [row]), /Incomplete/);
  assert.throws(()=>scoreClaimVerdicts(["No refund"], "Hello", []), /Incomplete/);
  assert.throws(()=>scoreClaimVerdicts(["No refund"], "Hello", [{...row,claimIndex:1}]), /Invalid/);
  assert.throws(()=>scoreClaimVerdicts(["No refund"], "Hello", [{...row,verdict:"uncertain"}]), /Uncertain/);
  assert.equal(scoreClaimVerdicts([], "Hello", []).score,100);
});

const criteria=[{id:"task",description:"Use actual evidence.",weight:100,minimumScore:90,required:true}];
const messages:Message[]=[{role:"user",content:"Secret user-only assertion"},
  {role:"assistant",content:"The retry succeeded. Refund A17 is issued."},
  {role:"assistant",content:"Your item can be returned within 30 days with a receipt."}];
const assess=(quote:unknown)=>validateAssessments({assessments:[{id:"task",score:100,explanation:"Evidence-backed.",quote}]},criteria,messages);

test("recorded benchmark quote-wrapper failures resolve only to exact source text", () => {
  for (const content of messages.filter(m=>m.role==="assistant").map(m=>m.content)) {
    for (const [open,close] of [['"','"'],["'","'"],["“","”"],["‘","’"]]) {
      const original=open+content+close;
      assert.equal(assess(original)[0].quote,content);
    }
    assert.equal(assess(content)[0].quote,content);
  }
  assert.equal(assess("")[0].quote,"");
});

test("fabricated, paraphrased, user-only and malformed evidence still cannot pass", () => {
  for (const quote of ['"The refund probably succeeded."', '"Secret user-only assertion"',
    '"The retry succeeded..."', '""', '"The retry succeeded. Refund A17 is issued.\'',
    '"The retry succeeded.  Refund A17 is issued."', null, "x".repeat(12001)]) {
    assert.throws(()=>assess(quote), /Invalid criterion/);
  }
  const quoted:Message[]=[{role:"assistant",content:'He said "approved".'}];
  assert.equal(validateAssessments({assessments:[{id:"task",score:100,explanation:"Exact.",quote:'"approved"'}]},criteria,quoted)[0].quote,'"approved"');
});
