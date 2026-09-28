# @humanlyai/sdk

TypeScript client for Humanly OSS and the compatible Humanly hosted API.

`@humanlyai/sdk` is the canonical package name. This directory contains the
unpublished OSS-compatible `0.1.1-oss.0` prerelease. The npm-published `0.1.0`
targets the hosted API and does not expose the same creation methods.

```bash
npm ci
npm run build
npm pack
npm install ./humanlyai-sdk-0.1.1-oss.0.tgz
```

```ts
import { HumanlyClient } from "@humanlyai/sdk";

const client = new HumanlyClient({
  apiKey: process.env.HUMANLY_API_KEY!,
  baseUrl: "http://localhost:5000",
});

const agent = await client.createAgent({ name: "Support agent" });
const connector = await client.createConnector({
  name: "Local connector",
  agentId: agent.id,
  endpointUrl: "http://host.docker.internal:3001",
});
const suite = await client.createSuite({
  name: "Greeting test",
  agentId: agent.id,
  connectorId: connector.id,
  testGoal: "Greet the customer.",
});
const run = await client.triggerRun({ suiteId: suite.id });
const report = await client.waitForRun(run.id);
```

## Build from source

```bash
npm ci
npm run build
npm run lint
```

The package ships ESM, CommonJS, and TypeScript declarations.

## Licence

AGPL-3.0-or-later. See the repository [LICENSE](../../LICENSE).