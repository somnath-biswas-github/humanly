# Conversational & Workflow Testing

Humanly has two tracks: **Conversational & Workflow Testing** and **RAG
Evaluation**. They are testing approaches, not mutually exclusive agent types.

## Choose a mode

- **Scripted:** authored user turns, predictable input and repeatable regressions.
- **Synthetic User:** a model uses a persona and scenario to react to the tested
  agent. Conversation outcomes are not deterministic, even at temperature zero.

Both modes use persona (required only for synthetic), scenario, criteria and
execution configuration. Existing L1–L5 cases remain supported by `npm run workflow`.
The new `npm run conversation` runs conversational criteria in either mode and
can optionally apply `workflowChecks` to actual runtime evidence.

Studio exposes the two modes at `/workflow-evaluation`. Synthetic User opens
the existing `/run` flow, retaining saved personas, criteria, scenarios, test
configuration, billing and run history. This is a navigation integration, not a
replacement of the managed Studio runner. Studio's original criteria catalog
and scoring are not identical to OSS's configurable conversational rubric;
automatic configuration interchange and score parity are not claimed.

## Standalone OSS setup

From the OSS directory, install dependencies with `npm ci`. Node.js 20+ is
required. CLI execution needs neither Studio nor PostgreSQL. The HTTP API uses
the existing self-hosted database and API-key scopes.

Configure environment variables locally; do not put credentials in definitions,
reports, Git or chat:

- `CONVERSATION_MODEL_API_KEY`: hosted OpenAI-compatible provider credential.
- `CONVERSATION_MODEL_BASE_URL`: defaults to `https://api.openai.com/v1`.
- `CONVERSATION_MODEL`: defaults to `gpt-4o-mini`.
- `CONVERSATION_MODEL_ALLOW_PRIVATE=true`: explicitly permit a trusted local
  model endpoint, HTTP and keyless operation. Off by default.
- `CONVERSATION_AGENT_TOKEN`: optional bearer credential for the tested agent.
- `HUMANLY_ALLOW_PRIVATE_CONNECTORS=true`: explicitly permit trusted private
  agent endpoints. This is separate from private model access.

Provider must support Chat Completions with strict JSON-schema responses and
token usage. Other provider/model compatibility and quality are not certified.
Model calls are billed by your provider, not by Studio. Scripted conversation
grading still uses a judge; the legacy `workflow` L1–L5 runner needs no judge.

```sh
npx tsx src/conversation-cli.ts example > conversation.json
# Edit the generated definition before using your own connector:
npm run conversation -- run conversation.json https://your-agent.example/chat report.json
npm run conversation -- replay report.json regraded-report.json
npm run conversation -- export-script report.json regression-candidate.json
```

The example is a template, not proof that any real agent passed.
Use `npx tsx` (or `npm run --silent`) when redirecting JSON so npm's command
banner does not become part of the file.

For the container API, environment variables must reach the `app` container.
The checked-in Compose file forwards RAG settings but not conversation-provider
settings. Add an operator-owned Compose override forwarding
`CONVERSATION_MODEL_API_KEY`, `CONVERSATION_MODEL_BASE_URL`,
`CONVERSATION_MODEL` and, only if needed, `CONVERSATION_MODEL_ALLOW_PRIVATE`.
Setting these in the host `.env` alone does not inject them into the container.
The standalone CLI loads the local `.env` directly.

## Definition contract

The generated example is the canonical complete version-1 definition:

- `version: 1`, `kind: "conversation"`, `name`, `mode: "synthetic" | "scripted"`.
- `persona`: `name` and `description`; describe tone, knowledge and constraints.
- `scenario`: `goal`, `context` and `endCondition`. Use a realistic user goal,
  not evaluator-only expected answers.
- `criteria`: unique `id`, `description`, integer `weight`, `minimumScore` and
  boolean `required`. Weights must total 100; zero weights are allowed.
- `config`: `conversationCount` (1–20), `maxTurns` (1–50), `minimumScore`
  (0–100), `maxModelCalls` (1–500), `maxTokens` (1–1,000,000),
  `timeoutMs` (100–120,000 per operation).
- Scripted mode additionally requires `turns: [{message, approval?, revoke?}]`.
- Optional `workflowChecks` uses the existing [L1–L5 contract](workflow-evaluation.md).

The weighted score must meet `config.minimumScore`. A criterion marked
`required` must additionally meet its own `minimumScore`, even at zero weight.
Changing the rubric or weights changes the test: reports retain the exact
definition. Persona, scenario and criteria influence actual execution, not just
report labels.

## Execution and evidence

The simulator sees only the persona, scenario and transcript—not the criteria.
The agent receives the current `message`, prior `history`, complete `messages`,
unique `conversationId`/`sessionId` and one-based `turn`. It never receives the
rubric, weights, expected actions or approvals as hidden reference data.
Response text aliases follow the existing connector contract (`reply` first).

The judge sees the transcript and criteria. Every criterion must have exactly
one valid score, explanation and optional exact assistant quote. Missing,
duplicate, extra or fabricated assessments are inconclusive. This validates
structure and provenance, not semantic accuracy or immunity to prompt injection.

To prove actions/state, configure workflow checks and return actual runtime
`workflow` evidence. Missing evidence is inconclusive, not an inferred pass.
Synthetic users cannot create trusted approval annotations; L2 approval
authorisation needs a deliberately authored scripted case. Reports are not
cryptographically signed proofs of external side effects.

## Limits and CI

`maxModelCalls` applies across the whole run, including simulation and grading.
`maxTokens` is a **reported-usage stop threshold, not a guaranteed monetary cap**:
an in-flight call can exceed it before usage is known. Output tokens per call
are also capped. A timeout does not guarantee that a remote provider stopped
processing or charging. No automatic retries are made.

A turn limit, invalid output, unknown usage, missing required runtime evidence
or exhausted budget blocks the gate. Model/provider failures are reported with
sanitised diagnostics, not raw exception text that might contain credentials.

Exit codes: **0 pass; 1 evaluation failure; 2 inconclusive/configuration/error**.
Both 1 and 2 must block CI. Invalid top-level input can exit before a report is
created. Reports include conversations, exact definitions, termination reason,
criterion findings, workflow findings where requested, model names, usage and
timestamps. Treat reports as sensitive; transcripts can contain private data.

Replay regrades saved conversations: it calls the judge but not the agent or
simulator. Regraded results can vary and are not new live-agent evidence.
Export-script produces a candidate from the first conversation for review; it
does not invent approvals or guarantee equivalent behaviour on a new agent.

## HTTP API

- `GET /v1/conversation/example` — `suites:read`.
- `POST /v1/conversation/runs` — `runs:write`; body
  `{definition, connectorId}` **or** `{definition, replay}`, never both.
- `GET /v1/runs/:id/report` — existing `reports:read` report endpoint.

The API stores the report in the existing runs table; no database migration.

## RAG remains separate

Use [RAG Evaluation](rag-evaluation.md) for independent questions with reference
answers/facts and retrieval evidence. Studio can export an OSS suite from its
case editor. Export converts thresholds from 0–1 to 0–100 and discloses strict
evidence policies; it does not guarantee equal scores between judges/runners.
Conversational RAG and arbitrary Studio-to-OSS test-set conversion are not
implemented by this release.

## Verification

### Scoring interpretation

Conversational criterion scores measure observed agent behaviour, not how
difficult the test was. Limited test exposure should be explained separately:
a polite conversation is not a toxicity failure just because no provocation
occurred, and safe refusal is not hallucination. Use configured criteria to
specify authentication requirements; the judge must not invent mandatory MFA
or repeated verification rules. Missing evidence explicitly required by a
criterion still matters, and claims of completed actions are not runtime proof.

OSS reports exposure limitations in explanations. They do not implement
Studio's structured exposure fields or its proprietary Test Rig. These prompt
changes affect future evaluations only, not stored reports, and do not imply
identical Studio/OSS scores.

Isolated tests exercise adaptive turns, scripted history, persona/criteria
isolation, weights and hard gates, malformed verdicts, limits, evidence,
replay, script export and API handling. A local HTTP fixture also exercises the
actual CLI, provider adapter, agent transport and exit codes. No paid provider
calibration or signed-in Studio browser certification is implied.
