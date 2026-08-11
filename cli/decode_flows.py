#!/usr/bin/env python3
"""
Offline CLI tool for decoding captured flow payloads.

Usage:
    uv run python -m cli.decode_flows \\
        --flows tests/fixtures/sample_flows.jsonl \\
        --out artifacts/ \\
        --flow-id 9b54a987-0487-4ebe-8ef6-b75a95968ce1
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Literal

from decoder import get_logger, log_event
from decoder.pipeline import (
    PipelineOptions,
    decode_flow,
    write_artifacts_compat,
)
from decoder.transport import extract_flow_id, parse_flow_line


def parse_args() -> argparse.Namespace:
    """Parse command line arguments."""
    parser = argparse.ArgumentParser(
        description="Decode captured flow payloads from JSONL",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Decode specific flow
  python -m cli.decode_flows --flows backchannel_flows.jsonl --out artifacts/ \\
      --flow-id 9b54a987-0487-4ebe-8ef6-b75a95968ce1

  # Decode all flows
  python -m cli.decode_flows --flows backchannel_flows.jsonl --out artifacts/ --all

  # Decode with protobuf schema
  python -m cli.decode_flows --flows backchannel_flows.jsonl --out artifacts/ \\
      --flow-id abc123 --proto-desc schemas/example.desc \\
      --proto-message example.api.Response
        """,
    )

    parser.add_argument(
        "--flows",
        type=Path,
        required=True,
        help="Path to JSONL file containing flows",
    )

    parser.add_argument(
        "--out",
        type=Path,
        required=True,
        help="Output directory for artifacts",
    )

    parser.add_argument(
        "--flow-id",
        type=str,
        help="Specific flow ID to decode",
    )

    parser.add_argument(
        "--all",
        action="store_true",
        help="Decode all flows in file",
    )

    parser.add_argument(
        "--side",
        choices=["request", "response", "both"],
        default="response",
        help="Which side(s) to decode (default: response)",
    )

    parser.add_argument(
        "--proto-desc",
        type=Path,
        help="Path to protobuf .desc file",
    )

    parser.add_argument(
        "--proto-message",
        type=str,
        help="Full protobuf message name (e.g., example.api.Response)",
    )

    parser.add_argument(
        "--max-fields",
        type=int,
        default=2000,
        help="Maximum fields in field dump (default: 2000)",
    )

    parser.add_argument(
        "--no-xor",
        action="store_true",
        help="Disable XOR scanning",
    )

    parser.add_argument(
        "--no-decompress",
        action="store_true",
        help="Disable decompression attempts",
    )

    parser.add_argument(
        "--json-logs",
        action="store_true",
        help="Output logs as JSON lines",
    )

    parser.add_argument(
        "--quiet",
        action="store_true",
        help="Suppress progress output",
    )

    return parser.parse_args()


def main() -> int:
    """Main entry point."""
    args = parse_args()

    # Validate arguments
    if not args.flow_id and not args.all:
        print("Error: Must specify --flow-id or --all", file=sys.stderr)
        return 1

    if not args.flows.exists():
        print(f"Error: Flows file not found: {args.flows}", file=sys.stderr)
        return 1

    # Setup logging
    logger = get_logger("decode_flows", json_format=args.json_logs)
    if args.quiet:
        logger.setLevel("WARNING")

    # Configure pipeline
    directions: list[Literal["request", "response"]]
    if args.side == "both":
        directions = ["request", "response"]
    else:
        directions = [args.side]  # type: ignore

    options = PipelineOptions(
        proto_desc_path=str(args.proto_desc) if args.proto_desc else None,
        proto_message=args.proto_message,
        max_field_dump=args.max_fields,
        xor_scan=not args.no_xor,
        decompress=not args.no_decompress,
        output_dir=args.out,
    )

    # Create output directory
    args.out.mkdir(parents=True, exist_ok=True)

    # Process flows
    processed = 0
    errors = 0

    with open(args.flows, "r") as f:
        for line_num, line in enumerate(f, 1):
            line = line.strip()
            if not line:
                continue

            try:
                obj = parse_flow_line(line)
                flow_id = extract_flow_id(obj)
            except (json.JSONDecodeError, KeyError) as e:
                if not args.quiet:
                    print(f"Warning: Line {line_num}: {e}", file=sys.stderr)
                errors += 1
                continue

            # Filter by flow ID if specified
            if args.flow_id and flow_id != args.flow_id:
                continue

            if not args.quiet:
                print(f"Processing flow: {flow_id}")

            log_event(
                logger,
                "decode_start",
                flow_id,
                "both",
                "PASS",
                {"line": line_num},
            )

            try:
                results = decode_flow(
                    obj,
                    options=options,
                    logger=logger if args.json_logs else None,
                    directions=directions,
                )

                for direction, artifact in results.items():
                    paths = write_artifacts_compat(artifact, args.out)

                    if not args.quiet:
                        print(f"  {direction}: {artifact.summary()}")
                        for p in paths:
                            print(f"    -> {p}")

                    log_event(
                        logger,
                        "decode_done",
                        flow_id,
                        direction,
                        "PASS",
                        {
                            "artifacts": [str(p) for p in paths],
                            "summary": artifact.summary(),
                        },
                    )

                processed += 1

            except Exception as e:
                print(f"Error processing flow {flow_id}: {e}", file=sys.stderr)
                errors += 1
                log_event(
                    logger,
                    "decode_error",
                    flow_id,
                    "both",
                    "FAIL",
                    {"error": str(e)},
                )

            # Exit after first match if specific flow requested
            if args.flow_id and processed > 0:
                break

    # Summary
    if not args.quiet:
        print(f"\nProcessed: {processed} flows, Errors: {errors}")

    if args.flow_id and processed == 0:
        print(f"Error: Flow {args.flow_id} not found", file=sys.stderr)
        return 1

    return 0 if errors == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
