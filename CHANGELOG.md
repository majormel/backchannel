# Changelog

All notable changes to this project will be documented in this file.

## [0.1.0] - 2026-08-11

### Added
- Initial public alpha release of the local HTTP(S) capture dashboard, JSON API, and MCP server

### Changed
- **MCP 2026-07-28**
  - Migrated from FastMCP on MCP SDK 1 to MCPServer on MCP SDK 2
  - Added `2026-07-28` discovery and negotiation while retaining legacy `2025-11-25` compatibility
  - Added an optional stateless Streamable HTTP transport at loopback-only `http://127.0.0.1:8811/mcp` while preserving stdio as the default
  - Raised the Python baseline to 3.13 because mitmproxy 12.2.3 and MCP SDK 2 have incompatible `typing-extensions` requirements on Python 3.12
  - Applied reviewed uv overrides for fixed transitive dependencies constrained by mitmproxy 12.2.3 and removed all vulnerability audit exclusions

### Fixed
- **iPhone Pairing Guidance**
  - Replaced the ambiguous post-scan status with exact Save, Files, profile installation, certificate trust, and traffic verification steps
  - Distinguished profile delivery from completed installation so the dashboard no longer reports progress it cannot observe
  - Changed the pairing profile response from a forced attachment to inline delivery while retaining the `.mobileconfig` filename

**Development milestone: 2026-08-04**

### Changed
- **Open-Source Release Hardening**
  - Replaced a real captured-traffic frontend fixture with fully synthetic in-test payloads and removed the internal research tracker from the public tree
  - Added owner-only permissions for captures, SQLite indexes, decoder artifacts, CLI exports, HAR imports, and dashboard state files on POSIX systems
  - Moved dashboard credentials from persistent local storage to session storage, scrubbed the bootstrap token from the address bar, hardened the authentication cookie, and removed credentials from `dashboard_info`
  - Expanded sensitive-artifact ignore rules, added Gitleaks CI coverage, and documented data handling plus clean-snapshot publication
  - Removed the dashboard's remote font request and switched to local system font stacks
  - Added explicit Android global-proxy cleanup through `clear_android_proxy`
  - Sanitized captured sequence-diagram labels and enabled Mermaid's strict security mode
  - Raised the supported Python baseline to 3.12, constrained the MCP and mitmproxy compatibility ranges, refreshed dependency locks, and added frontend plus Python dependency audits to CI
  - Improved narrow flow-table discoverability, search sizing, keyboard focus, semantic landmarks, sortable headers, destructive-flow confirmation, and live status announcements
  - Consolidated the command-bar and advanced flow searches into one path, with quick search routing into a prefilled Search workspace and no duplicate field while that workspace is active
- **Documentation Accuracy**
  - Aligned the README, contribution guide, architecture notes, and development commands with the current Backchannel executable, paths, launchpad, nav-based Codex and Frida workflows, API surface, MCP tools, and verification commands
- **Backchannel Brand and Connection Launchpad**
  - Added production SVG mark, monochrome mark, outlined wordmark lockup, app icon, and favicon assets using the ultraviolet, signal-lime, graphite, and warm-ivory identity palette
  - Added an interactive dashboard mark whose packet fragments assemble on load, respond to pointer proximity, spring back into place, and remain static when reduced motion is requested
  - Added a first-run Capture launchpad that appears only after proxy status and recent-flow summaries load for an incomplete, offline, empty workspace
  - Added guided iPhone, loopback, and manual LAN connection paths plus a persistent **Connect source** action and compact Settings entry point
  - Added automatic loopback or LAN proxy preparation, resolved `lan_ip` status data, copyable targets, certificate guidance, retryable setup errors, and traffic-detected progress
  - Added technical-glass surfaces, spotlight source cards, press feedback, fluid inspector tabs, a direction-aware setup drawer, and reduced-motion fallbacks
  - Replaced the custom Codex activity animation with `thinking-orbs` state mapping for connecting, searching, and composing work
- **Flow Gate Dashboard Redesign**
  - Rebuilt the dashboard around a debugger/reverse-engineer identity: near-black terminal surfaces with cobalt and aqua accents, the Backchannel Cipher Lens logo mark, and a local system monospace stack for data cells
  - Replaced the single stacked layout with a persistent left nav rail (Capture, Flows, Search, Compare, Sequence, Replay, Agents, Frida, Settings), a top command bar with global search and a live proxy pill, and a persistent tabbed inspector (Overview, Request, Response, Headers, JSON, Timing)
  - Rebuilt the flow list on TanStack Table with row virtualization, sortable columns, and new Client and Tags columns; added an All/HTTP/HTTPS/WebSocket protocol filter
  - Added a metrics row with Traffic Summary, Connected Clients (with per-client request counts), and a Protocol Distribution donut, all derived client-side from captured flows
  - Made the dashboard dark-only and removed the light theme
  - Derived flow tags and client names (e.g. "Chrome 124", "Postman") in the browser; TLS/ALPN, real timing, and WebSocket capture surface honest "not captured yet" states pending backend support

**Development milestone: 2026-08-01**

### Added
- **Secure iPhone QR Pairing**
  - Added high-entropy, ten-minute pairing records and a pairing-only ephemeral LAN listener
  - Added combined SSID-scoped Wi-Fi proxy and mitmproxy certificate profile delivery through a scan-to-open QR code
  - Added dashboard progress for QR readiness, profile download, and detected device traffic
  - Added `qrcode[pil]` as a runtime dependency so QR rendering is available in standard installs
- **Codex Flow Review**
  - Added a stable JSONL stdio bridge to `codex app-server` with initialization, streamed review output, interruption, and lifecycle cleanup
  - Added authenticated Codex status and review API endpoints plus the `review_flows_with_codex` MCP tool
  - Added a read-only dashboard review panel with focused prompts, an animated thinking orb, sensitive-header and query redaction, and opt-in bodies

### Changed
- **Traffic-First Workbench**
  - Replaced the expanded command deck with compact capture controls, status metrics, and progressive settings
  - Collapsed device setup by default and tightened the header and mobile layout so traffic stays in the first viewport
  - Added a reduced-motion-aware live capture border beam and refined glass primitives without adding effects to dense traffic rows

**Development milestone: 2026-03-18**

### Fixed
- **iPhone Setup Mode Split**
  - `mobileconfig` now defaults to a certificate-only profile so the existing manual iPhone proxy workflow keeps working
  - Wi-Fi proxy profiles are now opt-in and require an explicit `ssid` via `mobileconfig?mode=wifi&ssid=...`
  - Dashboard device setup keeps manual proxy configuration as a fallback while recommending short-lived QR pairing
  - Mobile setup QR/API instructions expose both secure pairing and the direct Wi-Fi profile URL template

### Added
- **Binary Capture Fidelity**
  - Capture addon now records `body_truncated`, `body_captured_bytes`, `body_original_bytes`, and `body_sha256` for every request and response body
  - HAR export uses `content.encoding="base64"` when `body_base64` is present, preserving binary fidelity through export/import round-trips
  - HAR import restores `body_base64` from base64-encoded content and reconstructs truncation metadata from `_mcp_*` custom fields
  - Added `flows_search_bytes` MCP tool and `POST /api/flows/search_bytes` endpoint for hex-pattern searching within raw flow body bytes
  - Added 11 new tests across `test_capture_addon.py`, `test_har.py`, and `test_server_io.py`

**Development milestone: 2026-03-16**

### Added
- **Frida Dynamic Instrumentation**
  - Added `backchannel/frida_bridge.py` with `FridaBridge` singleton — device enumeration, attach/detach lifecycle, hook CRUD, trace capture, memory scan/read, and flow-event correlation by timestamp proximity
  - Added `backchannel/frida_scripts/` with four injectable JavaScript templates: `generic_tracer.js`, `crypto_hooks.js` (CCHmac/CC_SHA256/CCCrypt), `memory_scanner.js`, and `session_c_hook.js` (KV16 key watcher for game-specific research)
  - Added 9 MCP tools: `frida_list_devices`, `frida_attach`, `frida_detach`, `frida_hook_function`, `frida_list_hooks`, `frida_remove_hook`, `frida_trace`, `frida_memory_scan`, `frida_read_memory`
  - Added 10 JSON API endpoints under `/api/frida/*` mirroring the MCP tools
  - Frida is an optional dependency (`.[frida]`) — all tools degrade gracefully with a descriptive error when the package is not installed
  - Added `frida = ["frida>=16.0", "frida-tools>=12.0"]` to `[project.optional-dependencies]`
  - Added 24 mocked backend tests in `tests/test_frida_bridge.py`
- **Frida Dashboard Panel**
  - Added `FridaPanel` React component with connect/detach controls, hooks table with inline add-hook form, trace controls with duration slider, event log with collapsible JSON and flow correlation, and memory scan/read tabs with hex dump output
  - Added **Frida** toggle button in the dashboard header; panel renders between the command deck and traffic workbench
  - Added `Shift+F` keyboard shortcut to toggle the Frida panel
  - Fixed shift modifier handling in `useKeyboardShortcuts` (previously only `ctrl`/`cmd` modifiers were matched)
  - Added Frida type definitions to `types.ts` and 10 API wrapper functions to `api.ts`

**Development milestone: 2026-03-11**

### Added
- **Apple-Hybrid Dashboard Refresh**
  - Reframed the dashboard around a command deck, setup panel, traffic workbench, and inspector
  - Added a calmer dark glass theme with stronger hierarchy and reduced visual noise
  - Added a resizable inspector layout on desktop and improved mobile row formatting
- **Quick Wins Completion**
  - Added named filter presets with dropdown apply/delete and localStorage persistence (`mcp_filter_presets`)
  - Added dark/light theme toggle in the header with persisted preference (`mcp_theme`)
  - Added response-size badges in flow rows with color thresholds (<10KB green, 10-100KB yellow, >100KB red)
  - Added active search highlighting in flow detail URL, headers, and body rendering
- **Saved Flow Views**
  - Added persistent quick views and saved custom filter views for repeated triage workflows
- **Real-Time WebSocket Streaming**
  - Added authenticated flow stream endpoint at `GET /ws?token=...`
  - Added server-side subscription filters (`url_contains`, `method`, `status_min`, `status_max`)
  - Added dashboard WebSocket client with reconnect backoff and polling fallback
  - Added dashboard header connection indicator (connected, reconnecting, disconnected/fallback)
  - Added `flows_stream` MCP tool stub that points clients to WebSocket streaming
- **Binary-Aware Inspector**
  - Added explicit binary payload messaging when a body is opaque instead of rendering unreadable mojibake
  - Added richer inspector metadata for host, path, query, content type, and flow id
- **SQLite FTS Flow Index**
  - Added a persisted SQLite FTS5 index for flow search and tail operations using JSONL byte offsets
  - Added background indexing for existing capture files with progress surfaced through `/api/status`
  - Added dashboard index progress UI and ISO date-range support in `flows_search`

### Changed
- **Dashboard Flow Loading**
  - The dashboard now loads lightweight recent-flow summaries first and fetches full flow detail only when a row is opened
- **Research-First Capture Defaults**
  - Removed default capture-time header redaction so headers are preserved for local research workflows
  - Default `max_body_bytes` is now unlimited (`0`), and zero no longer maps to empty body capture
  - Replay response reads now honor unlimited defaults instead of silently capping at 2MB
  - Flow compare now returns full request and response body values rather than fixed 1000-character truncation
  - Dashboard copy now explicitly calls out summary-row loading and export preview truncation
- **Timing Empty State**
  - Timing view now distinguishes between missing timing metadata and an actual empty result set
- **Proto Decode in Flow Detail**
  - Flow detail requests now honor the `Decode proto` toggle so structured protobuf views appear when available

### Fixed
- Fixed flow search requests hanging in the dashboard by separating recent summary loads from full detail fetches
- Fixed dialog accessibility warnings by supplying the missing descriptions and labels

**Development milestone: 2026-01-27**

### Added
- **Export Selected Flows** - Export multiple selected flows in various formats
  - Select multiple flows via checkboxes (no limit)
  - Export formats: JSON (pretty-printed), JSONL, cURL script
  - Preview before export
  - Copy to clipboard or download as file
  - New `flows_export` MCP tool
- **Keyboard Shortcuts** - Navigate and control with keyboard
  - `?` - Show shortcuts help
  - `Ctrl/Cmd + R` - Refresh/Tail flows
  - `Ctrl/Cmd + F` - Focus search
  - `Ctrl/Cmd + S/X/C` - Start/Stop/Clear proxy
  - `j/k` or arrows - Navigate flow list
  - `Esc` - Close modals
- **Flow Diff/Compare** - Compare two flows side-by-side to spot differences
  - Checkbox selection in flow list (select up to 2 flows)
  - Unified diff view for URL and body differences
  - Inline diff for method and status code changes
  - Header-by-header comparison showing additions/removals
  - Collapsible sections for request/response details
  - New `flows_compare` MCP tool for programmatic comparison
- **Timing Waterfall** - Visualize request/response timing breakdown
  - Toggle timing view and inspect per-flow timing segments
- **Flow Bookmarks** - Save and browse important flows
  - Bookmark/unbookmark flows and filter to bookmarked flows
  - Bookmarks panel for quick navigation
- **Sequence Diagrams** - Generate a sequence diagram from selected flows
  - New `flows_sequence` MCP tool for sequence data generation
- **Flow Search & Filter** - Search flows by URL, method, headers, or body with real-time filtering
  - Fuzzy search across URL, method, headers, and request body
  - Filter by HTTP method, status code range
  - Time range filtering support
  - Animated search UI with Framer Motion
  - New `flows_search` MCP tool for programmatic access
- **UI Improvements**
  - Color-coded HTTP methods (GET=blue, POST=green, DELETE=red, etc.)
  - Status code badges with semantic colors (2xx=green, 4xx=orange, 5xx=red)
  - Smart URL shortening in flow list
  - JSON syntax highlighting in body viewer
- **Cyberpunk-Terminal UI Redesign**
  - Dark theme with cyan grid background pattern
  - Neon accent colors (cyan primary, magenta accent, emerald success)
  - Distinctive typography (Space Grotesk + JetBrains Mono)
  - Glassmorphism card effects with glow
  - Custom scrollbar styling
- **Copy as cURL** - Copy any request as a curl command from flow detail modal

### Fixed
- Fixed `_iter_lines_forward` bug where only the last line was yielded (indentation error)

### Technical
- Added `flowDisplay.ts` utility library for formatting and colors
- Added `JsonHighlighter` component for syntax highlighting
- Added `FlowSearch` component with Framer Motion animations
- Extended `/api/flows` endpoint with `query`, `time_from`, `time_to` parameters
- Added comprehensive unit tests for search functionality
