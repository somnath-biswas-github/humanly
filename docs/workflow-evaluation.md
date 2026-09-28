# Workflow evaluation (L1–L5)

Studio's **Workflow Evaluation** page and OSS's workflow API/CLI use the same
framework-neutral deterministic evaluator. It is packaged inside OSS, with no
imports from Studio. Existing single-turn evaluations remain unchanged.

## Scope and results

* **L1** compares observed action bindings against explicit allowed/forbidden
  bindings derived by the test author from policy and initial fixtures. It does
  not automatically interpret natural-language policies or prescribe graph nodes.
* **L2** checks protected actions against earlier approvals for the exact action,
  target and material parameters. The approval must match a trusted scripted
  user-turn annotation. Revocation invalidates it. A subsequent state change of
  `target`, `action`, or `params` invalidates the earlier approval. Its lifetime
  starts at the original approval event in the annotated user turn; re-emitting
  old approval later cannot revive it. Use a new approval ID for fresh consent.
* **L3** compares end-of-turn state snapshots against authored checkpoints and
  checks actual tool targets against the latest expected target. Each configured
  target interval must contain an action, otherwise that assertion is
  inconclusive. Use an empty targets array for an intentional state-only test.
* **L4** compares structured reported outcomes against correlated tool results.
  A successful retry before a success claim is allowed. With `requireClaim:true`,
  every action must have a terminal outcome and a subsequent claim covering its
  operation (one claim can cover multiple retries). A claim before a later retry
  does not cover that retry. Timeouts/unknown outcomes
  are not definite failures. Unresolved evidence is inconclusive.
* **L5** checks progress, completion conditions, allowed pauses and budgets.
  Every state/progress snapshot is inspected using explicitly configured
  meaningful `progressFields`; arbitrary other counters/timestamps do not count.
  New projected states count as progress; cycling through already-seen states
  does not. Repeated execution with genuinely new meaningful state is productive.
  This is NOT an exactly-once or duplicate-backend-effect test.

Results are `pass`, `fail`, or `inconclusive`. Missing, malformed, incomplete,
unsequenced, or uncorrelated evidence must not pass. An inconclusive check blocks
the overall quality gate, even if no definite fault was found. A failing check
makes the overall report fail. Each finding includes event sequence references.
Positive L1/L2 checks with no relevant actions are inconclusive, not passing.
For a deliberate negative test, set `L1.expectNoAction:true` (allowed can then be
empty) or `L2.expectNoProtectedAction:true`; any prohibited action then fails.
L1 positive tests need nonempty allowed bindings; `requireAction:false` is
rejected unless this explicit negative mode is selected. L3 checkpoints need
nonempty expected values. L5 completion and progressFields must be nonempty.

This suite requires instrumentation and authored expectations; it is not
automatic verification of arbitrary agents. Evidence is trusted runtime
telemetry, not cryptographically attested truth. Instrument the actual execution
layer rather than asking an LLM to fabricate traces. Missing events falsely
labelled complete can conceal defects; independently audit instrumentation.

## Quick start — no paid providers

From the repository root (the `oss-scaffold` directory only in the development
monorepo; an extracted source archive is already the repository root):

```sh
# Invoke tsx directly when redirecting machine-readable JSON (no npm banner):
npx tsx src/workflow-cli.ts example fixed > fixed.json
npx tsx src/workflow-cli.ts example faulty > faulty.json
npm run workflow -- evaluate fixed.json
npm run workflow -- evaluate faulty.json
# workflow-report.json contains the full result. Exit codes: 0 pass, 1 fail,
# 2 inconclusive / invalid configuration / operational error.

# In a separate terminal:
npm run workflow:fixture
# Extract evaluator configuration (never send checks to the agent):
node -e "const fs=require('fs');fs.writeFileSync('case.json',JSON.stringify(JSON.parse(fs.readFileSync('fixed.json')).case))"
HUMANLY_ALLOW_PRIVATE_CONNECTORS=true npm run workflow -- run case.json http://127.0.0.1:8099/fixed/v1/chat fixed-report.json
HUMANLY_ALLOW_PRIVATE_CONNECTORS=true npm run workflow -- run case.json http://127.0.0.1:8099/faulty/v1/chat faulty-report.json
```

The two local endpoints intentionally simulate the faulty/fixed behaviour. The
fixture has no real customers/payments and is explicitly not a production agent.
Private connectors should only be enabled in a trusted local environment.
For remote authenticated connectors, CLI reads `WORKFLOW_AGENT_TOKEN` as bearer
auth. Never put credentials in case files or evidence. CLI requests have a 30s
timeout, response size limits, DNS-pinned target validation and no transport retry.

## Studio

Open `/workflow-evaluation` from the sidebar. Load the faulty example or fixed
control, edit the case/evidence JSON, and run. Results persist under your account.
Expand evidence/transcript and export the full JSON report. For live execution,
select an owned agent and one of its active saved connectors.
Existing connector credentials and timeouts are used; retry count is overridden
to zero to avoid replaying side effects.

Studio endpoints (authenticated session):

* `GET /api/workflow/examples`
* `POST /api/workflow/runs`: `{ "case": {...}, "evidence": {...} }` OR
  `{ "case": {...}, "agentId": "...", "connectorId": "..." }`
* `GET /api/workflow/runs`: latest 50 runs belonging to the authenticated user.

Runs store case, transcript, evidence and report in existing JSON columns.
There is no schema migration. The configuration from a saved run can be loaded
and rerun. Uploaded evidence is labelled as uploaded, not independently captured.

## OSS API and quality gates

Use your existing Humanly API key and scopes:

* `GET /v1/workflow/examples` (`suites:read`)
* `POST /v1/workflow/runs` (`runs:write`): same case/evidence format as Studio,
  or `{ "case": {...}, "connectorId": "..." }` for scripted execution.
* `GET /v1/runs/:id/report` (`reports:read`): persisted full output.

Workflow POST runs synchronously and returns a saved `runId`, `report` and
`qualityGate`. Check `qualityGate.passed`, not merely HTTP 201 or run completion.
Both inconclusive and failed evaluations block the gate. Existing numeric run
summary score is 1 only for a complete pass, otherwise 0. Workflow assertions do
not use the existing baseline delta semantics; use their explicit gate.
With long scenarios, allow a client timeout sufficient for all scripted turns.
Each run uses a fresh session ID. Fixtures and external storage must be reset
independently before reruns; Humanly does not erase external data.

## Version 1 case contract

```json
{
  "version": 1,
  "name": "Refund B",
  "turns": [
    {"message": "Use order A."},
    {"message": "Switch to B. I confirm refunding £20.", "approval": {
      "id": "approval-1", "binding": {"action":"refund","target":"B","params":{"amount":20}}
    }}
  ],
  "checks": {
    "L1": {"allowed":[{"action":"refund","target":"B","params":{"amount":20}}], "requireAction":true},
    "L2": {"actions":["refund"]},
    "L3": {"checkpoints":[{"turn":2,"values":{"target":"B"}}], "targets":[{"fromTurn":2,"target":"B"}]},
    "L4": {"requireClaim":true},
    "L5": {"maxSteps":20,"maxTurnsWithoutProgress":2,"allowedWaitReasons":["approval"],"completion":{"done":true},"progressFields":["target","done"]}
  }
}
```

Omit inapplicable checks. At least one is required. Up to 50 scripted turns.
L1 optional `forbidden` uses the same binding structure; exact JSON equality
ignores object-key order but preserves types and array order.
L3 checkpoint values and L5 completion are shallow subsets (nested values must
match exactly). Include all material parameters in bindings. A turn can use
`revoke: "approval-1"`. Approval annotations are trusted evaluator reference data:
only add them for explicit user consent, never inferred from an agent claim.
For arbitrary natural language, annotate independently or use a separate
semantic judge; v1 does not automatically classify consent.

`maxSteps` counts non-end runtime events, not framework-specific graph nodes.
`maxTurnsWithoutProgress` counts completed turn intervals without a new projected
state. Every snapshot must contain all configured progressFields. Missing fields
are inconclusive. Configure meaningful domain state (stage, completed work,
resolved facts), not timestamps or arbitrary counters; the evaluator cannot
establish the meaning of a field merely from its name.

L5 expects snapshots and an end event. Any event after `end:completed` fails;
resume-after-completion is not supported. A waiting reason alone is insufficient:
configure an evaluator-side expected wait with an outstanding prerequisite, e.g.:

```json
{
  "expectedWait": {
    "turn": 2,
    "reason": "approval",
    "prerequisite": {"awaitingApproval": true},
    "approvalId": "new-cancellation-approval",
    "binding": {"action":"cancel","target":"B","params":{}}
  }
}
```

Add this field inside L5, list the reason in allowedWaitReasons, and ensure the
final runtime snapshot satisfies prerequisite. For approval waits, approvalId
and binding are required. A still-valid scripted approval for the same material
action binding means waiting does not pass, even if expectedWait uses a new
approval ID. Approval validity uses the same temporal rules as L2: subsequent
scripted/runtime revocation or target/action/material-parameter state changes
invalidate old consent permanently. After such invalidation, a legitimate wait
for fresh consent to the original binding may pass. Merely returning to the old
target or re-emitting old approval does not revive consent. Fresh explicit user
approval starts a new lifetime and makes further waiting for that consent fail.
Scripted consent is authoritative even when its runtime approval event is absent;
its lifetime then starts at the corresponding user turn.
The expected wait's turn and reason must match the final end event. This is a
test-author assertion, never inferred from the agent's own claim. Stalls and
budget violations take precedence; a waiting status cannot hide them.
Failed ends, premature completion and unknown/unconfigured waits do not pass.

## Agent requests and runtime evidence

The connector receives only:

```json
{"message":"Use order A.","messages":[{"role":"user","content":"Use order A."}],"turn":1,"sessionId":"unique-run-id"}
```

Studio additionally sends compatible `history` and `userId` fields. Evaluator
policy bindings, checkpoints, approval annotations and expected outputs NEVER
enter the request. Do not put expected answers into the agent's knowledge base.

Each response:

```json
{
  "response": "The refund failed.",
  "workflow": {
    "version":1, "source":"runtime", "complete":true,
    "events":[
      {"seq":1,"turn":1,"type":"state","values":{"target":"A","done":false}}
    ]
  }
}
```

Both Studio and OSS accept response text aliases in the same precedence:
`reply`, `response`, `message`, `content`, `text`, `answer` (first string value).
Runtime evidence remains under `workflow`; aliases do not change that contract.

Return **only the current turn's events**, not a cumulative event list. `seq`
must increase globally across the session; `turn` is one-based and must not
decrease. Every scripted turn requires events. `complete:true` means all relevant
runtime events for that turn were captured (not that the business task succeeded).
Supported events:

| Type | Required fields / meaning |
|---|---|
| action | callId, operationId, binding `{action,target,params}`; emitted when actually invoking the tool |
| outcome | callId, status `success/failure/timeout/unknown`; after the associated action |
| approval | approvalId, userTurn, binding; capture user approval before action |
| revoke | approvalId; ordered invalidation |
| state | values; relevant state snapshot |
| progress | values; meaningful progress snapshot |
| claim | operationId, status `success/failure/unknown`; structured user-facing reported outcome |
| end | status `completed/waiting/failed/budget_exhausted`; optional reason for waiting |

Retries share operationId but have unique callId. A timeout after possible commit
is `unknown`/`timeout`, not definitive failure. Successful recovery must precede
the success claim.

### Instrumentation pattern

Wrap tool execution in your runtime:
1. Allocate call ID, reuse intended operation ID across retries, emit `action`.
2. Invoke the actual tool. Interpret business rejection even on HTTP 200.
3. Emit correlated `outcome`, capturing only safe status/metadata.
4. At relevant node boundaries emit selected `state` values.
5. Capture explicit approval and revocation from the application/user interface.
6. Render the final user-facing result from a structured result and emit `claim`.
7. Emit `end` when complete, paused or bounded execution stops.

L4 checks structured claims only. It cannot establish that arbitrary free-text
prose agrees with a structured claim. Render prose from that result or assess it
separately. A graph that hangs before returning evidence will yield an
inconclusive transport failure, not a proven loop diagnosis. Return bounded
execution evidence from your runtime to make that condition evaluable.

## Testing and limits

`npx tsx --test src/workflow.test.ts` checks faulty/fixed cases, incomplete and
malformed evidence, recovery, approval revocation/replay, valid outstanding waits,
stalls disguised as waiting, premature completion/resume, vacuous assertions,
missing per-operation claims, alias parity and reference isolation.
Existing default OSS nonempty-response checks remain a separate path.
No LLM provider is needed for deterministic workflow evaluation. Humanly does not
inspect hidden backend state or independently prove real side effects; supply
appropriate runtime/backend evidence and audit its completeness. Redact secrets,
personal data and irrelevant tool outputs before transmitting evidence.