import base64
import json
from datetime import datetime, timezone

from backchannel.har import HARExporter, HARImporter, export_har, import_har


def _flow(ts: float = 1700000000.0, flow_id: str = "flow-1") -> dict:
    return {
        "ts": ts,
        "id": flow_id,
        "client": ["127.0.0.1", 12345],
        "server": ["api.example.com", 443],
        "request": {
            "method": "POST",
            "url": "https://api.example.com/v1/items?one=1",
            "host": "api.example.com",
            "path": "/v1/items?one=1",
            "http_version": "HTTP/2",
            "headers": {
                "Content-Type": "application/json",
                "X-Test": "request-header",
            },
            "body": '{"name":"item"}',
            "body_base64": None,
        },
        "response": {
            "status_code": 201,
            "reason": "Created",
            "http_version": "HTTP/2",
            "headers": {
                "Content-Type": "application/json",
                "X-Resp": "response-header",
            },
            "body": '{"id":1}',
            "body_base64": None,
            "body_size": 8,
        },
        "timing": {"total_duration_ms": 150},
    }


def test_export_single_flow():
    flow = _flow()
    har = export_har([flow])

    assert har["log"]["version"] == "1.2"
    assert har["log"]["creator"] == {"name": "backchannel", "version": "1.0"}
    assert len(har["log"]["entries"]) == 1

    entry = har["log"]["entries"][0]
    assert entry["startedDateTime"] == datetime.fromtimestamp(flow["ts"], tz=timezone.utc).isoformat()
    assert entry["request"]["method"] == "POST"
    assert entry["request"]["url"] == flow["request"]["url"]
    assert entry["request"]["httpVersion"] == "HTTP/2"
    assert entry["response"]["status"] == 201
    assert entry["response"]["statusText"] == "Created"


def test_export_multiple_flows():
    flow1 = _flow(ts=1700000000.0, flow_id="flow-1")
    flow2 = _flow(ts=1700000001.0, flow_id="flow-2")
    flow2["request"]["url"] = "https://api.example.com/v1/other?two=2"
    har = HARExporter().export_flows([flow1, flow2])

    assert len(har["log"]["entries"]) == 2
    assert har["log"]["entries"][0]["request"]["url"] == flow1["request"]["url"]
    assert har["log"]["entries"][1]["request"]["url"] == flow2["request"]["url"]


def test_import_har_data():
    started = "2024-01-01T00:00:00+00:00"
    har_data = {
        "log": {
            "entries": [
                {
                    "startedDateTime": started,
                    "request": {
                        "method": "GET",
                        "url": "https://example.com/path?a=1",
                        "httpVersion": "HTTP/1.1",
                        "headers": [{"name": "Accept", "value": "application/json"}],
                        "queryString": [{"name": "a", "value": "1"}],
                        "bodySize": 0,
                        "postData": {"mimeType": "application/json", "text": ""},
                    },
                    "response": {
                        "status": 200,
                        "statusText": "OK",
                        "httpVersion": "HTTP/1.1",
                        "headers": [{"name": "Content-Type", "value": "application/json"}],
                        "content": {"size": 2, "mimeType": "application/json", "text": "{}"},
                        "bodySize": 2,
                    },
                }
            ]
        }
    }

    flows = HARImporter().import_har(har_data)
    assert len(flows) == 1
    flow = flows[0]
    assert len(flow["id"]) == 16
    assert flow["request"]["method"] == "GET"
    assert flow["request"]["url"] == "https://example.com/path?a=1"
    assert flow["request"]["host"] == "example.com"
    assert flow["request"]["path"] == "/path?a=1"
    assert flow["response"]["status_code"] == 200
    assert flow["response"]["reason"] == "OK"
    assert abs(flow["ts"] - datetime.fromisoformat(started).timestamp()) < 1e-6


def test_roundtrip_export_import_preserves_data():
    original = _flow()
    original["request"]["url"] = "https://api.example.com/submit?debug=1"
    original["request"]["path"] = "/submit?debug=1"
    original["request"]["body"] = '{"event":"create"}'
    original["response"]["body"] = '{"ok":true}'
    original["response"]["body_size"] = len(original["response"]["body"].encode("utf-8"))

    imported = import_har(export_har([original]))
    assert len(imported) == 1
    flow = imported[0]

    assert flow["request"]["method"] == original["request"]["method"]
    assert flow["request"]["url"] == original["request"]["url"]
    assert flow["request"]["host"] == original["request"]["host"]
    assert flow["request"]["path"] == original["request"]["path"]
    assert flow["request"]["http_version"] == original["request"]["http_version"]
    assert flow["request"]["headers"]["Content-Type"] == original["request"]["headers"]["Content-Type"]
    assert flow["request"]["body"] == original["request"]["body"]
    assert flow["response"]["status_code"] == original["response"]["status_code"]
    assert flow["response"]["reason"] == original["response"]["reason"]
    assert flow["response"]["http_version"] == original["response"]["http_version"]
    assert flow["response"]["headers"]["Content-Type"] == original["response"]["headers"]["Content-Type"]
    assert flow["response"]["body"] == original["response"]["body"]
    assert flow["response"]["body_size"] == original["response"]["body_size"]


def test_query_string_parsing():
    request = {
        "method": "GET",
        "url": "https://example.com/search?q=one&empty=&q=two",
        "headers": {},
    }
    har_request = HARExporter()._request_to_har(request)

    assert har_request["queryString"] == [
        {"name": "q", "value": "one"},
        {"name": "empty", "value": ""},
        {"name": "q", "value": "two"},
    ]


def test_empty_flows():
    exported = export_har([])
    assert exported["log"]["entries"] == []

    imported = import_har({"log": {"entries": []}})
    assert imported == []


def test_missing_optional_fields():
    flow = {"ts": 1700000000.0, "id": "minimal", "request": {"url": "https://example.com/min"}, "response": {}}
    exported = export_har([flow])
    entry = exported["log"]["entries"][0]

    assert entry["request"]["method"] == "GET"
    assert entry["request"]["httpVersion"] == "HTTP/1.1"
    assert entry["response"]["status"] == 0
    assert entry["response"]["statusText"] == ""
    assert entry["response"]["bodySize"] == 0

    imported = import_har(
        {
            "log": {
                "entries": [
                    {
                        "request": {
                            "url": "https://example.com/only-path",
                            "headers": [],
                        },
                        "response": {},
                    }
                ]
            }
        }
    )
    assert imported[0]["request"]["method"] == "GET"
    assert imported[0]["request"]["path"] == "/only-path"
    assert imported[0]["response"]["status_code"] == 0
    assert imported[0]["response"]["body_size"] == 0


def test_import_from_json_string():
    har_data = {
        "log": {
            "entries": [
                {
                    "startedDateTime": "2024-01-01T00:00:00+00:00",
                    "request": {"url": "https://example.com", "headers": []},
                    "response": {"status": 204, "headers": [], "content": {}, "bodySize": 0},
                }
            ]
        }
    }

    flows = import_har(json.dumps(har_data))
    assert len(flows) == 1
    assert flows[0]["request"]["url"] == "https://example.com"
    assert flows[0]["response"]["status_code"] == 204


def test_header_conversion_both_directions():
    flow = _flow()
    exported = export_har([flow])
    entry = exported["log"]["entries"][0]

    request_headers = {item["name"]: item["value"] for item in entry["request"]["headers"]}
    response_headers = {item["name"]: item["value"] for item in entry["response"]["headers"]}
    assert request_headers["Content-Type"] == "application/json"
    assert request_headers["X-Test"] == "request-header"
    assert response_headers["Content-Type"] == "application/json"
    assert response_headers["X-Resp"] == "response-header"

    imported = import_har(
        {
            "log": {
                "entries": [
                    {
                        "startedDateTime": "2024-01-01T00:00:00+00:00",
                        "request": {
                            "url": "https://example.com",
                            "headers": [
                                {"name": "X-One", "value": "1"},
                                {"name": "X-Two", "value": "2"},
                            ],
                        },
                        "response": {
                            "status": 200,
                            "headers": [
                                {"name": "Y-One", "value": "a"},
                                {"name": "Y-One", "value": "b"},
                            ],
                            "content": {"text": ""},
                        },
                    }
                ]
            }
        }
    )
    assert imported[0]["request"]["headers"] == {"X-One": "1", "X-Two": "2"}
    assert imported[0]["response"]["headers"] == {"Y-One": "b"}


def test_timing_estimation():
    exporter = HARExporter()
    timings = exporter._estimate_timings({"timing": {"total_duration_ms": 123.4}})
    assert timings == {
        "blocked": -1,
        "dns": -1,
        "connect": -1,
        "send": 0,
        "wait": 123,
        "receive": 0,
    }

    entry = exporter._flow_to_entry(
        {
            "ts": 1700000000.0,
            "request": {"url": "https://example.com", "headers": {}},
            "response": {},
            "timing": {"total_duration_ms": 123.4},
        }
    )
    assert entry["timings"]["wait"] == 123
    assert entry["time"] == 123


def test_roundtrip_binary_payload_via_base64():
    binary_data = bytes(range(256))
    b64 = base64.b64encode(binary_data).decode("ascii")
    flow = _flow()
    flow["response"]["body_base64"] = b64
    flow["response"]["body_size"] = len(binary_data)

    har = export_har([flow])
    entry = har["log"]["entries"][0]
    assert entry["response"]["content"]["encoding"] == "base64"
    assert entry["response"]["content"]["text"] == b64
    assert entry["response"]["content"]["size"] == 256

    imported = import_har(har)
    assert len(imported) == 1
    assert imported[0]["response"]["body_base64"] == b64
    round_tripped = base64.b64decode(imported[0]["response"]["body_base64"])
    assert round_tripped == binary_data


def test_export_preserves_truncation_metadata():
    flow = _flow()
    flow["response"]["body_truncated"] = True
    flow["response"]["body_original_bytes"] = 5000
    flow["response"]["body_sha256"] = "abc123"

    har = export_har([flow])
    content = har["log"]["entries"][0]["response"]["content"]
    assert content.get("_mcp_body_truncated") is True
    assert content.get("_mcp_body_original_bytes") == 5000
    assert content.get("_mcp_body_sha256") == "abc123"


def test_import_restores_truncation_metadata():
    har_data = {
        "log": {
            "entries": [
                {
                    "request": {"url": "https://example.com", "headers": []},
                    "response": {
                        "status": 200,
                        "headers": [],
                        "content": {
                            "text": "data",
                            "size": 4,
                            "_mcp_body_truncated": True,
                            "_mcp_body_original_bytes": 8000,
                            "_mcp_body_sha256": "deadbeef",
                        },
                        "bodySize": 4,
                    },
                }
            ]
        }
    }
    flows = import_har(har_data)
    resp = flows[0]["response"]
    assert resp.get("body_truncated") is True
    assert resp.get("body_original_bytes") == 8000
    assert resp.get("body_sha256") == "deadbeef"
