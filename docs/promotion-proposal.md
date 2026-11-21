# Focused promotion proposal — no campaign executed

Prepared after local OSS tests, bundle/type/link checks, the recorded and real
LangGraph gate tests, and the SDK clean-consumer checks passed. Source archive
and final payload qualification are release gates, not assumed public success.
See [verification](adoption-verification.md) and [publication checklist](release-candidate.md).

## One audience and one useful tutorial

**Audience:** Python LangGraph developers shipping tool-using customer-support
agents who already have CI and need to catch false action-success claims.
Do not broaden to generic chatbot builders or sell Studio as the solution.

**Tutorial title:** “Catch a false refund-success claim in a LangGraph agent before deployment.”

The [starter](../examples/langgraph/README.md) and
[walkthrough](behavioural-demo.md) are the single tutorial/demo:

1. Run the credential-free fixture and inspect control/fault/missing-evidence reports.
2. Explain why mock semantic scores of 100 do not override runtime L4 failure.
3. Replace the sandbox graph with an own-agent endpoint and actual tool telemetry.
4. Review the rubric and explicitly approve provider budget before a live run.
5. Copy the fail-closed CI gate; retain reports even when it fails.

Evidence-backed claim: a local actual LangGraph tool exception and false
structured success claim are distinguished by the existing evidence gate.
Do not claim calibrated live judges, better accuracy than competitors, general
production safety, or that one tool-error case validates every behaviour.

## Small community shortlist and rules checked 19 November 2026

| Channel | Decision and constraints |
| --- | --- |
| [Show HN](https://news.ycombinator.com/showhn.html) | Conditional first public demonstration after release verification. Must be something people can run, not just a tutorial/landing page. Maker must participate. No requests for votes or coordinated comments. Lead with runnable credential-free source and disclose affiliation/limits. |
| [LangChain Slack](https://www.langchain.com/join-community) | Conditional technical sharing only after checking current channel rules/moderator permission. [Code of conduct](https://www.langchain.com/community-code) requires proper channels, threads, no double posts or unsolicited product DMs; vendor solicitation is banned. Do not recruit pilots or generate leads there. |
| [LangChain Forum](https://forum.langchain.com/guidelines) | Exclude from promotion: guidelines ban promotional content/solicitation and external-link answers except LangChain docs. Do not disguise marketing as a support question. |

Recheck rules before any approved post. No permission has been requested, no
community post made, and no account access is assumed.

## Assisted pilot offer (on the project's own approved page)

Proposed copy:

> Bring one sandbox LangGraph agent and one tool-failure case. We can help you
> connect it, interpret the report and add a CI gate in a 30-minute session.
> You control your credentials and provider budget. No production data, review,
> public testimonial or ongoing follow-up is required.

Five voluntary developers in two waves: two first, fix blocking issues, then
three. No paid ads, cold emails, unsolicited DMs, automatic reminders or paid
tester recruitment. Participants opt in through an approved repository discussion.
If paid research is later authorised, report it separately from adoption.

## Sequence and measurable decisions

1. Approve exact release version, files/hashes and metadata/help drafts.
2. Publish only with approved access; re-download and test public artifacts.
3. Let the first two opt-in developers follow the same tutorial. Record help
   required and friction; do not count fixture-only completion as activation.
4. If both can install and at least one reaches an own-agent report, fix blockers
   then invite the remaining three. Otherwise stop promotion and repair setup.
5. Only then consider one approved Show HN demonstration; Slack remains conditional.
6. Review at 14 days, with no automatic follow-up messages.

Track an opt-in, minimal manual log, not hidden OSS telemetry:
candidate version, anonymous participant code, setup duration, assistance minutes,
fixture completion, own-agent report reached, gate outcome, insight usefulness,
CI adoption and voluntary second run/date. Do not collect credentials or raw traces.

**Targets for five voluntary participants:**

- At least 4/5 produce an own-agent report within 45 minutes (record assistance).
- At least 3/5 identify a real defect or actionable missing-evidence requirement.
- At least 2/5 voluntarily run again on a later agent change within 14 days.
- At least 2/5 adopt the fail-closed CI gate.

Report fail/inconclusive/error counts separately; a passing score is not the
activation metric. An own-agent report can reveal a failure and still be useful.
Stars, downloads, smoke/demo runs and paid testers are not adoption.
Stop/iterate if a safety-sensitive false pass is found, installation blocks either
first-wave user, or fewer than two users voluntarily reuse the tool. Investigate
before expanding channels; do not tune thresholds to improve marketing metrics.
