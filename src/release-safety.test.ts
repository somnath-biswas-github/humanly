import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("Docker healthchecks use IPv4 and require database readiness", () => {
  for (const file of ["Dockerfile", "docker-compose.yml"]) {
    const text = readFileSync(file, "utf8");
    assert.match(text, /127\.0\.0\.1:5000\/health/);
    assert.ok(text.includes("ready"));
    assert.doesNotMatch(text, /localhost:5000\/health/);
  }
});
test("release dependency lock excludes vulnerable proxy-addr", () => {
  const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));
  assert.equal(lock.packages["node_modules/proxy-addr"].version, "2.0.8");
});
test("legacy smoke checks are not advertised as answer quality evaluation", () => {
  const readme = readFileSync("README.md", "utf8");
  assert.match(readme, /pass does \*\*not\*\* establish factual correctness/);
  assert.match(readme, /docs\/conversational-testing.md/);
});
