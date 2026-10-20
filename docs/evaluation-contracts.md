# Evaluation extension contracts (Phase 1)

**Execution update:** Phases 2–3 now accept an opt-in `executionPlan` inside an
existing conversation definition. See [advanced evaluation](advanced-evaluation.md).
Standalone contract envelopes still cannot be sent directly to legacy endpoints.
The contract-only matrix below records the original Phase 1 boundary; the advanced
guide is the current execution reference.

Humanly remains configured synthetic-user testing followed by analysis. Phase 1
adds **validation contracts, not new execution modes**. Existing version-1
conversation, workflow and RAG definitions remain the executable formats.
Never send extension contracts to those runners.

## Inspect and validate

From the OSS repository root:

```sh
npx tsx src/contract-cli.ts capabilities
npx tsx src/contract-cli.ts validate contract.json
```

Validation uses no database, provider or Studio account. Exit 0 means valid
schema, **not** agent success or executable support. Exit 2 means invalid input.
Unknown fields and unsupported versions are rejected without changing the input.

Example `contract.json`:

```json
{
  "contractVersion": 1,
  "kind": "scenario",
  "id": "refund",
  "start": "ask",
  "stages": [{
    "id": "ask",
    "user": {"mode": "synthetic", "instruction": "Ask for a refund."},
    "maxVisits": 2,
    "terminal": true,
    "transitions": [],
    "onNoMatch": "stop_inconclusive"
  }],
  "limits": {"maxTurns": 4, "maxModelCalls": 10, "maxTokens": 2000, "timeoutMs": 30000}
}
```

## Contract family

The source of truth is `src/evaluation-contracts.ts`, with exported TypeScript
types and dependency-free runtime validators.

| kind | Required information |
| --- | --- |
| scenario | ID, start stage, stages with scripted/synthetic user instructions, transitions with explicit rule/model routing, per-stage visit limits, terminal flags, unmatched-branch policy, execution limits |
| metric | ID and revision, description, explicit scale and direction, threshold, weight, required flag, evidence types, required exposure, inconclusive missing-evidence policy |
| metric-result | Metric ID/revision, status, score or null, exposure, reason and turn-linked evidence references |
| provider | Provider/model identity, structured-output, usage and cancellation capabilities, reported usage or null; no credential fields |
| report-summary | Run/product/runner identity, configuration version and snapshot reference, findings, provider records, status and consistent release gate |

Each uses `contractVersion: 1` and a distinct `kind`. Existing executable
definitions use `version: 1`; these namespaces are intentionally separate.
All fields are required unless the type explicitly says otherwise. Null means
unavailable, not zero. Evidence references identify supplied evidence; validation
does not independently authenticate its existence or truth.

`validateMetricPair` checks the exact metric revision, scale, threshold,
required exposure and evidence types. A required metric with weight zero is
still checked. No implicit score-scale conversion or weight normalization occurs.
Metric validation does not calculate a weighted aggregate.

Report summaries represent gate-participating findings: an empty report or a
report containing unresolved findings cannot pass. They do not replace existing
reports, recalculate historical scores, or implement cross-run comparison.
Callers must validate metric/result pairs against the actual configured
definitions before constructing a new summary.

Graph cycles are representable with mandatory finite visit and run limits.
Schema validation does not execute conditions, resolve ambiguous branches,
prove reachability or enforce runtime budgets. Those belong to Phase 2.
Token limits are not monetary caps; cancellation is not a guarantee that remote
processing or charging stopped.

## Current capability matrix

| Capability | OSS | Studio |
| --- | --- | --- |
| Scripted and synthetic conversations | Available | Available, separate managed runner |
| L1–L5 workflow evidence | Available | Available |
| Independent-question RAG | Available | Available |
| Scenario graphs | Contract-only | Contract-only |
| Metric/provider/report extension family | Contract-only | Contract-only |
| Conversational RAG | Planned | Planned |
| General framework evidence adapters | Planned | Planned |

The existing LangChain starter is not general framework-adapter parity.

## Compatibility and interchange

- Existing definitions and saved weights are not rewritten. Unknown legacy
  versions fail explicitly. Existing runner validation still applies.
- Studio records remain on their existing managed execution/billing path.
  Historical reports keep their original semantics; absent exposure is unknown.
- Workflow version-1 cases/evidence are interchangeable, but credentials,
  ownership, connector IDs and run IDs are not portable.
- Studio RAG export converts to an OSS suite with warnings and explicit
  threshold-scale handling. OSS suites cannot be imported as Studio case arrays.
- Conversational criteria/configuration conversion is manual. No automatic
  conversion, full report interchange or numerical score parity is promised.
- These contracts contain no provider keys. Keep references and rubric data
  separate from agent requests. New execution adapters must preserve that boundary.

## Verification boundary

`npm test` includes contract validation, legacy-input preservation, unsupported
version rejection and CLI tests. These are not live-model calibration,
certification of planned features or published-install verification.
Studio's Test Rig tracks the corresponding contract compatibility suite separately.
