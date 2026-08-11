import base64
import os
import socket
import sys
import threading
import time
import unittest
from http.server import ThreadingHTTPServer

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from backchannel.server import DashboardHandler, WebSocketServer, flow_stream_manager, flows_stream, state, websocket_server


class StubWebSocketClient:
    def __init__(self):
        self.filters = {}
        self.messages = []
        self.closed = False

    def send_json(self, payload):
        self.messages.append(payload)
        return True

    def close(self):
        self.closed = True


class TestWebSocketServer(unittest.TestCase):
    def tearDown(self):
        with flow_stream_manager._lock:
            subscription_ids = list(flow_stream_manager._subscriptions.keys())
        for subscription_id in subscription_ids:
            flow_stream_manager.close_subscription(subscription_id)

    def setUp(self):
        self.server = WebSocketServer()

    def test_normalize_filters(self):
        normalized = self.server._normalize_filters({
            "url_contains": " api ",
            "method": "post",
            "status_min": "200",
            "status_max": "299",
            "invalid": "x",
        })
        self.assertEqual(normalized["url_contains"], "api")
        self.assertEqual(normalized["method"], "POST")
        self.assertEqual(normalized["status_min"], 200)
        self.assertEqual(normalized["status_max"], 299)
        self.assertNotIn("invalid", normalized)

    def test_matches_filters(self):
        flow = {
            "request": {"url": "https://api.example.com/users", "method": "GET"},
            "response": {"status_code": 204},
        }
        self.assertTrue(self.server._matches_filters(flow, {"url_contains": "example"}))
        self.assertTrue(self.server._matches_filters(flow, {"method": "GET"}))
        self.assertTrue(self.server._matches_filters(flow, {"status_min": 200, "status_max": 299}))
        self.assertFalse(self.server._matches_filters(flow, {"url_contains": "login"}))
        self.assertFalse(self.server._matches_filters(flow, {"method": "POST"}))
        self.assertFalse(self.server._matches_filters(flow, {"status_min": 300}))

    def test_broadcast_flow_respects_client_filters(self):
        matching_client = StubWebSocketClient()
        non_matching_client = StubWebSocketClient()
        self.server.register_client(matching_client)
        self.server.register_client(non_matching_client)
        self.server.update_client_filters(matching_client, {"url_contains": "api", "method": "POST"})
        self.server.update_client_filters(non_matching_client, {"url_contains": "auth"})

        flow = {
            "id": "flow-1",
            "ts": 1234.0,
            "client": ["127.0.0.1", 12345],
            "server": ["api.example.com", 443],
            "request": {"url": "https://api.example.com/users", "method": "POST", "host": "api.example.com", "path": "/users"},
            "response": {"status_code": 201, "reason": "Created"},
        }
        self.server.broadcast_flow(flow)

        matching_types = [message.get("type") for message in matching_client.messages]
        non_matching_types = [message.get("type") for message in non_matching_client.messages]
        self.assertIn("flow", matching_types)
        self.assertNotIn("flow", non_matching_types)
        self.assertIn("status", matching_types)
        self.assertIn("status", non_matching_types)

    def test_dashboard_handler_uses_http_1_1_for_websocket_upgrade(self):
        original_token = state.dashboard_token
        state.dashboard_token = None
        httpd = ThreadingHTTPServer(("127.0.0.1", 0), DashboardHandler)
        thread = threading.Thread(target=httpd.serve_forever, daemon=True)
        thread.start()
        try:
            host, port = httpd.server_address
            websocket_key = base64.b64encode(b"the sample nonce").decode("ascii")
            with socket.create_connection((host, port), timeout=2.0) as conn:
                conn.settimeout(2.0)
                conn.sendall(
                    (
                        "GET /ws HTTP/1.1\r\n"
                        f"Host: {host}:{port}\r\n"
                        "Upgrade: websocket\r\n"
                        "Connection: Upgrade\r\n"
                        f"Sec-WebSocket-Key: {websocket_key}\r\n"
                        "Sec-WebSocket-Version: 13\r\n"
                        "\r\n"
                    ).encode("ascii")
                )
                response = conn.recv(1024)
            self.assertIn(b"HTTP/1.1 101 Switching Protocols", response)
        finally:
            httpd.shutdown()
            httpd.server_close()
            thread.join(timeout=2.0)
            state.dashboard_token = original_token

    def test_flows_stream_opens_subscription_and_reads_live_flow(self):
        original_host = state.dashboard_host
        original_port = state.dashboard_port
        original_token = state.dashboard_token
        state.dashboard_host = "127.0.0.1"
        state.dashboard_token = "stream-token"
        httpd = ThreadingHTTPServer(("127.0.0.1", 0), DashboardHandler)
        state.dashboard_port = httpd.server_address[1]
        thread = threading.Thread(target=httpd.serve_forever, daemon=True)
        thread.start()
        subscription_id = None
        try:
            ready = False
            for _ in range(40):
                try:
                    with socket.create_connection((state.dashboard_host, state.dashboard_port), timeout=0.1):
                        ready = True
                        break
                except OSError:
                    time.sleep(0.05)
            self.assertTrue(ready)
            opened = flows_stream(method="POST", wait_seconds=1.0)
            subscription_id = opened["subscription_id"]
            deadline = time.time() + 5.0
            connected = False
            last_state = None
            while time.time() < deadline:
                current = flow_stream_manager.get_subscription(subscription_id)
                if current and current.connection_state == "connected":
                    connected = True
                    break
                if current:
                    last_state = (current.connection_state, current.last_error)
                time.sleep(0.05)
            self.assertTrue(connected, msg=str(last_state))
            flow = {
                "id": "flow-live-1",
                "ts": 1234.0,
                "client": ["127.0.0.1", 12345],
                "server": ["api.example.com", 443],
                "request": {"url": "https://api.example.com/users", "method": "POST", "host": "api.example.com", "path": "/users"},
                "response": {"status_code": 201, "reason": "Created"},
            }
            websocket_server.broadcast_flow(flow)
            result = flows_stream(subscription_id=subscription_id, wait_seconds=2.0)
            self.assertEqual(result["count"], 1)
            self.assertEqual(result["flows"][0]["id"], "flow-live-1")
            self.assertEqual(result["connection_state"], "connected")
            closed = flows_stream(subscription_id=subscription_id, close=True)
            self.assertTrue(closed["closed"])
        finally:
            if subscription_id:
                flow_stream_manager.close_subscription(subscription_id)
            httpd.shutdown()
            httpd.server_close()
            thread.join(timeout=2.0)
            state.dashboard_host = original_host
            state.dashboard_port = original_port
            state.dashboard_token = original_token


if __name__ == "__main__":
    unittest.main()
