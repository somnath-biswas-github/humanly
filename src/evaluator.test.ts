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