import base64
import hashlib
import json
import os
import time
from pathlib import Path
from mitmproxy import ctx

from backchannel.file_security import open_private_text_append

flow_index_writer = None
flow_broadcaster = None


def _capture_headers(headers):
    result = {}
    for key, value in headers.items():
        result[key] = value
    return result


def _limited_bytes(data, max_bytes):
    if not data:
        return b""
    try:
        limit = int(max_bytes)
    except Exception:
        limit = 0
    if limit > 0 and len(data) > limit:
        return data[:limit]
    return data


def _decode_body(data, max_bytes):
    if not data:
        return ""
    data = _limited_bytes(data, max_bytes)
    return data.decode("utf-8", errors="replace")


def _encode_body_base64(data, max_bytes):
    if not data:
        return ""
    data = _limited_bytes(data, max_bytes)
    return base64.b64encode(data).decode("ascii")


def _body_metadata(raw_content, max_bytes):
    if not raw_content:
        return {
            "body_truncated": False,
            "body_captured_bytes": 0,
            "body_original_bytes": 0,
            "body_sha256": None,
        }
    original = len(raw_content)
    try:
        limit = int(max_bytes)
    except Exception:
        limit = 0
    truncated = limit > 0 and original > limit
    captured = min(original, limit) if truncated else original
    sha256 = hashlib.sha256(raw_content).hexdigest()
    return {
        "body_truncated": truncated,
        "body_captured_bytes": captured,
        "body_original_bytes": original,
        "body_sha256": sha256,
    }


class MCPFlowCapture:
    def load(self, loader):
        default_path = os.path.expanduser("~/.mitmproxy/backchannel_flows.jsonl")
        loader.add_option("backchannel_capture_path", str, default_path, "")
        loader.add_option("mcp_capture_max_body_bytes", int, 0, "")

    def response(self, flow):
        capture_path = ctx.options.backchannel_capture_path
        if not capture_path:
            return
        capture_path = os.path.expanduser(capture_path)
        max_body_bytes = ctx.options.mcp_capture_max_body_bytes
        try:
            Path(capture_path).parent.mkdir(parents=True, exist_ok=True)
            req = flow.request
            resp = flow.response
            req_meta = _body_metadata(req.raw_content, max_body_bytes)
            resp_meta = _body_metadata(resp.raw_content, max_body_bytes)
            entry = {
                "ts": float(getattr(resp, "timestamp_end", None) or time.time()),
                "id": flow.id,
                "client": list(flow.client_conn.address) if flow.client_conn and flow.client_conn.address else None,
                "server": list(flow.server_conn.address) if flow.server_conn and flow.server_conn.address else None,
                "request": {
                    "method": req.method,
                    "url": req.pretty_url,
                    "host": req.host,
                    "path": req.path,
                    "http_version": req.http_version,
                    "headers": _capture_headers(req.headers),
                    "body": _decode_body(req.raw_content, max_body_bytes),
                    "body_base64": _encode_body_base64(req.raw_content, max_body_bytes),
                    **req_meta,
                },
                "response": {
                    "status_code": resp.status_code,
                    "reason": resp.reason,
                    "http_version": resp.http_version,
                    "headers": _capture_headers(resp.headers),
                    "body": _decode_body(resp.raw_content, max_body_bytes),
                    "body_base64": _encode_body_base64(resp.raw_content, max_body_bytes),
                    "body_size": len(resp.raw_content) if resp.raw_content else 0,
                    **resp_meta,
                },
            }
            payload = json.dumps(entry, ensure_ascii=True) + "\n"
            payload_bytes = payload.encode("utf-8")
            with open_private_text_append(capture_path) as f:
                f.seek(0, os.SEEK_END)
                jsonl_offset = f.tell()
                f.write(payload)
            index_writer = flow_index_writer
            if callable(index_writer):
                index_writer(entry, jsonl_offset, len(payload_bytes))
            broadcaster = flow_broadcaster
            if broadcaster is not None:
                broadcaster(entry)
        except Exception:
            return


addons = [MCPFlowCapture()]
