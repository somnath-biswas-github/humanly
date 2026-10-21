# Independent benchmark handoff — candidate, not qualified release

## Version freeze

- Humanly: use the immutable public commit and artifact SHA recorded by the
  release qualifier **after** the changes in this candidate are published.
  No current public revision is asserted to contain these additions.
- DeepEval comparison target: **4.3.1**, selected from its published package
  metadata on 2026-10-20; not installed or execution-verified here.
- Framework fixture versions: langchain-core **1.6.12**, langgraph **1.2.16**,
  openai-agents **0.24.0**. Broader version ranges are not certified.

Do not start the independent comparison until Humanly's public revision is
pinned and the tester confirms DeepEval installation and supported interfaces.

## Installation and local controls

Follow the repository README for clean Humanly installation, then run
`npm run verify` and the documented conversation/workflow/RAG CLI examples.
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
| Immutable product revisions / artifact hashes | pending freeze |
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

Clean installation from the final public revision; container startup/readiness;
published authenticated Studio journeys; complete conversational billing
isolation/failure-path verification; human-reviewed held-out expected outcomes;
independent comparative execution and signed-off findings.

This package prepares the handoff. It does not claim those gates have passed.
