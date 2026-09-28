# Contributing to Humanly OSS

Thank you for helping improve Humanly OSS.

Please read the [Code of Conduct](CODE_OF_CONDUCT.md). Report vulnerabilities
privately according to [SECURITY.md](SECURITY.md).

## Repository structure

```text
humanly/
├── src/                  # Express API, evaluator, and database code
├── migrations/           # Ordered PostgreSQL migrations
├── packages/
│   ├── sdk/              # @humanlyai/sdk TypeScript SDK
│   ├── cli/              # Source-only CLI package
│   └── python-sdk/       # Source-only Python client
├── scripts/              # Demo, link checks, and smoke tests
├── docs/                 # Product and self-hosting documentation
├── docker-compose.yml
└── Dockerfile
```

Humanly Studio is proprietary and is not part of this repository. Contributions
must not copy Studio-only source, credentials, customer data, or generated
workspace files into OSS.

## Development setup

Requirements:

- Node.js 20+
- PostgreSQL 16, or Docker Compose v2

```bash
git clone https://github.com/somnath-biswas-github/humanly.git
cd humanly
npm ci
cp .env.example .env
```

For local TypeScript development, set `DATABASE_URL` and
`HUMANLY_API_KEY`, then:

```bash
npm run migrate
npm run dev
```

For Docker:

```bash
docker compose up --build
```

## Required checks

Run before opening a pull request:

```bash
npm ci
npm run verify

npm --prefix packages/sdk ci
npm --prefix packages/sdk run build
npm --prefix packages/sdk run lint

npm --prefix packages/cli ci
npm --prefix packages/cli run build
```

`npm run verify` performs the server typecheck, evaluator tests, release bundle,
and internal documentation-link check. The self-hosted GitHub Actions workflow
also performs a clean Docker build, waits for `/health`, verifies migrations,
and exercises the API and packaged clients.

## Database changes

Add an ordered SQL file under `migrations/`. Migrations must be idempotent at
the release level and must not depend on interactive tools. Test both a new
database and an upgrade from the prior release.

## Pull requests

- Keep each pull request focused.
- Add or update tests for behavioural changes.
- Update documentation for public API or deployment changes.
- Use conventional commit-style titles where practical.
- Complete the pull-request template.
- Never commit `.env`, API keys, customer data, or generated demo output.

The [roadmap](docs/ROADMAP.md) includes issue-ready contribution candidates.