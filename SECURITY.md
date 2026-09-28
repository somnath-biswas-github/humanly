# Security Policy

## Supported versions

Humanly OSS is currently a `0.x` project. Security fixes are applied to the
latest tagged release and the `main` branch.

| Version | Supported |
| --- | --- |
| Latest `0.x` release | Yes |
| Older releases | No |

## Reporting a vulnerability

Please use
[GitHub private vulnerability reporting](https://github.com/somnath-biswas-github/humanly/security/advisories/new).
Do not include exploit details, credentials, personal data, or vulnerable
deployment URLs in a public issue.

Include:

- The affected version or commit
- Reproduction steps
- The security impact
- Any suggested mitigation

The maintainers will acknowledge the report, investigate it, and coordinate a
fix and disclosure. Timelines depend on severity and reproducibility.

## Deployment responsibilities

- Use a high-entropy `HUMANLY_API_KEY`.
- Keep `HUMANLY_ALLOW_PRIVATE_CONNECTORS=false` on network-reachable instances.
- Restrict outbound network access where practical.
- Use PostgreSQL credentials and TLS appropriate for your environment.
- Back up data before upgrading.
- Never commit `.env` files.