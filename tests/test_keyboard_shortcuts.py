"""Tests for keyboard shortcuts functionality.

Since keyboard shortcuts are primarily a frontend feature (handled in React),
this test file focuses on any backend utilities that support shortcuts.
"""

import json
import os
import tempfile
import unittest

import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from backchannel.server import (
    _parse_bool,
    _parse_int,
    _parse_float,
    _normalize_header_map,
)


class TestParseBoolUtility(unittest.TestCase):
    """Test the _parse_bool utility function used for shortcut toggles."""

    def test_parse_none_returns_default(self):
        self.assertFalse(_parse_bool(None, default=False))
        self.assertTrue(_parse_bool(None, default=True))

    def test_parse_bool_returns_self(self):
        self.assertTrue(_parse_bool(True))
        self.assertFalse(_parse_bool(False))

    def test_parse_true_values(self):
        true_values = ["1", "true", "True", "TRUE", "yes", "YES", "on", "ON"]
        for val in true_values:
            self.assertTrue(_parse_bool(val), f"Failed for {val}")

    def test_parse_false_values(self):
        false_values = ["0", "false", "False", "FALSE", "no", "NO", "off", "OFF"]
        for val in false_values:
            self.assertFalse(_parse_bool(val), f"Failed for {val}")

    def test_parse_invalid_returns_default(self):
        self.assertFalse(_parse_bool("invalid", default=False))
        self.assertTrue(_parse_bool("invalid", default=True))

    def test_parse_strips_whitespace(self):
        self.assertTrue(_parse_bool("  true  "))
        self.assertFalse(_parse_bool("  false  "))


class TestParseIntUtility(unittest.TestCase):
    """Test the _parse_int utility function."""

    def test_parse_none_returns_default(self):
        self.assertIsNone(_parse_int(None))
        self.assertEqual(_parse_int(None, default=0), 0)

    def test_parse_valid_int(self):
        self.assertEqual(_parse_int("42"), 42)
        self.assertEqual(_parse_int("0"), 0)
        self.assertEqual(_parse_int("-5"), -5)

    def test_parse_int_returns_int(self):
        self.assertEqual(_parse_int(42), 42)

    def test_parse_invalid_returns_default(self):
        self.assertIsNone(_parse_int("invalid"))
        self.assertEqual(_parse_int("invalid", default=0), 0)

    def test_parse_float_string_returns_default(self):
        self.assertIsNone(_parse_int("3.14"))
        self.assertEqual(_parse_int("3.14", default=0), 0)


class TestParseFloatUtility(unittest.TestCase):
    """Test the _parse_float utility function."""

    def test_parse_none_returns_default(self):
        self.assertIsNone(_parse_float(None))
        self.assertEqual(_parse_float(None, default=0.0), 0.0)

    def test_parse_valid_float(self):
        self.assertEqual(_parse_float("3.14"), 3.14)
        self.assertEqual(_parse_float("0"), 0.0)
        self.assertEqual(_parse_float("-5.5"), -5.5)

    def test_parse_float_returns_float(self):
        self.assertEqual(_parse_float(3.14), 3.14)

    def test_parse_invalid_returns_default(self):
        self.assertIsNone(_parse_float("invalid"))
        self.assertEqual(_parse_float("invalid", default=0.0), 0.0)


class TestNormalizeHeaderMap(unittest.TestCase):
    """Test the _normalize_header_map utility function."""

    def test_normalize_none_returns_empty(self):
        result = _normalize_header_map(None)
        self.assertEqual(result, {})

    def test_normalize_empty_dict(self):
        result = _normalize_header_map({})
        self.assertEqual(result, {})

    def test_normalize_simple_headers(self):
        headers = {"Content-Type": "application/json", "Accept": "*/*"}
        result = _normalize_header_map(headers)
        self.assertEqual(result["Content-Type"], "application/json")
        self.assertEqual(result["Accept"], "*/*")

    def test_normalize_strips_keys(self):
        headers = {"  Content-Type  ": "application/json"}
        result = _normalize_header_map(headers)
        self.assertEqual(result["Content-Type"], "application/json")

    def test_normalize_converts_values_to_string(self):
        headers = {"Content-Length": 123, "X-Number": 45.6}
        result = _normalize_header_map(headers)
        self.assertEqual(result["Content-Length"], "123")
        self.assertEqual(result["X-Number"], "45.6")

    def test_normalize_skips_none_keys(self):
        headers = {None: "value", "Valid": "header"}
        result = _normalize_header_map(headers)
        self.assertNotIn(None, result)
        self.assertIn("Valid", result)

    def test_normalize_skips_none_values(self):
        headers = {"Valid": "header", "Invalid": None}
        result = _normalize_header_map(headers)
        self.assertNotIn("Invalid", result)
        self.assertIn("Valid", result)

    def test_normalize_skips_empty_keys(self):
        headers = {"": "value", " ": "value2", "Valid": "header"}
        result = _normalize_header_map(headers)
        self.assertNotIn("", result)
        self.assertNotIn(" ", result)
        self.assertIn("Valid", result)


class TestKeyboardShortcutResponseHandling(unittest.TestCase):
    """Test response handling patterns used by keyboard shortcut actions."""

    def setUp(self):
        self.temp_dir = tempfile.mkdtemp()
        self.capture_path = os.path.join(self.temp_dir, "test.jsonl")

        # Create sample flows
        flows = [
            {"ts": 1000, "id": "flow-1", "request": {"method": "GET", "url": "https://example.com/1"}},
            {"ts": 1001, "id": "flow-2", "request": {"method": "POST", "url": "https://example.com/2"}},
        ]

        with open(self.capture_path, "w") as f:
            for flow in flows:
                f.write(json.dumps(flow) + "\n")

    def tearDown(self):
        os.remove(self.capture_path)
        os.rmdir(self.temp_dir)

    def test_error_response_format(self):
        from backchannel.server import flows_export
        import backchannel.server as server_module

        server_module.state.capture_path = self.capture_path

        result = flows_export([], format="json")

        # Error responses should have consistent format
        self.assertIn("error", result)
        self.assertIn("data", result)
        self.assertIn("format", result)
        self.assertIn("count", result)
        self.assertEqual(result["count"], 0)

    def test_success_response_format(self):
        from backchannel.server import flows_export
        import backchannel.server as server_module

        server_module.state.capture_path = self.capture_path

        result = flows_export(["flow-1"], format="json")

        # Success responses should have consistent format
        self.assertNotIn("error", result)
        self.assertIn("data", result)
        self.assertIn("format", result)
        self.assertIn("count", result)
        self.assertEqual(result["count"], 1)


class TestDashboardStateHelpers(unittest.TestCase):
    """Test helper functions for dashboard state that shortcuts may toggle."""

    def test_env_default_int_with_valid_value(self):
        from backchannel.server import _env_default_int
        import os

        os.environ["TEST_INT_VAR"] = "42"
        result = _env_default_int("TEST_INT_VAR", 0)
        self.assertEqual(result, 42)
        del os.environ["TEST_INT_VAR"]

    def test_env_default_int_with_invalid_value(self):
        from backchannel.server import _env_default_int
        import os

        os.environ["TEST_INT_VAR"] = "invalid"
        result = _env_default_int("TEST_INT_VAR", 99)
        self.assertEqual(result, 99)
        del os.environ["TEST_INT_VAR"]

    def test_env_default_int_with_missing_value(self):
        from backchannel.server import _env_default_int

        result = _env_default_int("NONEXISTENT_VAR_XYZ", 100)
        self.assertEqual(result, 100)

    def test_env_default_bool_with_true_values(self):
        from backchannel.server import _env_default_bool
        import os

        true_values = ["1", "true", "yes", "on"]
        for val in true_values:
            os.environ["TEST_BOOL_VAR"] = val
            result = _env_default_bool("TEST_BOOL_VAR", False)
            self.assertTrue(result, f"Failed for {val}")

        if "TEST_BOOL_VAR" in os.environ:
            del os.environ["TEST_BOOL_VAR"]

    def test_env_default_bool_with_false_values(self):
        from backchannel.server import _env_default_bool
        import os

        false_values = ["0", "false", "no", "off"]
        for val in false_values:
            os.environ["TEST_BOOL_VAR"] = val
            result = _env_default_bool("TEST_BOOL_VAR", True)
            self.assertFalse(result, f"Failed for {val}")

        if "TEST_BOOL_VAR" in os.environ:
            del os.environ["TEST_BOOL_VAR"]


if __name__ == "__main__":
    unittest.main()
