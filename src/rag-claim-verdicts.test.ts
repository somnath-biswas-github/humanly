import test from "node:test";
import assert from "node:assert/strict";
import { scoreClaimVerdicts } from "./rag-claim-verdicts.js";
const claims = ["Returns allowed for 60 days"];
const row = (verdict = "asserted", quote = "60 days") => ({ claimIndex: 0, verdict, quote, explanation: "Assessment of the claim." });
test("scores explicit violation, negation and absent claims from structured verdicts", () => {
  assert.equal(scoreClaimVerdicts(claims, "Yes, 60 days.", [row()]).score, 0);
  assert.equal(scoreClaimVerdicts(claims, "Not 60 days.", [row("not_asserted", "Not 60 days.")]).score, 100);
  assert.equal(scoreClaimVerdicts([], "Hello", []).score, 100);
});
test("missing, duplicated, uncertain and fabricated verdicts cannot pass", () => {
  for (const rows of [undefined, [], [row("uncertain")], [row("asserted", "")],
    [row("asserted", "invented")], [row(), row()], [{ ...row(), claimIndex: 1 }]]) {
    assert.throws(() => scoreClaimVerdicts(claims, "60 days", rows));
  }
});
test("one asserted claim fails even when another is not asserted", () => {
  const result = scoreClaimVerdicts([...claims, "Free shipping"], "60 days", [
    row(), { ...row("not_asserted", ""), claimIndex: 1 },
  ]);
  assert.equal(result.score, 0);
  assert.equal(result.findings.length, 1);
});
