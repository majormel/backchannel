#!/bin/bash

set -euo pipefail

cd "$(dirname "$0")/.."

ENV_FILE="${BACKCHANNEL_SANDBOX_ENV_FILE:-sandbox/.env}"
if [[ ! -f "$ENV_FILE" ]]; then
    ENV_FILE="sandbox/.env.example"
fi

set -a
source "$ENV_FILE"
set +a

echo "=== backchannel Sandbox Environment ==="
echo ""
echo "Environment file: $ENV_FILE"
echo "Capture file:     $BACKCHANNEL_CAPTURE_PATH"
echo "Dashboard:        http://$BACKCHANNEL_API_HOST:$BACKCHANNEL_API_PORT"
echo "Proxy:            $BACKCHANNEL_PROXY_HOST:$BACKCHANNEL_PROXY_PORT"
echo ""

mkdir -p sandbox/data

if lsof -Pi :"$BACKCHANNEL_API_PORT" -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo "Warning: something is already listening on port $BACKCHANNEL_API_PORT"
    echo ""
fi

cleanup() {
    if [[ -n "${SERVER_PID:-}" ]] && kill -0 "$SERVER_PID" >/dev/null 2>&1; then
        curl -sS -X POST \
            -H "X-MCP-Token: $BACKCHANNEL_TOKEN" \
            "http://$BACKCHANNEL_API_HOST:$BACKCHANNEL_API_PORT/api/stop" >/dev/null || true
        kill "$SERVER_PID" >/dev/null 2>&1 || true
        wait "$SERVER_PID" 2>/dev/null || true
    fi
}

trap cleanup EXIT INT TERM

uv run backchannel \
    --dashboard-host "$BACKCHANNEL_API_HOST" \
    --dashboard-port "$BACKCHANNEL_API_PORT" \
    --dashboard-token "$BACKCHANNEL_TOKEN" &

SERVER_PID=$!

for _ in $(seq 1 30); do
    if curl -sS \
        -H "X-MCP-Token: $BACKCHANNEL_TOKEN" \
        "http://$BACKCHANNEL_API_HOST:$BACKCHANNEL_API_PORT/api/status" >/dev/null; then
        break
    fi
    sleep 1
done

curl -sS -X POST \
    -H "Content-Type: application/json" \
    -H "X-MCP-Token: $BACKCHANNEL_TOKEN" \
    --data @- \
    "http://$BACKCHANNEL_API_HOST:$BACKCHANNEL_API_PORT/api/start" >/dev/null <<EOF
{"listen_host":"$BACKCHANNEL_PROXY_HOST","listen_port":$BACKCHANNEL_PROXY_PORT,"capture_path":"$BACKCHANNEL_CAPTURE_PATH","max_body_bytes":$BACKCHANNEL_MAX_BODY_BYTES}
EOF

echo "Sandbox dashboard and proxy started."
echo "Press Ctrl+C to stop."
echo ""

wait "$SERVER_PID"
