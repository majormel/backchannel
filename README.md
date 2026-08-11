<p align="center">
  <img src="dashboard/public/brand/backchannel-app-icon.svg" width="96" alt="Backchannel logo">
</p>

# Backchannel

**Backchannel** is a local traffic analysis tool built on top of [mitmproxy](https://mitmproxy.org). It captures HTTP(S) flows to JSONL and exposes them through a dashboard, a JSON API, and MCP tools for assistants and automation, so you can capture, search, and replay the traffic behind any app and reason about it with an LLM.

It is built for understanding how data flows through apps and websites: debugging your own applications, and reverse-engineering the undocumented APIs behind products that have no public interface so you can build on top of them.

It is designed for practical interception and inspection workflows: capturing traffic from browsers, mobile devices, and desktop apps; inspecting and exporting flows; decoding opaque payloads; and using MCP-compatible assistants to search, compare, summarize, and reason about captured requests.

## Responsible Use

Use this tool only on systems, applications, and traffic you are authorized to inspect. Captured traffic can contain credentials, tokens, cookies, personal data, and proprietary payloads.
By default, capture now preserves full headers and unlimited request/response body bytes for research fidelity.

Read [Data Handling and Privacy](docs/data-handling.md) before capturing real traffic or connecting an MCP client.

## Highlights

- Capture HTTP(S) traffic from any client configured to use the proxy
- Inspect flows in a local dashboard with search, compare, bookmarks, replay, sequence, and timing views
- Stream newly captured flows to the dashboard and MCP assistants for near-instant updates
- Query recent traffic or exported logs through a local JSON API
- Keep flow lookup fast with a local SQLite FTS index mapped to JSONL offsets
- Attach MCP-compatible assistants to the running server for LLM-assisted traffic analysis
- Pair an iPhone by scanning a short-lived QR code that delivers an SSID-scoped proxy and certificate profile
- Review a selected flow through a read-only Codex App Server task with sensitive headers redacted and bodies opt-in
- Export selected flows as JSON, JSONL, or curl, with exact save-location picking in supported browsers
- Decode opaque payloads offline with the bundled decoder CLI
- Hook and trace live processes with Frida dynamic instrumentation and correlate events with captured flows
- Keep installs simple with prebuilt dashboard assets bundled in the Python package

## Requirements

- Python 3.13+
- `uv`
- Node.js and npm for frontend development only
- Codex CLI for the optional in-dashboard Codex review panel

## Install

```bash
uv sync
```

Version 0.1.0 is distributed from the reviewed source repository and must be run with uv so the locked security overrides are applied. PyPI package publication is deferred until mitmproxy permits the fixed transitive dependency versions without overrides.

To enable Frida dynamic instrumentation (optional):

```bash
uv sync --extra frida
```

## Quick Start

Start the dashboard and JSON API:

```bash
uv run backchannel
```

Common commands:

```bash
uv run backchannel serve
uv run backchannel mcp
uv run backchannel logs --n 50 --format json
uv run python -m cli.decode_flows --flows ~/.mitmproxy/backchannel_flows.jsonl --out artifacts --all
```

Global dashboard and API options go before the subcommand:

```bash
uv run backchannel --dashboard-port 8801 --dashboard-token local-dev-token serve
```

Defaults:

- Dashboard and JSON API: `http://127.0.0.1:8800`
- Proxy listen address: `127.0.0.1:8080`
- Capture file: `~/.mitmproxy/backchannel_flows.jsonl`
- Search index database: `~/.mitmproxy/backchannel_flows.db`
- Dashboard state file: `~/.mitmproxy/backchannel_dashboard_state.json`

The dashboard startup log prints the full local URL, including the access token.
That URL is a bootstrap credential. The dashboard removes the token from the address bar after loading and keeps it only for the current browser session.
Startup serves the dashboard and API but does not start `mitmdump`. Begin capture from the launchpad, **Connect source**, Settings, `POST /api/start`, or the `mitm_start` MCP tool.

## Interfaces

### Dashboard

The dashboard uses the **Flow Gate** design: a dark technical-glass workspace with a left
nav rail (Capture, Flows, Search, Compare, Sequence, Replay, Agents, Frida, Settings), a top
command bar with quick search and a live proxy indicator, a dense flow table with client and
tag columns and an All/HTTP/HTTPS/WebSocket filter, a metrics row (traffic summary, connected
clients, protocol distribution), and a persistent tabbed inspector (Overview, Request,
Response, Headers, JSON, Timing).

Quick search opens the Search workspace with the query applied. Inside that workspace, one
advanced search surface provides presets, saved views, and method, status, and time filters.

The Backchannel Cipher Lens mark focuses fragmented packets through a cobalt and aqua inspection lens. Packet fragments assemble and stream through the lens during active motion. Reduced-motion environments receive the assembled static mark.

On a new offline, empty installation, Capture opens a connection launchpad after proxy status and recent flows have loaded. Choose iPhone, this Mac/browser, or another LAN device. Skipping setup, entering the workbench, or detecting traffic persists completion, so clearing flows later does not reopen onboarding. The persistent **Connect source** action reopens the chooser, while Settings keeps advanced capture configuration.

The dashboard is the primary human interface for:

- starting and stopping the proxy
- configuring capture path, token, and body limits
- using `max_body_bytes=0` (the default) for unlimited body capture
- pairing an iPhone with a short-lived QR code and combined SSID-scoped proxy and certificate profile
- tailing recent flows with lightweight summary loading
- auto-cleaning conflicting orphan `mitmdump` capture processes before starting a new proxy session
- searching and filtering by URL, method, status, time range, and text
- saving and reusing named filter presets from the dashboard
- showing live search-index backfill progress while existing captures are being indexed
- inspecting requests and responses with JSON, text, binary, and protobuf-aware views
- searching raw body bytes by hex pattern via `flows_search_bytes` MCP tool and `/api/flows/search_bytes`
- seeing response-size badges directly in the flow list
- highlighting active search matches in flow detail URLs, headers, and bodies
- replaying requests
- comparing flows side by side
- exporting flows as JSON, JSONL, or curl
- choosing an exact export file name and location with `Save As` in browsers that support the File System Access API
- reviewing a selected exchange through a local, read-only Codex App Server bridge with redacted credentials and opt-in bodies
- attaching Frida to a live process, adding hooks, running traces, inspecting memory, and correlating events with captured flows (open **Frida** from the nav rail or press `Shift+F`)

### JSON API

The local API exposes the same core workflows used by the dashboard. Representative endpoints include:

```text
GET  /api/status
GET  /api/flows
GET  /api/flows/item
GET  /api/flows/compare
GET  /ws?token=...
POST /api/start
POST /api/stop
POST /api/clear
POST /api/replay
POST /api/flows/export
POST /api/flows/sequence
POST /api/flows/search_bytes
POST /api/processes/kill
GET  /api/network-info
GET  /api/frida/status
GET  /api/frida/devices
GET  /api/frida/hooks
GET  /api/codex/status
GET  /api/codex/reviews/REVIEW_ID
GET  /api/mobile-pairing/PAIRING_TOKEN
POST /api/frida/attach
POST /api/frida/detach
POST /api/frida/hooks
POST /api/frida/hooks/remove
POST /api/frida/trace
POST /api/frida/memory/scan
POST /api/frida/memory/read
POST /api/codex/reviews
POST /api/codex/reviews/REVIEW_ID/interrupt
POST /api/mobile-pairing
```

Useful `GET /api/flows` patterns:

```bash
GET /api/flows?n=50&url_contains=api&method=GET
GET /api/flows?summary=1&n=50
GET /api/flows?query=login&time_from=1700000000&time_to=1700000600
```

`GET /api/status` includes the resolved `lan_ip` and includes `index_progress` while background indexing is in progress. Successful `POST /api/start` responses also include `lan_ip`.

Authenticate with either:

- `X-MCP-Token: YOUR_TOKEN`
- `Authorization: Bearer YOUR_TOKEN`

### MCP Tools

`backchannel mcp` attaches an MCP server to a running dashboard/API instance. It uses MCP SDK 2, negotiates the `2026-07-28` protocol by default, and accepts legacy `2025-11-25` clients on the same transport. Stdio remains the default:

```bash
uv run backchannel mcp
```

For a stateless Streamable HTTP endpoint, run:

```bash
uv run backchannel mcp --transport streamable-http
```

The default endpoint is `http://127.0.0.1:8811/mcp`. The MCP listener is restricted to loopback because it does not add endpoint authentication. Dashboard/API credentials still protect the connection from the MCP process to the running Backchannel dashboard.

The server exposes tools including:

- capture control: `mitm_start`, `mitm_stop`, `mitm_status`, and `dashboard_info`
- flow analysis: `flows_tail`, `flows_search`, `flows_stream`, `flows_compare`, `flows_export`, `flows_clear`, `flows_sequence`, `flows_timing`, and `flows_search_bytes`
- decoding and replay: `smart_decode_flow`, `get_decode_suggestions_for_flow`, `infer_protobuf_schema`, `replay_with_fuzzing`, `replay_chain`, `create_replay_collection`, `export_har`, and `import_har`
- interception and mocking: `set_breakpoint`, `list_intercepted`, `modify_and_resume`, and `create_mock_rule`
- device and assistant workflows: `get_mobile_setup_qr`, `setup_android_device`, `clear_android_proxy`, and `review_flows_with_codex`
- dynamic instrumentation: `frida_list_devices`, `frida_attach`, `frida_detach`, `frida_hook_function`, `frida_list_hooks`, `frida_remove_hook`, `frida_trace`, `frida_memory_scan`, and `frida_read_memory`

`flows_search` supports both Unix timestamps (`time_from`, `time_to`) and ISO date strings (`date_from`, `date_to`) for time-window filtering.

`flows_stream` opens a live subscription that agents can read incrementally over MCP. Call it once without a `subscription_id` to open the stream, then call it again with the returned `subscription_id` to pull the next batch of flow summaries, or pass `close=true` to stop the subscription.

Example `flows_stream` flow:

```json
{"method":"POST","wait_seconds":5}
```

Then continue with:

```json
{"subscription_id":"YOUR_SUBSCRIPTION_ID","wait_seconds":5}
```

Frida tools require the `frida` optional dependency (`uv sync --extra frida`). All tools return a descriptive error when Frida is not installed rather than failing at import time.

Example Claude Code MCP entry:

```json
{
  "mcpServers": {
    "backchannel": {
      "command": "uv",
      "args": [
        "--directory",
        "/absolute/path/to/backchannel",
        "run",
        "backchannel",
        "mcp"
      ]
    }
  }
}
```

For clients that support remote MCP URLs, connect to `http://127.0.0.1:8811/mcp` after starting the Streamable HTTP transport. Configure the listener with `BACKCHANNEL_MCP_HOST`, `BACKCHANNEL_MCP_PORT`, and `BACKCHANNEL_MCP_PATH`, or the corresponding `--host`, `--port`, and `--path` options after the `mcp` subcommand.

If the running server uses a custom host, port, or token, set:

```bash
BACKCHANNEL_API_HOST=127.0.0.1
BACKCHANNEL_API_PORT=8800
BACKCHANNEL_API_TOKEN=YOUR_TOKEN
```

Attach mode retries with the latest saved dashboard state if the previous dashboard target goes away or its token changes.

### iPhone QR Pairing

Choose **Connect source** and **Pair an iPhone**. On the iPhone, open **Settings > Wi-Fi** and enter the exact network name with the checkmark, including spaces and capitalization; do not enter the password or an IP address. Backchannel starts or restarts capture on `0.0.0.0`, then opens a pairing-only listener on an ephemeral LAN port and places a high-entropy, ten-minute profile URL in the QR code. It does not expose the dashboard or dashboard token.

After scanning with the iPhone Camera app:

1. If Safari shows `backchannel.mobileconfig`, tap **Save**, then open it from **Files > Downloads**. If iOS shows **Profile Downloaded** instead, continue in Settings.
2. Open **Settings**, tap **Profile Downloaded**, then tap **Install**. If that row is missing, open **General > VPN & Device Management**. Install promptly because iOS removes an uninstalled downloaded profile after eight minutes.
3. Open **Settings > General > About > Certificate Trust Settings** and enable full trust for `mitmproxy`.
4. Open a website or app while capture is running and wait for Backchannel to confirm traffic.

The connection drawer distinguishes a profile sent to the phone from a verified traffic connection; Backchannel cannot detect profile installation or certificate trust directly. The Mac and iPhone must be on the same LAN.

iOS does not permit a QR code to silently install a profile or trust a root certificate. Those two confirmations remain required. Remove the profile from **Settings > General > VPN & Device Management** after the capture session so its Wi-Fi proxy setting no longer applies.

Manual setup remains available from **Another device**: configure the client HTTP proxy with the displayed LAN target and visit `mitm.it`. **This Mac or browser** prepares a loopback proxy at `127.0.0.1`. `/mobileconfig` serves a certificate-only profile, while `/mobileconfig?mode=wifi&ssid=YOUR_WIFI_NAME` serves the combined SSID-scoped profile.

`setup_android_device` changes the connected Android device's global HTTP proxy and returns separate certificate-copy and cleanup commands. Certificate installation remains manual. Run `clear_android_proxy` after capture to remove the global proxy.

### Codex Flow Review

Select a flow, open **Agents** from the nav rail, choose a review prompt, and start the review. The server launches `codex app-server` over its stable JSONL stdio transport, creates a task in the current workspace, and runs the turn with read-only sandboxing and no approval escalation.

Authorization, cookies, API keys, and sensitive query values are redacted before the prompt is built. Request and response bodies are excluded unless **Include bodies** is enabled. The selected evidence is still sent through the model provider configured in the local Codex CLI, so only review traffic you are authorized to share with that provider.

## Offline Decoder

The bundled decoder is useful when you want to inspect captured binary payloads outside the live dashboard.

Examples:

```bash
uv run python -m cli.decode_flows \
  --flows ~/.mitmproxy/backchannel_flows.jsonl \
  --out artifacts \
  --flow-id FLOW_ID

uv run python -m cli.decode_flows \
  --flows ~/.mitmproxy/backchannel_flows.jsonl \
  --out artifacts \
  --all

uv run python -m cli.decode_flows \
  --flows ~/.mitmproxy/backchannel_flows.jsonl \
  --out artifacts \
  --flow-id FLOW_ID \
  --proto-desc schemas/example.desc \
  --proto-message example.api.Response
```

## Sandbox

The `sandbox/` directory provides an isolated local environment with its own ports, token, and capture path so you can test without touching your default `~/.mitmproxy` files.

```bash
cp sandbox/.env.example sandbox/.env
./sandbox/start.sh
./sandbox/query.sh --n 25 --format json
uv run python sandbox/test-client.py
```

## Development

Backend checks:

```bash
uv run pytest -q
```

Frontend checks:

```bash
cd dashboard
npm ci
npm test -- --run
npx tsc --noEmit
npm run build
```

The frontend build output is written to `backchannel/dashboard_dist/` and is intentionally tracked so the packaged Python project can serve the dashboard without requiring end users to build frontend assets themselves.

## Docs

- [Architecture](docs/architecture.md)
- [Development](docs/development.md)
- [Data handling and privacy](docs/data-handling.md)
- [Open-source release checklist](docs/open-source-release.md)
- [Roadmap](ROADMAP.md)
- [Changelog](CHANGELOG.md)
- [Contributing](CONTRIBUTING.md)
- [Code of conduct](CODE_OF_CONDUCT.md)
- [Security](SECURITY.md)
- [Third-party notices](THIRD_PARTY_NOTICES.md)

## Publishing Note

If you plan to open-source a previously private deployment of this project, follow the [open-source release checklist](docs/open-source-release.md) and publish from a cleaned snapshot rather than exposing private repository history directly.
