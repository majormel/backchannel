# Contributing

Thanks for your interest in improving `backchannel`.

## Before You Start

- Use the tool only with traffic you are authorized to inspect
- Avoid attaching captured third-party traffic, credentials, or secrets to issues and pull requests
- Use synthetic traffic for fixtures, screenshots, examples, and bug reproductions
- Keep changes focused and user-visible behavior well documented

## Development Setup

```bash
uv sync --extra dev

cd dashboard
npm ci
cd ..
```

## Common Commands

```bash
uv run backchannel
uv run backchannel mcp
uv run backchannel logs --n 50 --format json
uv run pytest -q

cd dashboard
npm test -- --run
npx tsc --noEmit
npm run build

cd ..
gitleaks git --redact
```

## Pull Request Checklist

- Add or update tests when behavior changes
- Update `README.md` or other public docs when commands, workflows, or UI behavior change
- Rebuild `backchannel/dashboard_dist/` after changing dashboard source
- Keep the dashboard, JSON API, and MCP interfaces stable unless the change explicitly requires otherwise
- Confirm new fixtures and generated assets contain no real traffic, device identifiers, private host names, or credentials
- Follow `docs/open-source-release.md` for release and repository-publication work

## Project Layout

- `backchannel/` runtime server, API, MCP tools, capture addon, packaged dashboard assets
- `dashboard/` Vite/React dashboard source
- `decoder/` offline payload inspection helpers
- `cli/` offline decoder entrypoints
- `tests/` backend test suite
- `sandbox/` isolated local example environment

## Reporting Problems

- Use GitHub issues for bugs, usability problems, and feature requests
- Use private reporting for security-sensitive issues as described in `SECURITY.md`
