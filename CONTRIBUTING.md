# Contributing to Humanly

Thanks for your interest in contributing. This guide will get you set up quickly.

---

## Project Structure

```
humanly/
├── client/          # React frontend (Vite + TypeScript)
├── server/          # Express backend (TypeScript ESM)
├── shared/          # Shared types and Drizzle schema
├── packages/
│   └── sdk/         # @humanly/sdk TypeScript SDK
├── python_agents/   # Demo Python agents (FastAPI)
├── docker-compose.yml
└── Dockerfile
```

---

## Local Development Setup

### Prerequisites

- Node.js 20+
- PostgreSQL 15+ (or Docker)
- OpenAI API key

### Steps

```bash
# 1. Clone and install
git clone https://github.com/somnath-biswas-github/humanly.git
cd humanly
npm install

# 2. Set up environment
cp .env.example .env
# Edit .env — set DATABASE_URL, OPENAI_API_KEY, SESSION_SECRET

# 3. Start development server
npm run dev
```

The dev server starts on port 5000. The frontend and backend are served together.

### Using Docker for local dev

```bash
cp .env.example .env
docker compose up postgres -d   # start just the database
npm run dev                      # run app locally against Docker postgres
```

---

## Making Changes

### Backend

- Routes live in `server/routes.ts`
- Storage interface in `server/storage.ts`
- Database schema in `shared/schema.ts`
- After changing the schema, run: `npm run db:push`

### Frontend

- Pages in `client/src/pages/`
- Shared components in `client/src/components/`
- Register new pages in `client/src/App.tsx`

### SDK

- Source in `packages/sdk/src/`
- Run `npm run build` inside `packages/sdk/` before testing

---

## Pull Request Guidelines

- **One feature or fix per PR** — keep PRs small and focused
- **Branch naming:** `feat/description`, `fix/description`, `docs/description`
- **Tests:** add tests for new evaluation logic if applicable
- **Commit style:** use [Conventional Commits](https://www.conventionalcommits.org/)
  - `feat: add webhook delivery dashboard`
  - `fix: handle empty LLM trace gracefully`
  - `docs: update AgentConnector spec`
- **Fill in the PR template** — link to any relevant issue

---

## Reporting Issues

Use the issue templates:
- **Bug report** — unexpected behaviour, errors, crashes
- **Feature request** — new functionality or improvements

---

## Code Style

- TypeScript strict mode throughout
- ESLint + Prettier (run `npm run lint`)
- No `any` types without a comment explaining why

---

## Questions?

Open a [Discussion](https://github.com/somnath-biswas-github/humanly/discussions) for questions about architecture, integration patterns, or anything else.
