// Compare without overwriting the committed distribution artifact.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const temporary = mkdtempSync(join(tmpdir(), "humanly-bundle-check-"));
const digest = bytes => createHash("sha256").update(bytes).digest("hex");
try {
  const output = join(temporary, "server.cjs");
  execFileSync(join(root, "node_modules/.bin/esbuild"), [
    "src/index.ts", "--bundle", "--platform=node", "--format=cjs",
    "--target=node20", `--outfile=${output}`,
  ], { cwd: root, stdio: "inherit" });
  execFileSync(process.execPath, ["scripts/strip-trailing-whitespace.mjs", output], { cwd: root });
  const committed = readFileSync(join(root, "dist/server.cjs"));
  const rebuilt = readFileSync(output);
  if (!committed.equals(rebuilt)) {
    console.error(`FAIL: distribution bundle is stale.\nCommitted: ${digest(committed)}\nRebuilt:   ${digest(rebuilt)}\nRun npm ci and npm run build, then commit source, lockfile and dist/server.cjs together.`);
    process.exitCode = 1;
  } else {
    console.log(`PASS: distribution bundle matches rebuild (SHA-256 ${digest(rebuilt)}).`);
  }
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
