import { access, readFile, readdir } from "node:fs/promises";
import { dirname, extname, join, relative, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const roots = [
  "README.md",
  "CONTRIBUTING.md",
  "SECURITY.md",
  "CODE_OF_CONDUCT.md",
  "CHANGELOG.md",
  "docs",
  "sdk",
  "packages/sdk/README.md",
  "packages/cli/README.md",
  "packages/python-sdk/README.md",
];
const markdownExtensions = new Set([".md", ".mdx"]);
const failures = [];

async function collect(path) {
  const absolute = resolve(root, path);
  try {
    const entries = await readdir(absolute, { withFileTypes: true });
    const nested = await Promise.all(entries.map((entry) =>
      collect(relative(root, join(absolute, entry.name)))));
    return nested.flat();
  } catch {
    if (!markdownExtensions.has(extname(absolute))) return [];
    return access(absolute).then(() => [absolute], () => []);
  }
}

function candidates(file, target) {
  const withoutFragment = target.split("#")[0].split("?")[0];
  if (!withoutFragment) return [];
  const base = withoutFragment.startsWith("/")
    ? resolve(root, withoutFragment.slice(1))
    : resolve(dirname(file), withoutFragment);
  return [
    base,
    `${base}.md`,
    `${base}.mdx`,
    join(base, "README.md"),
    join(base, "index.md"),
    join(base, "index.mdx"),
  ];
}

const files = (await Promise.all(roots.map(collect))).flat();
for (const file of files) {
  const content = await readFile(file, "utf8");
  const links = [...content.matchAll(/!?\[[^\]]*]\(([^)]+)\)/g)].map((match) => match[1].trim());
  for (const target of links) {
    if (/^(https?:|mailto:|#)/.test(target)) continue;
    const possible = candidates(file, target);
    if (!possible.length) continue;
    const exists = await Promise.any(possible.map(async (candidate) => {
      await readFile(candidate);
      return true;
    })).catch(() => false);
    if (!exists) failures.push(`${relative(root, file)} -> ${target}`);
  }
}

if (failures.length) {
  console.error("Broken internal documentation links:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Checked internal links in ${files.length} documentation files.`);