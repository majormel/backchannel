"""
Protobuf runtime support: descriptor loading and dynamic decoding.

This module provides optional protobuf decoding when .desc files are provided.
No code changes needed - just configuration.
"""
from __future__ import annotations

from pathlib import Path
from typing import Any


def load_descriptor_set(path: str | Path) -> Any:
    """
    Load a FileDescriptorSet from a .desc file.

    Args:
        path: Path to .desc file

    Returns:
        FileDescriptorSet object

    Raises:
        ImportError: If protobuf is not installed
        FileNotFoundError: If file doesn't exist
    """
    try:
        from google.protobuf import descriptor_pb2
    except ImportError as e:
        raise ImportError(
            "protobuf library required for descriptor loading. "
            "Install with: pip install protobuf"
        ) from e

    path = Path(path)
    if not path.exists():
        raise FileNotFoundError(f"Descriptor file not found: {path}")

    fds = descriptor_pb2.FileDescriptorSet()
    fds.ParseFromString(path.read_bytes())
    return fds


def build_message_factory(fds: Any) -> tuple[Any, Any]:
    """
    Build a DescriptorPool and MessageFactory from FileDescriptorSet.

    Args:
        fds: FileDescriptorSet

    Returns:
        Tuple of (DescriptorPool, MessageFactory)
    """
    try:
        from google.protobuf import descriptor_pool
        from google.protobuf import message_factory
    except ImportError as e:
        raise ImportError(
            "protobuf library required. Install with: pip install protobuf"
        ) from e

    pool = descriptor_pool.DescriptorPool()

    for file_proto in fds.file:
        pool.Add(file_proto)

    factory = message_factory.MessageFactory(pool=pool)

    return pool, factory


def get_message_class(
    pool: Any,
    factory: Any,
    message_name: str,
) -> Any:
    """
    Get a message class by full name from the pool.

    Args:
        pool: DescriptorPool
        factory: MessageFactory
        message_name: Full message name (e.g., "example.api.Response")

    Returns:
        Message class
    """
    descriptor = pool.FindMessageTypeByName(message_name)
    return factory.GetPrototype(descriptor)


def decode_with_message(
    data: bytes,
    pool: Any,
    factory: Any,
    message_name: str,
) -> dict[str, Any]:
    """
    Decode bytes using a specific message type.

    Args:
        data: Protobuf-encoded bytes
        pool: DescriptorPool
        factory: MessageFactory
        message_name: Full message name

    Returns:
        Decoded message as dict
    """
    try:
        from google.protobuf import json_format
    except ImportError as e:
        raise ImportError("protobuf library required") from e

    msg_class = get_message_class(pool, factory, message_name)
    msg = msg_class()
    msg.ParseFromString(data)

    return json_format.MessageToDict(msg, preserving_proto_field_name=True)


def decode_raw_protobuf(data: bytes) -> dict[str, Any]:
    """
    Decode protobuf without schema (raw field extraction).

    This provides a schema-less view of protobuf-encoded data,
    showing field numbers and wire types.

    Args:
        data: Potentially protobuf-encoded bytes

    Returns:
        Dict with raw field structure
    """
    from decoder.structure import decode_varint

    fields: list[dict[str, Any]] = []
    offset = 0

    while offset < len(data):
        # Read tag (field number + wire type)
        tag_result = decode_varint(data, offset)
        if tag_result is None:
            break

        tag, tag_bytes = tag_result
        offset += tag_bytes

        field_number = tag >> 3
        wire_type = tag & 0x07

        field_info: dict[str, Any] = {
            "field_number": field_number,
            "wire_type": wire_type,
            "offset": offset - tag_bytes,
        }

        try:
            if wire_type == 0:  # Varint
                value_result = decode_varint(data, offset)
                if value_result is None:
                    break
                value, value_bytes = value_result
                offset += value_bytes
                field_info["type"] = "varint"
                field_info["value"] = value

            elif wire_type == 1:  # 64-bit
                if offset + 8 > len(data):
                    break
                field_info["type"] = "fixed64"
                field_info["value_hex"] = data[offset : offset + 8].hex()
                offset += 8

            elif wire_type == 2:  # Length-delimited
                len_result = decode_varint(data, offset)
                if len_result is None:
                    break
                length, len_bytes = len_result
                offset += len_bytes
                if offset + length > len(data):
                    break
                content = data[offset : offset + length]
                offset += length

                field_info["type"] = "length_delimited"
                field_info["length"] = length

                # Try to decode as string
                try:
                    text = content.decode("utf-8")
                    if all(0x20 <= ord(c) <= 0x7E or c in "\n\r\t" for c in text):
                        field_info["value_string"] = text
                except (UnicodeDecodeError, ValueError):
                    pass

                # Always include hex for short values
                if length <= 64:
                    field_info["value_hex"] = content.hex()

                # Check if nested protobuf
                nested = decode_raw_protobuf(content)
                if nested.get("fields") and len(nested["fields"]) > 0:
                    field_info["nested"] = nested

            elif wire_type == 5:  # 32-bit
                if offset + 4 > len(data):
                    break
                field_info["type"] = "fixed32"
                field_info["value_hex"] = data[offset : offset + 4].hex()
                offset += 4

            else:
                # Unknown wire type, stop parsing
                break

        except Exception:
            break

        fields.append(field_info)

    return {
        "fields": fields,
        "parsed_bytes": offset,
        "total_bytes": len(data),
        "complete": offset == len(data),
    }


def try_protobuf_decode(
    data: bytes,
    desc_path: str | None = None,
    message_name: str | None = None,
) -> dict[str, Any]:
    """
    Attempt protobuf decoding with optional schema.

    Args:
        data: Input bytes
        desc_path: Optional path to .desc file
        message_name: Optional message name for schema-based decode

    Returns:
        Decode result dict
    """
    result: dict[str, Any] = {
        "status": "SKIP",
        "method": None,
        "decoded": None,
    }

    # Try schema-based decode if descriptor provided
    if desc_path and message_name:
        try:
            fds = load_descriptor_set(desc_path)
            pool, factory = build_message_factory(fds)
            decoded = decode_with_message(data, pool, factory, message_name)
            result["status"] = "PASS"
            result["method"] = "schema"
            result["decoded"] = decoded
            return result
        except Exception as e:
            result["schema_error"] = str(e)

    # Try raw protobuf decode
    try:
        raw = decode_raw_protobuf(data)
        if raw.get("fields") and raw.get("parsed_bytes", 0) > len(data) * 0.5:
            result["status"] = "PASS"
            result["method"] = "raw"
            result["decoded"] = raw
            return result
        else:
            result["raw_incomplete"] = raw.get("parsed_bytes", 0)
    except Exception as e:
        result["raw_error"] = str(e)

    return result
