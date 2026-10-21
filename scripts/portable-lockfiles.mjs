import { readFile, writeFile } from "node:fs/promises";

// Run only after resolving and scanning dependencies through the configured
// registry. This changes download locations, not versions or integrity hashes.
const check = process.argv.includes("--check");
let changed = false;
for (const name of ["package-lock.json", "packages/sdk/package-lock.json", "packages/cli/package-lock.json"]) {
  const file = new URL(`../${name}`, import.meta.url);
  const original = await readFile(file, "utf8");
  const lock = JSON.parse(original);
  let count = 0;
  for (const dependency of Object.values(lock.packages)) {
    if (!dependency.resolved) continue;
    const match = /^https?:\/\/package-firewall\.replit\.internal\/npm\/(.+)$/.exec(dependency.resolved);
    if (!match) continue;
    if (!dependency.integrity) throw new Error(`Missing integrity hash in ${name}`);
    dependency.resolved = `https://registry.npmjs.org/${match[1]}`;
    count++;
  }
  if (count) {
    changed = true;
    if (!check) await writeFile(file, `${JSON.stringify(lock, null, 2)}\n`);
    console.log(`${name}: ${count} ${check ? "nonportable URLs" : "public download URLs restored"}`);
  }
}
if (check && changed) {
  console.error("Run npm run lockfiles:portable after the approved dependency resolution/security checks.");
  process.exitCode = 1;
} else if (check) {
  console.log("OSS lockfiles use portable download URLs.");
}
