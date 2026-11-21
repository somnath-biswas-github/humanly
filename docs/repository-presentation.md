# Repository presentation — approval draft, not applied

Checked public state on 19 November 2026. No open issues were returned; the
visible discussion list contained one welcome thread. Recheck all pages and
search titles immediately before applying these drafts to avoid duplication.

## Exact metadata proposal

**Description**

> Self-hosted AI agent evaluation: synthetic-user conversations, conversational RAG and standalone RAG, with evidence-backed reports and fail-closed CI gates.

**Topics**

`ai-agents`, `agent-evaluation`, `llm-evaluation`, `synthetic-users`, `rag`,
`langgraph`, `ci-cd`, `self-hosted`

**Homepage**

https://github.com/somnath-biswas-github/humanly#readme

This is an existing verified OSS-focused destination. The standing preference
for `humanly.ai/docs` should be discussed before changing the homepage there:
this preparation does not claim that an OSS-specific route exists or that the
hosted product's documentation is a substitute. No new docs site is proposed.

## Setup-help discussion draft

**Title:** Get your first synthetic conversation report

**Body:**

> Start with the README's recorded behavioural walkthrough, then choose
> synthetic conversations, conversational RAG or standalone RAG. The recorded
> example is credential-free harness verification, not live judge calibration.
> Scripted workflow entry points are currently disabled.
>
> Stuck? Reply with your OS, Node/Python versions, candidate version, command
> and sanitised error, expected outcome and whether a report was produced.
> Distinguish failure from inconclusive: both block CI. Never post API keys,
> private transcripts, customer data or raw headers.
>
> For a useful next step, say whether you reached a report on your own agent
> and what evidence was missing. No Studio account is required.

Use a suitable existing Q&A/help category if one is available; inspect categories
with approved access rather than inventing an ID. Do not duplicate the welcome
discussion. Post only after the referenced candidate is actually public.

## Starter issue drafts

### Validate JSON examples in documentation

Labels proposed: `good first issue`, `documentation` (confirm/create only with approval).

> Extend `scripts/check-links.mjs` with a check for complete JSON fences.
> Acceptance: valid JSON passes, malformed examples report file and line,
> intentionally partial snippets are explicitly labelled and skipped, and tests
> cover both. Do not interpret historical scripted snippets as available commands.

### Test the LangGraph adapter's multi-turn isolation

Labels proposed: `help wanted`, `testing`.

> Extend `scripts/adoption.test.ts` for interleaved conversation IDs and two
> turns per conversation. Acceptance: increasing per-conversation event
> sequences, correct tool correlation and no cross-conversation state; include
> malformed request and missing-evidence controls. Use no model credentials.
> The starter is stateless today; do not imply it implements checkpoint memory.

These are proposed contribution scopes, not claims that tests already exist.
Review against the current roadmap and issues before creating either.
