# Your users, your criteria, your agent

Humanly's primary journey is: configure representative synthetic users, specify
what to test and the execution settings, run against your agent, evaluate the
interactions, then inspect the report. Optional workflow L1–L5 checks assess
runtime actions and approvals; they are not the product's only testing path.

## Choose the interaction

| Interaction | Entry point | Configuration |
| --- | --- | --- |
| Adaptive conversational workflow | Conversation runner, synthetic mode | Persona, goal/context, weighted criteria, thresholds, turn/call/token limits; optional workflow evidence checks |
| Conversational RAG | Advanced conversation plan | The same persona-driven conversation, plus stage instructions, exposure requirements and turn-linked RAG reference evidence |
| Independent RAG questions | Persona drafts below, or an authored suite | Personas, question topics, target RAG metrics, thresholds and independently reviewed expected outcomes |

Personas and scenario instructions drive conversation simulation. The basic
simulator does not see the grading rubric or golden answers. A selected criterion
does not automatically provoke the relevant behaviour: design a scenario/stage
that exercises it and use advanced required-exposure gates where needed.
Basic rubric exposure remains unknown rather than automatically verified.

## 1. Define personas, topics and test criteria

Start with [the persona RAG configuration](../examples/persona-rag.json).
Each persona has a name, description and an authored question template containing
`{{topic}}`. Each topic lists its intended native RAG metrics. Thresholds control
the existing evaluator; topic targets are planning metadata, not metric enable/
disable switches. The evaluator still assesses all applicable RAG checks.

Template drafting uses the exact authored phrasing; descriptions are retained as
context/provenance, not secretly interpreted by a model. A maximum of 20
persona/topic combinations keeps the suite bounded.

```sh
npm run rag -- draft examples/persona-rag.json rag-drafts.json
```

This makes no provider calls, produces no reference answers and runs no tests.

### Optional model-assisted OSS drafting

```sh
npm run rag -- draft-model examples/persona-rag.json rag-drafts.json
```

This explicitly invokes your configured conversation provider using
`CONVERSATION_MODEL_API_KEY`, optional `CONVERSATION_MODEL` and
`CONVERSATION_MODEL_BASE_URL`. It uses persona descriptions and speaking-style
templates to generate one question per combination. Provider charges apply.
It uses at most 20 calls, at most 512 requested output tokens per call, a
30-second provider timeout and a 10,000 reported-token budget across calls.
Input usage is known after a call, so this is not a guaranteed currency cap.
Unknown usage or invalid output fails explicitly; no automatic retries.
Draft files record generation usage. No agent evaluation runs.

Do not put private reference answers in persona descriptions or topic prompts.
Externally configured models receive the drafting inputs. Studio does not
expose this unmanaged-provider option.

## 2. Review before creating a runnable suite

Drafts have a distinct `persona-rag-draft` format and cannot run as RAG suites.
For each retained candidate, add a `review` object. The reviewer must check the
question, its answerability and independent source material. For example:

```json
{
  "reviewer": "QA reviewer",
  "referenceSource": "Approved returns policy, section 3",
  "case": {
    "id": "persona-1-topic-1",
    "question": "The reviewed question copied or edited from this candidate",
    "answerable": true,
    "referenceAnswer": "The answer verified against your source",
    "expectedFacts": ["A separately verified fact"],
    "expectedChunkIds": ["your-real-source-id"],
    "prohibitedClaims": ["An independently identified prohibited assertion"]
  }
}
```

Place that object under the candidate's `review` key; keep the candidate's
persona/topic metadata. These strings are illustrative, not usable goldens.
For deliberately unanswerable cases, explicitly choose `answerable: false` and
record the source/scope used to justify that decision. Delete unwanted drafts
before approval rather than treating missing review as acceptance.

```sh
npm run rag -- approve rag-drafts.json approved-rag-suite.json
```

Approval is an explicit operator assertion, not a cryptographic attestation that
a human performed the review. The resulting suite retains persona, topic, target
metrics, reviewer and reference-source provenance. Editing its question or
expected evidence invalidates the stored review snapshot and requires re-review.
Legacy authored suites remain supported without invented persona provenance.

## 3. Run explicitly and inspect the report

Configure the RAG judge as described in [RAG setup](rag-evaluation.md), then:

```sh
npm run rag -- run approved-rag-suite.json https://your-agent.example/chat rag-report.json
```

Use your real endpoint, not the illustrative URL. Evaluation can incur agent and
judge charges. The connector receives the question and conversation identity,
never the reference answers, reviewer or criteria provenance. The evaluator sees
the approved reference material. Reports retain the suite configuration and
per-case findings. A configured threshold actually controls pass/fail.

`coveragePlan` records the intended metric targets and whether their assessments
were available, unavailable or not applicable. Availability is not proof of
adequate behavioural exposure. Conversational exposure belongs in advanced
scenario/metric evidence, not an inferred pass from the existence of a question.

For API consumers, `POST /v1/rag/drafts` drafts from the same configuration;
`POST /v1/rag/drafts/approve` approves a reviewed draft. Both require the
`suites:write` API-key scope and neither invokes models or agents. Submit the
approved suite to the existing `POST /v1/rag/runs` endpoint explicitly.

## Studio

Within a RAG set, build questions from persona templates and topics, edit/review
each candidate, provide independent expectations and reference provenance, then
add approved cases to the set. Save separately and use Configure & run explicitly.
Drafting is local and makes no model calls. Edited approved content must be
reviewed again; configuration and case provenance persist on save/reload.

For adaptive multi-turn testing, use Adaptive Tests and its advanced plan rather
than treating an independent question set as a conversation. Studio retains
managed execution and billing; it does not call your OSS provider directly.

## Verification limits

Credential-free tests trace configured persona wording through question creation,
explicit review, actual local connector requests, criterion thresholds and saved
reports. Model drafting tests use a controlled model, not live calibration.
Published signed-in journeys and independent held-out accuracy require separate
qualification after publication. Neither these tests nor L1–L5 establish
numerical parity between Studio and OSS.
