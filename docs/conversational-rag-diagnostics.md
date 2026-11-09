# Conversational RAG diagnostics

Conversational RAG uses current-turn retrieval, independent reference answers and the actual conversation history. References are evaluator-only: they are not added to agent invocation requests. These diagnostics do not change thresholds, normalize saved criteria, retry adverse judgments or merge standalone RAG and conversational scores.

## Start from a reviewed example

```sh
npm run conversation -- rag-template
npm run conversation -- rag-template followups > definition.json
# Also available: corrections, abstention
```

These are fictional returns-policy starters, not production-ready tests or independently adjudicated benchmarks. Review the persona, three user intents, per-turn reference answers, expected source IDs if needed, and agent policy before running. Do not copy golden answers into the agent prompts. All templates use synthetic conversation mode; scripted modes remain unavailable.

In Studio, open the Conversational RAG plan editor, choose a starter, review the candidate and explicitly apply it. Selection does not execute an agent or call a model. Saving and running remain separate actions.

## Read a turn

New shared OSS/Studio advanced RAG judges request `diagnostics.claims` and `diagnostics.context`. A claim includes an exact answer quote, a supported/contradicted/unsupported verdict, an explanation, and exact passage excerpts. `sourceIndex` is one-based within that turn's `observation.retrievedChunks`. Supported and contradicted claims require at least one passage. Unsupported claims can have no passage.

Context entries cite one-based `messageIndex` values and exact transcript excerpts, marked relevant or superseded. The judge receives every transcript message and current-turn passage with an explicit `messageIndex` or `sourceIndex` field, so it copies numbers rather than counting list positions. Later messages and prior-turn retrieval cannot be substituted for current evidence. The authored reference question and actual user question may differ: inspect both.

Excerpt existence and reference bounds are validated mechanically. **The semantic verdict, interpretation of a correction and explanation remain model-authored**, not independent proof. An empty claims list does not certify exhaustive claim coverage. Old reports and custom legacy judges may have no diagnostics; the interface says “not recorded” rather than fabricating them. Invalid claim diagnostics block usable evaluation: a fabricated answer quote, passage excerpt or source number makes the turn inconclusive. Context references are explanatory, not scored evidence. A context reference whose message number or quote cannot be verified is removed and counted in `droppedContextReferences`; the turn's scores are kept. Studio shows the removed count beside the context list.

## Understand a blocked gate

- `agent_failure`: a scored requirement failed, including empty answers or explicitly empty required evidence.
- `insufficient_evidence`: required telemetry was omitted or malformed.
- `incomplete_exposure`: a configured turn was never exercised, or the conversation hit its turn limit.
- `evaluator_failure`: a judge/simulator failed, returned invalid output, or evaluation did not reach a recorded turn.
- `execution_failure`: the agent invocation did not complete.

Multiple causes can coexist. Status precedence and existing pass/fail thresholds remain unchanged. A missing observation after an interrupted invocation is not proof of agent factual error. Raw provider exception bodies are not persisted.

## Compare a regression

```sh
npm run conversation -- compare-rag baseline.json current.json
```

Studio accepts a local baseline JSON upload on the advanced results view. The comparison identifies changed verdicts, checks, failure categories, answer/retrieval evidence, diagnostic findings and reference configuration. It supports raw conversation reports and Studio advanced snapshots. No upload is sent to a server.

Rows align by **conversation position, turn number and case ID**, not by semantic equivalence of independently simulated conversations. Changed configuration is flagged; review comparability before calling a change an improvement. Added/removed turns are explicit. Do not compare aggregate scores across different metric definitions.

## Verification limits

Offline tests cover exact reference validation, corrections, omitted versus empty retrieval, malformed/fabricated excerpts, stale retrieval, unexercised turns, synthetic runner persistence and baseline comparison. They are not evidence of LLM semantic accuracy, resistance to every prompt injection, or superiority over another evaluator.

Keep held-out examples separate from tuning data. Human reviewers should independently adjudicate expected labels before reporting accuracy. A new judge prompt/schema requires separately labelled live qualification; never overwrite prior benchmark artifacts.
