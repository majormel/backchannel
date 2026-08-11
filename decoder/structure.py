"""
Structural analysis: entropy mapping, TLV detection, varint scanning, field extraction.
"""
from __future__ import annotations

import struct
from typing import Any


def byte_histogram(data: bytes) -> list[int]:
    """
    Calculate byte frequency histogram.

    Args:
        data: Input bytes

    Returns:
        List of 256 frequency counts
    """
    hist = [0] * 256
    for b in data:
        hist[b] += 1
    return hist


def entropy_windows(
    data: bytes,
    window: int = 256,
) -> list[dict[str, Any]]:
    """
    Calculate entropy over sliding windows.

    Args:
        data: Input bytes
        window: Window size in bytes

    Returns:
        List of {offset, entropy} dicts
    """
    from decoder.crypto import shannon_entropy

    results = []
    step = max(1, window // 4)  # 75% overlap

    for i in range(0, len(data) - window + 1, step):
        chunk = data[i : i + window]
        ent = shannon_entropy(chunk)
        results.append({
            "offset": i,
            "entropy": round(ent, 3),
        })

    return results


def find_printable_runs(
    data: bytes,
    min_len: int = 6,
) -> list[dict[str, Any]]:
    """
    Find runs of printable ASCII characters.

    Args:
        data: Input bytes
        min_len: Minimum run length to report

    Returns:
        List of {offset, length, text} dicts
    """
    runs = []
    current_start = None
    current_chars: list[str] = []

    for i, b in enumerate(data):
        if 0x20 <= b <= 0x7E:
            if current_start is None:
                current_start = i
            current_chars.append(chr(b))
        else:
            if current_start is not None and len(current_chars) >= min_len:
                runs.append({
                    "offset": current_start,
                    "length": len(current_chars),
                    "text": "".join(current_chars),
                })
            current_start = None
            current_chars = []

    # Handle trailing run
    if current_start is not None and len(current_chars) >= min_len:
        runs.append({
            "offset": current_start,
            "length": len(current_chars),
            "text": "".join(current_chars),
        })

    return runs


def decode_varint(data: bytes, offset: int = 0) -> tuple[int, int] | None:
    """
    Decode a protobuf-style varint.

    Args:
        data: Input bytes
        offset: Starting offset

    Returns:
        Tuple of (value, bytes_consumed) or None if invalid
    """
    result = 0
    shift = 0

    for i in range(min(10, len(data) - offset)):  # Max 10 bytes for varint
        if offset + i >= len(data):
            return None

        b = data[offset + i]
        result |= (b & 0x7F) << shift
        shift += 7

        if (b & 0x80) == 0:
            return result, i + 1

    return None


def varint_scan(
    data: bytes,
    max_len: int = 10,
) -> dict[str, Any]:
    """
    Scan for varint-like patterns.

    Args:
        data: Input bytes
        max_len: Maximum varint length

    Returns:
        Dict with heatmap, counts, samples
    """
    heatmap = []  # Per-offset: looks like varint start
    samples = []
    valid_count = 0

    for i in range(len(data)):
        result = decode_varint(data, i)
        is_valid = result is not None
        heatmap.append(1 if is_valid else 0)

        if is_valid:
            valid_count += 1
            value, consumed = result
            if len(samples) < 20 and consumed <= max_len:
                samples.append({
                    "offset": i,
                    "value": value,
                    "bytes": consumed,
                })

    # Calculate density
    density = valid_count / len(data) if data else 0

    # Classify density
    if density > 0.5:
        density_class = "high"
    elif density > 0.2:
        density_class = "moderate"
    else:
        density_class = "low"

    return {
        "total_valid": valid_count,
        "density": round(density, 3),
        "density_class": density_class,
        "samples": samples,
        "heatmap_summary": {
            "length": len(heatmap),
            "ones": sum(heatmap),
        },
    }


def tlv_probe(
    data: bytes,
    max_records: int = 2048,
) -> dict[str, Any]:
    """
    Probe for TLV (Type-Length-Value) patterns.

    Args:
        data: Input bytes
        max_records: Maximum records to scan

    Returns:
        Dict with pattern scores and record info
    """
    results = {}

    # Pattern: [type:u8][len:u8][value...]
    results["t8_l8"] = _probe_tlv_pattern(data, 1, 1, "<", max_records)

    # Pattern: [type:u8][len:u16_le][value...]
    results["t8_l16_le"] = _probe_tlv_pattern(data, 1, 2, "<", max_records)

    # Pattern: [type:u8][len:u16_be][value...]
    results["t8_l16_be"] = _probe_tlv_pattern(data, 1, 2, ">", max_records)

    # Pattern: [type:u16_le][len:u16_le][value...]
    results["t16_l16_le"] = _probe_tlv_pattern(data, 2, 2, "<", max_records)

    # Find best pattern
    best_pattern = max(results.keys(), key=lambda k: results[k]["score"])

    return {
        "patterns": results,
        "best_pattern": best_pattern,
        "best_score": results[best_pattern]["score"],
    }


def _probe_tlv_pattern(
    data: bytes,
    type_bytes: int,
    len_bytes: int,
    endian: str,
    max_records: int,
) -> dict[str, Any]:
    """Probe a specific TLV pattern."""
    header_size = type_bytes + len_bytes

    if len(data) < header_size:
        return {"score": 0, "records": 0, "coverage": 0}

    fmt = f"{endian}{'B' if type_bytes == 1 else 'H'}{'B' if len_bytes == 1 else 'H'}"

    offset = 0
    records = 0
    types_seen: set[int] = set()

    while offset + header_size <= len(data) and records < max_records:
        try:
            parsed = struct.unpack(fmt, data[offset : offset + header_size])
            rec_type = parsed[0]
            rec_len = parsed[1]
        except struct.error:
            break

        # Validate length
        if rec_len > len(data) - offset - header_size:
            break

        types_seen.add(rec_type)
        offset += header_size + rec_len
        records += 1

    coverage = offset / len(data) if data else 0

    # Score based on coverage, record count, and type diversity
    type_factor = min(1.0, len(types_seen) / 10)  # Favor some diversity
    score = coverage * 0.5 + (1 if records > 5 else records / 10) * 0.3 + type_factor * 0.2

    return {
        "score": round(score, 3),
        "records": records,
        "coverage": round(coverage, 3),
        "types_seen": len(types_seen),
    }


def field_level_dump(
    data: bytes,
    max_fields: int = 2000,
    stride: int = 4,
) -> list[dict[str, Any]]:
    """
    Dump field-level interpretation at each offset.

    Args:
        data: Input bytes
        max_fields: Maximum fields to return
        stride: Offset stride

    Returns:
        List of field interpretations
    """
    fields = []

    for offset in range(0, min(len(data), max_fields * stride), stride):
        field: dict[str, Any] = {
            "offset": offset,
            "hex": data[offset : offset + 8].hex() if offset + 8 <= len(data) else data[offset:].hex(),
        }

        # u16 LE/BE
        if offset + 2 <= len(data):
            field["u16_le"] = struct.unpack("<H", data[offset : offset + 2])[0]
            field["u16_be"] = struct.unpack(">H", data[offset : offset + 2])[0]

        # u32 LE/BE
        if offset + 4 <= len(data):
            field["u32_le"] = struct.unpack("<I", data[offset : offset + 4])[0]
            field["u32_be"] = struct.unpack(">I", data[offset : offset + 4])[0]

        # float LE
        if offset + 4 <= len(data):
            try:
                f = struct.unpack("<f", data[offset : offset + 4])[0]
                # Only include if it's a "reasonable" float
                if -1e10 < f < 1e10 and f != 0:
                    field["float_le"] = round(f, 6)
            except (struct.error, ValueError):
                pass

        # ASCII candidate
        run = []
        for i in range(offset, min(offset + 32, len(data))):
            if 0x20 <= data[i] <= 0x7E:
                run.append(chr(data[i]))
            else:
                break
        if len(run) >= 4:
            field["ascii"] = "".join(run)

        # Varint
        varint_result = decode_varint(data, offset)
        if varint_result:
            val, consumed = varint_result
            if consumed <= 5:  # Reasonable varint
                field["varint"] = {"value": val, "bytes": consumed}

        fields.append(field)

        if len(fields) >= max_fields:
            break

    return fields


def structure_recon(
    data: bytes,
    entropy_window: int = 256,
    max_fields: int = 2000,
) -> dict[str, Any]:
    """
    Perform comprehensive structural reconnaissance.

    Args:
        data: Input bytes
        entropy_window: Window size for entropy calculation
        max_fields: Maximum fields for field dump

    Returns:
        Complete recon report
    """
    return {
        "size": len(data),
        "histogram": byte_histogram(data),
        "entropy_windows": entropy_windows(data, entropy_window),
        "printable_runs": find_printable_runs(data),
        "varint_analysis": varint_scan(data),
        "tlv_analysis": tlv_probe(data),
        "field_dump": field_level_dump(data, max_fields),
    }
