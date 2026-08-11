"""
Forensic decoder pipeline for captured HTTP payloads.

This package provides layered transform chains for analyzing opaque
application/octet-stream payloads captured via mitmproxy.
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any


class JsonLineFormatter(logging.Formatter):
    """Format log records as JSON lines for structured logging."""

    def format(self, record: logging.LogRecord) -> str:
        log_obj: dict[str, Any] = {
            "ts": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "event": getattr(record, "event", record.msg),
        }

        # Add extra fields from record
        for key in ("flow_id", "direction", "stage", "status", "details"):
            if hasattr(record, key):
                log_obj[key] = getattr(record, key)

        # If message is different from event, include it
        if record.msg and record.msg != log_obj.get("event"):
            if not hasattr(record, "event"):
                log_obj["event"] = record.msg

        return json.dumps(log_obj, default=str)


def get_logger(name: str, json_format: bool = True) -> logging.Logger:
    """
    Get a configured logger instance.

    Args:
        name: Logger name (typically __name__)
        json_format: If True, use JSON line formatting

    Returns:
        Configured logger instance
    """
    logger = logging.getLogger(name)

    if not logger.handlers:
        handler = logging.StreamHandler()
        if json_format:
            handler.setFormatter(JsonLineFormatter())
        else:
            handler.setFormatter(
                logging.Formatter("%(asctime)s [%(levelname)s] %(message)s")
            )
        logger.addHandler(handler)
        logger.setLevel(logging.INFO)

    return logger


def log_event(
    logger: logging.Logger,
    event: str,
    flow_id: str,
    direction: str,
    status: str,
    details: dict[str, Any] | None = None,
    level: int = logging.INFO,
) -> None:
    """
    Log a structured pipeline event.

    Args:
        logger: Logger instance
        event: Event name (e.g., "transport_magic")
        flow_id: Flow identifier
        direction: "request" or "response"
        status: "PASS", "FAIL", or "SKIP"
        details: Additional event details
        level: Log level
    """
    extra = {
        "event": event,
        "flow_id": flow_id,
        "direction": direction,
        "status": status,
        "details": details or {},
    }
    logger.log(level, event, extra=extra)


from decoder.pipeline import (
    ArtifactSet,
    LayerDecision,
    PipelineOptions,
    decode_bytes,
    decode_flow,
)
from decoder.encoding_classifier import classify, ClassifierResult
from decoder.decode_memory import DecodeMemory, ChainRecord
from decoder.grpc import decode_grpc, decode_grpc_stream, is_grpc, GrpcFrame
from decoder.msgpack_decoder import decode_msgpack, is_msgpack, MsgpackResult
from decoder.smart_pipeline import smart_decode, get_decode_suggestions, SmartResult

__all__ = [
    "ArtifactSet",
    "LayerDecision",
    "PipelineOptions",
    "decode_bytes",
    "decode_flow",
    "get_logger",
    "log_event",
    "JsonLineFormatter",
    "classify",
    "ClassifierResult",
    "DecodeMemory",
    "ChainRecord",
    "decode_grpc",
    "decode_grpc_stream",
    "is_grpc",
    "GrpcFrame",
    "decode_msgpack",
    "is_msgpack",
    "MsgpackResult",
    "smart_decode",
    "get_decode_suggestions",
    "SmartResult",
]
