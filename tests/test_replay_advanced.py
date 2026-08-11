from __future__ import annotations

import json
from unittest.mock import MagicMock

import pytest

from backchannel.replay_advanced import (
    FuzzingStrategies,
    ReplayCollection,
    _get_nested,
    _interpolate,
    _interpolate_obj,
    _set_nested,
    create_collection,
    fuzz_request,
    get_collection,
    list_collections,
    run_chain,
    run_load_test,
)


def _mock_replay(status: int = 200, body: str = "{}", ok: bool = True):
    def _fn(**kwargs):
        return {
            "ok": ok,
            "elapsed_ms": 42,
            "response": {
                "status_code": status,
                "reason": "OK",
                "headers": {},
                "body": body,
                "body_base64": "",
            },
        }
    return _fn


class TestFuzzingStrategies:
    def test_integer_boundaries_includes_base(self):
        payloads = FuzzingStrategies.integer_boundaries(100)
        assert 100 in payloads
        assert 101 in payloads
        assert 99 in payloads
        assert 0 in payloads

    def test_integer_boundaries_includes_overflow(self):
        payloads = FuzzingStrategies.integer_boundaries(0)
        assert 2**31 - 1 in payloads
        assert 2**63 - 1 in payloads

    def test_integer_boundaries_none_base(self):
        payloads = FuzzingStrategies.integer_boundaries(None)
        assert 0 in payloads

    def test_sql_injection_returns_list(self):
        payloads = FuzzingStrategies.sql_injection()
        assert len(payloads) >= 3
        assert any("OR" in p for p in payloads)

    def test_path_traversal_returns_list(self):
        payloads = FuzzingStrategies.path_traversal()
        assert any("passwd" in p for p in payloads)

    def test_xss_returns_list(self):
        payloads = FuzzingStrategies.xss()
        assert any("script" in p for p in payloads)

    def test_string_edge_cases(self):
        payloads = FuzzingStrategies.string_edge_cases()
        assert "" in payloads
        assert "\x00" in payloads

    def test_for_strategy_boundaries(self):
        payloads = FuzzingStrategies.for_strategy("boundaries", 5)
        assert 5 in payloads

    def test_for_strategy_sql(self):
        payloads = FuzzingStrategies.for_strategy("sql")
        assert any("OR" in str(p) for p in payloads)

    def test_for_strategy_unknown_returns_base(self):
        payloads = FuzzingStrategies.for_strategy("nonexistent", "myval")
        assert payloads == ["myval"]


class TestNestedHelpers:
    def test_get_nested_dict(self):
        obj = {"a": {"b": {"c": 42}}}
        assert _get_nested(obj, ["a", "b", "c"]) == 42

    def test_get_nested_missing_key(self):
        obj = {"a": 1}
        assert _get_nested(obj, ["a", "b"]) is None

    def test_get_nested_list(self):
        obj = {"items": [10, 20, 30]}
        assert _get_nested(obj, ["items", "1"]) == 20

    def test_set_nested_creates_key(self):
        obj = {"a": {"b": 1}}
        result = _set_nested(obj, ["a", "b"], 99)
        assert result["a"]["b"] == 99

    def test_set_nested_preserves_other_keys(self):
        obj = {"a": 1, "b": 2}
        result = _set_nested(obj, ["a"], 99)
        assert result["b"] == 2

    def test_set_nested_empty_path(self):
        assert _set_nested({"a": 1}, [], "new") == "new"


class TestInterpolation:
    def test_interpolate_simple(self):
        result = _interpolate("Bearer {{login.token}}", {"login": {"token": "abc123"}})
        assert result == "Bearer abc123"

    def test_interpolate_missing_step(self):
        result = _interpolate("{{missing.field}}", {})
        assert result == "{{missing.field}}"

    def test_interpolate_missing_field(self):
        result = _interpolate("{{step.missing}}", {"step": {"other": "val"}})
        assert result == "{{step.missing}}"

    def test_interpolate_obj_dict(self):
        template = {"Authorization": "Bearer {{auth.token}}"}
        result = _interpolate_obj(template, {"auth": {"token": "xyz"}})
        assert result == {"Authorization": "Bearer xyz"}

    def test_interpolate_obj_list(self):
        template = ["{{step.a}}", "{{step.b}}"]
        result = _interpolate_obj(template, {"step": {"a": "1", "b": "2"}})
        assert result == ["1", "2"]

    def test_interpolate_obj_nested(self):
        template = {"headers": {"Auth": "Bearer {{s.tok}}"}}
        result = _interpolate_obj(template, {"s": {"tok": "T"}})
        assert result["headers"]["Auth"] == "Bearer T"


class TestFuzzRequest:
    def test_fuzz_body_field(self):
        body = json.dumps({"id": 1, "name": "test"})
        results = fuzz_request(
            method="POST",
            url="http://example.com/api",
            headers={"Content-Type": "application/json"},
            body=body,
            fuzz_fields=["body.id"],
            strategy="boundaries",
            replay_fn=_mock_replay(),
        )
        assert len(results) > 0
        assert all("field" in r for r in results)
        assert all("payload" in r for r in results)
        assert all("status_code" in r for r in results)
        assert all(r["field"] == "body.id" for r in results)

    def test_fuzz_query_field(self):
        results = fuzz_request(
            method="GET",
            url="http://example.com/api",
            headers={},
            body=None,
            fuzz_fields=["query.page"],
            strategy="boundaries",
            replay_fn=_mock_replay(),
        )
        assert len(results) > 0
        assert all("field" in r for r in results)

    def test_fuzz_header_field(self):
        results = fuzz_request(
            method="GET",
            url="http://example.com/api",
            headers={"X-Custom": "value"},
            body=None,
            fuzz_fields=["headers.X-Custom"],
            strategy="sql",
            replay_fn=_mock_replay(),
        )
        assert len(results) == len(FuzzingStrategies.sql_injection())

    def test_fuzz_sql_strategy(self):
        body = json.dumps({"search": "term"})
        results = fuzz_request(
            method="POST",
            url="http://example.com/search",
            headers={},
            body=body,
            fuzz_fields=["body.search"],
            strategy="sql",
            replay_fn=_mock_replay(),
        )
        payloads = [r["payload"] for r in results]
        assert any("OR" in str(p) for p in payloads)

    def test_fuzz_no_body_obj(self):
        results = fuzz_request(
            method="POST",
            url="http://example.com/api",
            headers={},
            body="not json",
            fuzz_fields=["body.id"],
            strategy="boundaries",
            replay_fn=_mock_replay(),
        )
        assert len(results) > 0


class TestRunChain:
    def test_single_step(self):
        steps = [{"name": "step1", "method": "GET", "url": "http://example.com/api"}]
        results = run_chain(steps, _mock_replay())
        assert len(results) == 1
        assert results[0]["name"] == "step1"
        assert results[0]["ok"] is True

    def test_extraction(self):
        body = json.dumps({"token": "abc123", "user": {"id": 42}})
        steps = [
            {
                "name": "login",
                "method": "POST",
                "url": "http://example.com/login",
                "extract": {"tok": "$.token", "uid": "$.user.id"},
            }
        ]
        results = run_chain(steps, _mock_replay(body=body))
        assert results[0]["extracted"]["tok"] == "abc123"
        assert results[0]["extracted"]["uid"] == 42

    def test_variable_interpolation(self):
        captured_urls = []

        def _capturing_replay(**kwargs):
            captured_urls.append(kwargs["url"])
            return _mock_replay(body='{"token": "tok999"}')(**kwargs)

        body = json.dumps({"token": "tok999"})
        steps = [
            {"name": "auth", "method": "POST", "url": "http://example.com/login",
             "extract": {"token": "$.token"}},
            {"name": "profile", "method": "GET",
             "url": "http://example.com/users/me",
             "headers": {"Authorization": "Bearer {{auth.token}}"}},
        ]
        results = run_chain(steps, _capturing_replay)
        assert len(results) == 2
        assert results[1]["ok"] is True

    def test_stop_on_error(self):
        call_count = [0]

        def _failing_replay(**kwargs):
            call_count[0] += 1
            return {"ok": False, "elapsed_ms": 10, "error": "500 error", "response": {"status_code": 500}}

        steps = [
            {"name": "s1", "method": "GET", "url": "http://example.com/a"},
            {"name": "s2", "method": "GET", "url": "http://example.com/b"},
            {"name": "s3", "method": "GET", "url": "http://example.com/c"},
        ]
        results = run_chain(steps, _failing_replay, stop_on_error=True)
        assert len(results) == 1
        assert call_count[0] == 1

    def test_continue_on_error(self):
        def _failing_replay(**kwargs):
            return {"ok": False, "elapsed_ms": 10, "error": "err", "response": {"status_code": 500}}

        steps = [
            {"name": "s1", "method": "GET", "url": "http://example.com/a"},
            {"name": "s2", "method": "GET", "url": "http://example.com/b"},
        ]
        results = run_chain(steps, _failing_replay, stop_on_error=False)
        assert len(results) == 2

    def test_result_fields_present(self):
        steps = [{"name": "req", "method": "GET", "url": "http://example.com/"}]
        results = run_chain(steps, _mock_replay())
        r = results[0]
        assert "name" in r
        assert "ok" in r
        assert "status_code" in r
        assert "elapsed_ms" in r
        assert "extracted" in r


class TestRunLoadTest:
    def test_basic_load_test(self):
        result = run_load_test(
            method="GET",
            url="http://example.com/",
            headers={},
            body=None,
            iterations=5,
            concurrency=2,
            replay_fn=_mock_replay(),
        )
        assert result["iterations"] == 5
        assert result["completed"] == 5
        assert result["errors"] == 0
        assert result["latency"]["avg_ms"] >= 0

    def test_load_test_error_rate(self):
        result = run_load_test(
            method="GET",
            url="http://example.com/",
            headers={},
            body=None,
            iterations=4,
            concurrency=2,
            replay_fn=_mock_replay(ok=False),
        )
        assert result["error_rate"] == 1.0

    def test_latency_fields(self):
        result = run_load_test(
            method="GET", url="http://example.com/",
            headers={}, body=None,
            iterations=3, concurrency=1,
            replay_fn=_mock_replay(),
        )
        latency = result["latency"]
        assert "avg_ms" in latency
        assert "p50_ms" in latency
        assert "p95_ms" in latency
        assert "p99_ms" in latency
        assert "min_ms" in latency
        assert "max_ms" in latency


class TestReplayCollection:
    def test_create_collection(self):
        col = ReplayCollection(name="test", flow_ids=["a", "b"])
        assert col.name == "test"
        assert col.flow_ids == ["a", "b"]

    def test_to_dict(self):
        col = ReplayCollection(name="my_col", flow_ids=["x", "y"])
        d = col.to_dict()
        assert d["name"] == "my_col"
        assert d["flow_ids"] == ["x", "y"]

    def test_from_dict(self):
        d = {"name": "col", "flow_ids": ["1", "2"], "modifications": {}}
        col = ReplayCollection.from_dict(d)
        assert col.name == "col"
        assert col.flow_ids == ["1", "2"]

    def test_create_and_get(self):
        col = create_collection("integration_test_col", ["f1", "f2", "f3"])
        retrieved = get_collection("integration_test_col")
        assert retrieved is not None
        assert retrieved.name == "integration_test_col"
        assert retrieved.flow_ids == ["f1", "f2", "f3"]

    def test_list_collections_includes_created(self):
        create_collection("list_test_col_a", ["a"])
        create_collection("list_test_col_b", ["b"])
        cols = list_collections()
        names = [c["name"] for c in cols]
        assert "list_test_col_a" in names
        assert "list_test_col_b" in names

    def test_get_nonexistent_returns_none(self):
        assert get_collection("does_not_exist_xyz") is None
