from __future__ import annotations
import zlib
from dataclasses import dataclass
from typing import Any
from decoder.proto_runtime import decode_raw_protobuf

@dataclass
class GrpcFrame:
    compressed: bool
    declared_length: int
    body: bytes
    protobuf: dict[str, Any] | None = None
    error: str | None = None

def is_grpc(data: bytes) -> bool:
    if len(data) < 5 or data[0] not in (0, 1):
        return False
    return int.from_bytes(data[1:5], "big") == len(data) - 5

def decode_grpc(data: bytes) -> GrpcFrame | None:
    if not is_grpc(data):
        return None
    compressed = data[0] == 1
    declared_length = int.from_bytes(data[1:5], "big")
    body = data[5:]
    if compressed:
        try:
            body = zlib.decompress(body, 16 + zlib.MAX_WBITS)
        except zlib.error:
            return GrpcFrame(compressed=True, declared_length=declared_length, body=body, error="gzip decompression failed")
    result = decode_raw_protobuf(body)
    return GrpcFrame(compressed=compressed, declared_length=declared_length, body=body, protobuf=result.get("decoded"))

def decode_grpc_stream(data: bytes) -> list[GrpcFrame]:
    frames: list[GrpcFrame] = []
    offset = 0
    while offset < len(data):
        if offset + 5 > len(data):
            break
        if data[offset] not in (0, 1):
            break
        length = int.from_bytes(data[offset + 1:offset + 5], "big")
        end = offset + 5 + length
        if end > len(data):
            break
        frame = decode_grpc(data[offset:end])
        if frame:
            frames.append(frame)
        offset = end
    return frames
