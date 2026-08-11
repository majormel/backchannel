import base64
import hashlib
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from backchannel.capture_addon import MCPFlowCapture, _body_metadata, _capture_headers, _decode_body, _encode_body_base64


class DummyLoader:
    def __init__(self):
        self.options = {}

    def add_option(self, name, option_type, default, help_text):
        self.options[name] = {
            "type": option_type,
            "default": default,
            "help": help_text,
        }


class TestCaptureAddonBodyLimits(unittest.TestCase):
    def test_capture_headers_keeps_sensitive_values(self):
        headers = {
            "Authorization": "Bearer token",
            "Cookie": "session=abc",
            "Set-Cookie": "foo=bar",
            "X-Api-Key": "secret",
        }
        captured = _capture_headers(headers)
        self.assertEqual(captured["Authorization"], "Bearer token")
        self.assertEqual(captured["Cookie"], "session=abc")
        self.assertEqual(captured["Set-Cookie"], "foo=bar")
        self.assertEqual(captured["X-Api-Key"], "secret")

    def test_decode_body_unlimited_when_limit_is_zero(self):
        data = "x" * 1200
        decoded = _decode_body(data.encode("utf-8"), 0)
        self.assertEqual(decoded, data)

    def test_encode_body_base64_unlimited_when_limit_is_zero(self):
        data = b"a" * 1200
        encoded = _encode_body_base64(data, 0)
        self.assertEqual(encoded, base64.b64encode(data).decode("ascii"))

    def test_decode_body_respects_positive_limit(self):
        data = "abcdefghij"
        decoded = _decode_body(data.encode("utf-8"), 4)
        self.assertEqual(decoded, "abcd")

    def test_encode_body_base64_respects_positive_limit(self):
        data = b"abcdefghij"
        encoded = _encode_body_base64(data, 4)
        self.assertEqual(encoded, base64.b64encode(b"abcd").decode("ascii"))

    def test_loader_sets_unlimited_default(self):
        loader = DummyLoader()
        MCPFlowCapture().load(loader)
        self.assertEqual(loader.options["mcp_capture_max_body_bytes"]["default"], 0)


class TestBodyMetadata(unittest.TestCase):
    def test_truncation_metadata_when_limited(self):
        data = b"A" * 100
        meta = _body_metadata(data, 40)
        self.assertTrue(meta["body_truncated"])
        self.assertEqual(meta["body_captured_bytes"], 40)
        self.assertEqual(meta["body_original_bytes"], 100)
        self.assertIsNotNone(meta["body_sha256"])

    def test_no_truncation_metadata_when_unlimited(self):
        data = b"B" * 50
        meta = _body_metadata(data, 0)
        self.assertFalse(meta["body_truncated"])
        self.assertEqual(meta["body_captured_bytes"], 50)
        self.assertEqual(meta["body_original_bytes"], 50)
        self.assertIsNotNone(meta["body_sha256"])

    def test_body_sha256_computed_correctly(self):
        data = b"hello world"
        meta = _body_metadata(data, 0)
        expected = hashlib.sha256(data).hexdigest()
        self.assertEqual(meta["body_sha256"], expected)

    def test_metadata_empty_body(self):
        meta = _body_metadata(None, 0)
        self.assertFalse(meta["body_truncated"])
        self.assertEqual(meta["body_captured_bytes"], 0)
        self.assertEqual(meta["body_original_bytes"], 0)
        self.assertIsNone(meta["body_sha256"])

    def test_sha256_is_of_full_body_even_when_truncated(self):
        data = b"the full content"
        meta = _body_metadata(data, 4)
        self.assertEqual(meta["body_sha256"], hashlib.sha256(data).hexdigest())


if __name__ == "__main__":
    unittest.main()
