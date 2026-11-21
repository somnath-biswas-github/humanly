# Adoption preparation verification

## Scope and evidence boundaries

Verification is local and credential-free. The recorded demo's mock semantic
judge returns 100 for every variant; deterministic L4 evidence catches the
false-success claim. The LangGraph test uses an actual graph and a sandbox tool
exception. This establishes transport, evidence and gate wiring, not live
simulator diversity, semantic accuracy or production safety.

No scripted entry point was enabled, threshold changed, evidence gate weakened,
licence changed or Studio implementation copied into OSS.

## Checks

The release preparation runs:

- Locked OSS install, source tests, TypeScript check, committed-bundle comparison,
  rebuild, internal documentation links and portable lockfile checks.
- Recorded demo and real LangGraph HTTP adapter: control exits 0, faulty exits 1,
  missing runtime evidence exits 2, invalid request returns 400.
- SDK build, local tarball, isolated consumer ESM/CJS imports and declarations.
- Source archive extraction, fresh install and documented demo path.
- Shared support-knowledge tests confirm CTO Chat and Help Bot receive aligned
  setup and availability guidance.

## Results — 19 November 2026

- OSS suite: 153 passed, zero failed/skipped; the subsequently added active-copy
  regression test also passed (154 tests in total).
- TypeScript, portable lockfiles and bundle consistency passed. Committed server
  SHA-256: `023e4b1592fdf294ccb4a29f63670f3bf3b35961ee653cc1eb8c0375ab0cbc59`.
  Rebuilding from the locked install did not change it.
- Internal links passed across 43 documentation files including the new starter.
- Both adoption tests passed, including a second run with LangGraph installed
  into a clean target and host site-packages excluded. Pip reported a conflict
  with an unrelated host `openai-agents` package; the isolated target did not use
  that package and both tests passed.
- SDK tarball build and clean ESM/CJS/TypeScript consumer checks passed.
- Source archive extracted into a fresh temporary directory: locked install,
  documented demo, bundle consistency and documentation links all passed.
- Shared CTO/Help Bot guidance: 9 tests passed.
- Development app restarted cleanly; public `/docs` rendered. This was not a
  signed-in UI check or verification of a published documentation route.

Final archive hashes are in the generated candidate's `SHA256SUMS`, not duplicated
here (including a source archive's own hash inside itself would be circular).

## Test Rig impact

Reviewed the existing coverage map and `docs/test-rig-coverage-review.md`.
No evaluator/runtime capability changed; no Studio Test Rig behaviour or coverage
percentage needs changing. The new adoption harness has its own CI step and must
not be presented as live judge qualification or extra semantic coverage.
The existing Docker self-hosted smoke workflow remains separate and unchanged.
No Docker daemon or live provider is needed for the new primary onboarding.

## Explicitly unverified

- Live paid simulation and semantic judging of this new scenario.
- Public GitHub Actions execution, registry publication and downloaded release.
- New Docker end-to-end execution in this workspace.
- Signed-in Studio documentation rendering; shared guidance is checked in source
  and tests, not through an authenticated browser session.
