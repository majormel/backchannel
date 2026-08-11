from __future__ import annotations
from dataclasses import dataclass, field
from typing import Literal
from decoder.crypto import shannon_entropy, ascii_density

EncodingHint = Literal["grpc","msgpack","protobuf","gzip","zlib","json","text","xor_encrypted","aes_encrypted","unknown"]

@dataclass
class ClassifierResult:
    hint: EncodingHint
    confidence: float
    evidence: dict = field(default_factory=dict)
    alternatives: list[tuple[EncodingHint, float]] = field(default_factory=list)

def classify(data: bytes, content_type: str = "") -> ClassifierResult:
    if not data:
        return ClassifierResult(hint="unknown", confidence=0.0)
    scores: dict[str, float] = {}
    evidence: dict = {}
    if data[:2] == b"\x1f\x8b":
        scores["gzip"] = 0.95
        evidence["magic"] = "gzip"
    if len(data) >= 2 and data[0] == 0x78 and data[1] in (0x01, 0x9c, 0xda, 0x5e):
        scores["zlib"] = 0.90
        evidence["zlib_magic"] = True
    if len(data) >= 5 and data[0] in (0, 1):
        declared = int.from_bytes(data[1:5], "big")
        if declared == len(data) - 5:
            scores["grpc"] = 0.92
            evidence["grpc_frame_len"] = declared
    first = data[0]
    if 0x80 <= first <= 0x8f:
        scores["msgpack"] = 0.60
        evidence["msgpack_fixmap"] = f"0x{first:02x}"
    elif 0x90 <= first <= 0x9f:
        scores["msgpack"] = 0.60
        evidence["msgpack_fixarray"] = f"0x{first:02x}"
    elif first in (0xde, 0xdf, 0xdc, 0xdd):
        scores["msgpack"] = 0.65
        evidence[f"msgpack_0x{first:02x}"] = True
    ct = content_type.lower()
    if "grpc" in ct:
        scores["grpc"] = max(scores.get("grpc", 0.0), 0.85)
    if "msgpack" in ct:
        scores["msgpack"] = max(scores.get("msgpack", 0.0), 0.85)
    if "protobuf" in ct or "octet-stream" in ct:
        scores["protobuf"] = max(scores.get("protobuf", 0.0), 0.50)
    sample = data[:2048]
    entropy = shannon_entropy(sample)
    density = ascii_density(sample)
    evidence["entropy"] = round(entropy, 3)
    evidence["ascii_density"] = round(density, 3)
    if density > 0.90:
        stripped = sample.lstrip(b" \t\r\n")
        if stripped[:1] in (b"{", b"["):
            scores["json"] = 0.90
        else:
            scores["text"] = 0.80
    elif entropy > 7.5:
        scores["aes_encrypted"] = 0.75
    elif entropy > 6.8 and density < 0.10:
        scores["xor_encrypted"] = 0.55
    proto_markers = sum(1 for b in sample[:256] if b in (0x08,0x0a,0x10,0x12,0x18,0x1a,0x20,0x22,0x28,0x2a,0x30,0x32,0x38,0x3a))
    if proto_markers > 5:
        scores["protobuf"] = max(scores.get("protobuf", 0.0), min(0.40 + proto_markers * 0.02, 0.75))
        evidence["proto_field_markers"] = proto_markers
    if not scores:
        scores["unknown"] = 0.50
    best = max(scores, key=lambda k: scores[k])
    alts = sorted([(h, s) for h, s in scores.items() if h != best], key=lambda x: -x[1])[:3]
    return ClassifierResult(hint=best, confidence=scores[best], evidence=evidence, alternatives=alts)
