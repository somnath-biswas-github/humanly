// Local preparation only. Never publishes a registry package or GitHub release.
import {execFileSync} from "node:child_process";
import {mkdirSync, readFileSync, writeFileSync, mkdtempSync, rmSync, cpSync} from "node:fs";
import {resolve, dirname, join} from "node:path";
import {fileURLToPath} from "node:url";
import {tmpdir} from "node:os";
import {createHash} from "node:crypto";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const version = JSON.parse(readFileSync(join(root, "packages/sdk/package.json"))).version;
if (version !== "0.1.1-oss.0") throw Error("Review the release payload before changing candidate version");
const output = join(root, "generated-artifacts", version);
mkdirSync(output, {recursive: true});
function run(command, args, cwd = root) {
  return execFileSync(command, args, {cwd, stdio: ["ignore", "pipe", "inherit"], encoding: "utf8"});
}
run("npm", ["ci"], join(root, "packages/sdk"));
console.log(run("npm", ["run", "build"], join(root, "packages/sdk")));
console.log(run("npm", ["run", "lint"], join(root, "packages/sdk")));
run("npm", ["pack", "--pack-destination", output], join(root, "packages/sdk"));
const sdk = `humanlyai-sdk-${version}.tgz`;
const consumer = mkdtempSync(join(tmpdir(), "humanly-consumer-"));
try {
  writeFileSync(join(consumer, "package.json"), JSON.stringify({name: "isolated-consumer", private: true, type: "module"}));
  run("npm", ["install", "--ignore-scripts", join(output, sdk)], consumer);
  writeFileSync(join(consumer, "check.mjs"), `
import {HumanlyClient} from "@humanlyai/sdk";
import {createRequire} from "node:module";
const cjs = createRequire(import.meta.url)("@humanlyai/sdk");
if (typeof HumanlyClient !== "function" || typeof cjs.HumanlyClient !== "function") throw Error("Missing exports");
new HumanlyClient({apiKey:"local-fixture",baseUrl:"http://127.0.0.1:1"});
console.log("Isolated ESM and CJS imports passed; no network calls.");
`);
  console.log(run("node", ["check.mjs"], consumer));
  writeFileSync(join(consumer, "types.ts"), 'import {HumanlyClient} from "@humanlyai/sdk"; new HumanlyClient({apiKey:"fixture",baseUrl:"http://127.0.0.1:1"});');
  console.log(run(join(root, "packages/sdk/node_modules/.bin/tsc"), ["--noEmit", "--strict", "--skipLibCheck", "--module", "nodenext", "--moduleResolution", "nodenext", "--target", "es2022", "types.ts"], consumer));
} finally { rmSync(consumer, {recursive: true, force: true}); }

// Only OSS paths, never parent Studio source. Include newly authored source too.
const files = [...new Set(run("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z", "."])
  .split("\0").filter(Boolean))].sort();
if (files.some(file => file.startsWith("/") || file.split("/").includes("..") ||
  /(^|\/)(node_modules|generated-artifacts|\.git)(\/|$)/.test(file) ||
  /(^|\/)\.env(?!\.example$)/.test(file))) throw Error("Unsafe archive input");
const staging = mkdtempSync(join(tmpdir(), "humanly-source-"));
const source = `humanly-oss-${version}.tar.gz`;
try {
  for (const file of files) {
    const destination = join(staging, "humanly", file);
    mkdirSync(dirname(destination), {recursive: true});
    cpSync(join(root, file), destination);
  }
  writeFileSync(join(staging, "humanly", "CANDIDATE_VERSION"), `${version}\nLocal prerelease candidate; not registry publication.\n`);
  run("tar", ["-czf", join(output, source), "-C", staging, "humanly"]);
} finally {rmSync(staging, {recursive: true, force: true});}
writeFileSync(join(output, "SHA256SUMS"), [sdk, source].map(file =>
  `${createHash("sha256").update(readFileSync(join(output, file))).digest("hex")}  ${file}`).join("\n") + "\n");
writeFileSync(join(output, "source-files.json"), JSON.stringify(files, null, 2));
console.log(`Local candidate only: ${output}`);
