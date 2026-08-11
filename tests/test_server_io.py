import base64
import json
import os
from pathlib import Path
import sys
import tempfile
import threading
import time
import types
import unittest
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import patch
import urllib.error

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from backchannel.server import (
    MobilePairingHandler,
    _bytes_response,
    _client_request,
    _codex_flow_context,
    _create_mobile_pairing,
    _find_conflicting_orphan_mitmdumps,
    _flow_part_body_bytes,
    _flow_part_body_text,
    _header_value,
    _json_response,
    _load_all_flows,
    _load_flow_by_id,
    _load_flows_by_ids,
    _load_recent_window_flows,
    _load_tail_flows,
    _replay_http_request,
    _search_raw_bytes,
    get_mobile_setup_qr,
    mitm_start,
    mitm_status,
    recent_flows_cache,
    state,
)


class ClosableIterator:
    def __init__(self, values):
        self._iterator = iter(values)
        self.closed = False

    def __iter__(self):
        return self

    def __next__(self):
        return next(self._iterator)

    def close(self):
        self.closed = True


class DummyWriter:
    def __init__(self, fail_on_write=False):
        self.fail_on_write = fail_on_write
        self.writes = []

    def write(self, data):
        if self.fail_on_write:
            raise BrokenPipeError(32, "Broken pipe")
        self.writes.append(data)


class DummyHandler:
    def __init__(self, fail_stage=None):
        self.fail_stage = fail_stage
        self.close_connection = False
        self.status = None
        self.sent_headers = []
        self.wfile = DummyWriter(fail_on_write=fail_stage == "write")

    def send_response(self, status):
        self.status = status

    def send_header(self, key, value):
        self.sent_headers.append((key, value))

    def end_headers(self):
        if self.fail_stage == "headers":
            raise BrokenPipeError(32, "Broken pipe")


class DummyProc:
    def __init__(self, pid=4321):
        self.pid = pid

    def poll(self):
        return None

    def terminate(self):
        return None

    def wait(self, timeout=None):
        return 0

    def kill(self):
        return None


class FakeHttpResponse:
    def __init__(self, payload, status=200):
        self.payload = payload
        self.status = status
        self.closed = False

    def read(self):
        return self.payload

    def close(self):
        self.closed = True

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        self.close()
        return False


class FakeReplayResponse:
    def __init__(self, payload: bytes, status: int = 200, reason: str = "OK", headers: dict | None = None):
        self._payload = payload
        self.status = status
        self.reason = reason
        self.headers = headers or {"Content-Type": "text/plain"}
        self.read_calls = []

    def read(self, amount=None):
        self.read_calls.append(amount)
        if amount is None:
            return self._payload
        return self._payload[:amount]

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False


class TestIteratorCleanup(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.mkdtemp()
        self.capture_path = os.path.join(self.temp_dir, "flows.jsonl")
        with open(self.capture_path, "w", encoding="utf-8") as handle:
            handle.write('{"id":"placeholder"}\n')

        self.forward_lines = [
            json.dumps({"id": "flow-1", "request": {"method": "GET", "url": "https://api.test.com/one"}, "response": {"status_code": 200}}).encode("utf-8"),
            json.dumps({"id": "flow-2", "request": {"method": "POST", "url": "https://api.test.com/two"}, "response": {"status_code": 201}}).encode("utf-8"),
        ]
        self.reverse_lines = list(reversed(self.forward_lines))

    def tearDown(self):
        recent_flows_cache.path = None
        recent_flows_cache.mtime_ns = None
        recent_flows_cache.size = None
        recent_flows_cache.max_items = 0
        recent_flows_cache.max_bytes = 0
        recent_flows_cache.flows = None
        os.remove(self.capture_path)
        os.rmdir(self.temp_dir)

    def test_reverse_iterators_close_after_early_exit(self):
        cases = [
            lambda: _load_recent_window_flows(self.capture_path, max_items=1, max_bytes=1024),
            lambda: _load_tail_flows(self.capture_path, 1, None, None, None, None),
            lambda: _load_flow_by_id(self.capture_path, "flow-2"),
            lambda: _load_flows_by_ids(self.capture_path, ["flow-2"]),
        ]

        for case in cases:
            iterator = ClosableIterator(self.reverse_lines)
            with patch("backchannel.server._iter_lines_reverse", return_value=iterator):
                case()
            self.assertTrue(iterator.closed)

    def test_forward_iterators_close_after_early_exit(self):
        iterator = ClosableIterator(self.forward_lines)
        with patch("backchannel.server._iter_lines_forward", return_value=iterator):
            _load_all_flows(self.capture_path, None, None, None, None, limit=1)
        self.assertTrue(iterator.closed)

    def test_recent_window_requests_share_single_refresh(self):
        starts = threading.Barrier(4)
        iterator_calls = 0
        iterator_lock = threading.Lock()

        def slow_reverse(_path):
            nonlocal iterator_calls
            with iterator_lock:
                iterator_calls += 1
            time.sleep(0.2)
            return ClosableIterator(self.reverse_lines)

        def load_recent(_index):
            starts.wait()
            return _load_recent_window_flows(self.capture_path, max_items=1, max_bytes=1024)

        with patch("backchannel.server._iter_lines_reverse", side_effect=slow_reverse):
            with ThreadPoolExecutor(max_workers=4) as executor:
                results = list(executor.map(load_recent, range(4)))

        self.assertEqual(iterator_calls, 1)
        self.assertEqual([result[0]["id"] for result in results], ["flow-2"] * 4)


class TestResponseWrites(unittest.TestCase):
    def test_json_response_swallows_broken_pipe_during_headers(self):
        handler = DummyHandler(fail_stage="headers")
        _json_response(handler, {"ok": True})
        self.assertTrue(handler.close_connection)

    def test_json_response_swallows_broken_pipe_during_body_write(self):
        handler = DummyHandler(fail_stage="write")
        _json_response(handler, {"ok": True})
        self.assertTrue(handler.close_connection)

    def test_bytes_response_swallows_broken_pipe_during_body_write(self):
        handler = DummyHandler(fail_stage="write")
        _bytes_response(handler, b"hello")
        self.assertTrue(handler.close_connection)


class TestMobileSetupQr(unittest.TestCase):
    def test_pairing_profile_is_served_inline_for_ios_handoff(self):
        pairing = types.SimpleNamespace(host="10.0.0.2", proxy_port=8080, wifi_ssid="Studio WiFi")
        handler = types.SimpleNamespace(path="/pair/pairing-token", client_address=("10.0.0.8", 51234))

        with patch("backchannel.server.mobile_setup.mobile_pairings.get", return_value=pairing):
            with patch("backchannel.server.mobile_setup.mobile_pairings.get_active", return_value=pairing):
                with patch("backchannel.server.mobile_setup.read_cert_pem", return_value="certificate"):
                    with patch("backchannel.server.mobile_setup.generate_apple_profile", return_value="profile"):
                        with patch("backchannel.server.mobile_setup.mobile_pairings.mark_downloaded"):
                            with patch("backchannel.server._bytes_response") as response:
                                MobilePairingHandler.do_GET(handler)

        response.assert_called_once()
        self.assertEqual(response.call_args.kwargs["content_type"], "application/x-apple-aspen-config")
        self.assertEqual(
            response.call_args.kwargs["extra_headers"]["Content-Disposition"],
            'inline; filename="backchannel.mobileconfig"',
        )

    def test_get_mobile_setup_qr_prefers_manual_ios_instructions_and_exposes_wifi_template(self):
        original_process = state.process
        original_listen_port = state.listen_port
        original_dashboard_port = state.dashboard_port
        original_dashboard_token = state.dashboard_token
        state.process = DummyProc()
        state.listen_port = 9090
        state.dashboard_port = 8800
        state.dashboard_token = "secret-token"
        try:
            with patch("backchannel.server.mobile_setup.get_lan_ip", return_value="10.0.0.2"):
                with patch("backchannel.server.mobile_setup.get_mitmproxy_cert_path", return_value=Path("/tmp/cert.pem")):
                    payload = get_mobile_setup_qr()
        finally:
            state.process = original_process
            state.listen_port = original_listen_port
            state.dashboard_port = original_dashboard_port
            state.dashboard_token = original_dashboard_token

        self.assertEqual(payload["profile_url"], "http://10.0.0.2:8800/mobileconfig")
        self.assertEqual(
            payload["wifi_profile_url_template"],
            "http://10.0.0.2:8800/mobileconfig?mode=wifi&ssid={ssid}",
        )
        self.assertTrue(payload["cert_available"])
        self.assertIn("Set WiFi proxy to 10.0.0.2:9090", payload["instructions"]["ios"][0])
        self.assertIn("manual", " ".join(payload["instructions"]["ios"]).lower())
        self.assertIn("Files > Downloads", " ".join(payload["instructions"]["ios"]))
        self.assertIn("Profile Downloaded", " ".join(payload["instructions"]["ios"]))
        self.assertIn("{ssid}", payload["instructions"]["ios"][-1])

    def test_create_mobile_pairing_uses_short_lived_profile_url_without_dashboard_token(self):
        original_process = state.process
        original_listen_host = state.listen_host
        original_listen_port = state.listen_port
        original_dashboard_token = state.dashboard_token
        state.process = DummyProc()
        state.listen_host = "0.0.0.0"
        state.listen_port = 9090
        state.dashboard_token = "dashboard-secret"
        fake_httpd = types.SimpleNamespace(server_address=("0.0.0.0", 49152))
        try:
            with patch("backchannel.server.mobile_setup.get_mitmproxy_cert_path", return_value=Path("/tmp/cert.pem")):
                with patch("backchannel.server.mobile_setup.get_lan_ip", return_value="10.0.0.2"):
                    with patch("backchannel.server._ensure_mobile_pairing_server", return_value=fake_httpd):
                        with patch("backchannel.server.mobile_setup.generate_qr_png", return_value=b"png"):
                            payload, status_code = _create_mobile_pairing("Studio WiFi")
        finally:
            state.process = original_process
            state.listen_host = original_listen_host
            state.listen_port = original_listen_port
            state.dashboard_token = original_dashboard_token

        self.assertEqual(status_code, 200)
        self.assertEqual(payload["wifi_ssid"], "Studio WiFi")
        self.assertEqual(payload["proxy_port"], 9090)
        self.assertTrue(payload["profile_url"].startswith("http://10.0.0.2:49152/pair/"))
        self.assertNotIn("dashboard-secret", payload["profile_url"])
        self.assertEqual(payload["qr_image_data_url"], "data:image/png;base64,cG5n")
        self.assertTrue(payload["proxy_ready"])


class TestCodexFlowContext(unittest.TestCase):
    def test_sensitive_headers_and_query_values_are_redacted(self):
        flow = {
            "id": "flow-1",
            "request": {
                "method": "GET",
                "url": "https://example.test/account?token=secret&view=full",
                "headers": {"Authorization": "Bearer secret", "Accept": "application/json"},
                "body": "request secret",
            },
            "response": {
                "status_code": 200,
                "headers": {"Set-Cookie": "session=secret", "Content-Type": "application/json"},
                "body": "response secret",
            },
        }

        context = _codex_flow_context(flow, include_bodies=False)

        self.assertIn("token=%5BREDACTED%5D", context["request"]["url"])
        self.assertIn("view=full", context["request"]["url"])
        self.assertEqual(context["request"]["headers"]["Authorization"], "[REDACTED]")
        self.assertEqual(context["response"]["headers"]["Set-Cookie"], "[REDACTED]")
        self.assertNotIn("body", context["request"])
        self.assertNotIn("body", context["response"])

    def test_bodies_are_only_included_when_requested(self):
        flow = {
            "id": "flow-1",
            "request": {"method": "POST", "url": "https://example.test", "headers": {}, "body": "request body"},
            "response": {"status_code": 200, "headers": {}, "body": "response body"},
        }

        context = _codex_flow_context(flow, include_bodies=True)

        self.assertEqual(context["request"]["body"], "request body")
        self.assertEqual(context["response"]["body"], "response body")


class TestFlowBodyDecoding(unittest.TestCase):
    def test_flow_part_body_bytes_prefers_base64(self):
        raw, error = _flow_part_body_bytes({"body": "plain text", "body_base64": "aGVsbG8="})
        self.assertIsNone(error)
        self.assertEqual(raw, b"hello")

    def test_flow_part_body_bytes_uses_text_body_when_base64_missing(self):
        raw, error = _flow_part_body_bytes({"body": "plain text"})
        self.assertIsNone(error)
        self.assertEqual(raw, b"plain text")

    def test_flow_part_body_bytes_returns_error_for_invalid_base64(self):
        raw, error = _flow_part_body_bytes({"body_base64": "!!!"})
        self.assertIsNone(raw)
        self.assertEqual(error, "could not base64-decode body")

    def test_flow_part_body_text_uses_base64_first(self):
        text = _flow_part_body_text({"body": "garbage", "body_base64": "aGVsbG8="})
        self.assertEqual(text, "hello")

    def test_flow_part_body_text_falls_back_to_body(self):
        text = _flow_part_body_text({"body": "plain text"})
        self.assertEqual(text, "plain text")

    def test_header_value_matches_case_insensitive(self):
        headers = {"Content-Type": "application/json"}
        self.assertEqual(_header_value(headers, "content-type"), "application/json")


class TestReplayResponseLimits(unittest.TestCase):
    def test_replay_request_reads_full_response_when_limit_is_zero(self):
        payload = b"0123456789"
        response = FakeReplayResponse(payload)
        with patch("urllib.request.urlopen", return_value=response):
            result = _replay_http_request(
                method="GET",
                url="https://api.test.com/data",
                headers={},
                body=None,
                body_base64=None,
                timeout_seconds=5.0,
                verify_tls=True,
                max_response_bytes=0,
            )
        self.assertTrue(result["ok"])
        self.assertEqual(response.read_calls, [None])
        self.assertEqual(result["response"]["body"], "0123456789")
        self.assertEqual(result["response"]["body_base64"], base64.b64encode(payload).decode("ascii"))

    def test_replay_request_honors_positive_response_limit(self):
        payload = b"abcdefghij"
        response = FakeReplayResponse(payload)
        with patch("urllib.request.urlopen", return_value=response):
            result = _replay_http_request(
                method="GET",
                url="https://api.test.com/data",
                headers={},
                body=None,
                body_base64=None,
                timeout_seconds=5.0,
                verify_tls=True,
                max_response_bytes=4,
            )
        self.assertTrue(result["ok"])
        self.assertEqual(response.read_calls, [4])
        self.assertEqual(result["response"]["body"], "abcd")
        self.assertEqual(result["response"]["body_base64"], base64.b64encode(payload[:4]).decode("ascii"))


class TestMitmStartCleanup(unittest.TestCase):
    def setUp(self):
        self.original_state = {
            "process": state.process,
            "capture_path": state.capture_path,
            "listen_host": state.listen_host,
            "listen_port": state.listen_port,
            "mode": state.mode,
            "max_body_bytes": state.max_body_bytes,
        }
        state.process = None
        state.capture_path = None
        state.listen_host = None
        state.listen_port = None
        state.mode = None
        state.max_body_bytes = None

    def tearDown(self):
        state.process = self.original_state["process"]
        state.capture_path = self.original_state["capture_path"]
        state.listen_host = self.original_state["listen_host"]
        state.listen_port = self.original_state["listen_port"]
        state.mode = self.original_state["mode"]
        state.max_body_bytes = self.original_state["max_body_bytes"]

    def test_find_conflicting_orphans_matches_requested_endpoint(self):
        orphans = [
            {"pid": 101, "command": "a", "listen_host": "0.0.0.0", "listen_port": 8080},
            {"pid": 102, "command": "b", "listen_host": "127.0.0.1", "listen_port": 8080},
            {"pid": 103, "command": "c", "listen_host": "127.0.0.1", "listen_port": 9090},
        ]
        with patch("backchannel.server._list_orphan_mitmdumps", return_value=orphans):
            conflicts = _find_conflicting_orphan_mitmdumps("127.0.0.1", 8080)
        self.assertEqual([item["pid"] for item in conflicts], [101, 102])

    def test_mitm_start_cleans_conflicting_orphans_before_spawn(self):
        conflicting = {"pid": 201, "command": "mitmdump a", "listen_host": "127.0.0.1", "listen_port": 8080}
        remaining = {"pid": 202, "command": "mitmdump b", "listen_host": "127.0.0.1", "listen_port": 9090}
        with patch("shutil.which", return_value="/usr/bin/mitmdump"):
            with patch("backchannel.server._list_orphan_mitmdumps", side_effect=[[conflicting, remaining], [remaining]]):
                with patch("backchannel.server._terminate_pid", return_value={"killed": True, "pid": 201}) as terminate_pid:
                    with patch("subprocess.Popen", return_value=DummyProc(pid=303)) as popen:
                        with patch("backchannel.server._wait_for_proxy", return_value=(True, None)):
                            with patch("backchannel.server.mobile_setup.get_lan_ip", return_value="10.0.0.7"):
                                result = mitm_start(listen_host="127.0.0.1", listen_port=8080)
        terminate_pid.assert_called_once_with(201)
        self.assertTrue(result["running"])
        self.assertEqual(result["pid"], 303)
        self.assertEqual(result["lan_ip"], "10.0.0.7")
        self.assertEqual([item["pid"] for item in result["cleaned_orphans"]], [201])
        self.assertEqual(result["orphan_count"], 1)
        self.assertEqual([item["pid"] for item in result["orphan_processes"]], [202])
        self.assertEqual(popen.call_args.args[0][0], "mitmdump")

    def test_mitm_status_exposes_lan_ip_when_stopped(self):
        state.process = None
        with patch("backchannel.server.mobile_setup.get_lan_ip", return_value="10.0.0.8"):
            with patch("backchannel.server._list_orphan_mitmdumps", return_value=[]):
                result = mitm_status()
        self.assertFalse(result["running"])
        self.assertEqual(result["lan_ip"], "10.0.0.8")

    def test_mitm_status_exposes_lan_ip_when_running(self):
        state.process = DummyProc(pid=404)
        state.listen_host = "0.0.0.0"
        state.listen_port = 8080
        with patch("backchannel.server.mobile_setup.get_lan_ip", return_value="10.0.0.9"):
            with patch("backchannel.server._list_orphan_mitmdumps", return_value=[]):
                result = mitm_status()
        self.assertTrue(result["running"])
        self.assertEqual(result["pid"], 404)
        self.assertEqual(result["lan_ip"], "10.0.0.9")

    def test_mitm_status_preserves_loopback_fallback(self):
        state.process = None
        with patch("backchannel.server.mobile_setup.get_lan_ip", return_value="127.0.0.1"):
            with patch("backchannel.server._list_orphan_mitmdumps", return_value=[]):
                result = mitm_status()
        self.assertEqual(result["lan_ip"], "127.0.0.1")

    def test_mitm_start_returns_error_when_conflicting_orphan_cannot_be_cleaned(self):
        conflicting = {"pid": 211, "command": "mitmdump a", "listen_host": "127.0.0.1", "listen_port": 8080}
        with patch("shutil.which", return_value="/usr/bin/mitmdump"):
            with patch("backchannel.server._list_orphan_mitmdumps", side_effect=[[conflicting], [conflicting]]):
                with patch("backchannel.server._terminate_pid", return_value={"killed": False, "pid": 211, "error": "permission denied"}) as terminate_pid:
                    with patch("subprocess.Popen") as popen:
                        result = mitm_start(listen_host="127.0.0.1", listen_port=8080)
        terminate_pid.assert_called_once_with(211)
        popen.assert_not_called()
        self.assertFalse(result["running"])
        self.assertIn("failed to clean 1 conflicting orphan process", result["error"])
        self.assertEqual(result["cleanup_failed"][0]["pid"], 211)
        self.assertEqual(result["orphan_count"], 1)


class TestClientConfigRefresh(unittest.TestCase):
    def setUp(self):
        self.original_state = {
            "process": state.process,
            "capture_path": state.capture_path,
            "listen_host": state.listen_host,
            "listen_port": state.listen_port,
            "mode": state.mode,
            "max_body_bytes": state.max_body_bytes,
        }
        self.original_client_config = __import__("backchannel.server", fromlist=["client_config"]).client_config

    def tearDown(self):
        module = __import__("backchannel.server", fromlist=["client_config"])
        module.client_config = self.original_client_config
        state.process = self.original_state["process"]
        state.capture_path = self.original_state["capture_path"]
        state.listen_host = self.original_state["listen_host"]
        state.listen_port = self.original_state["listen_port"]
        state.mode = self.original_state["mode"]
        state.max_body_bytes = self.original_state["max_body_bytes"]

    def test_client_request_refreshes_after_transport_failure(self):
        module = __import__("backchannel.server", fromlist=["ClientConfig"])
        module.client_config = module.ClientConfig("127.0.0.1", 8899, "old-token", 1.0, allow_state_refresh=True)
        requests = []

        def fake_urlopen(req, timeout=0):
            requests.append((req.full_url, req.headers.get("X-mcp-token")))
            if len(requests) == 1:
                raise urllib.error.URLError("[Errno 61] Connection refused")
            return FakeHttpResponse(b'{"running": true}')

        with patch("backchannel.server._read_dashboard_state", return_value={"host": "127.0.0.1", "port": 8800, "token": "new-token"}):
            with patch("urllib.request.urlopen", side_effect=fake_urlopen):
                result = _client_request("GET", "/api/status")

        self.assertEqual(result, {"running": True})
        self.assertEqual(requests[0][0], "http://127.0.0.1:8899/api/status")
        self.assertEqual(requests[1][0], "http://127.0.0.1:8800/api/status")
        self.assertEqual(requests[1][1], "new-token")

    def test_client_request_refreshes_after_unauthorized_response(self):
        module = __import__("backchannel.server", fromlist=["ClientConfig"])
        module.client_config = module.ClientConfig("127.0.0.1", 8800, "old-token", 1.0, allow_state_refresh=True)
        requests = []

        def fake_urlopen(req, timeout=0):
            requests.append((req.full_url, req.headers.get("X-mcp-token")))
            if len(requests) == 1:
                raise urllib.error.HTTPError(req.full_url, 401, "Unauthorized", hdrs=None, fp=FakeHttpResponse(b'{"error": "unauthorized"}', status=401))
            return FakeHttpResponse(b'{"running": true}')

        with patch("backchannel.server._read_dashboard_state", return_value={"host": "127.0.0.1", "port": 8800, "token": "new-token"}):
            with patch("urllib.request.urlopen", side_effect=fake_urlopen):
                result = _client_request("GET", "/api/status")

        self.assertEqual(result, {"running": True})
        self.assertEqual(requests[0][1], "old-token")
        self.assertEqual(requests[1][1], "new-token")


class TestSearchRawBytes(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.mkdtemp()
        self.capture_path = os.path.join(self.temp_dir, "flows.jsonl")

    def tearDown(self):
        try:
            os.remove(self.capture_path)
        except OSError:
            pass
        try:
            os.rmdir(self.temp_dir)
        except OSError:
            pass

    def _write_flow(self, flow_id, body_bytes, headers=None):
        import base64 as b64
        b64_body = b64.b64encode(body_bytes).decode("ascii")
        flow = {
            "id": flow_id,
            "ts": 1700000000.0,
            "request": {"method": "GET", "url": "https://example.com", "headers": {}},
            "response": {
                "status_code": 200,
                "headers": headers or {},
                "body": body_bytes.decode("utf-8", errors="replace"),
                "body_base64": b64_body,
                "body_size": len(body_bytes),
            },
        }
        with open(self.capture_path, "a", encoding="utf-8") as f:
            f.write(json.dumps(flow, ensure_ascii=True) + "\n")

    def test_search_raw_bytes_finds_known_pattern(self):
        needle = bytes.fromhex("17f6a8c73d9e5089")
        body = b"\x00" * 20 + needle + b"\x00" * 20
        self._write_flow("flow-search-1", body)
        with patch("backchannel.server._get_capture_path", return_value=self.capture_path):
            result = _search_raw_bytes("flow-search-1", "response", "17f6a8c73d9e5089")
        self.assertEqual(result["match_count"], 1)
        self.assertEqual(result["matches"][0]["offset"], 20)
        self.assertIn("17f6a8c73d9e5089", result["matches"][0]["hex_window"])

    def test_search_raw_bytes_with_gzip_body(self):
        import gzip as gz
        needle = bytes.fromhex("b13829403d9e5089")
        raw = b"\xff" * 10 + needle + b"\xff" * 10
        compressed = gz.compress(raw)
        self._write_flow("flow-gzip-1", compressed, headers={"Content-Encoding": "gzip"})
        with patch("backchannel.server._get_capture_path", return_value=self.capture_path):
            result = _search_raw_bytes("flow-gzip-1", "response", "b13829403d9e5089")
        self.assertEqual(result["match_count"], 1)
        self.assertEqual(result["matches"][0]["offset"], 10)

    def test_search_raw_bytes_no_match(self):
        body = b"\x00" * 100
        self._write_flow("flow-nomatch-1", body)
        with patch("backchannel.server._get_capture_path", return_value=self.capture_path):
            result = _search_raw_bytes("flow-nomatch-1", "response", "deadbeefcafe")
        self.assertEqual(result["match_count"], 0)
        self.assertEqual(result["matches"], [])


if __name__ == "__main__":
    unittest.main()
