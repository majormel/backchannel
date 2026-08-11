# Architecture

`backchannel` is split into a live capture runtime, a local dashboard, and an offline decoder toolchain.

## Runtime Server

`backchannel/server.py` owns the main entrypoints:

- `serve` starts the dashboard and JSON API
- `mcp` attaches an MCP 2026-07-28 server to a running dashboard/API instance over stdio or stateless Streamable HTTP
- `logs` queries the capture file offline without starting the dashboard

The runtime also owns token authentication, subprocess lifecycle management for `mitmdump`, replay helpers, and the flow query/export endpoints.

The MCP process uses MCP SDK 2 and accepts both the `2026-07-28` protocol and legacy `2025-11-25` clients. Streamable HTTP defaults to `127.0.0.1:8811/mcp`, creates no MCP session state, and refuses non-loopback hosts because the MCP endpoint has no independent authentication layer. The dashboard/API client used by MCP remains token-aware.

## Capture Addon

`backchannel/capture_addon.py` is loaded by `mitmdump` and writes completed flows to JSONL.

Each record includes:

- request and response metadata
- full captured headers
- UTF-8 body previews when possible
- `body_base64` for byte-accurate downstream inspection
- timing data when mitmproxy provides it

## Dashboard

The dashboard source lives in `dashboard/`. The packaged build output lives in `backchannel/dashboard_dist/`.

The React app provides:

- first-run launchpad visibility derived after status and recent-flow summary loading
- guided loopback, iPhone, and manual LAN proxy preparation
- persistent completion state under `backchannel_setup_complete_v1`
- QR-assisted iPhone pairing with profile download and traffic-detected progress
- recent-flow summaries and full inspection
- search, compare, replay, export, sequence, and timing views
- read-only Codex review of a selected flow
- optional Frida process attachment, hooks, traces, memory inspection, and flow correlation
- local bookmarks and saved filters

The packaged dashboard assets are tracked so Python installs can serve the UI without a frontend build step.

Dashboard authentication bootstraps from a tokenized local URL, immediately removes the token from the visible URL, and retains it only for the current browser session. The server also issues an `HttpOnly`, `SameSite=Strict` cookie. Runtime capture, index, decoder, export, and dashboard-state files use owner-only permissions on POSIX systems.

## Mobile Pairing

`backchannel/mobile_setup.py` creates high-entropy, short-lived pairing records and combined Apple configuration profiles. When a pairing starts, `server.py` opens a separate HTTP listener on an ephemeral LAN port. That listener serves only valid `/pair/TOKEN` profile requests and never serves the dashboard or JSON API.

The combined profile contains the mitmproxy root certificate and a manual proxy payload scoped to the exact SSID supplied by the user. Download state and the requesting device IP are reported through the authenticated dashboard API.

`GET /api/status` and successful `POST /api/start` responses include the LAN address resolved by `mobile_setup.get_lan_ip()`. The connection workflow starts local capture on `127.0.0.1` and restarts iPhone or other-device capture on `0.0.0.0` before generating targets or pairing data.

## Codex App Server Bridge

`backchannel/codex_bridge.py` owns a local `codex app-server --stdio` subprocess. It performs the JSONL initialization handshake, correlates request responses, consumes streamed notifications, and stores lightweight review state for dashboard polling.

Flow reviews use a fresh Codex thread and turn with read-only sandboxing and `approvalPolicy=never`. The prompt builder redacts credential-bearing headers and sensitive query parameters. Bodies are omitted unless the user explicitly opts in.

Host names, URLs, noncredential headers, network addresses, and other selected metadata remain in the review context. See [Data Handling and Privacy](data-handling.md) for the disclosure boundary.

## Offline Decoder

`decoder/` provides reusable helpers for analyzing opaque payloads outside the live dashboard flow.

That stack includes:

- base64 and transport helpers
- decompression and length-prefix inspection
- XOR and AES-oriented heuristics
- printable-run, TLV, and varint analysis
- descriptor-driven protobuf decoding
- an artifact-writing pipeline for offline investigations

`cli/decode_flows.py` is the main command-line entrypoint for that stack.

## Sandbox

`sandbox/` is an isolated example environment with its own token, ports, and capture path. It is useful for local testing without touching the default `~/.mitmproxy` state.

## Data Flow

1. `uv run backchannel` starts the dashboard and JSON API.
2. A dashboard action, JSON API request, or MCP tool call starts `mitmdump`.
3. `capture_addon.py` appends flow objects to the JSONL capture file.
4. The dashboard, JSON API, stdio or Streamable HTTP MCP attach mode, and `logs` command query the capture file.
5. The optional mobile pairing listener delivers an SSID-scoped Apple profile and records the device that downloaded it.
6. The optional Codex bridge sends a redacted, user-selected flow to a read-only App Server turn and streams the answer back to the dashboard.
7. The optional Frida bridge instruments a selected live process and correlates captured events with nearby flows.
8. The offline decoder CLI consumes `body_base64` when deeper payload analysis is needed.
