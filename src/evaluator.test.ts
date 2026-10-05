import assert from "node:assert/strict";
import test from "node:test";
import { evaluateAgentResponse, extractAgentResponse } from "./evaluator.js";

test("extracts supported JSON and plain-text response forms", () => {
  assert.equal(extractAgentResponse('{"response":"Hello"}'), "Hello");
  assert.equal(extractAgentResponse('{"message":"Hello from message"}'), "Hello from message");
  assert.equal(extractAgentResponse('{"output":"Hello from output"}'), "Hello from output");
  assert.equal(extractAgentResponse("  plain text  "), "plain text");
});

test("rejects blank or structurally invalid JSON responses", () => {
  assert.equal(extractAgentResponse("   "), "");
  assert.equal(extractAgentResponse('{"response":"   "}'), "");
  assert.equal(extractAgentResponse('{"unexpected":"value"}'), "");
  assert.equal(extractAgentResponse('{"response":null}'), "");
});

test("requires both a successful HTTP status and non-empty content", () => {
  assert.equal(evaluateAgentResponse(true, 200, '{"response":"Hello"}').passed, true);
  assert.equal(evaluateAgentResponse(true, 200, '{"response":""}').passed, false);
  assert.equal(evaluateAgentResponse(false, 500, '{"response":"Error page"}').passed, false);
});

test("accepts reply and the workflow response aliases in the default evaluator", () => {
  for (const key of ["reply", "response", "message", "content", "text", "answer", "output"]) {
    const result = evaluateAgentResponse(true, 200, JSON.stringify({ [key]: "  Agent answer  " }));
    assert.equal(result.responseText, "Agent answer", key);
    assert.equal(result.passed, true, key);
    assert.equal(evaluateAgentResponse(true, 200, JSON.stringify({ [key]: " \n " })).passed, false, key);
    assert.equal(evaluateAgentResponse(false, 500, JSON.stringify({ [key]: "Agent answer" })).passed, false, key);
  }
});

test("uses reply-first string precedence without hiding an empty answer", () => {
  assert.equal(extractAgentResponse('{"reply":"Primary","response":"Fallback"}'), "Primary");
  assert.equal(extractAgentResponse('{"reply":"","response":"Fallback"}'), "");
  assert.equal(extractAgentResponse('{"reply":"  ","response":"Fallback"}'), "");
  assert.equal(extractAgentResponse('{"reply":null,"response":42,"message":"Valid"}'), "Valid");
  assert.equal(extractAgentResponse('{"reply":{"text":"Nested"},"output":"Legacy"}'), "Legacy");
});

test("JSON primitives and metadata alone cannot pass as agent answers", () => {
  for (const body of ['null', 'true', '42', '""', '"  "', '[]', '{"sources":["document"]}']) {
    assert.equal(evaluateAgentResponse(true, 200, body).passed, false, body);
  }
  assert.equal(extractAgentResponse('"  Plain JSON string  "'), "Plain JSON string");
});