# Humanly OSS

### Evaluate AI agent behaviour before release and catch regressions in CI

Run adaptive synthetic-user conversations, conversational RAG and standalone RAG
with your own provider. Inspect transcripts, criteria and runtime evidence;
block deployment on failures **and inconclusive results**.

[Quick start](docs/quickstart.mdx) · [Behavioural walkthrough](docs/behavioural-demo.md) ·
[LangGraph starter](examples/langgraph/README.md) · [Choose a test](docs/choose-your-test.md)

AGPL-3.0-or-later · Node.js 20+ · No Studio account required.

## What is included in the free OSS release?

**Standalone RAG, conversational RAG and adaptive synthetic-user conversations
are available now**, without a Studio subscription. HTTP is the connection to
your agent, not a restriction to endpoint smoke tests. Synthetic users react
to your agent using a persona and scenario you configure.

Live simulation and semantic judging use your own model provider and can incur
provider costs. Full RAG checks need actual retrieved passages/citations and
independently authored reference evidence; answer text alone cannot establish
retrieval quality or groundedness. Docker is optional for the standalone CLI.

Download the source and SDK from the
[GitHub prerelease v0.1.1-oss.0](https://github.com/somnath-biswas-github/humanly/releases/tag/v0.1.1-oss.0).
SDK distribution is via the GitHub tarball, not the npm registry.

## Try a meaningful failure without credentials

From the source checkout:

```sh
npm ci
npm run demo
```

This **recorded, deterministic harness walkthrough** runs the supported synthetic
conversation runner against local fixtures. A refund tool fails; the faulty agent
claims success, while the control truthfully reports failure. Missing runtime
evidence produces an inconclusive result. Reports go to `demo-output/behaviour/`.
No external model is called. This verifies wiring and deterministic evidence
checks, **not live simulator or judge accuracy**.

Read the [evidence and limitations](docs/behavioural-demo.md), then follow the
explicit live path there using your own provider and budget. The old empty-text
demo is now `npm run demo:smoke`; it checks connectivity, not behaviour.
A smoke-test pass does **not** establish factual correctness or groundedness.

## Choose an evaluation

| Need | Supported path | Provider usage |
| --- | --- | --- |
| Multi-turn behaviour | [Synthetic conversations](docs/conversational-testing.md) | Simulator and judge |
| Grounded multi-turn answers | [Conversational RAG](docs/advanced-evaluation.md) | Simulator, conversation and RAG judges |
| Independent questions | [Standalone RAG](docs/rag-evaluation.md) | Semantic judge |
| Reachability only | [Legacy smoke suites](docs/guides/first-test-run.mdx) | No judge |

Standalone scripted workflows, scripted conversation stages and script export
are **disabled**. Historical contracts are retained in the
[archived workflow guide](docs/workflow-evaluation.md), not runnable quickstarts.
See [availability](docs/feature-availability.md).

## Install and run

The [release and installation guide](docs/release-candidate.md) describes the
published GitHub downloads. Do not install npm `@humanlyai/sdk@0.1.0` for
this self-hosted API: it targets the older hosted API.

For source-based evaluation:

```sh
git clone https://github.com/somnath-biswas-github/humanly.git
cd humanly
npm ci
npm run --silent conversation -- example > conversation.json
# Review definition and configure your own provider before the paid command:
npm run conversation -- run conversation.json https://your-agent.example/chat report.json
```

The demo and starter are available in the public source and GitHub prerelease.
No npm registry publication is required. For the persistent REST API, use the
[Docker quick start](docs/quickstart.mdx); CLI evaluations need no database.

## Connect a LangGraph agent and gate CI

The [complete starter](examples/langgraph/README.md) adapts a real LangGraph
graph to the HTTP connector and includes credential-free verification, a live
provider path, reports and a copyable CI gate. Exit codes are **0 pass, 1 fail,
2 inconclusive/configuration/error**. Only 0 permits deployment.

Agent requests include `message`, `history`, `conversationId` and `turn`.
Return JSON with `reply` and, for configured workflow checks, actual `workflow`
runtime evidence. Never fabricate evidence from generated prose.
See the [connector guide](docs/guides/agent-connector-setup.mdx).

## OSS and Studio

OSS is the independent, self-hosted evaluation engine. Humanly Studio is the
proprietary hosted visual product at [humanly.ai](https://humanly.ai), with
managed runs and a broader criteria catalog. Neither identical scores nor
automatic configuration interchange is promised. Studio implementation is not
included in this repository.

## Evidence, limitations and contribution

Controlled historical [live pilots](docs/live-pilot-report.md) disclose author
labels, costs, coverage and inconclusive outcomes. They do not establish general
accuracy or production safety, and do not qualify this new starter's live judge.

- [Documentation](docs/introduction.mdx) and [CI gates](docs/guides/ci-cd.mdx)
- [Published release and installation](docs/release-candidate.md)
- [Roadmap](docs/ROADMAP.md), [contributing](CONTRIBUTING.md), [security](SECURITY.md)
- [Licence](LICENSE): AGPL-3.0-or-later; no licence change

Run `npm run verify` before releasing. The committed `dist/server.cjs` must
match a rebuild from locked dependencies; source tests alone do not qualify it.
