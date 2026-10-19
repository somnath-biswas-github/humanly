# Choose your test

Humanly OSS helps engineers evaluate agents before deployment and repeat those
checks in CI. It works without a Studio account. Choose by the question you need
to answer, not by the framework your agent uses.

The core product journey is configured synthetic-user-driven testing followed
by analysis of the tests performed. Configure users, goals, criteria and budgets;
run the test; inspect transcripts, scores and evidence. Scripted checks and RAG
evaluation support that journey rather than replace it.

Before preparing input files, read the [input-format guide](input-formats.md).

## 1. Conversational behaviour

Use the [conversation runner](conversational-testing.md) when you need to assess
how an agent handles a user goal across multiple turns.

- **Scripted:** you write each user message. Useful for reproducing known cases.
- **Synthetic:** configure a persona and scenario; a model generates adaptive
  user messages. Useful for exploring how conversations develop.
- In either mode, configure weighted criteria, required minimum scores, turn
  limits and model/token budgets. A model judges the transcript.
- Replay grades a saved transcript again; it does not call the agent. Script
  export produces a candidate regression case, not a proven equivalent test.

Start with Node.js 20+ and `npm ci`, then:

```sh
npx tsx src/conversation-cli.ts example > conversation.json
```

Configure your provider and edit the generated definition before running:

```sh
npm run conversation -- run conversation.json https://your-agent.example/chat report.json
```

Both scripted and synthetic conversational grading need a model provider.
Synthetic mode also uses it for user simulation. Calls are billed by your provider.
CLI runs do not require PostgreSQL or the hosted Studio product.

## 2. Workflow correctness

Use [workflow L1–L5](workflow-evaluation.md) to check permitted actions,
approval authorisation, state/target consistency, tool-outcome claims and
progress/termination.

This is deterministic evaluation of **structured runtime evidence plus authored
expectations**, not a model guessing whether actions occurred. Instrument your
agent's actual execution layer; missing required evidence blocks the gate.

For a provider-free first result:

```sh
npm ci
npx tsx src/workflow-cli.ts example fixed > fixed.json
npx tsx src/workflow-cli.ts example faulty > faulty.json
npm run workflow -- evaluate fixed.json
npm run workflow -- evaluate faulty.json
```

The fixed example should pass; the faulty example should exit non-zero.
These examples evaluate supplied evidence, not a live endpoint. The workflow
guide also covers live-agent execution and HTTP fixtures.

You can add `workflowChecks` to a conversation definition. Trusted L2 approvals
require authored scripted annotations; a synthetic user cannot manufacture consent.

## 3. RAG answer quality

Use [RAG evaluation](rag-evaluation.md) for independent questions with golden
references and retrieval evidence. It assesses supported claims, expected facts,
reference correctness and other configured checks. Golden references stay on
the evaluator side, not in the agent request.

Semantic checks need your own compatible judge provider. Mock examples verify
the evaluation pipeline, not real-model accuracy. Missing required retrieval or
document evidence is not a pass. Multi-turn conversational RAG is not implemented.

## 4. Connector smoke testing

Legacy `POST /v1/runs` suites check HTTP success and non-empty text. They support
stored score baselines but do **not** grade configurable conversational rubrics.
Use this route to check connectivity, not as proof of behaviour or factual quality.
The README's `npm run demo` demonstrates this deliberately limited check.

## API, CLI and CI

| Runner | Start through the API | CI contract |
| --- | --- | --- |
| Conversation | `POST /v1/conversation/runs` | CLI: 0 pass, 1 failure, 2 inconclusive/error |
| Workflow | `POST /v1/workflow/runs` | CLI: 0 pass, 1 failure, 2 inconclusive/error |
| RAG | `POST /v1/rag/runs` | CLI: 0 pass, 1 failure, 2 inconclusive/error |
| Legacy smoke suite | `POST /v1/runs` | Legacy CLI baseline gate; inspect check failures too |

Always block CI on non-zero exit. Conversation and RAG reports expose `qualityGate`;
workflow CLI report files use `report.status` (only `pass` permits release),
while the workflow HTTP API also supplies `qualityGate.passed`.
Do not apply the legacy `baselineBreach` field to them. API runs require the
self-hosted server, PostgreSQL, a configured API key and appropriate scopes.
See [API reference](../sdk/api/overview.mdx) for request formats and report retrieval.

The repository SDKs and legacy CLI are separate from the `npm run conversation`,
`workflow` and `rag` commands. Do not assume a generic SDK `triggerRun` starts
every runner or that the published npm SDK matches the checked-in OSS source.

## OSS or Studio?

Choose OSS for source control, self-hosting, your own provider and CI integration.
Choose Studio for hosted visual test creation, managed runs and the Studio
criteria catalog. OSS is not dependent on Studio. Similar concepts do not mean
identical criteria, scores, report schemas or automatic configuration interchange.
