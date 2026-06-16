# Humanly

**Open-source synthetic user testing for AI agents.**

Run regression suites, evaluate conversations, and gate deployments on quality, compliance, and performance — all from your CI/CD pipeline. Self-host or use [Humanly.ai](https://humanly.ai).

[![GitHub Stars](https://img.shields.io/github/stars/somnath-biswas-github/humanly?style=social)](https://github.com/somnath-biswas-github/humanly/stargazers)
[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
[![npm](https://img.shields.io/npm/v/@humanlyai/sdk)](https://www.npmjs.com/package/@humanlyai/sdk)
[![Docker](https://img.shields.io/badge/docker-ready-blue)](https://hub.docker.com/r/humanlyai/humanly)

> ⭐ If Humanly is useful to you, please **[star this repo](https://github.com/somnath-biswas-github/humanly/stargazers)** — it helps the project grow!

---

## What is Humanly?

Humanly lets you test AI agents the way you test software: automatically, repeatably, and as part of your CI/CD pipeline.

Instead of manually chatting with your agent to check if it behaves correctly, Humanly generates synthetic users — personas with different goals, knowledge levels, and behaviours — and runs structured conversations against your agent. Each conversation is evaluated against your criteria (factual accuracy, tone, compliance, goal completion, and 27+ built-in checks). Results are scored, compared to baselines, and can fail a deployment.

**Who is it for?**
- Teams shipping AI agents or LLM-powered features
- Companies with compliance requirements (finance, healthcare, insurance, telco)
- Engineers who want CI/CD quality gates on agent behaviour

---

## Features

- **Synthetic user personas** — simulate real users with configurable behavioural attributes
- **27+ built-in evaluation checks** — factual accuracy, guardrails, tone, goal completion, and more
- **Regression baselines** — set a quality baseline and alert when scores drop
- **CI/CD integration** — GitHub Actions, GitLab CI, Jenkins templates included
- **AgentConnector protocol** — connect any agent via HTTP with optional LLM trace support
- **LLM trace analysis** — inspect framework calls, tool usage, and latency per turn
- **RAG document support** — upload documents, configure chunk size and retrieval
- **A/B test two agents** — compare agents side-by-side on the same test suite
- **v1 REST API** — full programmatic control with scoped API keys
- **TypeScript SDK** — `@humanly/sdk` wraps the REST API with full type safety
- **Self-hostable** — one-command Docker setup, runs on any VPS

---

## Quick Start (Docker)

```bash
git clone https://github.com/somnath-biswas-github/humanly.git
cd humanly
cp .env.example .env
# Edit .env — at minimum set OPENAI_API_KEY and SESSION_SECRET
docker compose up
```

Open [http://localhost:5000](http://localhost:5000).

Database migrations run automatically on first start. Cold start takes ~30 seconds.

---

## Self-Hosting Guide

### Requirements

- Docker + Docker Compose v2
- OpenAI API key (GPT-4o is the default evaluation model)
- 2 GB RAM minimum (4 GB recommended for concurrent test runs)

### Environment Variables

Copy `.env.example` to `.env` and fill in the required values:

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Auto-set | PostgreSQL connection string (set by Docker Compose) |
| `OPENAI_API_KEY` | **Yes** | Used for synthetic user generation and evaluation |
| `SESSION_SECRET` | **Yes** | Random string for session encryption (32+ chars) |
| `SENDGRID_API_KEY` | No | For password reset and email notifications |
| `STRIPE_SECRET_KEY` | No | Only needed if enabling billing |

### Persistent Data

Postgres data is persisted to a named Docker volume (`humanly_postgres_data`). Uploaded documents are written to `./uploads` which is bind-mounted into the container.

### Upgrading

```bash
git pull
docker compose build
docker compose up -d
```

Migrations run automatically on startup.

---

## CI/CD Integration

### GitHub Actions

```yaml
name: Agent Quality Gate

on:
  push:
    branches: [main]

jobs:
  test-agent:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Install Humanly SDK
        run: npm install -g @humanly/sdk

      - name: Trigger test run
        env:
          HUMANLY_API_KEY: ${{ secrets.HUMANLY_API_KEY }}
          HUMANLY_BASE_URL: ${{ secrets.HUMANLY_BASE_URL }}
        run: |
          npx humanly run \
            --suite ${{ vars.SUITE_ID }} \
            --connector ${{ vars.CONNECTOR_ID }} \
            --baseline \
            --fail-on-regression
```

See `/docs/ci-cd` for GitLab CI, Jenkins, and Bitbucket Pipelines templates.

---

## TypeScript SDK

```bash
npm install @humanly/sdk
```

```typescript
import { HumanlyClient } from '@humanly/sdk';

const client = new HumanlyClient({
  apiKey: process.env.HUMANLY_API_KEY!,
  baseUrl: 'https://humanly.ai', // or your self-hosted URL
});

// Trigger a test run
const run = await client.triggerRun({
  suiteId: 'suite_abc123',
  connectorId: 'conn_xyz456',
});

// Poll until complete
const report = await client.waitForRun(run.id);
console.log(`Score: ${report.overallScore} | Status: ${report.status}`);

// Compare against baseline
if (report.baselineBreach) {
  console.error('Baseline breached — deployment blocked');
  process.exit(1);
}
```

Full SDK documentation: [humanly.ai/docs/sdk](https://humanly.ai/docs/sdk)

---

## AgentConnector Protocol

Humanly connects to any agent via HTTP. Your agent just needs to expose a single endpoint:

```
POST /your-agent-endpoint
Content-Type: application/json

{
  "message": "I need to cancel my policy",
  "conversationId": "conv_abc123",
  "history": [
    { "role": "user", "content": "..." },
    { "role": "assistant", "content": "..." }
  ]
}
```

Expected response:

```json
{
  "response": "I can help with that. Could you provide your policy number?",
  "llmTrace": { ... }  // optional — enables deep trace analysis
}
```

See [AgentConnector Spec](docs/agent-connector.md) for full schema including LLM trace format.

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│                  Humanly Platform                │
│                                                  │
│  React (Vite) ──► Express API ──► PostgreSQL     │
│                        │                         │
│              ┌─────────┴──────────┐              │
│              │   Evaluation Engine │              │
│              │  - Conversation runner             │
│              │  - Synthetic user LLM              │
│              │  - Check scoring                   │
│              │  - Verdict & report gen            │
│              └─────────┬──────────┘              │
│                        │ HTTP                     │
│              ┌─────────▼──────────┐              │
│              │  Your AI Agent      │              │
│              │  (via Connector)    │              │
│              └────────────────────┘              │
└─────────────────────────────────────────────────┘
```

**Stack:** Node.js + Express + TypeScript · React + Vite · Drizzle ORM · PostgreSQL · OpenAI

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Good first issues are labelled [`good first issue`](https://github.com/somnath-biswas-github/humanly/issues?q=label%3A%22good+first+issue%22).

---

## Roadmap

- [x] Custom evaluation check plugin API
- [x] Run streaming via SSE
- [ ] Python SDK (`pip install humanly`)
- [ ] Webhooks (run.completed, baseline.breached events)
- [ ] Bitbucket Pipelines + CircleCI templates
- [ ] Community check registry

---

## License

AGPL-3.0 — see [LICENSE](LICENSE).

The hosted platform at [humanly.ai](https://humanly.ai) (Humanly Studio) is proprietary. Self-hosting under AGPL is free.
