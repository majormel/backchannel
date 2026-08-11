"""Tests for flow export functionality."""

import json
import os
import tempfile
import unittest

import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from backchannel.server import (
    _load_flows_by_ids,
    _format_flows_as_json,
    _format_flows_as_jsonl,
    _format_flows_as_curl,
    _flow_to_curl,
    flows_export,
)


class TestLoadFlowsByIds(unittest.TestCase):
    """Test the _load_flows_by_ids function."""

    def setUp(self):
        self.temp_dir = tempfile.mkdtemp()
        self.capture_path = os.path.join(self.temp_dir, "flows.jsonl")

        self.flows = [
            {
                "ts": 1000,
                "id": "flow-1",
                "client": ["127.0.0.1", 12345],
                "server": ["example.com", 443],
                "request": {
                    "method": "GET",
                    "url": "https://api.test.com/users",
                    "http_version": "HTTP/2",
                    "headers": {"Accept": "application/json"},
                    "body": ""
                },
                "response": {
                    "status_code": 200,
                    "reason": "OK",
                    "http_version": "HTTP/2",
                    "headers": {"Content-Type": "application/json"},
                    "body": '{"users": []}'
                }
            },
            {
                "ts": 1001,
                "id": "flow-2",
                "client": ["127.0.0.1", 12346],
                "server": ["example.com", 443],
                "request": {
                    "method": "POST",
                    "url": "https://api.test.com/users",
                    "http_version": "HTTP/2",
                    "headers": {"Content-Type": "application/json"},
                    "body": '{"name": "Alice"}'
                },
                "response": {
                    "status_code": 201,
                    "reason": "Created",
                    "http_version": "HTTP/2",
                    "headers": {"Content-Type": "application/json"},
                    "body": '{"id": 1, "name": "Alice"}'
                }
            },
            {
                "ts": 1002,
                "id": "flow-3",
                "client": ["127.0.0.1", 12347],
                "server": ["example.com", 443],
                "request": {
                    "method": "DELETE",
                    "url": "https://api.test.com/users/1",
                    "http_version": "HTTP/2",
                    "headers": {},
                    "body": ""
                },
                "response": {
                    "status_code": 204,
                    "reason": "No Content",
                    "http_version": "HTTP/2",
                    "headers": {},
                    "body": ""
                }
            },
        ]

        with open(self.capture_path, "w") as f:
            for flow in self.flows:
                f.write(json.dumps(flow) + "\n")

    def tearDown(self):
        os.remove(self.capture_path)
        os.rmdir(self.temp_dir)

    def test_load_single_flow(self):
        results = _load_flows_by_ids(self.capture_path, ["flow-2"])
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["id"], "flow-2")
        self.assertEqual(results[0]["request"]["method"], "POST")

    def test_load_multiple_flows(self):
        results = _load_flows_by_ids(self.capture_path, ["flow-1", "flow-3"])
        self.assertEqual(len(results), 2)
        ids = [f["id"] for f in results]
        self.assertIn("flow-1", ids)
        self.assertIn("flow-3", ids)

    def test_load_flows_in_order(self):
        results = _load_flows_by_ids(self.capture_path, ["flow-3", "flow-1", "flow-2"])
        self.assertEqual(len(results), 3)
        ids = [f["id"] for f in results]
        self.assertEqual(ids, ["flow-1", "flow-2", "flow-3"])

    def test_load_nonexistent_flow(self):
        results = _load_flows_by_ids(self.capture_path, ["flow-999"])
        self.assertEqual(len(results), 0)

    def test_load_mix_of_existing_and_nonexistent(self):
        results = _load_flows_by_ids(self.capture_path, ["flow-1", "flow-999", "flow-2"])
        self.assertEqual(len(results), 2)
        ids = [f["id"] for f in results]
        self.assertIn("flow-1", ids)
        self.assertIn("flow-2", ids)

    def test_load_empty_list(self):
        results = _load_flows_by_ids(self.capture_path, [])
        self.assertEqual(len(results), 0)

    def test_load_from_nonexistent_file(self):
        results = _load_flows_by_ids("/nonexistent/path/flows.jsonl", ["flow-1"])
        self.assertEqual(len(results), 0)

    def test_load_duplicate_ids(self):
        results = _load_flows_by_ids(self.capture_path, ["flow-1", "flow-1", "flow-2"])
        self.assertEqual(len(results), 2)
        ids = [f["id"] for f in results]
        self.assertEqual(ids, ["flow-1", "flow-2"])

    def test_load_large_number_of_flows(self):
        large_flows = []
        for i in range(100):
            large_flows.append({
                "ts": 2000 + i,
                "id": f"large-flow-{i}",
                "request": {"method": "GET", "url": f"https://api.test.com/item{i}"},
                "response": {"status_code": 200}
            })

        large_path = os.path.join(self.temp_dir, "large_flows.jsonl")
        with open(large_path, "w") as f:
            for flow in large_flows:
                f.write(json.dumps(flow) + "\n")

        target_ids = [f"large-flow-{i}" for i in range(0, 100, 2)]
        results = _load_flows_by_ids(large_path, target_ids)
        self.assertEqual(len(results), 50)

        os.remove(large_path)


class TestFormatFlowsAsJson(unittest.TestCase):
    """Test the _format_flows_as_json function."""

    def test_format_empty_list(self):
        result = _format_flows_as_json([])
        data = json.loads(result)
        self.assertEqual(data["count"], 0)
        self.assertEqual(data["flows"], [])

    def test_format_single_flow(self):
        flows = [{"id": "flow-1", "ts": 1000, "request": {"method": "GET"}}]
        result = _format_flows_as_json(flows)
        data = json.loads(result)
        self.assertEqual(data["count"], 1)
        self.assertEqual(len(data["flows"]), 1)
        self.assertEqual(data["flows"][0]["id"], "flow-1")

    def test_format_multiple_flows(self):
        flows = [
            {"id": "flow-1", "ts": 1000},
            {"id": "flow-2", "ts": 1001},
            {"id": "flow-3", "ts": 1002},
        ]
        result = _format_flows_as_json(flows)
        data = json.loads(result)
        self.assertEqual(data["count"], 3)
        self.assertEqual(len(data["flows"]), 3)

    def test_format_preserves_structure(self):
        flow = {
            "id": "flow-1",
            "ts": 1000,
            "request": {
                "method": "POST",
                "url": "https://example.com",
                "headers": {"Content-Type": "application/json"},
                "body": '{"key": "value"}'
            },
            "response": {
                "status_code": 200,
                "body": '{"result": "ok"}'
            }
        }
        result = _format_flows_as_json([flow])
        data = json.loads(result)
        self.assertEqual(data["flows"][0]["request"]["method"], "POST")
        self.assertEqual(data["flows"][0]["request"]["headers"]["Content-Type"], "application/json")

    def test_format_uses_ascii(self):
        flow = {"id": "flow-1", "message": "Hello \u00e9\u00e0"}
        result = _format_flows_as_json([flow])
        self.assertIn("Hello", result)


class TestFormatFlowsAsJsonl(unittest.TestCase):
    """Test the _format_flows_as_jsonl function."""

    def test_format_empty_list(self):
        result = _format_flows_as_jsonl([])
        self.assertEqual(result, "")

    def test_format_single_flow(self):
        flows = [{"id": "flow-1", "ts": 1000}]
        result = _format_flows_as_jsonl(flows)
        lines = result.strip().split("\n")
        self.assertEqual(len(lines), 1)
        data = json.loads(lines[0])
        self.assertEqual(data["id"], "flow-1")

    def test_format_multiple_flows(self):
        flows = [
            {"id": "flow-1", "ts": 1000},
            {"id": "flow-2", "ts": 1001},
        ]
        result = _format_flows_as_jsonl(flows)
        lines = result.strip().split("\n")
        self.assertEqual(len(lines), 2)
        self.assertEqual(json.loads(lines[0])["id"], "flow-1")
        self.assertEqual(json.loads(lines[1])["id"], "flow-2")

    def test_format_ends_with_newline(self):
        flows = [{"id": "flow-1", "ts": 1000}]
        result = _format_flows_as_jsonl(flows)
        self.assertTrue(result.endswith("\n"))

    def test_format_each_line_is_valid_json(self):
        flows = [
            {"id": "flow-1", "nested": {"key": "value"}},
            {"id": "flow-2", "array": [1, 2, 3]},
        ]
        result = _format_flows_as_jsonl(flows)
        lines = result.strip().split("\n")
        for line in lines:
            data = json.loads(line)
            self.assertIn("id", data)


class TestFlowToCurl(unittest.TestCase):
    """Test the _flow_to_curl function."""

    def test_simple_get(self):
        flow = {
            "id": "flow-1",
            "request": {
                "method": "GET",
                "url": "https://api.example.com/users",
                "headers": {}
            }
        }
        result = _flow_to_curl(flow)
        self.assertIn("curl -X GET", result)
        self.assertIn("https://api.example.com/users", result)

    def test_post_with_body(self):
        flow = {
            "id": "flow-1",
            "request": {
                "method": "POST",
                "url": "https://api.example.com/users",
                "headers": {"Content-Type": "application/json"},
                "body": '{"name": "Alice"}'
            }
        }
        result = _flow_to_curl(flow)
        self.assertIn("curl -X POST", result)
        self.assertIn("-d '{\"name\": \"Alice\"}'", result)

    def test_skips_blacklisted_headers(self):
        flow = {
            "id": "flow-1",
            "request": {
                "method": "GET",
                "url": "https://api.example.com",
                "headers": {
                    "Host": "api.example.com",
                    "Content-Length": "123",
                    "Connection": "keep-alive",
                    "Accept-Encoding": "gzip",
                    "Accept-Language": "en",
                    "Accept": "application/json"
                }
            }
        }
        result = _flow_to_curl(flow)
        self.assertIn("Accept", result)
        self.assertNotIn("Host", result)
        self.assertNotIn("Content-Length", result)
        self.assertNotIn("Connection", result)
        self.assertNotIn("Accept-Encoding", result)
        self.assertNotIn("Accept-Language", result)

    def test_escapes_single_quotes(self):
        flow = {
            "id": "flow-1",
            "request": {
                "method": "POST",
                "url": "https://api.example.com",
                "headers": {},
                "body": "It's a test"
            }
        }
        result = _flow_to_curl(flow)
        self.assertIn("It'\\''s a test", result)

    def test_handles_body_base64(self):
        import base64
        body = '{"key": "value"}'
        encoded = base64.b64encode(body.encode()).decode()
        flow = {
            "id": "flow-1",
            "request": {
                "method": "POST",
                "url": "https://api.example.com",
                "headers": {},
                "body_base64": encoded
            }
        }
        result = _flow_to_curl(flow)
        self.assertIn("-d '{\"key\": \"value\"}'", result)

    def test_handles_missing_request(self):
        flow = {"id": "flow-1"}
        result = _flow_to_curl(flow)
        self.assertEqual(result, "")

    def test_handles_empty_url(self):
        flow = {
            "id": "flow-1",
            "request": {
                "method": "GET",
                "url": "",
                "headers": {}
            }
        }
        result = _flow_to_curl(flow)
        self.assertIn("curl -X GET", result)


class TestFormatFlowsAsCurl(unittest.TestCase):
    """Test the _format_flows_as_curl function."""

    def test_format_empty_list(self):
        result = _format_flows_as_curl([])
        self.assertEqual(result, "")

    def test_format_single_flow(self):
        flows = [{
            "id": "flow-1",
            "request": {
                "method": "GET",
                "url": "https://api.example.com",
                "headers": {}
            }
        }]
        result = _format_flows_as_curl(flows)
        self.assertIn("# Flow: flow-1", result)
        self.assertIn("# GET https://api.example.com", result)
        self.assertIn("curl -X GET", result)

    def test_format_multiple_flows(self):
        flows = [
            {
                "id": "flow-1",
                "request": {"method": "GET", "url": "https://api.example.com/1", "headers": {}}
            },
            {
                "id": "flow-2",
                "request": {"method": "POST", "url": "https://api.example.com/2", "headers": {}}
            },
        ]
        result = _format_flows_as_curl(flows)
        self.assertIn("# Flow: flow-1", result)
        self.assertIn("# Flow: flow-2", result)
        self.assertIn("# GET https://api.example.com/1", result)
        self.assertIn("# POST https://api.example.com/2", result)

    def test_format_separates_flows_with_blank_lines(self):
        flows = [
            {"id": "flow-1", "request": {"method": "GET", "url": "https://a.com", "headers": {}}},
            {"id": "flow-2", "request": {"method": "GET", "url": "https://b.com", "headers": {}}},
        ]
        result = _format_flows_as_curl(flows)
        self.assertIn("\n\n", result)


class TestFlowsExportTool(unittest.TestCase):
    """Test the flows_export MCP tool."""

    def setUp(self):
        self.temp_dir = tempfile.mkdtemp()
        self.capture_path = os.path.join(self.temp_dir, "flows.jsonl")

        self.flows = [
            {
                "ts": 1000,
                "id": "export-flow-1",
                "request": {"method": "GET", "url": "https://api.test.com/users", "headers": {}},
                "response": {"status_code": 200}
            },
            {
                "ts": 1001,
                "id": "export-flow-2",
                "request": {"method": "POST", "url": "https://api.test.com/users", "headers": {}},
                "response": {"status_code": 201}
            },
        ]

        with open(self.capture_path, "w") as f:
            for flow in self.flows:
                f.write(json.dumps(flow) + "\n")

        import backchannel.server as server_module
        server_module.state.capture_path = self.capture_path

    def tearDown(self):
        os.remove(self.capture_path)
        os.rmdir(self.temp_dir)

    def test_export_json_format(self):
        result = flows_export(["export-flow-1"], format="json")
        self.assertNotIn("error", result)
        self.assertEqual(result["format"], "json")
        self.assertEqual(result["count"], 1)
        data = json.loads(result["data"])
        self.assertEqual(data["count"], 1)
        self.assertEqual(data["flows"][0]["id"], "export-flow-1")

    def test_export_jsonl_format(self):
        result = flows_export(["export-flow-1", "export-flow-2"], format="jsonl")
        self.assertNotIn("error", result)
        self.assertEqual(result["format"], "jsonl")
        self.assertEqual(result["count"], 2)
        lines = result["data"].strip().split("\n")
        self.assertEqual(len(lines), 2)

    def test_export_curl_format(self):
        result = flows_export(["export-flow-1"], format="curl")
        self.assertNotIn("error", result)
        self.assertEqual(result["format"], "curl")
        self.assertEqual(result["count"], 1)
        self.assertIn("curl -X GET", result["data"])

    def test_export_empty_flow_ids(self):
        result = flows_export([], format="json")
        self.assertIn("error", result)
        self.assertEqual(result["count"], 0)

    def test_export_invalid_format(self):
        result = flows_export(["export-flow-1"], format="xml")
        self.assertIn("error", result)
        self.assertIn("invalid format", result["error"])

    def test_export_nonexistent_flows(self):
        result = flows_export(["nonexistent-flow"], format="json")
        self.assertNotIn("error", result)
        self.assertEqual(result["count"], 0)
        self.assertIn("missing_ids", result)
        self.assertIn("nonexistent-flow", result["missing_ids"])

    def test_export_partial_missing_flows(self):
        result = flows_export(["export-flow-1", "nonexistent-flow"], format="json")
        self.assertNotIn("error", result)
        self.assertEqual(result["count"], 1)
        self.assertIn("missing_ids", result)
        self.assertIn("nonexistent-flow", result["missing_ids"])

    def test_export_large_number_of_flows(self):
        large_flows = []
        for i in range(50):
            large_flows.append({
                "ts": 2000 + i,
                "id": f"bulk-flow-{i}",
                "request": {"method": "GET", "url": f"https://api.test.com/{i}", "headers": {}},
                "response": {"status_code": 200}
            })

        with open(self.capture_path, "a") as f:
            for flow in large_flows:
                f.write(json.dumps(flow) + "\n")

        target_ids = [f"bulk-flow-{i}" for i in range(50)]
        result = flows_export(target_ids, format="json")
        self.assertEqual(result["count"], 50)
        data = json.loads(result["data"])
        self.assertEqual(len(data["flows"]), 50)


if __name__ == "__main__":
    unittest.main()
