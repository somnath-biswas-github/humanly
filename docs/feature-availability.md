# Current evaluation availability

Standalone Scripted Tests and scripted conversation mode are temporarily disabled
in both Studio and OSS. This is reversible: source, schemas, fixtures, internal
evaluators and saved reports have not been deleted.

## Available now

- Adaptive conversations using synthetic users (`mode: "synthetic"`).
- Conversational RAG using synthetic users and independent reference evidence.
- Classical RAG evaluation.
- Internal workflow evidence checks within supported adaptive evaluations.
- Reading and inspecting existing reports.
- Existing one-turn connector smoke suites (not a replacement for evaluation).

## Disabled entry points

- Studio `/workflow-evaluation` shows an unavailable notice.
- Studio workflow examples and new workflow runs return HTTP 403.
- OSS workflow examples and new workflow runs return HTTP 403.
- OSS conversation API rejects scripted definitions and scripted replays before
  resolving a connector, configuring a model, or writing a report.
- `npm run workflow -- ...` exits 2 without executing or evaluating a case.
- Conversation CLI scripted run/replay and `export-script` exit 2 before provider
  configuration, network calls or output writes.

HTTP 403 and CLI exit 2 are not successful evaluations. CI must fail closed.
Historical scripted reports remain readable, but are not new test results.

## Restoring later

The authoritative release switch is `src/feature-availability.ts`.
Studio imports the same switch through its shared module. It is intentionally
not a user setting or an environment-variable override.

Before restoring, review both scripted entry points, re-enable their conditional
regression tests, rebuild and verify the checked-in OSS server bundle, and update
Studio/OSS documentation, evaluation guidance, onboarding, CTO Chat and Help Bot.
Retained pure evaluator code supports internal adaptive checks and historical
fixtures; its presence does not make the disabled public launch paths available.
