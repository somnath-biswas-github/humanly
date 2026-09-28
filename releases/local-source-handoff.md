# OSS source handoff

This source handoff contains the standalone OSS application approved for the
public repository. It is not an npm publication or a hosted deployment.
Archive contents are the OSS repository root, **not** the parent development workspace.

## Extract and verify

With Node.js 20+ and npm installed:

```sh
mkdir humanly-oss
tar -xzf humanly-oss-source.tar.gz -C humanly-oss
cd humanly-oss
npm ci
npm run verify
```

`npm run verify` runs the server tests (including the scripted L1–L5 workflow
suite and connector tests), TypeScript check, server bundle, and internal
documentation-link checks. In a fresh temporary extraction of this handoff,
`npm ci` and `npm run verify` passed: 29/29 tests, TypeScript check, server
bundle, and documentation-link checks. The rebuilt server bundle matched the
checked-in bundle byte-for-byte. Run the SDK and CLI checks separately if needed:

```sh
npm --prefix packages/sdk ci
npm --prefix packages/sdk run build
npm --prefix packages/sdk run lint
npm --prefix packages/cli ci
npm --prefix packages/cli run build
```

To run a no-provider workflow example without a server or database:

```sh
npm run workflow -- example fixed
npm run workflow -- example faulty
```

For self-hosting, see [quick start](../docs/quickstart.mdx). Docker Engine and
Compose v2 plus PostgreSQL are required for the container/API integration path.
Copy `.env.example` to `.env` **only on your machine**, set a fresh
`HUMANLY_API_KEY` and database password, then run `docker compose up --build`
from this root. Never return your `.env` or runtime outputs with feedback.
Docker/integration checks were not run as part of this local archive handoff.

## Boundaries

This OSS beta includes the source, migrations and the checked-in Docker server
bundle. Its one-turn suite checks are deterministic; authored, instrumented
L1–L5 scripted multi-turn workflows are available separately. It does **not**
include the proprietary Studio UI, Studio accounts or customer data, LLM-generated
synthetic users, Studio's broader evaluation catalog or RAG semantic evaluation.
Workflow results depend on trusted runtime evidence and authored expectations,
not automatic verification of arbitrary agents. See the
[workflow evaluation guide](../docs/workflow-evaluation.md) for limitations.

No public release has been made by preparing this file.