# Branching, reusable metrics and conversational RAG

Use the existing conversation CLI/API with an optional `executionPlan`. Existing
definitions without a plan retain their original runner and scoring.

Generate a base definition using `npx tsx src/conversation-cli.ts example`.
Import `defaultExecutionPlan` and `metricCatalog` from `src/execution-plan.ts`
when constructing a plan programmatically, or use this shape:

```json
{
  "version": 1,
  "metrics": [],
  "ragCases": [],
  "limits": {"maxTurns": 8, "maxModelCalls": 30, "maxTokens": 20000, "timeoutMs": 30000},
  "graph": {
    "contractVersion": 1, "kind": "scenario", "id": "refund", "start": "ask",
    "limits": {"maxTurns": 8, "maxModelCalls": 30, "maxTokens": 20000, "timeoutMs": 30000},
    "stages": [{
      "id": "ask", "user": {"mode": "scripted", "instruction": "Can I get a refund?"},
      "maxVisits": 1, "terminal": true, "transitions": [], "onNoMatch": "stop_inconclusive"
    }]
  }
}
```

Place this under `executionPlan` in the version-1 conversation definition.
Graph definitions require synthetic mode, but individual stages can be scripted.
The plan limits govern advanced execution; graph limits must match them. Model
and token budgets apply across all conversations in this OSS run. They are stop
thresholds, not guaranteed cost caps. No transport retry is introduced.

## Branching

Transitions have `to`, `routing` and `condition`. Rule routing accepts `always`,
`contains:text` or `not_contains:text`, matching the current assistant response
case-insensitively. Model routing evaluates a natural-language condition using
conversation history. All matches are considered: ambiguous matches are
inconclusive, never an arbitrary first match. No match either repeats the stage
or stops inconclusively. Terminal stages end after their user/assistant pair.
Unreachable stages, dangling transitions and invalid limits are rejected.
Visit/model/token/turn limits block a passing gate when exhausted.

Reports record branch history. Replay regrades saved messages/evidence and
does not rerun the agent or simulate a new branch. Script export is a candidate
for manual review, not equivalent branch coverage. Graphs cannot create trusted
scripted L2 approval annotations.

## Reusable metrics

The versioned catalogue covers goal completion, completeness, knowledge retention,
turn relevance, policy adherence, claim support and tool arguments. Each uses the
metric contract with threshold, required flag, evidence and exposure policy.
Findings cite actual message/event IDs. Unknown or fabricated IDs are rejected.
Missing required evidence and insufficient exposure are inconclusive, not poor
agent behaviour. Optional metrics are reported but do not block the gate.
Required zero-weight metrics still gate. Metrics do not silently change the
legacy criterion-weighted score; their gate is separate.

## Conversational RAG

`ragCases` contains `{turn, case}` entries, where case uses the existing RAG case
contract: id, question, answerable, optional referenceAnswer, expectedFacts,
expectedChunkIds and prohibitedClaims. Each is an evaluator-only expectation for
that one-based turn. Reference data never reaches the agent. The current response's
actual `rag.retrievedChunks` and `rag.citations` supply evidence. Conversation
history informs follow-up/correction interpretation; earlier retrieval is not
invented as current evidence. Unreached turns remain inconclusive.

Per-turn reports reuse RAG groundedness, citation, answer-handling and reference
checks. A required RAG failure/inconclusive blocks the conversation gate.
References are authored per turn: authors must review whether adaptive dialogue
still exercises the intended question. This is not automatic reference generation.

## Studio

The Run Tests editor can apply/remove a plan and save it with the existing test
set. Metadata is disabled/zero-weight and does not alter saved criterion weights.
Plans use the existing authenticated run, persistence, reservation and settlement
path. Managed judging/routing uses gpt-4o-mini; no standalone OSS credential is used.
Additional provider and agent usage is accumulated in the existing ledger path.
Selected Studio criteria become versioned rubric metrics in this opt-in path
(80 threshold, required exposure); this is not identical legacy score semantics.
At most 30 combined selected/catalogue metrics are supported.

Module/prefix/custom synthetic-prompt overrides and webpage sessions are not
supported with advanced plans. Use the normal runner for those configurations.
Results expose the separate gate, branch history, exposure and per-turn RAG
findings. Existing legacy category fields are not advanced metric scores.
Save/import/edit does not execute a test. Live evaluations can incur usage.

## Verification limits

Tests use controlled models and endpoints, not paid calibration. Contract tests,
integration fixtures and browser tests do not establish judge accuracy, prompt
injection immunity, runtime telemetry authenticity or numerical parity.
