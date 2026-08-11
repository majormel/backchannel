"""
Transport layer decoding: base64, compression, magic bytes, length-prefix probing.
"""
from __future__ import annotations

import base64
import json
import struct
import zlib
from typing import Any

# Magic byte signatures
MAGIC_SIGNATURES: dict[str, bytes] = {
    "gzip": b"\x1f\x8b",
    "zlib": b"\x78",  # 0x78 0x01/9c/da/5e
    "zlib_low": b"\x78\x01",
    "zlib_default": b"\x78\x9c",
    "zlib_best": b"\x78\xda",
    "pk_zip": b"PK",
    "protobuf_field1_varint": b"\x08",  # field 1, wire type 0
    "protobuf_field1_length": b"\x0a",  # field 1, wire type 2
}


def parse_flow_line(line: str) -> dict[str, Any]:
    """
    Parse a single JSONL line into a flow object.

    Args:
        line: Raw JSON line string

    Returns:
        Parsed flow dictionary

    Raises:
        ValueError: If line is not valid JSON
    """
    line = line.strip()
    if not line:
        raise ValueError("Empty line")
    return json.loads(line)


def extract_flow_id(obj: dict[str, Any]) -> str:
    """
    Extract flow ID with fallback keys.

    Args:
        obj: Flow object

    Returns:
        Flow ID string
    """
    for key in ("id", "flow_id", "uuid", "_id"):
        if key in obj:
            return str(obj[key])
    raise KeyError("No flow ID found in object")


def extract_headers(obj: dict[str, Any], direction: str) -> dict[str, str]:
    """
    Extract headers for request or response.

    Args:
        obj: Flow object
        direction: "request" or "response"

    Returns:
        Headers dictionary (case-preserved keys)
    """
    container = obj.get(direction, {})
    headers = container.get("headers", {})

    # Handle list-of-tuples format
    if isinstance(headers, list):
        return {str(k): str(v) for k, v in headers}

    return {str(k): str(v) for k, v in headers.items()}


def extract_body_b64(obj: dict[str, Any], direction: str) -> str | None:
    """
    Extract base64-encoded body from flow.

    Args:
        obj: Flow object
        direction: "request" or "response"

    Returns:
        Base64 string or None if not present
    """
    container = obj.get(direction, {})

    # Try multiple field names
    for key in ("body_base64", "content_base64", "body_b64", "content"):
        if key in container:
            val = container[key]
            if isinstance(val, str):
                return val

    return None


def b64_to_bytes(data_b64: str) -> bytes:
    """
    Decode base64 string to bytes.

    Args:
        data_b64: Base64-encoded string

    Returns:
        Decoded bytes

    Raises:
        ValueError: If decoding fails
    """
    try:
        # Handle URL-safe base64
        data_b64 = data_b64.replace("-", "+").replace("_", "/")
        # Add padding if needed
        padding = 4 - (len(data_b64) % 4)
        if padding != 4:
            data_b64 += "=" * padding
        return base64.b64decode(data_b64)
    except Exception as e:
        raise ValueError(f"Base64 decode failed: {e}") from e


def scan_magic(data: bytes) -> dict[str, Any]:
    """
    Scan for known magic byte signatures.

    Args:
        data: Raw bytes to scan

    Returns:
        Dict with prefix_hex and list of matches
    """
    if len(data) < 2:
        return {"prefix_hex": data.hex(), "matches": []}

    prefix = data[:4] if len(data) >= 4 else data
    matches = []

    for name, sig in MAGIC_SIGNATURES.items():
        if data.startswith(sig):
            matches.append(name)

    return {
        "prefix_hex": prefix.hex(),
        "matches": matches,
    }


def probe_length_fields(
    data: bytes,
    vcfieldlist_size: int | None = None,
) -> list[dict[str, Any]]:
    """
    Probe for length-prefix patterns at various offsets.

    Args:
        data: Raw bytes
        vcfieldlist_size: Expected size from VCFIELDLIST_SIZE header

    Returns:
        List of candidate length fields
    """
    candidates = []
    total_size = len(data)

    # Offsets and formats to probe
    probes = [
        (0, "<H", 2, "le", 16),   # u16 LE at offset 0
        (0, ">H", 2, "be", 16),   # u16 BE at offset 0
        (0, "<I", 4, "le", 32),   # u32 LE at offset 0
        (0, ">I", 4, "be", 32),   # u32 BE at offset 0
        (2, "<H", 2, "le", 16),   # u16 LE at offset 2
        (2, ">H", 2, "be", 16),   # u16 BE at offset 2
        (4, "<I", 4, "le", 32),   # u32 LE at offset 4
        (4, ">I", 4, "be", 32),   # u32 BE at offset 4
        (8, "<I", 4, "le", 32),   # u32 LE at offset 8
    ]

    for offset, fmt, width, endian, bits in probes:
        if offset + width > len(data):
            continue

        try:
            value = struct.unpack(fmt, data[offset : offset + width])[0]
        except struct.error:
            continue

        # Check match conditions
        remaining = total_size - offset - width

        match_type = None
        if value == total_size:
            match_type = "exact_total"
        elif value == remaining:
            match_type = "exact_remaining"
        elif vcfieldlist_size is not None and value == vcfieldlist_size:
            match_type = "vcfieldlist_match"
        elif abs(value - remaining) <= 16:  # Allow small variance for padding
            match_type = "approx_remaining"

        if match_type or (0 < value < total_size * 2):
            candidates.append({
                "offset": offset,
                "endian": endian,
                "width": width,
                "bits": bits,
                "value": value,
                "match": match_type,
                "remaining_after": remaining,
            })

    # Sort by match quality
    def match_score(c: dict[str, Any]) -> int:
        m = c.get("match")
        if m == "exact_remaining":
            return 0
        if m == "exact_total":
            return 1
        if m == "vcfieldlist_match":
            return 2
        if m == "approx_remaining":
            return 3
        return 4

    candidates.sort(key=match_score)
    return candidates


def try_decompress(data: bytes) -> tuple[bytes, list[dict[str, Any]]]:
    """
    Attempt various decompression methods.

    Args:
        data: Potentially compressed bytes

    Returns:
        Tuple of (decompressed bytes, decision list)
        If decompression fails, returns original data.
    """
    decisions = []

    # Try gzip-compatible zlib (auto-detect gzip/zlib)
    try:
        result = zlib.decompress(data, wbits=zlib.MAX_WBITS | 32)
        decisions.append({
            "method": "zlib_gzip_auto",
            "status": "PASS",
            "original_size": len(data),
            "decompressed_size": len(result),
        })
        return result, decisions
    except zlib.error as e:
        decisions.append({
            "method": "zlib_gzip_auto",
            "status": "FAIL",
            "error": str(e),
        })

    # Try raw deflate (no header)
    try:
        result = zlib.decompress(data, wbits=-zlib.MAX_WBITS)
        decisions.append({
            "method": "zlib_raw",
            "status": "PASS",
            "original_size": len(data),
            "decompressed_size": len(result),
        })
        return result, decisions
    except zlib.error as e:
        decisions.append({
            "method": "zlib_raw",
            "status": "FAIL",
            "error": str(e),
        })

    # Try standard zlib
    try:
        result = zlib.decompress(data)
        decisions.append({
            "method": "zlib_standard",
            "status": "PASS",
            "original_size": len(data),
            "decompressed_size": len(result),
        })
        return result, decisions
    except zlib.error as e:
        decisions.append({
            "method": "zlib_standard",
            "status": "FAIL",
            "error": str(e),
        })

    return data, decisions


def strip_length_prefix(
    data: bytes,
    candidates: list[dict[str, Any]],
) -> tuple[bytes, dict[str, Any] | None]:
    """
    Strip length prefix if a strong candidate exists.

    Args:
        data: Raw bytes
        candidates: Length field candidates from probe_length_fields

    Returns:
        Tuple of (stripped bytes, selected candidate or None)
    """
    if not candidates:
        return data, None

    # Only strip if we have a confident match
    best = candidates[0]
    match_type = best.get("match")

    if match_type not in ("exact_remaining", "exact_total", "vcfieldlist_match"):
        return data, None

    offset = best["offset"]
    width = best["width"]
    strip_start = offset + width

    if strip_start >= len(data):
        return data, None

    return data[strip_start:], best
