# Conversational RAG evidence and goal context — 15 November 2026

## Changes

- Preserve validated turn observations when evaluation stops before a RAG check.
- Distinguish unexercised turns from answers recorded without valid observations.
- Identify the interrupted evaluation stage without recording provider exception bodies.
- Supply configured conversational RAG references and recorded per-turn observations
  to the goal judge only. Simulator, router and tested-agent requests remain isolated.
- Clarify that uncertainty is appropriate when evidence is unavailable, not
  mandatory for supported answers.
- Refresh the public pilot documentation, including the separate RAGAS comparison.

Required goal and RAG checks remain independent. A passing RAG result does not
override a failing goal; a passing goal does not override incomplete RAG evidence.
Non-RAG goal prompts, score thresholds and historical results are unchanged.
Public scripted tests remain disabled.

## Verification

153 OSS tests passed, including evidence-preservation and goal-context regressions.
Type checks, internal documentation links and distribution-bundle consistency
passed. Dependencies were synchronised from the lockfile before rebuilding the
checked-in server bundle.

**The new goal-judge prompt has not yet been qualified with live judges.**
Earlier controlled live tests used the old goal input and exposed the discrepancy
that motivated this change; they do not validate this release's new prompt.
Offline tests establish data flow, isolation and gate behaviour, not semantic
accuracy. The original external tester run was unavailable for exact replay.

This update publishes Humanly OSS only. It does not publish Humanly Studio or a
new npm package.
