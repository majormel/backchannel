from __future__ import annotations
import json
from dataclasses import dataclass, field
from typing import Any, Literal
from decoder.encoding_classifier import classify
from decoder.decode_memory import DecodeMemory
from decoder.pipeline import decode_bytes, PipelineOptions, ArtifactSet
from decoder.grpc import is_grpc, decode_grpc_stream
from decoder.msgpack_decoder import is_msgpack, decode_msgpack

_memory: DecodeMemory | None = None

def _get_memory() -> DecodeMemory:
    global _memory
    if _memory is None:
        _memory = DecodeMemory()
    return _memory

@dataclass
class SmartResult:
    method: Literal["memory","classifier","grpc","msgpack","pipeline","raw"]
    hint: str
    confidence: float
    decoded: Any
    chain: list[str] = field(default_factory=list)
    artifact: ArtifactSet | None = None
    evidence: dict = field(default_factory=dict)
    error: str | None = None

def smart_decode(
    data: bytes,
    *,
    content_type: str = "",
    url: str = "",
    flow_id: str = "unknown",
    direction: Literal["request","response"] = "response",
    headers: dict[str, str] | None = None,
    options: PipelineOptions | None = None,
    use_memory: bool = True,
) -> SmartResult:
    headers = headers or {}
    if options is None:
        options = PipelineOptions()
    if use_memory:
        records = _get_memory().lookup(data, content_type)
        if records:
            best = records[0]
            return SmartResult(method="memory", hint=best.chain[0] if best.chain else "unknown",
                               confidence=min(0.50 + best.success_count * 0.05, 0.95),
                               decoded={"memory_chain": best.chain, "success_count": best.success_count},
                               chain=best.chain)
    classification = classify(data, content_type)
    hint = classification.hint
    evidence = classification.evidence
    url_prefix = url.split("?")[0][:128] if url else None
    if hint == "grpc" or is_grpc(data):
        frames = decode_grpc_stream(data)
        if frames:
            decoded = [{"compressed": f.compressed, "length": f.declared_length,
                        "protobuf": f.protobuf, "error": f.error} for f in frames]
            chain = ["grpc_frame", "protobuf"]
            if use_memory:
                _get_memory().record(data, chain, content_type=content_type, url_pattern=url_prefix)
            return SmartResult(method="grpc", hint="grpc", confidence=classification.confidence,
                               decoded=decoded[0] if len(decoded) == 1 else decoded, chain=chain, evidence=evidence)
    if hint == "msgpack" or is_msgpack(data):
        result = decode_msgpack(data)
        if result.success:
            chain = ["msgpack"]
            if use_memory:
                _get_memory().record(data, chain, content_type=content_type, url_pattern=url_prefix)
            return SmartResult(method="msgpack", hint="msgpack", confidence=classification.confidence,
                               decoded=result.value, chain=chain, evidence=evidence)
    if hint in ("json", "text"):
        try:
            text = data.decode("utf-8", errors="replace")
            decoded = json.loads(text) if hint == "json" else text
            chain = ["utf8", "json"] if hint == "json" else ["utf8"]
            return SmartResult(method="classifier", hint=hint, confidence=classification.confidence,
                               decoded=decoded, chain=chain, evidence=evidence)
        except Exception:
            pass
    artifact = decode_bytes(data, flow_id=flow_id, direction=direction, headers=headers, options=options)
    chain = [d.action for d in artifact.decisions if d.status == "PASS"]
    decoded_result: Any = artifact.decoded or artifact.recon
    if chain and use_memory and artifact.decoded:
        _get_memory().record(data, chain, content_type=content_type, url_pattern=url_prefix)
    return SmartResult(method="pipeline", hint=hint, confidence=classification.confidence * 0.8,
                       decoded=decoded_result, chain=chain, artifact=artifact, evidence=evidence)

def get_decode_suggestions(data: bytes, content_type: str = "") -> list[dict]:
    classification = classify(data, content_type)
    suggestions: list[dict] = [{"hint": classification.hint, "confidence": classification.confidence, "evidence": classification.evidence}]
    for ah, ac in classification.alternatives:
        suggestions.append({"hint": ah, "confidence": ac})
    if is_grpc(data):
        suggestions.insert(0, {"hint": "grpc", "confidence": 0.95, "evidence": {"grpc_frame": True}})
    if is_msgpack(data) and not any(s["hint"] == "msgpack" for s in suggestions):
        suggestions.append({"hint": "msgpack", "confidence": 0.70})
    records = _get_memory().lookup(data, content_type)
    if records:
        suggestions.insert(0, {"hint": "memory", "confidence": min(0.50 + records[0].success_count * 0.05, 0.95),
                                "chain": records[0].chain, "success_count": records[0].success_count})
    return suggestions[:5]
