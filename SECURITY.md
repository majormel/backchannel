# Security Policy

## Scope

`backchannel` is designed for local traffic inspection and research. Reports are especially helpful for issues involving:

- authentication or dashboard access control
- request replay behavior
- export or data handling bugs
- sensitive header or token redaction failures
- proxy process control or unintended exposure beyond the local machine

## Reporting

Please do not open a public issue for vulnerabilities that could expose captured traffic, credentials, or local-system access.

Use GitHub's private vulnerability reporting for this repository if it is enabled. If private reporting is unavailable, contact the maintainer through GitHub before sharing details publicly.

## What To Include

- affected version or commit
- reproduction steps
- impact assessment
- whether secrets, captures, or user data were involved
- any suggested mitigation if you have one

Please redact or remove private traffic, tokens, cookies, and personally identifiable information from reports whenever possible.

## Local Deployment

Keep the dashboard bound to `127.0.0.1` unless network access is an explicit and understood requirement. Treat the bootstrap dashboard URL as a credential. Review [Data Handling and Privacy](docs/data-handling.md) for stored files, device changes, assistant disclosure, retention, and cleanup.
