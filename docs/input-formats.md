# Prepare your first test

Start with [configured synthetic-user tests](conversational-testing.md): choose a
user, goal, criteria and budgets, execute the configured test, then analyse the
transcript, findings and scores. The legacy `/v1/runs` endpoint is only a
connector smoke check: a non-empty wrong answer can pass it.

## Copyable input contracts

- [Synthetic-user and scripted conversations](conversational-testing.md):
  configuration, provider setup and report interpretation.
- [RAG suites and uploaded observations](rag-evaluation.md#suite-and-uploaded-observation-contract):
  versioned suite, expected facts, prohibited claims and actual retrieval evidence.
- [Workflow cases](workflow-evaluation.md#version-1-case-contract):
  test turns, L1–L5 expectations and runtime evidence.

Each linked contract includes examples. Use real execution evidence. Keep golden
references out of the request sent to the agent.

## Studio imports are a different format

Studio accepts a case array using `expectedSources` and `mustNotInclude`;
OSS RAG uses a versioned suite with `expectedChunkIds` and `prohibitedClaims`.
Download Studio's example from its import dialog or `/templates/studio-rag-cases.json`.
Do not feed one format to the other. Studio's OSS export provides conversion
warnings that must be reviewed.

## Troubleshooting

Use JSON booleans (`true`/`false`), not quoted strings. Supply arrays where the
contract requires arrays. An answerable RAG case requires reference text or
expected facts. Missing evidence is not a successful check.

OSS provider charges are separate from Humanly Studio's evaluation-token balance.
A provider quota error needs provider attention; a Studio balance error needs
Humanly balance attention. An inconclusive evaluator result is not an agent
quality failure and must not be turned into a pass. Preserve the report and run
identifier, but remove credentials and private data before sharing reports.

Docker readiness checks use IPv4 loopback and require the database-backed
`ready` response. A running process alone is not enough to be healthy.
