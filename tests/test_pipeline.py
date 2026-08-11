"""
Tests for the decoder pipeline.

Run with: pytest tests/test_pipeline.py -v
"""
from __future__ import annotations

import json
import struct
import tempfile
from pathlib import Path

import pytest

from decoder import crypto, structure, transport
from decoder.pipeline import (
    ArtifactSet,
    PipelineOptions,
    decode_bytes,
    decode_flow,
    write_artifacts,
)


class TestTransport:
    """Tests for transport module."""

    def test_b64_decode(self):
        """Test base64 decoding."""
        encoded = "SGVsbG8gV29ybGQ="
        result = transport.b64_to_bytes(encoded)
        assert result == b"Hello World"

    def test_b64_decode_url_safe(self):
        """Test URL-safe base64 decoding."""
        # Standard: "test?" encodes to "dGVzdD8="
        # URL-safe might use - instead of +
        encoded = "dGVzdD8="
        result = transport.b64_to_bytes(encoded)
        assert result == b"test?"

    def test_scan_magic_gzip(self):
        """Test gzip magic detection."""
        data = b"\x1f\x8b\x08\x00\x00\x00\x00\x00"
        result = transport.scan_magic(data)
        assert "gzip" in result["matches"]

    def test_scan_magic_zlib(self):
        """Test zlib magic detection."""
        data = b"\x78\x9c\x00\x00\x00\x00"
        result = transport.scan_magic(data)
        assert any("zlib" in m for m in result["matches"])

    def test_probe_length_fields_exact(self):
        """Test length field detection with exact match."""
        # Create payload with u32 LE length prefix
        payload = b"Hello World"
        data = struct.pack("<I", len(payload)) + payload

        candidates = transport.probe_length_fields(data)
        assert len(candidates) > 0
        assert candidates[0]["offset"] == 0
        assert candidates[0]["width"] == 4
        assert candidates[0]["match"] == "exact_remaining"

    def test_strip_length_prefix(self):
        """Test length prefix stripping."""
        payload = b"Hello World"
        data = struct.pack("<I", len(payload)) + payload

        candidates = transport.probe_length_fields(data)
        stripped, info = transport.strip_length_prefix(data, candidates)

        assert stripped == payload
        assert info is not None
        assert info["width"] == 4


class TestCrypto:
    """Tests for crypto module."""

    def test_shannon_entropy_zero(self):
        """Test entropy of uniform data."""
        data = b"\x00" * 1000
        entropy = crypto.shannon_entropy(data)
        assert entropy == 0.0

    def test_shannon_entropy_random(self):
        """Test entropy of random-like data."""
        data = bytes(range(256)) * 4
        entropy = crypto.shannon_entropy(data)
        assert entropy > 7.9  # Near maximum

    def test_ascii_density(self):
        """Test ASCII density calculation."""
        data = b"Hello World"
        density = crypto.ascii_density(data)
        assert density == 1.0  # All printable

        data = b"\x00\x00Hello\x00\x00"
        density = crypto.ascii_density(data)
        assert 0.4 < density < 0.6

    def test_xor_apply_single(self):
        """Test single-byte XOR."""
        data = b"Hello"
        key = b"\x42"
        result = crypto.xor_apply(data, key)

        # Verify reversibility
        reversed_data = crypto.xor_apply(result, key)
        assert reversed_data == data

    def test_xor_scan_finds_key(self):
        """Test XOR scanner finds known key."""
        plaintext = b"PSNFakeName12345 VERSION=305.02 " * 10
        key = bytes([0x42])
        ciphertext = crypto.xor_apply(plaintext, key)

        candidates = crypto.xor_scan(ciphertext)

        # Best candidate should be our key
        assert len(candidates) > 0
        found_keys = [c.key for c in candidates[:3]]
        assert key in found_keys

    def test_aes_fingerprint_aligned(self):
        """Test AES fingerprint on aligned data."""
        # 16-byte IV + 32-byte ciphertext (aligned)
        data = bytes(48)
        result = crypto.aes_fingerprint(data)

        assert result.aligned is True
        assert result.mode_guess in ("cbc", "gcm", "ctr", "unknown")


class TestStructure:
    """Tests for structure module."""

    def test_find_printable_runs(self):
        """Test printable run detection."""
        data = b"\x00\x00Hello World\x00\x00TestString\x00"
        runs = structure.find_printable_runs(data, min_len=4)

        assert len(runs) == 2
        assert runs[0]["text"] == "Hello World"
        assert runs[1]["text"] == "TestString"

    def test_decode_varint(self):
        """Test varint decoding."""
        # 150 encodes as: 0x96 0x01
        data = b"\x96\x01"
        result = structure.decode_varint(data)

        assert result is not None
        value, consumed = result
        assert value == 150
        assert consumed == 2

    def test_varint_scan(self):
        """Test varint scanning."""
        # Create protobuf-like varints
        data = b"\x08\x96\x01\x10\x01\x18\x00"  # field 1 = 150, field 2 = 1, field 3 = 0
        result = structure.varint_scan(data)

        assert result["total_valid"] > 0
        assert len(result["samples"]) > 0

    def test_tlv_probe_simple(self):
        """Test TLV detection with crafted data."""
        # Create TLV pattern: [type:u8][len:u8][value...]
        records = [
            (0x01, b"abc"),
            (0x02, b"defgh"),
            (0x01, b"ij"),
            (0x03, b"klmn"),
        ]

        data = b""
        for rec_type, value in records:
            data += bytes([rec_type, len(value)]) + value

        result = structure.tlv_probe(data)

        assert result["patterns"]["t8_l8"]["records"] == len(records)
        assert result["patterns"]["t8_l8"]["coverage"] > 0.9

    def test_field_level_dump(self):
        """Test field-level dump."""
        data = b"\x00\x01\x02\x03Hello\x00\x00\x00"
        fields = structure.field_level_dump(data, max_fields=10, stride=1)

        assert len(fields) > 0
        assert "offset" in fields[0]
        assert "hex" in fields[0]


class TestPipeline:
    """Tests for the pipeline orchestrator."""

    def test_decode_bytes_basic(self):
        """Test basic byte decoding."""
        data = b"\x00\x01\x02\x03Hello World\x00\x00\x00"

        options = PipelineOptions(
            xor_scan=False,
            decompress=False,
        )

        artifact = decode_bytes(
            data,
            flow_id="test-123",
            direction="response",
            headers={},
            options=options,
        )

        assert artifact.flow_id == "test-123"
        assert artifact.direction == "response"
        assert artifact.raw == data
        assert len(artifact.decisions) > 0

    def test_decode_flow_mock(self):
        """Test flow decoding with mock data."""
        import base64

        payload = b"Test payload with some data"
        b64_payload = base64.b64encode(payload).decode()

        flow_obj = {
            "id": "test-flow-456",
            "request": {
                "headers": {"Content-Type": "application/octet-stream"},
                "body_base64": b64_payload,
            },
            "response": {
                "headers": {"VCFIELDLIST_SIZE": str(len(payload))},
                "body_base64": b64_payload,
            },
        }

        options = PipelineOptions()
        results = decode_flow(flow_obj, options=options)

        assert "request" in results
        assert "response" in results
        assert results["response"].raw == payload

    def test_write_artifacts(self):
        """Test artifact file writing."""
        data = b"Test data for artifacts"

        artifact = ArtifactSet(
            flow_id="write-test",
            direction="response",
            raw=data,
            unwrapped=data,
            recon={"test": "value", "histogram": [0] * 256},
        )

        with tempfile.TemporaryDirectory() as tmpdir:
            paths = write_artifacts(artifact, Path(tmpdir))

            assert len(paths) >= 4

            # Check files exist
            assert (Path(tmpdir) / "write-test_response_raw.bin").exists()
            assert (Path(tmpdir) / "write-test_response_unwrap.bin").exists()
            assert (Path(tmpdir) / "write-test_response_recon.json").exists()
            assert (Path(tmpdir) / "write-test_response_decoded.json").exists()


class TestFixtureValidation:
    """Tests using fixture data."""

    @pytest.fixture
    def sample_flow_path(self) -> Path:
        """Path to sample flows fixture."""
        fixture_path = Path(__file__).parent / "fixtures" / "sample_flows.jsonl"
        return fixture_path

    def test_fixture_has_target_flow(self, sample_flow_path: Path):
        """Verify target flow exists in fixture."""
        target_id = "synthetic-flow-1"

        found = False
        with open(sample_flow_path) as f:
            for line in f:
                obj = json.loads(line.strip())
                if obj.get("id") == target_id:
                    found = True
                    break

        assert found, f"Target flow {target_id} not found in fixture"

    def test_fixture_decode_produces_artifacts(self, sample_flow_path: Path):
        """Test that decoding fixture produces expected artifacts."""
        with open(sample_flow_path) as f:
            line = f.readline().strip()

        obj = json.loads(line)
        options = PipelineOptions()

        results = decode_flow(obj, options=options)

        assert len(results) > 0

        for direction, artifact in results.items():
            # Check for ASCII runs
            runs = artifact.recon.get("printable_runs", [])
            ascii_fields = [r for r in runs if r.get("length", 0) >= 6]
            assert len(ascii_fields) >= 1, f"Expected at least 1 ASCII run >= 6 chars"

            # Check for integer candidates
            field_dump = artifact.recon.get("field_dump", [])
            int_candidates = [
                f for f in field_dump
                if f.get("u32_le") is not None or f.get("u32_be") is not None
            ]
            assert len(int_candidates) >= 10, f"Expected at least 10 integer candidates"


class TestSynthetic:
    """Tests with synthetic/crafted data."""

    def test_xor_recovery_with_anchor(self):
        """Test XOR key recovery using anchor strings."""
        anchors = b"PSNFakeName VERSION=305.02 UUID-PATTERN"
        padding = bytes([0x00] * 100)
        plaintext = anchors + padding + anchors

        key = bytes([0x42])
        ciphertext = crypto.xor_apply(plaintext, key)

        candidates = crypto.xor_scan(ciphertext)

        assert len(candidates) > 0
        best = candidates[0]
        assert best.key == key or best.ascii_density > 0.3

    def test_varint_detection(self):
        """Test varint detection works correctly."""
        # Create protobuf-like data with known varints
        # Field 1 (tag 0x08) with value 150 (0x96 0x01)
        # Field 2 (tag 0x10) with value 1 (0x01)
        data = b"\x08\x96\x01\x10\x01"

        result = structure.varint_scan(data)

        # Should detect varints
        assert result["total_valid"] > 0
        assert len(result["samples"]) > 0

        # First sample should be at offset 0 (the tag byte 0x08)
        assert result["samples"][0]["offset"] == 0
        assert result["samples"][0]["value"] == 8  # 0x08 = 8


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
