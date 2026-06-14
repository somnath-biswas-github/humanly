# @humanly/sdk

TypeScript SDK for the [Humanly](https://humanly.ai) AI agent testing platform.

[![npm](https://img.shields.io/npm/v/@humanly/sdk)](https://www.npmjs.com/package/@humanly/sdk)
[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)

---

## Install

```bash
npm install @humanly/sdk
```

---

## Quick Start

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
  label: process.env.GITHUB_SHA, // tag with git commit
});

// Wait for completion and get the report
const report = await client.waitForRun(run.id);

console.log(`Score: ${report.overallScore}`);
console.log(`Pass rate: ${report.passRate * 100}%`);

// Fail CI if a baseline was breached
if (report.baselineBreach) {
  console.error(`Regression detected: score dropped ${report.baselineDelta}`);
  process.exit(1);
}
```

---

## API Reference

### `new HumanlyClient(options)`

| Option | Type | Required | Default |
|---|---|---|---|
| `apiKey` | `string` | Yes | — |
| `baseUrl` | `string` | No | `https://humanly.ai` |
| `timeout` | `number` (ms) | No | `30000` |

---

### Runs

#### `client.triggerRun(options)` → `Promise<Run>`

Trigger a new test run.

```typescript
const run = await client.triggerRun({
  suiteId: 'suite_abc123',
  connectorId: 'conn_xyz456',
  baselineId: 'baseline_v1', // optional: check for regressions
  label: 'main@abc1234',     // optional: tag with git info
});
```

#### `client.getRun(runId)` → `Promise<Run>`

Get the current status of a run.

#### `client.listRuns()` → `Promise<Run[]>`

List all runs in your workspace.

#### `client.getReport(runId)` → `Promise<Report>`

Get the full evaluation report for a completed run.

#### `client.waitForRun(runId, pollIntervalMs?, timeoutMs?)` → `Promise<Report>`

Poll until a run completes and return the report. Throws on failure or timeout.

---

### Baselines

#### `client.createBaseline(options)` → `Promise<Baseline>`

Register a run as a quality baseline.

```typescript
const baseline = await client.createBaseline({
  runId: run.id,
  name: 'Production baseline v1.2',
  threshold: 0.05, // allow up to 5% score regression
});
```

#### `client.getBaseline(baselineId)` → `Promise<Baseline>`

Get a specific baseline.

#### `client.listBaselines()` → `Promise<Baseline[]>`

List all baselines.

---

### Resources

#### `client.listAgents()` → `Promise<Agent[]>`
#### `client.listPersonas()` → `Promise<Persona[]>`
#### `client.listConnectors()` → `Promise<Connector[]>`
#### `client.listSuites()` → `Promise<Suite[]>`

---

## CI/CD Example

### GitHub Actions

```yaml
- name: Test agent quality
  env:
    HUMANLY_API_KEY: ${{ secrets.HUMANLY_API_KEY }}
  run: |
    node -e "
    const { HumanlyClient } = require('@humanly/sdk');
    const client = new HumanlyClient({ apiKey: process.env.HUMANLY_API_KEY });
    client.triggerRun({ suiteId: '$SUITE_ID', connectorId: '$CONNECTOR_ID' })
      .then(run => client.waitForRun(run.id))
      .then(report => {
        if (report.baselineBreach) process.exit(1);
      });
    "
```

---

## Error Handling

The SDK throws `HumanlyError` on API errors and request failures. 429 rate-limit responses are retried automatically with the `Retry-After` header.

```typescript
import { HumanlyClient } from '@humanly/sdk';

try {
  const report = await client.waitForRun(run.id);
} catch (err) {
  if (err instanceof Error && err.name === 'HumanlyError') {
    console.error(`API error ${(err as any).status}: ${err.message}`);
  }
}
```

---

## License

AGPL-3.0 — see [LICENSE](../../LICENSE)
