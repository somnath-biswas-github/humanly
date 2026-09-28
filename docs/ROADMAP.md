# Humanly OSS roadmap and issue candidates

This file contains issue-ready work for the public repository. It does not
promise delivery dates.

## Roadmap issues

### Add deterministic response-latency thresholds

**Labels:** `enhancement`, `evaluation`

Record connector duration per conversation, allow a suite threshold in
milliseconds, expose the check in reports, and test timeout and boundary cases.

### Add multi-turn conversation execution

**Labels:** `enhancement`, `evaluation`

Extend suites with a bounded turn count, send prior messages through the
AgentConnector `history` field, and retain backward compatibility with one-turn
suites.

### Export JUnit XML from the CLI

**Labels:** `enhancement`, `ci-cd`

Add `--format junit` to `humanly run` and `humanly report`, map each check to a
test case, and document GitHub Actions artifact upload.

### Add scoped API-key management

**Labels:** `enhancement`, `security`

Add endpoints to create, list, and revoke hashed API keys with explicit scopes.
Never return stored key material.

### Add an OpenAPI 3.1 document

**Labels:** `documentation`, `api`

Describe every v1 endpoint and schema, validate the document in CI, and link it
from `/docs`.

## Good first issue candidates

### Add `HEAD /health`

**Labels:** `good first issue`, `help wanted`

Return the same status code as `GET /health` without a body. Add tests and a
short self-hosting note.

### Add `--json` output to `humanly list-*`

**Labels:** `good first issue`, `help wanted`, `cli`

Preserve the current readable output by default and add machine-readable JSON
for scripts.

### Validate documentation code-block JSON

**Labels:** `good first issue`, `help wanted`, `documentation`

Extend the documentation checker to parse fenced JSON examples and report the
source file and line for malformed examples.