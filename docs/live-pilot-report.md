# Live evaluator pilot: Humanly OSS vs DeepEval

November 2026 · Humanly-authored pilot · DeepEval 4.3.3

This pilot compared expected verdicts, model requests, latency and estimated
model cost across Standard RAG, Conversational Workflow and Conversational RAG.
It compares the open-source evaluators, not Humanly Studio or commercial
Confident AI services.

**Disclosure:** Humanly ran the study and authored its fixtures, expected
outcomes and adapters. Labels have not been independently reviewed. These
results show a pattern in a small controlled pilot, not a statistically proven
ranking, independent certification or production-safety guarantee.

The [full report](https://humanly.ai/live-pilot-report) includes methodology,
run history, limitations and all 120 executions. The
[downloadable PDF](https://humanly.ai/reports/humanly-vs-deepeval-live-pilot.pdf)
also includes the test catalogue and reproducibility details.

## Expected verdicts

Each tool ran the same 60 test executions: 30 cases repeated twice.
An expected verdict can be pass, fail or inconclusive; a match is not
necessarily a passing agent.

| Suite | Humanly OSS | DeepEval |
| --- | ---: | ---: |
| Standard RAG | 36/36 | 34/36 |
| Conversational Workflow | 12/12 | 10/12 |
| Conversational RAG | 12/12 | 12/12 |
| **Total** | **60/60** | **56/60** |

Neither tool falsely passed a faulty agent. DeepEval's four misses were two
execution errors on an empty-answer case and two false failures on a healthy
refund-recovery conversation. Humanly had no false failures or execution errors
in these reported runs. One Standard RAG match was a fail-safe inconclusive
result after rejecting fabricated evidence, rather than the intended reasoning:
36 matches therefore comprise 35 for the intended reason and one fail-safe match.

## Model requests: 51% fewer overall, not in every suite

| Suite | Humanly OSS requests | DeepEval requests | Humanly relative to DeepEval |
| --- | ---: | ---: | --- |
| Standard RAG | 34 | 138 | 75% fewer |
| Conversational Workflow | 60 | 48 | 25% more |
| Conversational RAG | 96 | 204 | 53% fewer |
| **Total** | **190** | **390** | **51% fewer** |

Percentages are rounded and use DeepEval as the denominator. Request counts
cover the recorded pilot workload, including synthetic-user requests for
conversations; they are not a count of evaluator-only calls.

**Fewer requests does not mean lower cost or consistently faster execution.**
Request count and token usage are different measures. Humanly's per-claim
evidence diagnostics add output tokens. Estimated model cost was **$0.6170 for
Humanly vs $0.5452 for DeepEval**: Humanly cost about **13% more** overall.
Standard RAG median latency was 3.23s vs 4.49s; Workflow was 4.23s for both;
Conversational RAG was 15.64s vs 15.55s. These are observations from this pilot,
not general throughput, scale or cost guarantees.

## Method and version boundaries

- Both tools used GPT-4o (`gpt-4o-2024-08-06`), temperature 0, the same fixtures
  and unchanged thresholds. Native score scales are not treated as equivalent.
- Agents used controlled replies and state, not live production behaviour.
  Independent references were evaluator-only, not supplied to the agents.
- Cases ran serially with alternating tool order, deterministic shuffling and
  no caching. Errors and inconclusive results remain in the denominators.
- Adapter checks supplemented DeepEval where it lacked native equivalents,
  including evidence availability, citation identity and final-state checks.
- Standard RAG and Workflow results use Humanly revision `be2a86c`;
  Conversational RAG uses `8cd4ee3`. The latter was a dedicated rerun of both
  tools after a Humanly diagnostic-reference defect was fixed. The other two
  suites were not rerun on that revision.
- The full report retains earlier runs, including a Humanly regression that
  made every Conversational RAG result inconclusive. Do not present only the
  final results as evidence that earlier releases were equally reliable.

The pilot's **Conversational Workflow** category is a synthetic-user
conversation test with final-state checks. It does not imply that the separate
standalone scripted workflow runner is enabled; see
[current feature availability](feature-availability.md).

## Applying these findings

Requalify your evaluator on representative, independently reviewed fixtures
after model, prompt, schema or version changes. Keep held-out expectations
separate from tuning data. Do not infer superiority on other domains, lower
production costs or equivalent scores across different metrics.

The [earlier independent benchmark handoff](../releases/benchmark-candidate.md)
is a historical plan for a separate independently reviewed exercise. This
Humanly-run pilot does not satisfy that independent-validation requirement.

For evidence interpretation and regression comparison, see
[Conversational RAG diagnostics](conversational-rag-diagnostics.md).

## Separate corrected RAGAS pilot

The report page now has DeepEval as its first/default tab and a separate
[RAGAS tab](https://humanly.ai/live-pilot-report?report=ragas), with a
[RAGAS PDF](https://humanly.ai/reports/humanly-vs-ragas-corrected-live-pilot.pdf).
The homepage links directly to the RAGAS tab. This does not change the DeepEval
results or enable additional product features.

The RAGAS pilot used 36 distinct held-out cases, 12 per journey, repeated three
times per framework: 216 main evaluations plus 24 calibration evaluations.
Both used gpt-4o-2024-08-06; RAGAS was version 0.4.3. Labels are provisional
and author-written, not independently validated.

Workflow native agreement and primary per-turn Conversational RAG agreement were
36/36 for each framework. Standard RAG agreement was Humanly native 35/36,
RAGAS native 30/36, or RAGAS 33/36 with harness-added citation checks. Different
native citation coverage and remaining refusal-reference sensitivity prevent a
clean semantic accuracy ranking. Humanly had one invalid-judge inconclusive.
RAGAS's separate conversation-goal metric added four failures outside the primary
per-turn results.

The corrected experiment used $4.2645375 in additional model usage including
calibration. These are live judge calls against controlled frozen evidence, not
fresh production-agent conversations. Keep this pilot's counts, thresholds and
costs separate from DeepEval, and treat repeats as stability tests rather than
independent samples.
