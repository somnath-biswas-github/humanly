import { readFile, writeFile } from "node:fs/promises";

const filePath = process.argv[2];
if (!filePath) {
  throw new Error("Usage: node scripts/strip-trailing-whitespace.mjs <file>");
}

const original = await readFile(filePath, "utf8");
const normalized = original.replace(/[ \t]+$/gm, "");
if (normalized !== original) {
  await writeFile(filePath, normalized);
}