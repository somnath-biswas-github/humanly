# Independent benchmark handoff — pinned OSS baseline, benchmark pending

## Version freeze

- Humanly OSS: **be05a8bd6364a67d635341fa845632368ee69fe1**.
  [Immutable public revision](https://github.com/somnath-biswas-github/humanly/tree/be05a8bd6364a67d635341fa845632368ee69fe1).
- Shipped `dist/server.cjs` SHA-256:
  `57135064b3f4799964add67647fd0cee3b24d7b703fc5d1dd7a95b42efd67552`.
  Git blob SHA-1: `248016ae1bee93ea1111a7044999ddb7428b335f`.
- DeepEval comparison target: **4.3.1**, selected from its published package
  metadata on 2026-10-20; not installed or execution-verified here.
- Framework fixture versions: langchain-core **1.6.12**, langgraph **1.2.16**,
  openai-agents **0.24.0**. Broader version ranges are not certified.

Humanly's OSS baseline is pinned. The tester must still confirm DeepEval
installation/interfaces, approve held-out expected outcomes and obtain a live
budget before starting the independent comparison.

## Recorded OSS qualification evidence

Both workflows completed successfully for the exact pinned revision on
2026-10-21:

- [CI: tests, bundle consistency, builds, documentation and SDK packaging](https://github.com/somnath-biswas-github/humanly/actions/runs/39651949785).
- [Self-hosted smoke test: Python 3.10 and 3.12](https://github.com/somnath-biswas-github/humanly/actions/runs/39651949820).
  Both matrix jobs passed cacheless Docker startup, health/readiness, migrations,
  HTTP API, installed TypeScript/Python SDK and CLI checks, and resource cleanup.

This is deterministic/local-integration qualification, not held-out semantic
calibration, Studio production/billing certification or independent signoff.

## Installation and local controls

Follow the repository README for clean Humanly installation, then run
`npm run verify` and the documented conversation/workflow/RAG CLI examples.
Use the pinned revision, not a moving `main` branch:

```sh
git clone https://github.com/somnath-biswas-github/humanly.git
cd humanly
git checkout --detach be05a8bd6364a67d635341fa845632368ee69fe1
npm ci
npm run verify
sha256sum dist/server.cjs
```

The hash must equal the shipped-bundle SHA-256 above.
Run `python scripts/test-framework-adapters.py` with the pinned local framework
packages. Those tests use a deterministic model and actual local tools.
The public controlled workflow examples are development controls, **not**
held-out benchmark data.

Keep a separate private benchmark directory outside the development fixture
tree. The independent tester authors/reviews expected outcomes before executing.
Record a case identifier, input, expected behaviour, permitted tool/state
transitions, reference provenance, required exposure, reviewer and approval date.
No generated candidate or developer fixture is automatically approved truth.

## Configuration equivalence

Use identical controlled agent endpoints, visible conversation context and source
documents where possible. Keep golden reference data evaluator-only. Record all
provider/model revisions, temperature, budget and metric thresholds.
Document differences in branching, reference applicability, evidence availability,
score scales and gates; do not force numerical parity or adjust thresholds after
seeing outcomes. Trusted approvals must originate from the host test setup.

## Budget and consent

Default live budget is **zero** and live execution is disabled.
Before live tests, record an approved provider/currency budget, maximum cases,
maximum repetitions, timeout, cancellation limitations and a named operator.
No automatic retry or live-test execution is part of this handoff.

## Reporting template

For each run record:

| Field | Value |
|---|---|
| Immutable product revisions / artifact hashes | Humanly revision and bundle pinned above; DeepEval execution validation pending |
| Code/configuration version and run time | |
| Fixture / local integration / held-out live | |
| Human reviewer and expected-outcome approval | |
| Setup minutes and custom instrumentation | |
| True defects detected / missed | |
| False positives and denominator | |
| Inconclusive count and reasons | |
| Required behaviour exposure | |
| Explanation quality and cited evidence | |
| Runtime, reported usage and unknown usage | |
| Configuration differences and limitations | |

## Release gates still requiring independent evidence

DeepEval installation/interface verification; equivalent benchmark adapters and
configuration freeze; human-reviewed held-out expected outcomes; explicit live
budget; independent comparative execution and signed-off findings.

If Studio is included in the comparison, qualify its published authenticated
journeys and complete conversational billing isolation/failure paths separately.
The OSS workflow results do not establish those Studio properties.

Next prepare the executable comparison setup and case manifest. Record expected
behaviour, evidence availability and required exposure before running either
evaluator. Reviewers must approve expected outcomes independently of generated
drafts or development fixtures. Do not report the benchmark as complete until
the independent reviewer has executed and signed off the held-out results.
