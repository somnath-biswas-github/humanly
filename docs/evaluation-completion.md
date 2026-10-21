# Evaluation extension usage

See [advanced evaluation](advanced-evaluation.md) for plan structure. Existing
definitions without executionPlan keep the legacy runner.

## Runtime adapters

Studio supports reviewed candidate snapshots in advanced plans, including persona,
scenario, criteria and gate threshold. Historical Studio RAG common summaries retain
recorded outcomes, warn about missing evaluator revisions, and never rescore history.
Comparisons include status, exposure and finding changes without forcing score parity.

Install the local Python SDK source and the exact framework versions under test:
langchain-core 1.6.12, langgraph 1.2.16, openai-agents 0.24.0.
Do not assume the published `humanly` package contains these unreleased modules.

```python
from humanly.evidence import EvidenceRecorder
from humanly.langchain_evidence import HumanlyCallbackHandler

recorder = EvidenceRecorder("conversation-123")
recorder.begin_turn(1)
callback = HumanlyCallbackHandler(
    recorder, lambda tool_name, arguments: arguments["account"]
)
# actual_tool.invoke({"account": "fixture"}, config={"callbacks": [callback]})
# Only after all execution/streaming finishes:
recorder.finish_turn()
response_workflow = recorder.snapshot(turn_only=True)
```

The commented tool invocation must be replaced by your real local tool, not
invented evidence. For OpenAI Agents wrap actual FunctionTools using
`instrument_function_tool(tool, recorder, binding)`. Configure tools with
`failure_error_function=None`. Explicit approval/state hooks belong to the
trusted host application. No generated assertion can establish user consent.
Hosted tools are unsupported. Keep one recorder per session, ordered across turns.
See `scripts/test-framework-adapters.py` for credential-free real framework runs,
failures, retries and streamed completion.

## Provider selection

`executionPlan.provider` accepts `openai` or `anthropic`.
Use `CONVERSATION_MODEL_API_KEY` and optionally `CONVERSATION_MODEL`.
Default models are gpt-4o-mini and claude-haiku-4-5-20251001 respectively.
Anthropic uses constrained tool output, not a claim that every model supports JSON.
Provider capability records declare structured output, usage and best-effort
cancellation. Model output and usage are validated. No paid calibration is implied.

## Local metric extension

Export a `metrics` object from an explicitly trusted local module; each key is
a configured metric ID and each async function receives the metric, scenario,
messages and observed evidence. Return score, applicable, exposure, reason,
and evidenceIds. Evidence identifiers and scale are validated by the runner.

Set `HUMANLY_LOCAL_METRICS=/absolute/path/to/reviewed-module.mjs` for the conversation
CLI. The path is never read from a test JSON or accepted through an HTTP upload.
This is arbitrary trusted local code, not a sandbox. Exceptions become
inconclusive through the existing runner; remote side effects of plugins are
the operator's responsibility.

## Draft, inspect and compare

```sh
npx tsx src/conversation-cli.ts generate requirements.txt > candidate.json
# Edit and human-review the candidate, then explicitly approve:
npx tsx src/conversation-cli.ts approve candidate.json > definition.json
npx tsx src/conversation-cli.ts inspect conversation-report.json
npx tsx src/conversation-cli.ts diagnostic conversation-report.json
npx tsx src/conversation-cli.ts compare baseline.json conversation-report.json
npx tsx src/report-cli.ts inspect workflow-report.json
npx tsx src/report-cli.ts compare rag-baseline.json rag-report.json
```

Generation is local template drafting, not AI synthesis or verified truth.
Approval does not run a test. Use the normal run command separately.
Compare exit 2 means incompatible configurations; exit 0 means comparable,
not necessarily passing. The original report gate remains authoritative.
Diagnostic export omits free-text and raw evidence, unlike inspect/raw reports.

## Boundaries

Studio accepts only declarative metrics and supported managed providers.
It retains its authenticated billing path, not user-installed plugins.
Per-turn evidence is supplied by instrumentation, not independently attested.
Default field redaction does not discover free-text PII; configure it carefully.
Report envelopes support conversation, workflow bundles and OSS RAG reports;
native legacy Studio RAG reports retain their own existing inspection view.
Unified cross-runner score semantics, live-model calibration and independent
held-out benchmarking are not implied by these source-level features.
