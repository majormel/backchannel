"""
Pipeline orchestrator: coordinates decoding stages and manages artifacts.
"""
from __future__ import annotations

import hashlib
import json
import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Literal

from backchannel.file_security import write_private_bytes, write_private_text

from decoder import transport, crypto, structure, proto_runtime


@dataclass
class LayerDecision:
    """Record of a pipeline stage decision."""
    stage: str
    action: str
    status: Literal["PASS", "FAIL", "SKIP"]
    details: dict[str, Any] = field(default_factory=dict)


@dataclass
class ArtifactSet:
    """Complete artifact set for a flow direction."""
    flow_id: str
    direction: Literal["request", "response"]
    raw: bytes
    unwrapped: bytes
    decisions: list[LayerDecision] = field(default_factory=list)
    recon: dict[str, Any] = field(default_factory=dict)
    decoded: dict[str, Any] = field(default_factory=dict)

    def summary(self) -> str:
        """Generate summary string for logging."""
        parts = [f"size={len(self.raw)}"]

        for d in self.decisions:
            if d.status == "PASS":
                if "key" in d.details:
                    parts.append(f"{d.action}:key=0x{d.details['key'].hex()}")
                else:
                    parts.append(f"{d.action}:PASS")
            elif d.status == "FAIL":
                parts.append(f"{d.action}:FAIL")

        if self.recon:
            vd = self.recon.get("varint_analysis", {}).get("density_class", "unknown")
            parts.append(f"varints={vd}")
            runs = len(self.recon.get("printable_runs", []))
            parts.append(f"ascii_runs={runs}")

        return " ".join(parts)


@dataclass
class PipelineOptions:
    """Configuration options for the decode pipeline."""
    vcfieldlist_size: int | None = None
    proto_desc_path: str | None = None
    proto_message: str | None = None
    emit_intermediates: bool = True
    max_field_dump: int = 2000
    entropy_window: int = 256
    xor_scan: bool = True
    decompress: bool = True
    output_dir: Path | None = None


def decode_bytes(
    data: bytes,
    *,
    flow_id: str,
    direction: Literal["request", "response"],
    headers: dict[str, str],
    options: PipelineOptions,
    logger: logging.Logger | None = None,
) -> ArtifactSet:
    """
    Run full decode pipeline on raw bytes.

    Args:
        data: Raw payload bytes
        flow_id: Flow identifier
        direction: "request" or "response"
        headers: HTTP headers
        options: Pipeline options
        logger: Optional logger

    Returns:
        Complete ArtifactSet
    """
    artifact = ArtifactSet(
        flow_id=flow_id,
        direction=direction,
        raw=data,
        unwrapped=data,
    )

    current = data

    # Extract VCFIELDLIST_SIZE from headers if not in options
    vcfieldlist_size = options.vcfieldlist_size
    if vcfieldlist_size is None:
        for key, val in headers.items():
            if key.upper() == "VCFIELDLIST_SIZE":
                try:
                    vcfieldlist_size = int(val)
                except ValueError:
                    pass
                break

    def log_decision(decision: LayerDecision) -> None:
        artifact.decisions.append(decision)
        if logger:
            extra = {
                "event": f"{decision.stage}_{decision.action}",
                "flow_id": flow_id,
                "direction": direction,
                "status": decision.status,
                "details": decision.details,
            }
            logger.info(decision.action, extra=extra)

    # Stage 1: Magic byte scan
    magic = transport.scan_magic(current)
    log_decision(LayerDecision(
        stage="transport",
        action="magic_scan",
        status="PASS",
        details=magic,
    ))

    # Stage 2: Length field probing
    length_candidates = transport.probe_length_fields(current, vcfieldlist_size)
    log_decision(LayerDecision(
        stage="transport",
        action="length_probe",
        status="PASS" if length_candidates else "SKIP",
        details={"candidates": length_candidates[:3]},  # Top 3
    ))

    # Stage 3: Strip length prefix if confident
    stripped, strip_info = transport.strip_length_prefix(current, length_candidates)
    if strip_info:
        current = stripped
        log_decision(LayerDecision(
            stage="transport",
            action="strip_length",
            status="PASS",
            details={
                "stripped_bytes": strip_info["width"],
                "new_size": len(current),
            },
        ))

    # Stage 4: Try decompression
    if options.decompress:
        decompressed, decomp_decisions = transport.try_decompress(current)
        if decompressed != current:
            current = decompressed
            log_decision(LayerDecision(
                stage="transport",
                action="decompress",
                status="PASS",
                details=decomp_decisions[-1] if decomp_decisions else {},
            ))
        else:
            log_decision(LayerDecision(
                stage="transport",
                action="decompress",
                status="FAIL" if decomp_decisions else "SKIP",
                details={"attempts": [d["method"] for d in decomp_decisions]},
            ))

    # Stage 5: XOR scan
    if options.xor_scan:
        xor_candidates = crypto.xor_scan(current)

        if xor_candidates and xor_candidates[0].score > 0.1:
            best = xor_candidates[0]
            xor_decoded = crypto.xor_apply(current, best.key)

            # Verify improvement
            new_entropy = crypto.shannon_entropy(xor_decoded[:1024])
            old_entropy = crypto.shannon_entropy(current[:1024])

            if best.entropy_drop > 0.15 or best.ascii_density > 0.15:
                current = xor_decoded
                log_decision(LayerDecision(
                    stage="crypto",
                    action="xor_decode",
                    status="PASS",
                    details={
                        "key": best.key,
                        "key_hex": best.key.hex(),
                        "entropy_drop": round(best.entropy_drop, 3),
                        "ascii_density": round(best.ascii_density, 3),
                    },
                ))
            else:
                log_decision(LayerDecision(
                    stage="crypto",
                    action="xor_scan",
                    status="SKIP",
                    details={
                        "best_score": round(best.score, 3),
                        "reason": "improvement below threshold",
                    },
                ))
        else:
            log_decision(LayerDecision(
                stage="crypto",
                action="xor_scan",
                status="SKIP",
                details={"reason": "no strong candidates"},
            ))

    # Stage 6: Try decompression again (post-XOR)
    if options.decompress and current != artifact.raw:
        decompressed2, decomp2_decisions = transport.try_decompress(current)
        if decompressed2 != current:
            current = decompressed2
            log_decision(LayerDecision(
                stage="transport",
                action="decompress_post_xor",
                status="PASS",
                details=decomp2_decisions[-1] if decomp2_decisions else {},
            ))

    # Stage 7: AES fingerprint
    aes_probe = crypto.aes_fingerprint(current)
    log_decision(LayerDecision(
        stage="crypto",
        action="aes_fingerprint",
        status="PASS" if aes_probe.mode_guess != "unknown" else "SKIP",
        details={
            "mode_guess": aes_probe.mode_guess,
            "aligned": aes_probe.aligned,
            "confidence": aes_probe.confidence,
        },
    ))

    # Stage 8: AES decrypt (likely SKIP without key)
    _, decrypt_decision = crypto.decrypt_if_possible(
        current, aes_probe, None, flow_id, direction
    )
    log_decision(LayerDecision(
        stage="crypto",
        action="aes_decrypt",
        status=decrypt_decision.get("status", "SKIP"),
        details=decrypt_decision,
    ))

    # Update unwrapped
    artifact.unwrapped = current

    # Stage 9: Structure recon
    artifact.recon = structure.structure_recon(
        current,
        entropy_window=options.entropy_window,
        max_fields=options.max_field_dump,
    )

    log_decision(LayerDecision(
        stage="structure",
        action="recon",
        status="PASS",
        details={
            "entropy_windows": len(artifact.recon.get("entropy_windows", [])),
            "varint_density": artifact.recon.get("varint_analysis", {}).get("density_class"),
            "tlv_score": artifact.recon.get("tlv_analysis", {}).get("best_score"),
            "printable_runs": len(artifact.recon.get("printable_runs", [])),
        },
    ))

    # Stage 10: Protobuf decode attempt
    proto_result = proto_runtime.try_protobuf_decode(
        current,
        desc_path=options.proto_desc_path,
        message_name=options.proto_message,
    )

    if proto_result.get("decoded"):
        artifact.decoded = proto_result["decoded"]

    log_decision(LayerDecision(
        stage="proto",
        action="decode",
        status=proto_result.get("status", "SKIP"),
        details={
            "method": proto_result.get("method"),
            "fields": len(proto_result.get("decoded", {}).get("fields", []))
                if isinstance(proto_result.get("decoded"), dict) else None,
        },
    ))

    return artifact


def decode_flow(
    obj: dict[str, Any],
    *,
    options: PipelineOptions,
    logger: logging.Logger | None = None,
    directions: list[Literal["request", "response"]] | None = None,
) -> dict[str, ArtifactSet]:
    """
    Decode a complete flow object.

    Args:
        obj: Flow JSON object
        options: Pipeline options
        logger: Optional logger
        directions: Which directions to decode (default: both)

    Returns:
        Dict mapping direction to ArtifactSet
    """
    flow_id = transport.extract_flow_id(obj)

    if directions is None:
        directions = ["request", "response"]

    results: dict[str, ArtifactSet] = {}

    for direction in directions:
        body_b64 = transport.extract_body_b64(obj, direction)
        if not body_b64:
            continue

        try:
            data = transport.b64_to_bytes(body_b64)
        except ValueError as e:
            if logger:
                logger.warning(f"Failed to decode {direction} body: {e}")
            continue

        headers = transport.extract_headers(obj, direction)

        artifact = decode_bytes(
            data,
            flow_id=flow_id,
            direction=direction,
            headers=headers,
            options=options,
            logger=logger,
        )

        results[direction] = artifact

    return results


def write_artifacts(
    artifact: ArtifactSet,
    output_dir: Path,
    prefix: str | None = None,
) -> list[Path]:
    """
    Write artifact files to disk.

    Args:
        artifact: ArtifactSet to write
        output_dir: Output directory
        prefix: Optional filename prefix (default: flow_id)

    Returns:
        List of written file paths
    """
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    prefix = prefix or artifact.flow_id
    suffix = f"_{artifact.direction}" if artifact.direction else ""

    written = []

    # Raw bytes
    raw_path = output_dir / f"{prefix}{suffix}_raw.bin"
    write_private_bytes(raw_path, artifact.raw)
    written.append(raw_path)

    # Unwrapped bytes
    unwrap_path = output_dir / f"{prefix}{suffix}_unwrap.bin"
    write_private_bytes(unwrap_path, artifact.unwrapped)
    written.append(unwrap_path)

    # Recon JSON
    recon_path = output_dir / f"{prefix}{suffix}_recon.json"

    # Filter large fields for JSON output
    recon_output = {
        k: v for k, v in artifact.recon.items()
        if k != "histogram"  # Exclude histogram from JSON
    }
    recon_output["histogram_summary"] = {
        "zero_bytes": artifact.recon.get("histogram", [0])[0],
        "max_byte": max(range(256), key=lambda i: artifact.recon.get("histogram", [0]*256)[i]),
    }
    recon_output["decisions"] = [
        {
            "stage": d.stage,
            "action": d.action,
            "status": d.status,
            "details": d.details,
        }
        for d in artifact.decisions
    ]

    write_private_text(recon_path, json.dumps(recon_output, indent=2, default=str))
    written.append(recon_path)

    # Decoded JSON
    decoded_path = output_dir / f"{prefix}{suffix}_decoded.json"

    decoded_output = {
        "flow_id": artifact.flow_id,
        "direction": artifact.direction,
        "raw_size": len(artifact.raw),
        "unwrap_size": len(artifact.unwrapped),
        "raw_sha256": hashlib.sha256(artifact.raw).hexdigest()[:16],
        "unwrap_sha256": hashlib.sha256(artifact.unwrapped).hexdigest()[:16],
        "summary": artifact.summary(),
        "protobuf": artifact.decoded if artifact.decoded else None,
        "field_dump": artifact.recon.get("field_dump", [])[:100],  # First 100 fields
        "printable_runs": artifact.recon.get("printable_runs", []),
    }

    write_private_text(decoded_path, json.dumps(decoded_output, indent=2, default=str))
    written.append(decoded_path)

    return written


def write_artifacts_compat(
    artifact: ArtifactSet,
    output_dir: Path,
    prefix: str | None = None,
) -> list[Path]:
    """
    Write artifacts in spec-compatible format (no direction suffix for response).
    """
    written = write_artifacts(artifact, output_dir, prefix)

    # If response, also write without suffix for spec compatibility
    if artifact.direction == "response":
        prefix = prefix or artifact.flow_id
        output_dir = Path(output_dir)

        # Copy without suffix
        for path in list(written):
            name = path.name.replace("_response", "")
            compat_path = output_dir / name
            if not compat_path.exists() and compat_path != path:
                write_private_bytes(compat_path, path.read_bytes())
                written.append(compat_path)

    return written
