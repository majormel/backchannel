"""Tests for flow comparison functionality."""

import json
import os
import tempfile
import unittest

import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from backchannel.server import (
    _load_flow_by_id,
    _compute_diff,
    _compare_flows,
    _load_all_flows,
)


class TestLoadFlowById(unittest.TestCase):
    """Test loading a flow by ID."""

    def setUp(self):
        self.temp_dir = tempfile.mkdtemp()
        self.capture_path = os.path.join(self.temp_dir, "flows.jsonl")

        # Create test flows
        flows = [
            {"ts": 1000, "id": "flow-1", "request": {"method": "GET", "url": "https://api.test.com/users", "headers": {}}, "response": {"status_code": 200}},
            {"ts": 1001, "id": "flow-2", "request": {"method": "POST", "url": "https://api.test.com/users", "headers": {}}, "response": {"status_code": 201}},
            {"ts": 1002, "id": "flow-3", "request": {"method": "GET", "url": "https://api.test.com/posts", "headers": {}}, "response": {"status_code": 404}},
        ]

        with open(self.capture_path, "w") as f:
            for flow in flows:
                f.write(json.dumps(flow) + "\n")

    def tearDown(self):
        os.remove(self.capture_path)
        os.rmdir(self.temp_dir)

    def test_load_existing_flow(self):
        flow = _load_flow_by_id(self.capture_path, "flow-2")
        self.assertIsNotNone(flow)
        self.assertEqual(flow["id"], "flow-2")
        self.assertEqual(flow["request"]["method"], "POST")

    def test_load_nonexistent_flow(self):
        flow = _load_flow_by_id(self.capture_path, "flow-999")
        self.assertIsNone(flow)

    def test_load_from_nonexistent_file(self):
        flow = _load_flow_by_id("/nonexistent/path/flows.jsonl", "flow-1")
        self.assertIsNone(flow)


class TestComputeDiff(unittest.TestCase):
    """Test the diff computation."""

    def test_no_diff(self):
        text = "line1\nline2\nline3"
        diff = _compute_diff(text, text)
        self.assertEqual(len(diff), 0)

    def test_added_lines(self):
        text1 = "line1\nline2"
        text2 = "line1\nline2\nline3"
        diff = _compute_diff(text1, text2)
        # Should have header and added line
        self.assertTrue(any("+line3" in line for line in diff))

    def test_removed_lines(self):
        text1 = "line1\nline2\nline3"
        text2 = "line1\nline2"
        diff = _compute_diff(text1, text2)
        # Should have header and removed line
        self.assertTrue(any("-line3" in line for line in diff))

    def test_modified_lines(self):
        text1 = "line1\noriginal\nline3"
        text2 = "line1\nmodified\nline3"
        diff = _compute_diff(text1, text2)
        # Should show both removed and added
        self.assertTrue(any("-original" in line for line in diff))
        self.assertTrue(any("+modified" in line for line in diff))


class TestCompareFlows(unittest.TestCase):
    """Test flow comparison."""

    def _make_flow(self, flow_id, method="GET", url="https://api.test.com/users", status=200, body=""):
        return {
            "ts": 1000,
            "id": flow_id,
            "client": ["127.0.0.1", 12345],
            "server": ["example.com", 443],
            "request": {
                "method": method,
                "url": url,
                "http_version": "HTTP/2",
                "headers": {"Accept": "application/json", "X-Custom": "value"},
                "body": body
            },
            "response": {
                "status_code": status,
                "reason": "OK",
                "http_version": "HTTP/2",
                "headers": {"Content-Type": "application/json"},
                "body": '{"result": "success"}'
            }
        }

    def test_compare_identical_flows(self):
        flow1 = self._make_flow("flow-1")
        flow2 = self._make_flow("flow-2")

        result = _compare_flows(flow1, flow2)

        self.assertEqual(result["flow1_id"], "flow-1")
        self.assertEqual(result["flow2_id"], "flow-2")
        self.assertTrue(result["request"]["url"]["equal"])
        self.assertTrue(result["request"]["method"]["equal"])
        self.assertTrue(result["request"]["body"]["equal"])
        self.assertTrue(result["response"]["status"]["equal"])

    def test_compare_different_urls(self):
        flow1 = self._make_flow("flow-1", url="https://api.test.com/users")
        flow2 = self._make_flow("flow-2", url="https://api.test.com/posts")

        result = _compare_flows(flow1, flow2)

        self.assertFalse(result["request"]["url"]["equal"])
        self.assertEqual(result["request"]["url"]["value1"], "https://api.test.com/users")
        self.assertEqual(result["request"]["url"]["value2"], "https://api.test.com/posts")
        self.assertTrue(len(result["request"]["url"]["diff"]) > 0)

    def test_compare_different_methods(self):
        flow1 = self._make_flow("flow-1", method="GET")
        flow2 = self._make_flow("flow-2", method="POST")

        result = _compare_flows(flow1, flow2)

        self.assertFalse(result["request"]["method"]["equal"])
        self.assertEqual(result["request"]["method"]["value1"], "GET")
        self.assertEqual(result["request"]["method"]["value2"], "POST")

    def test_compare_different_status(self):
        flow1 = self._make_flow("flow-1", status=200)
        flow2 = self._make_flow("flow-2", status=404)

        result = _compare_flows(flow1, flow2)

        self.assertFalse(result["response"]["status"]["equal"])
        self.assertEqual(result["response"]["status"]["value1"], 200)
        self.assertEqual(result["response"]["status"]["value2"], 404)

    def test_compare_different_headers(self):
        flow1 = self._make_flow("flow-1")
        flow1["request"]["headers"]["Authorization"] = "Bearer token1"

        flow2 = self._make_flow("flow-2")
        flow2["request"]["headers"]["Authorization"] = "Bearer token2"

        result = _compare_flows(flow1, flow2)

        self.assertIn("Authorization", result["request"]["headers"])
        auth_header = result["request"]["headers"]["Authorization"]
        self.assertFalse(auth_header["equal"])
        self.assertEqual(auth_header["value1"], "Bearer token1")
        self.assertEqual(auth_header["value2"], "Bearer token2")

    def test_compare_missing_header(self):
        flow1 = self._make_flow("flow-1")
        flow1["request"]["headers"]["X-Custom"] = "value1"

        flow2 = self._make_flow("flow-2")
        # X-Custom header missing in flow2
        del flow2["request"]["headers"]["X-Custom"]

        result = _compare_flows(flow1, flow2)

        self.assertIn("X-Custom", result["request"]["headers"])
        custom_header = result["request"]["headers"]["X-Custom"]
        self.assertTrue(custom_header["in_flow1"])
        self.assertFalse(custom_header["in_flow2"])

    def test_compare_different_bodies(self):
        flow1 = self._make_flow("flow-1", body='{"name": "Alice"}')
        flow2 = self._make_flow("flow-2", body='{"name": "Bob"}')

        result = _compare_flows(flow1, flow2)

        self.assertFalse(result["request"]["body"]["equal"])
        self.assertTrue(len(result["request"]["body"]["diff"]) > 0)

    def test_compare_long_body_preserves_full_values(self):
        long_body = "x" * 1500
        flow1 = self._make_flow("flow-1", body=long_body)
        flow2 = self._make_flow("flow-2", body=long_body + "extra")

        result = _compare_flows(flow1, flow2)

        self.assertFalse(result["request"]["body"]["truncated"])
        self.assertEqual(result["request"]["body"]["value1"], long_body)
        self.assertEqual(result["request"]["body"]["value2"], long_body + "extra")


if __name__ == "__main__":
    unittest.main()
