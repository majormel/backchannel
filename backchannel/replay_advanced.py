from __future__ import annotations
import json
import re
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
from typing import Any


class FuzzingStrategies:
    @staticmethod
    def integer_boundaries(value: int | None = 0) -> list[Any]:
        base = int(value) if value is not None else 0
        return [0, -1, 1, base, base + 1, base - 1, 2**31 - 1, 2**31, -2**31, 2**63 - 1]

    @staticmethod
    def sql_injection() -> list[str]:
        return ["' OR '1'='1", "'; DROP TABLE users; --", "1' UNION SELECT NULL--", "admin'--", "' OR 1=1--"]

    @staticmethod
    def path_traversal() -> list[str]:
        return ["../../../etc/passwd", "....//....//etc/passwd", "%2e%2e%2f%2e%2e%2fetc%2fpasswd", "..\\..\\..\\windows\\system32\\drivers\\etc\\hosts"]

    @staticmethod
    def xss() -> list[str]:
        return ["<script>alert(1)</script>", '"><img src=x onerror=alert(1)>', "javascript:alert(1)", "<svg onload=alert(1)>"]

    @staticmethod
    def string_edge_cases() -> list[str]:
        return ["", " ", "\x00", "a" * 1000, "\n\r\t", "unicode_test"]

    @classmethod
    def for_strategy(cls, strategy: str, base_value: Any = None) -> list[Any]:
        if strategy == "boundaries":
            return cls.integer_boundaries(base_value)
        if strategy == "sql":
            return cls.sql_injection()
        if strategy == "path_traversal":
            return cls.path_traversal()
        if strategy == "xss":
            return cls.xss()
        if strategy == "strings":
            return cls.string_edge_cases()
        return [base_value]


def _set_nested(obj: Any, path: list[str], value: Any) -> Any:
    if not path:
        return value
    key = path[0]
    if isinstance(obj, dict):
        result = dict(obj)
        result[key] = _set_nested(obj.get(key), path[1:], value)
        return result
    if isinstance(obj, list):
        try:
            idx = int(key)
            result = list(obj)
            result[idx] = _set_nested(obj[idx] if idx < len(obj) else None, path[1:], value)
            return result
        except (ValueError, IndexError):
            return obj
    return value


def _get_nested(obj: Any, path: list[str]) -> Any:
    for key in path:
        if isinstance(obj, dict):
            obj = obj.get(key)
        elif isinstance(obj, list):
            try:
                obj = obj[int(key)]
            except (ValueError, IndexError):
                return None
        else:
            return None
    return obj


def fuzz_request(
    method: str,
    url: str,
    headers: dict,
    body: str | None,
    fuzz_fields: list[str],
    strategy: str,
    replay_fn,
    timeout_seconds: float = 10.0,
    verify_tls: bool = True,
    max_response_bytes: int = 2_000_000,
) -> list[dict]:
    results = []
    body_obj = None
    if body:
        try:
            body_obj = json.loads(body)
        except Exception:
            body_obj = None
    for field_path in fuzz_fields:
        parts = field_path.split(".")
        section = parts[0]
        field_parts = parts[1:]
        base_value = None
        if section == "body" and body_obj is not None:
            base_value = _get_nested(body_obj, field_parts)
        payloads = FuzzingStrategies.for_strategy(strategy, base_value)
        for payload in payloads:
            fuzz_url = url
            fuzz_headers = dict(headers)
            fuzz_body = body
            if section == "body" and body_obj is not None:
                mutated = _set_nested(body_obj, field_parts, payload)
                fuzz_body = json.dumps(mutated)
            elif section == "headers":
                fuzz_headers[".".join(field_parts)] = str(payload)
            elif section == "query":
                qs_key = ".".join(field_parts)
                sep = "&" if "?" in fuzz_url else "?"
                fuzz_url = fuzz_url + f"{sep}{qs_key}={payload}"
            result = replay_fn(
                method=method, url=fuzz_url, headers=fuzz_headers,
                body=fuzz_body, body_base64=None,
                timeout_seconds=timeout_seconds, verify_tls=verify_tls,
                max_response_bytes=max_response_bytes,
            )
            results.append({
                "field": field_path, "payload": payload,
                "status_code": result.get("response", {}).get("status_code"),
                "elapsed_ms": result.get("elapsed_ms"),
                "ok": result.get("ok"),
                "error": result.get("error"),
            })
    return results


def run_load_test(
    method: str,
    url: str,
    headers: dict,
    body: str | None,
    iterations: int,
    concurrency: int,
    replay_fn,
    timeout_seconds: float = 10.0,
    verify_tls: bool = True,
    max_response_bytes: int = 100_000,
) -> dict:
    timings: list[float] = []
    errors: list[str] = []
    status_counts: dict[int, int] = {}

    def _run_one(_: int) -> dict:
        return replay_fn(
            method=method, url=url, headers=headers, body=body,
            body_base64=None, timeout_seconds=timeout_seconds,
            verify_tls=verify_tls, max_response_bytes=max_response_bytes,
        )

    with ThreadPoolExecutor(max_workers=concurrency) as pool:
        futures = [pool.submit(_run_one, i) for i in range(iterations)]
        for fut in as_completed(futures):
            try:
                r = fut.result()
                ms = r.get("elapsed_ms") or 0
                timings.append(ms)
                sc = (r.get("response") or {}).get("status_code")
                if sc:
                    status_counts[sc] = status_counts.get(sc, 0) + 1
                if not r.get("ok"):
                    errors.append(r.get("error") or "error")
            except Exception as exc:
                errors.append(str(exc))

    timings.sort()
    n = len(timings)
    p50 = timings[n // 2] if n else 0
    p95 = timings[int(n * 0.95)] if n else 0
    p99 = timings[int(n * 0.99)] if n else 0
    avg = sum(timings) / n if n else 0
    return {
        "iterations": iterations,
        "completed": n,
        "errors": len(errors),
        "error_rate": round(len(errors) / iterations, 3) if iterations else 0,
        "latency": {"avg_ms": round(avg, 1), "p50_ms": p50, "p95_ms": p95, "p99_ms": p99,
                    "min_ms": timings[0] if timings else 0, "max_ms": timings[-1] if timings else 0},
        "status_counts": status_counts,
    }


_CHAIN_VAR_RE = re.compile(r"\{\{(\w+)\.(\w+)\}\}")


def _interpolate(template: str, context: dict[str, Any]) -> str:
    def replace(m: re.Match) -> str:
        step_name, field_name = m.group(1), m.group(2)
        step_data = context.get(step_name, {})
        if isinstance(step_data, dict):
            val = step_data.get(field_name)
            if val is not None:
                return str(val)
        return m.group(0)
    return _CHAIN_VAR_RE.sub(replace, template)


def _interpolate_obj(obj: Any, context: dict[str, Any]) -> Any:
    if isinstance(obj, str):
        return _interpolate(obj, context)
    if isinstance(obj, dict):
        return {k: _interpolate_obj(v, context) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_interpolate_obj(v, context) for v in obj]
    return obj


def run_chain(steps: list[dict], replay_fn, stop_on_error: bool = True) -> list[dict]:
    context: dict[str, Any] = {}
    results = []
    for step in steps:
        name = step.get("name", f"step_{len(results)}")
        method = _interpolate(step.get("method", "GET"), context)
        url = _interpolate(step.get("url", ""), context)
        headers_raw = _interpolate_obj(step.get("headers", {}), context)
        body_raw = step.get("body")
        body = _interpolate_obj(body_raw, context) if body_raw is not None else None
        if isinstance(body, dict):
            body = json.dumps(body)
        result = replay_fn(
            method=method, url=url, headers=headers_raw,
            body=body, body_base64=None,
            timeout_seconds=step.get("timeout_seconds", 15.0),
            verify_tls=step.get("verify_tls", True),
            max_response_bytes=step.get("max_response_bytes", 2_000_000),
        )
        resp_body_str = (result.get("response") or {}).get("body") or ""
        try:
            resp_json = json.loads(resp_body_str)
        except Exception:
            resp_json = {}
        step_ctx: dict[str, Any] = {}
        for var_name, json_path in (step.get("extract") or {}).items():
            path_parts = json_path.lstrip("$").lstrip(".").split(".")
            value: Any = resp_json
            for part in path_parts:
                if isinstance(value, dict):
                    value = value.get(part)
                else:
                    value = None
                    break
            step_ctx[var_name] = value
        context[name] = step_ctx
        results.append({
            "name": name, "ok": result.get("ok"),
            "status_code": (result.get("response") or {}).get("status_code"),
            "elapsed_ms": result.get("elapsed_ms"),
            "extracted": step_ctx,
            "error": result.get("error"),
        })
        if stop_on_error and not result.get("ok"):
            break
    return results


@dataclass
class ReplayCollection:
    name: str
    flow_ids: list[str] = field(default_factory=list)
    modifications: dict[str, dict] = field(default_factory=dict)

    def to_dict(self) -> dict:
        return {"name": self.name, "flow_ids": self.flow_ids, "modifications": self.modifications}

    @classmethod
    def from_dict(cls, d: dict) -> "ReplayCollection":
        obj = cls(name=d["name"], flow_ids=d.get("flow_ids", []))
        obj.modifications = d.get("modifications", {})
        return obj


_collections: dict[str, ReplayCollection] = {}


def create_collection(name: str, flow_ids: list[str]) -> ReplayCollection:
    col = ReplayCollection(name=name, flow_ids=list(flow_ids))
    _collections[name] = col
    return col


def get_collection(name: str) -> ReplayCollection | None:
    return _collections.get(name)


def list_collections() -> list[dict]:
    return [c.to_dict() for c in _collections.values()]
