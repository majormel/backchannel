import json
import os
import tempfile
import unittest

import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from backchannel.flow_index import FlowIndex


class TestFlowIndex(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.mkdtemp()
        self.jsonl_path = os.path.join(self.temp_dir, "flows.jsonl")
        self.db_path = os.path.join(self.temp_dir, "flows.db")
        self.flows = [
            {
                "ts": 1000.0,
                "id": "flow-1",
                "request": {
                    "method": "GET",
                    "url": "https://api.test.com/users",
                    "host": "api.test.com",
                    "path": "/users",
                    "headers": {"Accept": "application/json"},
                    "body": "",
                },
                "response": {
                    "status_code": 200,
                    "headers": {"Content-Type": "application/json"},
                    "body": '{"users":[]}',
                    "body_size": 12,
                },
            },
            {
                "ts": 1001.0,
                "id": "flow-2",
                "request": {
                    "method": "POST",
                    "url": "https://api.test.com/users",
                    "host": "api.test.com",
                    "path": "/users",
                    "headers": {"Content-Type": "application/json", "X-Trace": "abc-123"},
                    "body": '{"name":"Alice"}',
                },
                "response": {
                    "status_code": 201,
                    "headers": {"Content-Type": "application/json"},
                    "body": '{"id":1}',
                    "body_size": 8,
                },
                "timing": {"total_duration_ms": 48},
            },
            {
                "ts": 1002.0,
                "id": "flow-3",
                "request": {
                    "method": "DELETE",
                    "url": "https://api.test.com/users/1",
                    "host": "api.test.com",
                    "path": "/users/1",
                    "headers": {},
                    "body": "",
                },
                "response": {
                    "status_code": 204,
                    "headers": {},
                    "body": "",
                    "body_size": 0,
                },
            },
        ]
        with open(self.jsonl_path, "w", encoding="utf-8") as handle:
            for flow in self.flows:
                handle.write(json.dumps(flow, ensure_ascii=True) + "\n")
        self.index = FlowIndex(self.db_path)
        self.index.clear()

    def tearDown(self):
        try:
            self.index.clear()
        except Exception:
            pass
        self.index.close()
        for path in (self.db_path, self.db_path + "-wal", self.db_path + "-shm"):
            if os.path.exists(path):
                os.remove(path)
        if os.path.exists(self.jsonl_path):
            os.remove(self.jsonl_path)
        os.rmdir(self.temp_dir)

    def _index_from_file_offsets(self):
        offset = 0
        with open(self.jsonl_path, "rb") as handle:
            for raw_line in handle:
                length = len(raw_line)
                line = raw_line.strip()
                if line:
                    flow = json.loads(line.decode("utf-8"))
                    self.index.index_flow(flow, offset, length)
                offset += length

    def test_index_flow_count_and_get_by_id(self):
        self._index_from_file_offsets()
        self.assertEqual(self.index.count(), 3)
        item = self.index.get_by_id("flow-2")
        self.assertIsNotNone(item)
        self.assertGreaterEqual(item["jsonl_offset"], 0)
        self.assertGreater(item["jsonl_length"], 0)

    def test_tail_with_filters(self):
        self._index_from_file_offsets()
        results = self.index.tail(2, {"method": "POST"})
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["id"], "flow-2")
        results = self.index.tail(10, {"status_min": 200, "status_max": 204})
        self.assertEqual([item["id"] for item in results], ["flow-1", "flow-2", "flow-3"])
        results = self.index.tail(10, {"url_contains": "users/1"})
        self.assertEqual([item["id"] for item in results], ["flow-3"])

    def test_search_matches_query_fields(self):
        self._index_from_file_offsets()
        results = self.index.search("alice", {}, limit=10)
        self.assertEqual([item["id"] for item in results], ["flow-2"])
        results = self.index.search("x-trace", {}, limit=10)
        self.assertEqual([item["id"] for item in results], ["flow-2"])
        results = self.index.search("delete", {}, limit=10)
        self.assertEqual([item["id"] for item in results], ["flow-3"])

    def test_search_with_time_filters(self):
        self._index_from_file_offsets()
        results = self.index.search("users", {"time_from": 1001.0, "time_to": 1002.0}, limit=10)
        self.assertEqual([item["id"] for item in results], ["flow-2", "flow-3"])
        results = self.index.search("users", {"date_from": 1002.0, "date_to": 1002.0}, limit=10)
        self.assertEqual([item["id"] for item in results], ["flow-3"])

    def test_search_with_iso_date_filters(self):
        self._index_from_file_offsets()
        results = self.index.search(
            "users",
            {"date_from": "1970-01-01T00:16:42Z", "date_to": "1970-01-01T00:16:42Z"},
            limit=10,
        )
        self.assertEqual([item["id"] for item in results], ["flow-3"])

    def test_time_filters_not_overwritten_by_invalid_dates(self):
        self._index_from_file_offsets()
        results = self.index.search(
            "users",
            {"time_from": 1001.0, "time_to": 1001.0, "date_from": "bad-value", "date_to": "bad-value"},
            limit=10,
        )
        self.assertEqual([item["id"] for item in results], ["flow-2"])

    def test_clear_and_index_existing_file(self):
        progress = []
        self.index.index_existing_file(self.jsonl_path, progress_cb=lambda indexed, total: progress.append((indexed, total)))
        self.assertEqual(self.index.count(), 3)
        self.assertTrue(progress)
        self.assertEqual(progress[-1], (3, 3))
        self.index.clear()
        self.assertEqual(self.index.count(), 0)


if __name__ == "__main__":
    unittest.main()
