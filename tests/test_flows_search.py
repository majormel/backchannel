"""Tests for flows search functionality."""

import json
import os
import tempfile
import unittest

import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from backchannel.server import _matches_filters, _load_tail_flows, _load_all_flows, _load_recent_window_flows, _summarize_flow, flows_search, state


class TestMatchesFilters(unittest.TestCase):
    """Test the _matches_filters function."""

    def _make_flow(self, url="https://example.com/api/test", method="GET", status=200, ts=1000):
        return {
            "ts": ts,
            "id": "test-flow-1",
            "client": ["127.0.0.1", 12345],
            "server": ["example.com", 443],
            "request": {
                "method": method,
                "url": url,
                "http_version": "HTTP/2",
                "headers": {"Accept": "application/json", "X-Custom": "test-value"},
                "body": '{"key": "value"}'
            },
            "response": {
                "status_code": status,
                "reason": "OK",
                "http_version": "HTTP/2",
                "headers": {"Content-Type": "application/json"},
                "body": '{"result": "success"}'
            }
        }

    def test_url_contains_match(self):
        flow = self._make_flow(url="https://api.example.com/users")
        self.assertTrue(_matches_filters(flow, "api.example", None, None, None))
        self.assertFalse(_matches_filters(flow, "notfound", None, None, None))

    def test_method_match(self):
        flow = self._make_flow(method="POST")
        self.assertTrue(_matches_filters(flow, None, "post", None, None))
        self.assertFalse(_matches_filters(flow, None, "get", None, None))

    def test_status_range(self):
        flow = self._make_flow(status=404)
        self.assertTrue(_matches_filters(flow, None, None, 400, 499))
        self.assertFalse(_matches_filters(flow, None, None, 200, 299))

    def test_query_search_url(self):
        flow = self._make_flow(url="https://api.example.com/users/123")
        self.assertTrue(_matches_filters(flow, None, None, None, None, query="users"))
        self.assertFalse(_matches_filters(flow, None, None, None, None, query="posts"))

    def test_query_search_method(self):
        flow = self._make_flow(method="DELETE")
        self.assertTrue(_matches_filters(flow, None, None, None, None, query="delete"))
        self.assertFalse(_matches_filters(flow, None, None, None, None, query="get"))

    def test_query_search_headers(self):
        flow = self._make_flow()
        self.assertTrue(_matches_filters(flow, None, None, None, None, query="application/json"))
        self.assertTrue(_matches_filters(flow, None, None, None, None, query="X-Custom"))
        self.assertFalse(_matches_filters(flow, None, None, None, None, query="Authorization"))

    def test_query_search_body(self):
        flow = self._make_flow()
        self.assertTrue(_matches_filters(flow, None, None, None, None, query='"key": "value"'))
        self.assertFalse(_matches_filters(flow, None, None, None, None, query="not-in-body"))

    def test_time_range(self):
        flow = self._make_flow(ts=1500)
        self.assertTrue(_matches_filters(flow, None, None, None, None, time_from=1000, time_to=2000))
        self.assertFalse(_matches_filters(flow, None, None, None, None, time_from=2000, time_to=3000))

    def test_combined_filters(self):
        flow = self._make_flow(url="https://api.example.com/users", method="GET", status=200)
        self.assertTrue(_matches_filters(flow, "api.example", "get", 200, 299))
        self.assertFalse(_matches_filters(flow, "api.example", "post", 200, 299))


class TestLoadFlows(unittest.TestCase):
    """Test the _load_tail_flows and _load_all_flows functions."""

    def setUp(self):
        self.temp_dir = tempfile.mkdtemp()
        self.capture_path = os.path.join(self.temp_dir, "flows.jsonl")

        # Create test flows
        flows = [
            {"ts": 1000, "id": "flow-1", "request": {"method": "GET", "url": "https://api.test.com/users", "headers": {}}, "response": {"status_code": 200}},
            {"ts": 1001, "id": "flow-2", "request": {"method": "POST", "url": "https://api.test.com/users", "headers": {}}, "response": {"status_code": 201}},
            {"ts": 1002, "id": "flow-3", "request": {"method": "GET", "url": "https://api.test.com/posts", "headers": {}}, "response": {"status_code": 404}},
            {"ts": 1003, "id": "flow-4", "request": {"method": "DELETE", "url": "https://api.test.com/users/1", "headers": {}}, "response": {"status_code": 204}},
        ]

        with open(self.capture_path, "w") as f:
            for flow in flows:
                f.write(json.dumps(flow) + "\n")

    def tearDown(self):
        os.remove(self.capture_path)
        os.rmdir(self.temp_dir)

    def test_load_tail_basic(self):
        results = _load_tail_flows(self.capture_path, 2, None, None, None, None)
        self.assertEqual(len(results), 2)
        self.assertEqual(results[0]["id"], "flow-3")
        self.assertEqual(results[1]["id"], "flow-4")

    def test_load_tail_with_query(self):
        results = _load_tail_flows(self.capture_path, 10, None, None, None, None, query="users")
        self.assertEqual(len(results), 3)
        self.assertTrue(all("users" in r["request"]["url"] for r in results))

    def test_load_tail_with_method_filter(self):
        results = _load_tail_flows(self.capture_path, 10, None, "GET", None, None)
        self.assertEqual(len(results), 2)
        self.assertTrue(all(r["request"]["method"] == "GET" for r in results))

    def test_load_all_with_query(self):
        results = _load_all_flows(self.capture_path, None, None, None, None, 100, False, "posts", None, None)
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["id"], "flow-3")

    def test_load_all_with_time_range(self):
        results = _load_all_flows(self.capture_path, None, None, None, None, 100, False, None, 1001, 1002)
        self.assertEqual(len(results), 2)
        self.assertEqual(results[0]["id"], "flow-2")
        self.assertEqual(results[1]["id"], "flow-3")

    def test_load_recent_window_flows_returns_recent_subset(self):
        results = _load_recent_window_flows(self.capture_path, max_items=2, max_bytes=1024)
        self.assertEqual(len(results), 2)
        self.assertEqual(results[0]["id"], "flow-3")
        self.assertEqual(results[1]["id"], "flow-4")

    def test_summarize_flow_omits_bodies(self):
        flow = {
            "ts": 1000,
            "id": "flow-summary",
            "client": ["127.0.0.1", 12345],
            "server": ["example.com", 443],
            "request": {
                "method": "GET",
                "url": "https://example.com/api/test",
                "body": '{"hello": "world"}',
            },
            "response": {
                "status_code": 200,
                "reason": "OK",
                "body": '{"ok": true}',
                "body_size": 14,
            },
        }
        summary = _summarize_flow(flow)
        self.assertEqual(summary["request"]["method"], "GET")
        self.assertEqual(summary["response"]["status_code"], 200)
        self.assertEqual(summary["response"]["body_size"], 14)
        self.assertNotIn("body", summary["request"])
        self.assertNotIn("body", summary["response"])


class TestFlowsSearchTool(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.mkdtemp()
        self.capture_path = os.path.join(self.temp_dir, "flows.jsonl")
        flows = [
            {"ts": 1000, "id": "flow-1", "request": {"method": "GET", "url": "https://api.test.com/users", "headers": {}}, "response": {"status_code": 200, "body_size": 12}},
            {"ts": 1001, "id": "flow-2", "request": {"method": "POST", "url": "https://api.test.com/posts", "headers": {}}, "response": {"status_code": 201, "body_size": 11}},
            {"ts": 1002, "id": "flow-3", "request": {"method": "GET", "url": "https://api.test.com/users/1", "headers": {}}, "response": {"status_code": 404, "body_size": 1}},
        ]
        with open(self.capture_path, "w", encoding="utf-8") as handle:
            for flow in flows:
                handle.write(json.dumps(flow, ensure_ascii=True) + "\n")
        self.original_capture_path = state.capture_path
        state.capture_path = self.capture_path

    def tearDown(self):
        state.capture_path = self.original_capture_path
        db_path = os.path.splitext(self.capture_path)[0] + ".db"
        for path in (db_path, db_path + "-wal", db_path + "-shm"):
            if os.path.exists(path):
                os.remove(path)
        os.remove(self.capture_path)
        os.rmdir(self.temp_dir)

    def test_flows_search_supports_iso_date_filters(self):
        result = flows_search(query="users", date_from="1970-01-01T00:16:41Z", date_to="1970-01-01T00:16:42Z", limit=10)
        self.assertEqual(result["count"], 1)
        self.assertEqual(result["flows"][0]["id"], "flow-3")


if __name__ == "__main__":
    unittest.main()
