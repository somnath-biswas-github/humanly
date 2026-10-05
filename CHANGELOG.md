# Changelog

All notable changes to Humanly OSS are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and releases use
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Standalone RAG API and CLI with configurable OpenAI-compatible judge provider,
  source recall, semantic findings, strict evidence handling and fail-closed gates.
  No Studio account or hosted Humanly service is required.
- Uploaded and live-agent RAG runs, persisted API reports, fixed/faulty examples,
  bounded judge transport, and controlled-judge API/CLI regression coverage.

### Fixed

- Default suite evaluator now recognises `reply`, `content`, `text` and `answer`
  alongside existing response aliases, with workflow-compatible reply-first
  precedence. Empty replies cannot be masked by fallback fields.
- JSON primitives without answer text no longer pass the non-empty check.

### Planned

- Additional deterministic evaluation checks
- Multi-turn synthetic-user execution
- Packaged CLI distribution

## [0.1.0] - Unreleased

### Added

- Standalone AGPL-3.0-or-later Humanly OSS server
- Versioned PostgreSQL migrations with startup retry
- API-key authenticated `/v1` endpoints
- HTTP AgentConnector support with private-network protection
- Deterministic non-empty-response evaluation
- Run reports and regression baselines
- OSS-compatible `@humanlyai/sdk` prerelease source
- CLI and Python SDK source distributions
- Docker Compose quick start and health check
- End-to-end self-hosted smoke test
- Included passing-baseline and intentional-regression demo

[Unreleased]: https://github.com/somnath-biswas-github/humanly/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/somnath-biswas-github/humanly/releases/tag/v0.1.0