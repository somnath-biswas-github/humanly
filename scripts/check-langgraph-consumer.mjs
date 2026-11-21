import {execFileSync} from "node:child_process";
import {mkdtempSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
const target = mkdtempSync(join(tmpdir(), "langgraph-consumer-"));
try {
  execFileSync("python", ["-m", "pip", "install", "--target", target, "-r", "examples/langgraph/requirements.txt"], {stdio: "inherit"});
  // -S in the test child excludes host site-packages; only the new target is used.
  execFileSync("npm", ["run", "test:adoption"], {
    stdio: "inherit", env: {...process.env, HUMANLY_STARTER_PYTHONPATH: target},
  });
} finally {rmSync(target, {recursive: true, force: true});}
