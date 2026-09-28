# Humanly OSS CLI source

The repository includes the Humanly CLI source, but the CLI is not published to
npm in v0.1.

Build and run it from a checkout:

```bash
npm ci
npm run build

HUMANLY_BASE_URL=http://localhost:5000 \
HUMANLY_API_KEY="$HUMANLY_API_KEY" \
node dist/index.cjs run --suite "$SUITE_ID"
```

Commands:

- `run --suite <id>` — trigger a run, poll it, and write the report
- `report --run <id>` — download an existing report
- `list-agents`
- `list-connectors`
- `list-suites`
- `list-baselines`

`run` exits non-zero when `baselineBreach` is true.

## Licence

AGPL-3.0-or-later. See the repository [LICENSE](../../LICENSE).