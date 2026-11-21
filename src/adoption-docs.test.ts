import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

test("active onboarding recommends supported runners, not archived scripted commands", () => {
  for (const path of ["README.md", "docs/quickstart.mdx", "docs/choose-your-test.md", "docs/introduction.mdx", "docs/conversational-testing.md"]) {
    const text = readFileSync(path, "utf8");
    assert.doesNotMatch(text, /npm run workflow -- (evaluate|run)|npm run conversation -- export-script/);
    assert.doesNotMatch(text, /Conversational RAG.*not implemented/);
  }
  const demo = readFileSync("docs/behavioural-demo.md", "utf8");
  assert.match(demo, /not.*adaptive-user quality or semantic judge accuracy/);
  assert.match(demo, /inconclusive \/ 2/);
  const recipe = readFileSync("examples/langgraph/README.md", "utf8").split("```yaml")[1].split("```")[0];
  assert.doesNotMatch(recipe, /continue-on-error|\|\| true/);
  assert.match(recipe, /if: always\(\)/);
  assert.match(recipe, /npm run conversation -- run/);
});
