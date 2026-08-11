# Data Handling and Privacy

Backchannel captures network traffic for local inspection. Captured requests can contain passwords, session cookies, authorization headers, API keys, personal data, proprietary payloads, and device identifiers. Use it only with traffic you are authorized to inspect.

## Local Data

The default runtime stores:

- `~/.mitmproxy/backchannel_flows.jsonl`: captured request and response data
- `~/.mitmproxy/backchannel_flows.db`: the searchable SQLite index derived from the capture
- `~/.mitmproxy/backchannel_dashboard.json`: the current local dashboard attachment state
- `~/.mitmproxy/backchannel_dashboard_state.json`: the local dashboard address and access credential
- `~/.mitmproxy/decode_memory.db`: successful decoder-chain metadata created by the offline decoder
- browser storage for bookmarks, saved searches, filter presets, and onboarding state

Backchannel creates capture, index, decoder, CLI export, and dashboard-state files with owner-only permissions on POSIX systems. It also repairs those file modes when it reopens an existing file. Browser downloads use the permissions chosen by the browser and operating system.

Full headers and unlimited body bytes are captured by default. Configure a positive body limit before capture when full payload fidelity is unnecessary. Saved searches and bookmarks can reveal hosts, paths, and investigation terms even though they do not contain flow bodies.

## Dashboard Access

The dashboard and API bind to `127.0.0.1` by default and require a generated access token. The startup URL is a bootstrap credential and should not be pasted into issues, logs, screenshots, or chat messages.

After bootstrap, the dashboard removes the token from the address bar and keeps it in session storage instead of persistent local storage. The server also issues an `HttpOnly`, `SameSite=Strict` cookie. The `dashboard_info` MCP tool reports the dashboard origin and whether authentication is enabled, but it does not return the credential.

Binding the dashboard itself to `0.0.0.0` exposes the UI and API to the local network. Backchannel's guided device setup changes the proxy listener, not the dashboard listener. Do not expose the dashboard to an untrusted network or the public internet.

## Device Configuration

iPhone pairing opens a separate ephemeral LAN listener that serves one short-lived profile. The profile can install the mitmproxy certificate and an SSID-scoped proxy configuration. Remove it from the device after capture.

`setup_android_device` changes Android's global HTTP proxy through `adb`. Its result includes the exact cleanup command. Run `clear_android_proxy` when the session ends. Certificate installation remains a manual device action.

## MCP, Codex, and Frida

MCP clients can request complete captured flows. Those tool results become available to the connected MCP client and may be included in its model context. Configure the MCP client and model provider with that disclosure in mind.

The in-dashboard Codex review redacts credential-bearing headers and sensitive query values. Bodies are excluded unless explicitly enabled. Host names, URLs, noncredential headers, client and server addresses, status data, and the selected evidence are still sent through the model provider configured in the local Codex CLI.

Frida can inspect another process's memory, arguments, return values, and runtime events. That data remains local until it is copied, exported, or sent through an assistant workflow.

The dashboard does not load remote fonts or analytics.

## Retention and Removal

Stopping the proxy does not delete captures. Clearing flows truncates the active JSONL capture and clears its search index after confirmation in the dashboard. It does not delete exports, decoder artifacts, browser downloads, mobile profiles, or data already sent to an MCP client or model provider.

Before sharing a capture or repository artifact:

- inspect it for credentials, tokens, cookies, personal data, device identifiers, private host names, and proprietary payloads
- prefer a small synthetic reproduction over a real capture
- remove related SQLite, WAL, HAR, packet-capture, certificate, profile, and export files
- rotate any credential that may have been exposed

Repository publication guidance is in [open-source-release.md](open-source-release.md).
