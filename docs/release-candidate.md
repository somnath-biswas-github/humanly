# GitHub prerelease: 0.1.1-oss.0

**Published on GitHub.** The user approved the exact payload and subsequently
removed npm registry publication from scope. Download the source and SDK from
[the GitHub prerelease](https://github.com/somnath-biswas-github/humanly/releases/tag/v0.1.1-oss.0).
All four downloads matched the approved hashes; clean public source and SDK
installations passed. Paid model calls remain outside this approval.
The immutable archives retain their preparation-time notices; this page records
the current distribution policy without changing those approved bytes.

## Historical preparation checks — 19 November 2026

- Public repository: https://github.com/somnath-biswas-github/humanly
- GitHub API returned no tags, releases or open issues. Topics were empty and
  homepage unset. Public README still contained disabled workflow quickstarts.
- Discussions are enabled; the visible list contains the existing
  [welcome discussion](https://github.com/somnath-biswas-github/humanly/discussions/1).
  Do not create another welcome thread.
- npm `@humanlyai/sdk` is 0.1.0 (older hosted API), not this candidate.
  Public npm returned no `@humanlyai/cli`; PyPI returned no `humanly` project.
  This is an observation, not registry namespace ownership or publication access.
- No public changes were made during this preparation.

## Published payload

| Artifact | Candidate state / compatibility |
| --- | --- |
| `humanly-oss-0.1.1-oss.0.tar.gz` | OSS-only source, locked dependencies, committed server bundle, docs, behavioural fixture, LangGraph starter, CI recipes and licence. No Studio source or credentials. |
| `humanlyai-sdk-0.1.1-oss.0.tgz` | Built TypeScript legacy REST API client with ESM, CJS, declarations and AGPL licence; clean local consumer checks. Not a synthetic runner client. |
| `SHA256SUMS` | Exact hashes of the above archives, generated with the payload. |
| `source-files.json` | Auditable source-file manifest for the source archive. |
| GitHub tag/release | Published `v0.1.1-oss.0`, marked prerelease, with the four files above. |
| npm registry | Not a distribution route. No registry publication or dist-tag change is planned. |
| Python SDK / legacy CLI registries | Not part of this publication request. Source remains included; no registry availability claimed. |

The source server retains API version 0.1.0; the archive's `CANDIDATE_VERSION`
identifies the release payload. CLI source requires Node.js 20+, installed
dependencies and this checkout. SDK methods for legacy suites do not start
synthetic conversations; use the supported conversation CLI/API instead.
Python is needed only for the LangGraph starter, pinned in its requirements.

## Build locally; install without building the SDK

From the OSS root:

```sh
npm ci
npm run verify
npm run test:adoption
npm run prepare:candidate
```

For a clean Python dependency check rather than using your installed packages:
`node scripts/check-langgraph-consumer.mjs`. CI runs this isolated check.

The last command builds/packs the SDK, installs the tarball in a temporary clean
consumer, checks ESM/CJS and TypeScript, and packages only OSS source paths.
It does not publish. Outputs are ignored under `generated-artifacts/0.1.1-oss.0/`.
These local paths are not download URLs. Consumers should use the GitHub
prerelease linked above to obtain the reviewed files.

In a fresh directory after receiving the payload:

```sh
sha256sum -c SHA256SUMS
tar -xzf humanly-oss-0.1.1-oss.0.tar.gz
cd humanly
npm ci
npm run demo
```

In a separate consuming Node project:

```sh
npm init -y
npm install /absolute/path/to/humanlyai-sdk-0.1.1-oss.0.tgz
node --input-type=module -e 'import { HumanlyClient } from "@humanlyai/sdk"; console.log(typeof HumanlyClient)'
```

Expected import result: `function`. No provider or API call is made.
Use the downloaded SDK tarball, not an npm registry version. npm remains the
local dependency/package installation tool; registry publication is not required.

## Release approval and access checklist

Before publishing, review the exact manifest and hashes alongside the source
diff. Any subsequent payload change requires fresh hashes and approval.

- Confirm version `0.1.1-oss.0` and four GitHub attachments.
- Confirm OSS-only export, licence, bundle consistency and candidate source
  onboarding checks; see [verification](adoption-verification.md).
- GitHub write/release permission is required for the approved public commit,
  tag and prerelease; repository administration permission for metadata.
- Approve [metadata/help drafts](repository-presentation.md) separately.
- After publishing, re-download assets and verify hashes, install the exact
  SDK tarball in a clean consumer, verify the tag's source and bundle,
  and only then remove local-only availability notices.

No campaign, outreach, public issue, new discussion or registry package was created.
