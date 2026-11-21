# Choose your test

Humanly OSS runs independently of Studio. Start with representative synthetic
users, goals, criteria, execution budgets and evidence-backed reports.

| Question | Guide | CI |
| --- | --- | --- |
| Does the agent handle a user goal? | [Synthetic conversations](conversational-testing.md) | 0 pass; 1 fail; 2 inconclusive/error |
| Are multi-turn answers grounded? | [Conversational RAG](advanced-evaluation.md) | Same fail-closed gate |
| Are independent answers supported? | [Standalone RAG](rag-evaluation.md) | Same fail-closed gate |
| Does the endpoint return text? | [Legacy smoke test](guides/first-test-run.mdx) | Not behavioural evaluation |

Try the [credential-free recorded walkthrough](behavioural-demo.md) first, then
the [LangGraph starter](../examples/langgraph/README.md) and explicit live path.
Model-based evaluation incurs your provider's costs. Mock-provider checks
verify the harness, not judge accuracy.

Synthetic conversations can include L1–L5 runtime checks via `workflowChecks`.
Missing required evidence is inconclusive. Synthetic users cannot manufacture
trusted approval annotations. Standalone workflow commands, scripted
conversations and script export are disabled. Their
[historical contract](workflow-evaluation.md) is archived, not an active setup path.

Conversation API: `POST /v1/conversation/runs`; RAG API: `POST /v1/rag/runs`.
API execution requires the persistent self-hosted server and scoped API key;
CLI execution does not require PostgreSQL. Reports expose `qualityGate`.
Never use legacy `baselineBreach` as a conversation or RAG gate.

See [input formats](input-formats.md), [persona to report](persona-to-report.md),
[availability](feature-availability.md) and [CI](guides/ci-cd.mdx).
