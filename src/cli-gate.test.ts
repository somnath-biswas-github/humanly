import { test } from "node:test";
import assert from "node:assert/strict";
import { reportExitCode } from "../packages/cli/src/gate.js";

test("failed checks fail CI without a baseline", () => {
  assert.equal(reportExitCode({ status: "completed", baselineBreach: false,
    conversations: [{ passed: false }], passRate: 0 }), 1);
  assert.equal(reportExitCode({ status: "completed", conversations: [{ passed: true }] }), 0);
  assert.equal(reportExitCode({ status: "completed", baselineBreach: true,
    conversations: [{ passed: true }] }), 1);
});

test("unknown, incomplete and inconclusive reports never establish a passing gate", () => {
  for (const report of [null, {}, { status: "running" }, { status: "failed" },
    { status: "completed" }, { status: "completed", conversations: [{}] },
    { status: "completed", qualityGate: { passed: false, status: "inconclusive" } }]) {
    assert.equal(reportExitCode(report), 2);
  }
});

test("explicit gates and legacy rates retain failure semantics", () => {
  assert.equal(reportExitCode({ status: "completed", qualityGate: { passed: true, status: "pass" } }), 0);
  assert.equal(reportExitCode({ status: "completed", qualityGate: { passed: false, status: "fail" } }), 1);
  assert.equal(reportExitCode({ status: "completed", passRate: 0, conversationCount: 1 }), 1);
  assert.equal(reportExitCode({ status: "completed", passRate: 1, conversationCount: 1 }), 0);
});
