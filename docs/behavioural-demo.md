# A failed refund must not become a success claim

## Credential-free recorded walkthrough

From the published source root, Node.js 20+:

```sh
npm ci
npm run demo
```

No Docker, database, Studio account or provider credentials are used. The child
process has an allowlisted environment and does not load your `.env`.
The [recording](../examples/behaviour/recording.json) is **author-written**,
not a recording of a real model evaluation. It replays one user stimulus and
fixed mock-provider assessments through the real synthetic conversation CLI.
It is harness verification, not adaptive-user quality or semantic judge accuracy.

| Variant | Observed tool result | Structured claim | Expected gate / CLI exit |
| --- | --- | --- | --- |
| Control | failure | failure | pass / 0 |
| Faulty | failure | success | fail / 1 |
| Missing evidence | not supplied | not supplied | inconclusive / 2 |

All variants get the same deliberately permissive mock semantic score of 100.
The L4 runtime check - not the mock judge - catches the faulty claim. This isolates
what the demonstration proves. The wrapper succeeds only if all three expected
outcomes occur; do not use the wrapper's exit code to gate your own agent.

## Read the reports

Open `demo-output/behaviour/control.json`, `faulty.json`, `missing.json` and
`walkthrough.json`. Inspect:

1. `definition`: synthetic mode, rubric, thresholds, budgets and L4 requirement.
2. `conversations[0].messages`: what the user and agent actually said.
3. `conversations[0].evidence.events`: ordered action, outcome, claim and end.
4. `conversations[0].workflow.findings`: L4's explanation and linked event numbers.
5. `status` and `qualityGate.passed`: a score of 100 does not override a failed
   evidence gate. Missing evidence is not a pass or a zero-scored failure.
6. `usage`: fixture token counts are synthetic, not an estimate of provider cost.

The recorded adapter uses supplied sandbox evidence. The
[LangGraph starter](../examples/langgraph/README.md) instead executes an actual
local graph and records its sandbox tool exception. Neither sends money.
Structured events can be dishonest if an agent emits dishonest telemetry;
they are not signed proof. L4 does not interpret arbitrary prose.

## Explicit live path (provider charges apply)

Start the LangGraph server, then review the definition and set
`CONVERSATION_MODEL_API_KEY` through your local secret mechanism.
The default OpenAI-compatible model is `gpt-4o`; compatible explicit overrides
remain supported. Do not use the fixture provider for this path.

```sh
HUMANLY_ALLOW_PRIVATE_CONNECTORS=true npm run conversation -- run \
  examples/behaviour/definition.json http://127.0.0.1:8765/agent/control control-live.json
# A nonzero exit below is a blocked evaluation, not a shell setup success:
HUMANLY_ALLOW_PRIVATE_CONNECTORS=true npm run conversation -- run \
  examples/behaviour/definition.json http://127.0.0.1:8765/agent/faulty faulty-live.json
```

Each run permits up to 6 simulator/judge requests and a reported-usage stop
threshold of 4,000 tokens; two runs permit up to 12 calls. These are **not dollar
caps**. Check your provider's current input/output prices, set a provider-side
spending limit and approve a budget before running. In-flight calls/timeouts may
still be billed. Regrading also costs money. The sandbox agent itself is
deterministic; substituting an LLM agent adds its separate costs.

Live semantic outcomes have **not** been qualified for this example. Expect
stochastic variation, possible extra turns and inconclusive outcomes. Review
the transcript and tool evidence rather than assuming the fixture scores.
No paid call is authorised by preparing these instructions.
