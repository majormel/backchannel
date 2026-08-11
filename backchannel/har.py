import base64
import json
import time
import uuid
from datetime import datetime, timezone
from urllib.parse import parse_qsl, urlparse


def _to_str(value: object) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    if isinstance(value, (bytes, bytearray)):
        return bytes(value).decode("utf-8", errors="replace")
    return str(value)


def _to_int(value: object, default: int | None = None) -> int | None:
    if value is None:
        return default
    try:
        return int(value)
    except Exception:
        return default


def _to_float(value: object, default: float | None = None) -> float | None:
    if value is None:
        return default
    try:
        return float(value)
    except Exception:
        return default


def _headers_dict_to_list(headers: object) -> list[dict]:
    if not isinstance(headers, dict):
        return []
    return [{"name": _to_str(name), "value": _to_str(value)} for name, value in headers.items()]


def _headers_list_to_dict(headers: object) -> dict:
    if not isinstance(headers, list):
        return {}
    result: dict[str, str] = {}
    for item in headers:
        if not isinstance(item, dict):
            continue
        name = item.get("name")
        if name is None:
            continue
        result[_to_str(name)] = _to_str(item.get("value"))
    return result


def _header_value(headers: dict, name: str) -> str:
    target = name.lower()
    for key, value in headers.items():
        if _to_str(key).lower() == target:
            return _to_str(value)
    return ""


def _body_text(value: object) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    if isinstance(value, (bytes, bytearray)):
        return bytes(value).decode("utf-8", errors="replace")
    return _to_str(value)


def _body_size(value: object) -> int:
    return len(_body_text(value).encode("utf-8"))


class HARExporter:
    def export_flows(self, flows: list[dict]) -> dict:
        entries = [self._flow_to_entry(flow if isinstance(flow, dict) else {}) for flow in (flows or [])]
        return {
            "log": {
                "version": "1.2",
                "creator": {"name": "backchannel", "version": "1.0"},
                "entries": entries,
            }
        }

    def _flow_to_entry(self, flow: dict) -> dict:
        ts = _to_float(flow.get("ts"), default=time.time()) or time.time()
        started = datetime.fromtimestamp(ts, tz=timezone.utc).isoformat()
        request = self._request_to_har(flow.get("request") or {})
        response = self._response_to_har(flow.get("response") or {})
        timings = self._estimate_timings(flow)
        total_time = int(round(sum(float(v) for v in timings.values() if isinstance(v, (int, float)) and v >= 0)))
        entry = {
            "startedDateTime": started,
            "time": total_time,
            "request": request,
            "response": response,
            "cache": {},
            "timings": timings,
        }
        server = flow.get("server")
        if isinstance(server, list) and server:
            entry["serverIPAddress"] = _to_str(server[0])
        return entry

    def _request_to_har(self, request: dict) -> dict:
        request_obj = request if isinstance(request, dict) else {}
        url = _to_str(request_obj.get("url"))
        parsed = urlparse(url)
        query_items = parse_qsl(parsed.query, keep_blank_values=True)
        headers_dict = request_obj.get("headers") if isinstance(request_obj.get("headers"), dict) else {}
        body_b64 = request_obj.get("body_base64") or ""
        if body_b64:
            try:
                raw = base64.b64decode(body_b64, validate=True)
            except Exception:
                raw = None
            if raw is not None:
                post_data = {
                    "mimeType": _header_value(headers_dict, "Content-Type"),
                    "text": body_b64,
                    "encoding": "base64",
                }
                body_size = len(raw)
            else:
                body = _body_text(request_obj.get("body"))
                post_data = {
                    "mimeType": _header_value(headers_dict, "Content-Type"),
                    "text": body,
                }
                body_size = _body_size(body)
        else:
            body = _body_text(request_obj.get("body"))
            post_data = {
                "mimeType": _header_value(headers_dict, "Content-Type"),
                "text": body,
            }
            body_size = _body_size(body)
        self._add_truncation_metadata(request_obj, post_data)
        return {
            "method": _to_str(request_obj.get("method") or "GET").upper(),
            "url": url,
            "httpVersion": _to_str(request_obj.get("http_version") or "HTTP/1.1"),
            "headers": _headers_dict_to_list(headers_dict),
            "queryString": [{"name": name, "value": value} for name, value in query_items],
            "bodySize": body_size,
            "postData": post_data,
        }

    def _response_to_har(self, response: dict) -> dict:
        response_obj = response if isinstance(response, dict) else {}
        headers_dict = response_obj.get("headers") if isinstance(response_obj.get("headers"), dict) else {}
        body_b64 = response_obj.get("body_base64") or ""
        if body_b64:
            try:
                raw = base64.b64decode(body_b64, validate=True)
            except Exception:
                raw = None
            if raw is not None:
                content = {
                    "size": len(raw),
                    "mimeType": _header_value(headers_dict, "Content-Type"),
                    "text": body_b64,
                    "encoding": "base64",
                }
                computed_size = len(raw)
            else:
                body = _body_text(response_obj.get("body"))
                computed_size = _body_size(body)
                content = {
                    "size": computed_size,
                    "mimeType": _header_value(headers_dict, "Content-Type"),
                    "text": body,
                }
        else:
            body = _body_text(response_obj.get("body"))
            computed_size = _body_size(body)
            content = {
                "size": computed_size,
                "mimeType": _header_value(headers_dict, "Content-Type"),
                "text": body,
            }
        self._add_truncation_metadata(response_obj, content)
        body_size = _to_int(response_obj.get("body_size"), default=computed_size)
        if body_size is None or body_size < 0:
            body_size = computed_size
        return {
            "status": _to_int(response_obj.get("status_code"), default=0) or 0,
            "statusText": _to_str(response_obj.get("reason")),
            "httpVersion": _to_str(response_obj.get("http_version") or "HTTP/1.1"),
            "headers": _headers_dict_to_list(headers_dict),
            "content": content,
            "bodySize": body_size,
        }

    def _add_truncation_metadata(self, source: dict, target: dict):
        if source.get("body_truncated"):
            target["_mcp_body_truncated"] = True
        original = _to_int(source.get("body_original_bytes"), default=None)
        if original is not None:
            target["_mcp_body_original_bytes"] = original
        sha256 = source.get("body_sha256")
        if sha256:
            target["_mcp_body_sha256"] = sha256

    def _estimate_timings(self, flow: dict) -> dict:
        timing_obj = flow.get("timing") if isinstance(flow.get("timing"), dict) else {}
        estimated_ms = None
        for source in (timing_obj, flow):
            for key in ("total_duration_ms", "duration_ms", "wait_ms"):
                value = _to_float(source.get(key), default=None) if isinstance(source, dict) else None
                if value is not None:
                    estimated_ms = value
                    break
            if estimated_ms is not None:
                break
        if estimated_ms is None:
            request_ts = _to_float(flow.get("request_ts"), default=None)
            response_ts = _to_float(flow.get("ts"), default=None)
            if request_ts is not None and response_ts is not None:
                estimated_ms = max((response_ts - request_ts) * 1000.0, 0.0)
        if estimated_ms is None:
            estimated_ms = 0.0
        wait = max(int(round(estimated_ms)), 0)
        return {
            "blocked": -1,
            "dns": -1,
            "connect": -1,
            "send": 0,
            "wait": wait,
            "receive": 0,
        }


class HARImporter:
    def import_har(self, har_data: dict) -> list[dict]:
        if not isinstance(har_data, dict):
            return []
        log = har_data.get("log")
        if not isinstance(log, dict):
            return []
        entries = log.get("entries")
        if not isinstance(entries, list):
            return []
        return [self._entry_to_flow(entry if isinstance(entry, dict) else {}) for entry in entries]

    def _entry_to_flow(self, entry: dict) -> dict:
        request = self._har_to_request(entry.get("request") or {})
        response = self._har_to_response(entry.get("response") or {})
        return {
            "ts": self._parse_started_date_time(entry.get("startedDateTime")),
            "id": uuid.uuid4().hex[:16],
            "client": None,
            "server": None,
            "request": request,
            "response": response,
        }

    def _har_to_request(self, har_req: dict) -> dict:
        request_obj = har_req if isinstance(har_req, dict) else {}
        url = _to_str(request_obj.get("url"))
        parsed = urlparse(url)
        path = parsed.path or "/"
        if parsed.query:
            path = f"{path}?{parsed.query}"
        post_data = request_obj.get("postData") if isinstance(request_obj.get("postData"), dict) else {}
        encoding = post_data.get("encoding") or ""
        body_value = post_data.get("text")
        body_base64 = None
        if encoding == "base64" and body_value:
            body_base64 = body_value
            try:
                body = base64.b64decode(body_value).decode("utf-8", errors="replace")
            except Exception:
                body = _to_str(body_value) if body_value is not None else None
        else:
            body = _to_str(body_value) if body_value is not None else None
        if body is None and _to_int(request_obj.get("bodySize"), default=None) == 0:
            body = ""
        result = {
            "method": _to_str(request_obj.get("method") or "GET").upper(),
            "url": url,
            "host": parsed.hostname or parsed.netloc or "",
            "path": path,
            "http_version": _to_str(request_obj.get("httpVersion") or "HTTP/1.1"),
            "headers": _headers_list_to_dict(request_obj.get("headers")),
            "body": body,
            "body_base64": body_base64,
        }
        self._restore_truncation_metadata(post_data, result)
        return result

    def _har_to_response(self, har_resp: dict) -> dict:
        response_obj = har_resp if isinstance(har_resp, dict) else {}
        content = response_obj.get("content") if isinstance(response_obj.get("content"), dict) else {}
        encoding = content.get("encoding") or ""
        body_value = content.get("text")
        body_base64 = None
        if encoding == "base64" and body_value:
            body_base64 = body_value
            try:
                body = base64.b64decode(body_value).decode("utf-8", errors="replace")
            except Exception:
                body = _to_str(body_value) if body_value is not None else None
        else:
            body = _to_str(body_value) if body_value is not None else None
        body_size = _to_int(response_obj.get("bodySize"), default=None)
        if body_size is None:
            body_size = _to_int(content.get("size"), default=None)
        if body_size is None:
            body_size = _body_size(body) if body is not None else 0
        result = {
            "status_code": _to_int(response_obj.get("status"), default=0) or 0,
            "reason": _to_str(response_obj.get("statusText")),
            "http_version": _to_str(response_obj.get("httpVersion") or "HTTP/1.1"),
            "headers": _headers_list_to_dict(response_obj.get("headers")),
            "body": body,
            "body_base64": body_base64,
            "body_size": max(body_size, 0),
        }
        self._restore_truncation_metadata(content, result)
        return result

    def _restore_truncation_metadata(self, source: dict, target: dict):
        if not isinstance(source, dict):
            return
        if source.get("_mcp_body_truncated"):
            target["body_truncated"] = True
        original = _to_int(source.get("_mcp_body_original_bytes"), default=None)
        if original is not None:
            target["body_original_bytes"] = original
        sha256 = source.get("_mcp_body_sha256")
        if sha256:
            target["body_sha256"] = sha256

    def _parse_started_date_time(self, value: object) -> float:
        if isinstance(value, (int, float)):
            return float(value)
        if not isinstance(value, str):
            return time.time()
        text = value.strip()
        if not text:
            return time.time()
        if text.endswith("Z"):
            text = f"{text[:-1]}+00:00"
        try:
            return datetime.fromisoformat(text).timestamp()
        except Exception:
            return time.time()


def export_har(flows: list[dict]) -> dict:
    return HARExporter().export_flows(flows)


def import_har(har_data: dict | str) -> list[dict]:
    payload = json.loads(har_data) if isinstance(har_data, str) else har_data
    if not isinstance(payload, dict):
        raise TypeError("har_data must be a dict or JSON string")
    return HARImporter().import_har(payload)
