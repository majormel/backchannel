from __future__ import annotations

import base64
import gzip
import json
import struct
import tempfile
from pathlib import Path

import pytest

from decoder.encoding_classifier import classify, ClassifierResult
from decoder.decode_memory import DecodeMemory, _fingerprint, _entropy_class
from decoder.grpc import is_grpc, decode_grpc, decode_grpc_stream, GrpcFrame
from decoder.msgpack_decoder import is_msgpack, decode_msgpack, _type_name
from decoder.smart_pipeline import smart_decode, get_decode_suggestions, SmartResult


def _make_grpc_frame(body: bytes, compress: bool = False) -> bytes:
    flag = 1 if compress else 0
    return bytes([flag]) + struct.pack(">I", len(body)) + body


def _make_proto_bytes() -> bytes:
    return b"\x08\x01\x12\x05hello\x18\x2a"


class TestEncodingClassifier:
    def test_empty_returns_unknown(self):
        r = classify(b"")
        assert r.hint == "unknown"
        assert r.confidence == 0.0

    def test_gzip_magic(self):
        r = classify(b"\x1f\x8b" + b"\x00" * 20)
        assert r.hint == "gzip"
        assert r.confidence >= 0.9

    def test_zlib_magic(self):
        r = classify(b"\x78\x9c" + b"\x00" * 20)
        assert r.hint in ("zlib", "gzip")

    def test_grpc_frame(self):
        body = _make_proto_bytes()
        frame = _make_grpc_frame(body)
        r = classify(frame)
        assert r.hint == "grpc"
        assert r.confidence >= 0.9

    def test_json_detection(self):
        data = json.dumps({"key": "value", "num": 42}).encode()
        r = classify(data)
        assert r.hint == "json"
        assert r.confidence >= 0.85

    def test_text_detection(self):
        data = b"Hello world, this is plain text with lots of ascii characters."
        r = classify(data)
        assert r.hint in ("text", "json")

    def test_content_type_hint_grpc(self):
        r = classify(b"\x00" * 10, "application/grpc")
        assert r.hint == "grpc"

    def test_content_type_hint_msgpack(self):
        r = classify(b"\x82\xa3foo\xa3bar", "application/msgpack")
        assert r.hint == "msgpack"

    def test_alternatives_populated(self):
        data = _make_proto_bytes()
        r = classify(data)
        assert isinstance(r.alternatives, list)

    def test_evidence_contains_entropy(self):
        data = b"some data"
        r = classify(data)
        assert "entropy" in r.evidence
        assert "ascii_density" in r.evidence

    def test_high_entropy_aes(self):
        import os
        data = os.urandom(512)
        r = classify(data)
        assert r.hint in ("aes_encrypted", "xor_encrypted", "unknown", "protobuf")

    def test_msgpack_fixmap(self):
        r = classify(b"\x81\xa3key\xa5value")
        assert r.hint == "msgpack"

    def test_msgpack_fixarray(self):
        r = classify(b"\x93\x01\x02\x03")
        assert r.hint in ("msgpack", "unknown", "protobuf")


class TestDecodeMemory:
    def test_lookup_miss(self, tmp_path):
        mem = DecodeMemory(tmp_path / "test.db")
        result = mem.lookup(b"hello world", "text/plain")
        assert result == []
        mem.close()

    def test_record_and_lookup(self, tmp_path):
        mem = DecodeMemory(tmp_path / "test.db")
        data = b"\x1f\x8b" + b"\x00" * 50
        chain = ["decompress", "protobuf"]
        mem.record(data, chain, content_type="application/octet-stream")
        records = mem.lookup(data, "application/octet-stream")
        assert len(records) == 1
        assert records[0].chain == chain
        assert records[0].success_count == 1
        mem.close()

    def test_success_count_increments(self, tmp_path):
        mem = DecodeMemory(tmp_path / "test.db")
        data = b"test payload " + b"\x00" * 20
        for _ in range(3):
            mem.record(data, ["xor_decode"], content_type="")
        records = mem.lookup(data, "")
        assert records[0].success_count == 3
        mem.close()

    def test_list_recent(self, tmp_path):
        mem = DecodeMemory(tmp_path / "test.db")
        for i in range(5):
            mem.record(bytes([i]) * 64, [f"stage_{i}"], content_type="")
        recent = mem.list_recent(limit=3)
        assert len(recent) == 3
        mem.close()

    def test_fingerprint_stability(self):
        data = b"consistent data" + b"\x00" * 40
        fp1 = _fingerprint(data, "low", "text/plain")
        fp2 = _fingerprint(data, "low", "text/plain")
        assert fp1 == fp2

    def test_fingerprint_differs_by_entropy_class(self):
        data = b"data" + b"\x00" * 40
        fp1 = _fingerprint(data, "low", "")
        fp2 = _fingerprint(data, "encrypted", "")
        assert fp1 != fp2

    def test_entropy_class_low(self):
        assert _entropy_class(b"\x00" * 200) == "low"

    def test_entropy_class_encrypted(self):
        import os
        data = os.urandom(4096)
        assert _entropy_class(data) in ("encrypted", "high")


class TestGrpcDecoder:
    def test_is_grpc_valid(self):
        body = b"\x08\x01\x12\x05hello"
        frame = _make_grpc_frame(body)
        assert is_grpc(frame) is True

    def test_is_grpc_too_short(self):
        assert is_grpc(b"\x00\x00\x00") is False

    def test_is_grpc_bad_flag(self):
        assert is_grpc(b"\x02\x00\x00\x00\x05hello") is False

    def test_is_grpc_length_mismatch(self):
        assert is_grpc(b"\x00\x00\x00\x00\x0ahello") is False

    def test_decode_grpc_returns_frame(self):
        body = _make_proto_bytes()
        frame_bytes = _make_grpc_frame(body)
        frame = decode_grpc(frame_bytes)
        assert frame is not None
        assert isinstance(frame, GrpcFrame)
        assert frame.compressed is False
        assert frame.declared_length == len(body)
        assert frame.error is None

    def test_decode_grpc_not_grpc(self):
        assert decode_grpc(b"not a grpc frame") is None

    def test_decode_grpc_stream_single(self):
        body = _make_proto_bytes()
        data = _make_grpc_frame(body)
        frames = decode_grpc_stream(data)
        assert len(frames) == 1

    def test_decode_grpc_stream_multiple(self):
        body = _make_proto_bytes()
        data = _make_grpc_frame(body) + _make_grpc_frame(body)
        frames = decode_grpc_stream(data)
        assert len(frames) == 2

    def test_decode_grpc_stream_empty(self):
        frames = decode_grpc_stream(b"")
        assert frames == []

    def test_decode_grpc_compressed(self):
        body = gzip.compress(_make_proto_bytes())
        frame_bytes = _make_grpc_frame(body, compress=True)
        frame = decode_grpc(frame_bytes)
        assert frame is not None
        assert frame.compressed is True
        assert frame.error is None


class TestMsgpackDecoder:
    def test_is_msgpack_fixmap(self):
        assert is_msgpack(b"\x81\xa3key\xa5value") is True

    def test_is_msgpack_fixarray(self):
        assert is_msgpack(b"\x93\x01\x02\x03") is True

    def test_is_msgpack_nil(self):
        assert is_msgpack(b"\xc0") is True

    def test_is_msgpack_empty(self):
        assert is_msgpack(b"") is False

    def test_is_msgpack_plain_text(self):
        assert is_msgpack(b"hello world") is False

    def test_decode_msgpack_fallback_nil(self):
        r = decode_msgpack(b"\xc0")
        assert r.success is True
        assert r.value is None or (isinstance(r.value, dict) and r.value.get("_type") == "nil")

    def test_decode_msgpack_fallback_fixmap(self):
        r = decode_msgpack(b"\x82\xa3foo\xa3bar\xa3baz\xa3qux")
        assert r.success is True

    def test_type_name_known(self):
        assert _type_name(0xc0) == "nil"
        assert _type_name(0xc2) == "false"
        assert _type_name(0xc3) == "true"
        assert _type_name(0xca) == "float32"
        assert _type_name(0xcb) == "float64"

    def test_type_name_fixmap(self):
        assert _type_name(0x82) == "fixmap(2)"

    def test_type_name_fixarray(self):
        assert _type_name(0x93) == "fixarray(3)"

    def test_type_name_fixstr(self):
        assert _type_name(0xa5) == "fixstr(5)"

    def test_type_name_unknown(self):
        assert "unknown" in _type_name(0xfe)


class TestSmartPipeline:
    def test_smart_decode_json(self):
        data = json.dumps({"result": "ok", "code": 200}).encode()
        result = smart_decode(data, content_type="application/json", use_memory=False)
        assert result.hint == "json"
        assert result.confidence >= 0.8
        assert result.decoded == {"result": "ok", "code": 200}

    def test_smart_decode_grpc(self):
        body = _make_proto_bytes()
        data = _make_grpc_frame(body)
        result = smart_decode(data, content_type="application/grpc", use_memory=False)
        assert result.method == "grpc"
        assert result.hint == "grpc"

    def test_smart_decode_gzip(self):
        inner = json.dumps({"compressed": True}).encode()
        data = gzip.compress(inner)
        result = smart_decode(data, content_type="application/octet-stream", use_memory=False)
        assert result.hint in ("gzip", "zlib", "json", "text")

    def test_smart_decode_memory_lookup(self, tmp_path):
        from decoder.decode_memory import DecodeMemory
        from decoder import smart_pipeline
        original_memory = smart_pipeline._memory
        mem = DecodeMemory(tmp_path / "test.db")
        smart_pipeline._memory = mem
        try:
            data = b"\x08\x01\x12\x05value" + b"\xff" * 20
            chain = ["xor_decode", "protobuf"]
            mem.record(data, chain, content_type="application/octet-stream")
            result = smart_decode(data, content_type="application/octet-stream", use_memory=True)
            assert result.method == "memory"
            assert result.chain == chain
        finally:
            smart_pipeline._memory = original_memory
            mem.close()

    def test_smart_decode_result_has_required_fields(self):
        data = b"hello world test data"
        result = smart_decode(data, use_memory=False)
        assert isinstance(result, SmartResult)
        assert result.method in ("memory", "classifier", "grpc", "msgpack", "pipeline", "raw")
        assert isinstance(result.hint, str)
        assert 0.0 <= result.confidence <= 1.0
        assert isinstance(result.chain, list)
        assert isinstance(result.evidence, dict)

    def test_get_decode_suggestions_returns_list(self):
        data = json.dumps({"foo": "bar"}).encode()
        suggestions = get_decode_suggestions(data, "application/json")
        assert isinstance(suggestions, list)
        assert len(suggestions) >= 1
        assert all("hint" in s for s in suggestions)
        assert all("confidence" in s for s in suggestions)

    def test_get_decode_suggestions_grpc_first(self):
        body = _make_proto_bytes()
        data = _make_grpc_frame(body)
        suggestions = get_decode_suggestions(data, "application/grpc")
        assert suggestions[0]["hint"] == "grpc"
        assert suggestions[0]["confidence"] >= 0.9

    def test_get_decode_suggestions_max_five(self):
        data = b"\x08\x01\x12\x05hello"
        suggestions = get_decode_suggestions(data, "")
        assert len(suggestions) <= 5
