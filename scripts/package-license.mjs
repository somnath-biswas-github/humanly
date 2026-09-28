import { copyFile, rm } from "node:fs/promises";
import { resolve } from "node:path";

const action = process.argv[2];
const source = resolve(import.meta.dirname, "..", "COPYING");
const destination = resolve(process.cwd(), "LICENSE");

if (action === "copy") {
  await copyFile(source, destination);
} else if (action === "remove") {
  await rm(destination, { force: true });
} else {
  throw new Error("Usage: node scripts/package-license.mjs <copy|remove>");
}