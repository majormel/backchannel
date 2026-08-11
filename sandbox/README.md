# Sandbox

The sandbox is an isolated local environment for testing `backchannel` without touching your default `~/.mitmproxy` files.

It uses:

- a separate capture file under `sandbox/data/`
- a separate dashboard port
- a separate proxy port
- a fixed local token for repeatable testing

## Quick Start

```bash
cp sandbox/.env.example sandbox/.env
./sandbox/start.sh
```

Then open:

```text
http://127.0.0.1:8801/?token=sandbox-test-token-12345
```

If `sandbox/.env` is missing, the scripts fall back to `sandbox/.env.example`.

## Files

- `start.sh` starts the dashboard and proxy with sandbox settings
- `query.sh` runs offline `logs` queries against the sandbox capture file
- `test-client.py` exercises the local API
- `fixtures/` holds sample data for tests and demos

## MCP Example

`sandbox/mcp-settings.json` contains a simple MCP client example that targets the sandbox server.
