# Standalone RAG evaluation

Humanly OSS can evaluate RAG answers **without a Studio account, subscription,
or Studio API**. The RAG runner is separate from the legacy non-empty-response
suite and from scripted L1–L5 workflow checks.

## What it checks

| Check | Evidence and method | Default threshold |
| --- | --- | --- |
| Retrieval recall | Expected source IDs compared with actual retrieved IDs | 80% |
| Expected fact coverage | Model judges semantic coverage; findings identify missing facts | 90% |
| Reference correctness | Model compares answer with independently authored reference | 90% |
| Groundedness | Model compares answer claims only with retrieved passages | 90% |
| Citation support | Model checks that cited evidence supports answer claims | 90% |
| Citation identity | Each citation must uniquely resolve to retrieved evidence | 100% |
| Answer handling | Distinguishes answering, abstention, refusal and guesses after disclaimers | 100% |
| Prohibited claims | Model checks independently authored forbidden claims | 100% |

Thresholds use **0–100**, not 0–1. Set overrides in `suite.thresholds` using
`retrievalRecall`, `expectedFactCoverage`, `referenceCorrectness`, `groundedness`,
`citations`, `answerHandling`, or `prohibitedClaims`. Citation identity is always
strict. Missing expected sources are reported separately from missing answer facts.

There is no keyword-matching fallback for semantic checks. A model/provider
failure is inconclusive and blocks the quality gate.

## Configure your own judge

For the CLI, install source dependencies with `npm ci`. It requires Node.js 20+,
but **does not require PostgreSQL or a running Humanly server**.

Set these in your local `.env` (never commit credentials):

```dotenv
RAG_JUDGE_API_KEY=your-provider-key
RAG_JUDGE_BASE_URL=https://api.openai.com/v1
RAG_JUDGE_MODEL=gpt-4o-mini
RAG_JUDGE_ALLOW_PRIVATE=false
```

OpenAI is the default protocol target. Provider calls are billed directly to
your provider account, not through Studio. The adapter uses Chat Completions
with strict JSON-schema output, temperature 0 and a 5000-token output limit.
Alternative OpenAI-compatible providers/models must support that contract.
Compatibility and semantic quality are **not guaranteed for every provider**.

For a trusted local judge, configure its `/v1` base URL and model and explicitly
set `RAG_JUDGE_ALLOW_PRIVATE=true`. That flag permits private network destinations,
HTTP, and keyless local endpoints. It is independent of private agent access.
Local-model quality has not been calibrated. Hosted judges require HTTPS and a key.
Both judge and agent connections use DNS-pinned target validation, bounded
responses, timeouts, and no automatic retry.

Docker Compose forwards these judge settings to the API:

```sh
docker compose up --build -d
```

## Try fixed and faulty examples

Generate controlled fixture bundles without a provider:

```sh
npx tsx src/rag-cli.ts example fixed > fixed-rag.json
npx tsx src/rag-cli.ts example faulty > faulty-rag.json
```

With your judge configured:

```sh
npm run rag -- evaluate fixed-rag.json fixed-report.json
npm run rag -- evaluate faulty-rag.json faulty-report.json
```

These are **authored fixtures, not a real production agent**. The faulty fixture
omits the electronics exception source and incorrectly approves a return.
Source recall is deterministically 50% against the 80% threshold. The semantic
judge separately assesses the incorrect/incomplete answer. Model results can vary.

CLI exit codes:

* `0`: every case passed.
* `1`: a definite evaluation failure, with no inconclusive case.
* `2`: inconclusive, invalid configuration, transport/provider error, or invalid input.

Both `1` and `2` should block CI. Reports are written as JSON; default filename is
`rag-report.json`. Invalid top-level configuration exits `2` before a report exists.
Individual case failures/errors remain in the report, and remaining cases run.

## Suite and uploaded observation contract

The example commands above generate the complete contract:

```json
{
  "suite": {
    "version": 1,
    "name": "Returns",
    "thresholds": { "retrievalRecall": 80 },
    "cases": [{
      "id": "return-window",
      "question": "What is the general return window?",
      "answerable": true,
      "referenceAnswer": "General returns are allowed within 30 days.",
      "expectedFacts": ["General returns are allowed within 30 days."],
      "expectedChunkIds": ["returns"],
      "prohibitedClaims": ["General returns are allowed within 90 days."]
    }]
  },
  "observations": {
    "return-window": {
      "answer": "General returns are allowed within 30 days [policy/returns].",
      "retrievedChunks": [{
        "documentId": "policy",
        "chunkId": "returns",
        "content": "General returns are allowed within 30 days."
      }],
      "citations": [{ "documentId": "policy", "chunkId": "returns" }]
    }
  }
}
```

Cases require unique IDs, questions and boolean `answerable`. Answerable cases
need `referenceAnswer` or at least one expected fact. Use `answerable:false` for
questions that should elicit abstention. Unconfigured reference/fact/prohibition
checks are marked not applicable.

Retrieved entries support `id`, `chunkId`, and `documentId`; at least one is
required, together with non-empty `content`. Expected source IDs match any of
these identifiers. Prefer globally unique chunk IDs and citations containing
both `documentId` and `chunkId`; ambiguous citation matches fail.

### Missing evidence versus empty evidence

* Omitted retrieval/citation arrays mean unavailable instrumentation, not success.
* Explicit empty arrays mean retrieval/citation execution produced no results;
  applicable checks score zero.
* A correct abstention on an unanswerable case makes grounding and citation checks
  not applicable. It does not waive independently configured expected-source recall.
* Malformed or missing judge assessments are evaluator errors, never substitute
  zero scores or passing results.
* Empty agent answers fail without a judge invocation.
* An inconclusive case blocks the gate even when other cases passed. Check each
  case's `failures` and `errors` to distinguish known faults from unavailable assessment.

## Run against your agent

Extract the suite from a generated bundle:

```sh
node -e "const fs=require('fs'); fs.writeFileSync('rag-suite.json',JSON.stringify(JSON.parse(fs.readFileSync('fixed-rag.json','utf8')).suite,null,2))"
npm run rag -- run rag-suite.json https://your-agent.example/chat live-report.json
```

For bearer authentication, set `RAG_AGENT_TOKEN` in the CLI environment. For
deliberate private/local agent testing only, set
`HUMANLY_ALLOW_PRIVATE_CONNECTORS=true`.

Each case gets a fresh conversation ID. Only this request reaches the agent:

```json
{ "message": "What is the general return window?", "conversationId": "unique-run_case-id", "history": [] }
```

**Never include references or expected facts in the agent's knowledge base or
request.** Those enter the separate judge call only after the agent responds.
The agent should return:

```json
{
  "reply": "General returns are allowed within 30 days [policy/returns].",
  "rag": {
    "retrievedChunks": [{ "documentId": "policy", "chunkId": "returns", "content": "General returns are allowed within 30 days." }],
    "citations": [{ "documentId": "policy", "chunkId": "returns" }]
  }
}
```

The standard response aliases are supported. Live connector parsing also accepts
top-level `retrievedChunks`/`citations` when `rag` is absent, and chunk `text`
as an alias for `content`. Uploaded observations use the canonical contract above.
Instrument the actual retrieval path; do not ask the agent to fabricate telemetry.

## API and persistence

The self-hosted API uses existing API-key authentication/scopes:

* `GET /v1/rag/examples` — `suites:read`.
* `POST /v1/rag/runs` — `runs:write`; body is `{ "suite": ..., "observations": ... }`
  or `{ "suite": ..., "connectorId": "saved-connector-id" }`, never both.
* `GET /v1/runs/:id/report` — `reports:read`; retrieves the persisted full report.

```sh
curl -X POST http://localhost:5000/v1/rag/runs \
  -H "Authorization: Bearer $HUMANLY_API_KEY" \
  -H "Content-Type: application/json" \
  --data-binary @fixed-rag.json
```

The server operator configures judge credentials; API callers cannot override
them or redirect the judge endpoint through a request. Live API runs use the
saved connector's authentication.

HTTP `201` and top-level `status:"completed"` mean the run was recorded, not
that it passed. Check `qualityGate.passed` and `qualityGate.status`;
`report.status` is `pass`, `fail`, or `inconclusive`. RAG gates do not use legacy
baseline-delta semantics. The numeric summary is 1 only when every case passes.

Runs are synchronous, sequential, and limited to 20 cases. No new case starts
after a five-minute run budget; the in-flight case can finish its bounded calls
(agent: at most 30 seconds; judge: 120 seconds). Clients/proxies must permit a
sufficient timeout. There is no retry/resume or streaming in this first version.

## Privacy, reliability and verification

The configured judge receives reference data, answers, retrieved text and
citations. For hosted providers, that data leaves your infrastructure. Use
appropriate provider policies and redact secrets/personal data first. API reports
are persisted locally and contain test references and observed evidence; CLI
reports are local files. Neither includes judge or agent credentials.

The model request and prompt treat agent/evidence content as untrusted data, but
LLM judges are not immune to prompt injection or grading mistakes. Temperature
zero is not a reproducibility guarantee. Reports retain the suite, observations,
thresholds, findings, model name and reported token usage; review disagreements.

The automated tests exercise grading rules, reference isolation, provider HTTP
transport, persisted API report handling and CLI gates using a **controlled mock
judge**. They do not establish real-model accuracy or Studio/OSS semantic parity.
Calibrate the configured real model on independently reviewed positive and
negative examples before trusting this as a release gate.
