# humanly · Python SDK (experimental)

**Self-hosted API client source for Humanly OSS.**

> The Python SDK source is experimental and is **not published** as part of
> the first Humanly OSS release. Use the REST API, TypeScript SDK, or CLI for
> supported installation paths.

---

## Quickstart

```python
from humanly import HumanlyClient

client = HumanlyClient(api_key="hmnly_...")

# Trigger a test run
run = client.trigger_run(suite_id="suite_abc123", label="v2.1.0")

# Wait for it to complete and get the report
report = client.wait_for_run(run.id)

print(f"Score: {report.overall_score:.0%}")
print(f"Pass rate: {report.pass_rate:.0%}")

# Fail CI if a baseline is breached
if report.baseline_breach:
    raise SystemExit(1)
```

## Async support

```python
import asyncio
from humanly import AsyncHumanlyClient

async def main():
    async with AsyncHumanlyClient(api_key="hmnly_...") as client:
        run = await client.trigger_run(suite_id="suite_abc123")
        report = await client.wait_for_run(run.id)
        print(f"Score: {report.overall_score:.0%}")

asyncio.run(main())
```

## CI/CD integration

```python
# ci_test.py — drop into any pipeline
import os, sys
from humanly import HumanlyClient, HumanlyError

client = HumanlyClient(api_key=os.environ["HUMANLY_API_KEY"])

run = client.trigger_run(
    suite_id=os.environ["HUMANLY_SUITE_ID"],
    label=os.environ.get("GITHUB_SHA", "ci"),
)

print(f"Run started: {run.id}")
report = client.wait_for_run(run.id)

print(f"Score:     {report.overall_score:.0%}")
print(f"Pass rate: {report.pass_rate:.0%}")
print(f"Baseline breach: {report.baseline_breach}")

if report.baseline_breach:
    print("❌ Quality regression detected — blocking deployment")
    sys.exit(1)

print("✓ All checks passed")
```

## LangChain example

```python
from humanly import HumanlyClient

# 1. Register your LangChain agent as a connector in Humanly Studio
# 2. Run synthetic user tests in CI before every deploy

client = HumanlyClient(api_key="hmnly_...")
run = client.trigger_run(
    suite_id="langchain-banking-suite",
    label="main@abc1234",
)
report = client.wait_for_run(run.id)

for conv in report.conversations:
    if not conv.passed:
        print(f"Failed: {conv.persona_name} — score {conv.overall_score:.0%}")
        for check in conv.check_scores:
            if not check.passed:
                print(f"  ✗ {check.check_name}: {check.explanation}")
```

## Full API reference

### `HumanlyClient(api_key, base_url?, timeout?)`

| Method | Description |
|--------|-------------|
| `list_agents()` | List all agents |
| `list_personas()` | List all test personas |
| `list_connectors()` | List all AgentConnectors |
| `list_suites()` | List all test suites |
| `trigger_run(suite_id, connector_id?, baseline_id?, label?)` | Start a test run |
| `get_run(run_id)` | Get run status |
| `list_runs()` | List all runs |
| `get_report(run_id)` | Get evaluation report |
| `wait_for_run(run_id, poll_interval?, timeout?)` | Poll until complete, return report |
| `create_baseline(run_id, name, threshold?)` | Register a quality baseline |
| `get_baseline(baseline_id)` | Get a baseline |
| `list_baselines()` | List all baselines |

`AsyncHumanlyClient` exposes the same interface with `async/await`.

## Self-hosting

Run Humanly on your own infrastructure:

```bash
git clone https://github.com/somnath-biswas-github/humanly
cd humanly
cp .env.example .env   # set HUMANLY_API_KEY
docker compose up
```

Then point the SDK at your instance:

```python
client = HumanlyClient(
    api_key="hmnly_...",
    base_url="https://your-humanly-instance.com",
)
```

## Links

- [Humanly Studio](https://humanly.ai) — hosted visual platform
- [Documentation](../../docs/quickstart.mdx)
- [GitHub](https://github.com/somnath-biswas-github/humanly)
- [TypeScript SDK source](../sdk)
