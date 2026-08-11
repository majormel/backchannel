# Development

## Setup

```bash
uv sync --extra dev

cd dashboard
npm ci
cd ..
```

## Common Commands

Serve the dashboard and JSON API:

```bash
uv run backchannel
uv run backchannel serve
```

Global dashboard and API options must precede the subcommand:

```bash
uv run backchannel --dashboard-port 8801 --dashboard-token local-dev-token serve
```

Attach an MCP client to a running local server:

```bash
uv run backchannel mcp
BACKCHANNEL_API_PORT=8801 BACKCHANNEL_API_TOKEN=local-dev-token uv run backchannel mcp
uv run backchannel mcp --transport streamable-http
```

Stdio is the default. Streamable HTTP is stateless at `http://127.0.0.1:8811/mcp` and is limited to loopback hosts until the MCP endpoint has its own authentication. Use `--host`, `--port`, and `--path` after the `mcp` subcommand to change its listener settings.

Query captured flows offline:

```bash
uv run backchannel logs --n 50 --format json
uv run backchannel logs --all --limit 200 --status-min 400 --status-max 599 --decode-proto --format jsonl --out /tmp/flows.jsonl
```

Decode captured payloads offline:

```bash
uv run python -m cli.decode_flows --flows ~/.mitmproxy/backchannel_flows.jsonl --out artifacts --flow-id FLOW_ID
uv run python -m cli.decode_flows --flows ~/.mitmproxy/backchannel_flows.jsonl --out artifacts --all
```

Use the sandbox:

```bash
cp sandbox/.env.example sandbox/.env
./sandbox/start.sh
./sandbox/query.sh --n 25 --format json
uv run python sandbox/test-client.py
```

## Tests

Backend:

```bash
uv run pytest -q
```

Frontend:

```bash
cd dashboard
npm test -- --run
npx tsc --noEmit
npm run build
```

Release-oriented checks:

```bash
gitleaks git --redact
uv build

uv export --python 3.13 --no-dev --no-emit-project --no-hashes --format requirements-txt |
  uvx pip-audit -r /dev/stdin --no-deps --disable-pip --progress-spinner off

cd dashboard
npm audit --audit-level=high
```

The root `pyproject.toml` uses explicit uv overrides to select patched `cryptography`, `h2`, `msgpack`, and `tornado` releases constrained by mitmproxy 12.2.3. The audit has no vulnerability exclusions. Use `uv sync` or `uv run` so the reviewed lock and overrides are applied.

## Frontend Notes

- `dashboard/` is the source of truth
- `backchannel/dashboard_dist/` is the packaged output
- rebuild the packaged assets after frontend changes with `cd dashboard && npm run build`
- use synthetic traffic in tests and examples
- never commit captures, indexes, HAR files, packet captures, certificates, profiles, exports, or local environment files
- follow [open-source-release.md](open-source-release.md) before publishing a repository or package
