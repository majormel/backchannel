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

N=50
FORMAT="json"
URL_CONTAINS=""
METHOD=""

while [[ $# -gt 0 ]]; do
    case $1 in
        -n|--n)
            N="$2"
            shift 2
            ;;
        --all)
            N="--all"
            shift
            ;;
        --url-contains)
            URL_CONTAINS="$2"
            shift 2
            ;;
        --method)
            METHOD="$2"
            shift 2
            ;;
        --format)
            FORMAT="$2"
            shift 2
            ;;
        *)
            shift
            ;;
    esac
done

CMD=(uv run backchannel logs --path "$BACKCHANNEL_CAPTURE_PATH")

if [[ "$N" == "--all" ]]; then
    CMD+=(--all)
else
    CMD+=(--n "$N")
fi

if [[ -n "$URL_CONTAINS" ]]; then
    CMD+=(--url-contains "$URL_CONTAINS")
fi

if [[ -n "$METHOD" ]]; then
    CMD+=(--method "$METHOD")
fi

CMD+=(--format "$FORMAT")

echo "Querying sandbox flows..."
echo "Environment file: $ENV_FILE"
echo "Capture:          $BACKCHANNEL_CAPTURE_PATH"
echo ""

exec "${CMD[@]}"
