#!/usr/bin/env python3

import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path


def load_env() -> None:
    sandbox_dir = Path(__file__).resolve().parent
    env_path = sandbox_dir / ".env"
    if not env_path.exists():
        env_path = sandbox_dir / ".env.example"
    if not env_path.exists():
        return
    for line in env_path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ[key] = value


load_env()

API_HOST = os.environ.get("BACKCHANNEL_API_HOST", "127.0.0.1")
API_PORT = int(os.environ.get("BACKCHANNEL_API_PORT", "8801"))
TOKEN = os.environ.get("BACKCHANNEL_TOKEN", "sandbox-test-token-12345")
BASE_URL = f"http://{API_HOST}:{API_PORT}"


def api_request(path: str, method: str = "GET", data: dict | None = None) -> dict:
    url = f"{BASE_URL}{path}"
    headers = {
        "Authorization": f"Bearer {TOKEN}",
        "Content-Type": "application/json",
    }
    req = urllib.request.Request(url, method=method, headers=headers)
    if data is not None:
        req.data = json.dumps(data).encode()
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as exc:
        return {"error": exc.read().decode(), "status": exc.code}
    except Exception as exc:
        return {"error": str(exc)}


def main() -> int:
    print("=== backchannel Sandbox Test Client ===\n")

    print("1. Checking server status...")
    status = api_request("/api/status")
    if "error" in status:
        print(f"   FAIL: {status['error']}")
        print("\n   Start the sandbox with:")
        print("   ./sandbox/start.sh")
        return 1
    print("   OK: Server is running")
    print(f"       Dashboard: {BASE_URL}")
    print(f"       Proxy running: {status.get('running', False)}")

    print("\n2. Starting proxy...")
    proxy_host = os.environ.get("BACKCHANNEL_PROXY_HOST", "127.0.0.1")
    proxy_port = int(os.environ.get("BACKCHANNEL_PROXY_PORT", "8081"))
    result = api_request(
        "/api/start",
        method="POST",
        data={
            "listen_host": proxy_host,
            "listen_port": proxy_port,
            "capture_path": os.environ.get("BACKCHANNEL_CAPTURE_PATH", "./sandbox/data/backchannel_flows.jsonl"),
            "max_body_bytes": int(os.environ.get("BACKCHANNEL_MAX_BODY_BYTES", "0")),
        },
    )
    if result.get("running"):
        print(f"   OK: Proxy started on {proxy_host}:{proxy_port}")
        print(f"       PID: {result.get('pid')}")
    else:
        print(f"   FAIL: {result.get('error', 'Unknown error')}")

    print("\n3. Querying flows...")
    flows = api_request("/api/flows?n=10")
    print(f"   OK: Found {flows.get('count', 0)} flows")

    print("\n4. Stopping proxy...")
    result = api_request("/api/stop", method="POST")
    if not result.get("running"):
        print("   OK: Proxy stopped")
    else:
        print("   FAIL: Proxy still running")

    print("\n=== Tests Complete ===")
    return 0


if __name__ == "__main__":
    sys.exit(main())
