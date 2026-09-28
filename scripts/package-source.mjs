#!/usr/bin/env node
// Local-only source handoff. Only the OSS checkout's tracked files plus the two
// explicitly reviewed handoff files are eligible; never archive the parent tree.
import { execFileSync } from "node:child_process";
import {
  lstatSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const destination = resolve(root, "..", "deliverables", "humanly-oss-source.tar.gz");
const currentFiles = ["scripts/package-source.mjs", "releases/local-source-handoff.md"];
const required = [
  ".env.example", ".github/workflows/ci.yml", ".github/workflows/self-hosted-smoke.yml",
  "Dockerfile", "docker-compose.yml", "dist/server.cjs", "LICENSE", "COPYING",
  "README.md", "package.json", "package-lock.json", "migrations/001_initial.sql",
  "src/workflow.test.ts", "docs/workflow-evaluation.md", ...currentFiles,
];
const forbiddenParts = new Set([
  ".git", "node_modules", ".cache", ".local", ".config", ".upm", ".docker",
  ".vite", "coverage", "demo-output", "uploads", "logs", "build", "venv",
  ".venv", "__pycache__", "playwright-artifacts", "screenshots",
]);
const privateKeyOrToken = /-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----|(?:gh[pousr]_[A-Za-z0-9_]{36,})|(?:sk-(?:proj-)?[A-Za-z0-9_-]{32,})|(?:AKIA[0-9A-Z]{16})/;

function checkPath(name) {
  const parts = name.split("/");
  if (!name || name.startsWith("/") || parts.some((part) =>
    !part || part === "." || part === ".." || forbiddenParts.has(part)
    || part.endsWith(".tsbuildinfo") || part.endsWith(".log")
    || part.endsWith(".pyc") || part.endsWith(".pem") || part.endsWith(".key")
    || part === ".DS_Store"
    || (part.startsWith(".env") && part !== ".env.example")
  )) throw new Error(`Forbidden archive path: ${name}`);
  let cursor = root;
  for (const part of parts) {
    cursor = join(cursor, part);
    if (lstatSync(cursor).isSymbolicLink()) throw new Error(`Symlink in archive path: ${name}`);
  }
  if (!lstatSync(cursor).isFile()) throw new Error(`Not a regular file: ${name}`);
  const bytes = readFileSync(cursor);
  if (privateKeyOrToken.test(bytes.toString("utf8")))
    throw new Error(`Potential credential material in: ${name} (contents not displayed)`);
}

let temporary;
try {
  const tracked = execFileSync("git", ["ls-files", "--cached", "-z", "--", "."], {
    cwd: root, maxBuffer: 10 * 1024 * 1024,
  }).toString("utf8").split("\0").filter(Boolean);
  const files = [...new Set([...tracked, ...currentFiles])].sort();
  for (const name of required) {
    if (!files.includes(name)) throw new Error(`Required source file missing from manifest: ${name}`);
  }
  for (const name of files) checkPath(name);
  temporary = mkdtempSync(join(tmpdir(), "humanly-oss-pack-"));
  const listPath = join(temporary, "files");
  const archivePath = join(temporary, "source.tar.gz");
  writeFileSync(listPath, files.join("\0") + "\0");
  execFileSync("tar", [
    "--format=gnu", "--sort=name", "--mtime=@0", "--owner=0", "--group=0",
    "--numeric-owner", "-czf", archivePath, "--null", "-T", listPath,
  ], { cwd: root });
  const archived = execFileSync("tar", ["-tzf", archivePath], {
    maxBuffer: 10 * 1024 * 1024,
  }).toString("utf8").trimEnd().split("\n");
  if (archived.length !== files.length || archived.some((name, index) => name !== files[index]))
    throw new Error("Archive manifest does not exactly match reviewed source file list");
  mkdirSync(dirname(destination), { recursive: true });
  // Only replace an existing handoff after the new one has passed validation.
  const bytes = readFileSync(archivePath);
  writeFileSync(destination, bytes);
  console.log(`Archive: ${destination}`);
  console.log(`Files: ${files.length}`);
  console.log(`SHA256: ${createHash("sha256").update(bytes).digest("hex")}`);
  console.log("Manifest:\n" + files.join("\n"));
} catch (error) {
  console.error(`Source packaging failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  if (temporary) rmSync(temporary, { recursive: true, force: true });
}