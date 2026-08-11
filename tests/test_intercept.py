from __future__ import annotations

import time

import backchannel.intercept as intercept_module
from backchannel.intercept import AutoResponseRule, Breakpoint, BreakpointManager, get_manager


def _make_flow(
    flow_id: str = "flow-1",
    url: str = "https://example.com/api/items",
    method: str = "GET",
    request_headers: dict | None = None,
    response_headers: dict | None = None,
) -> dict:
    return {
        "id": flow_id,
        "request": {
            "url": url,
            "method": method,
            "headers": request_headers or {"X-Test": "yes"},
            "body": "request-body",
        },
        "response": {
            "status_code": 200,
            "headers": response_headers or {"Content-Type": "application/json", "X-Resp": "ok"},
            "body": "response-body",
        },
    }


def test_add_remove_list_toggle_breakpoints():
    manager = BreakpointManager()
    bp = Breakpoint(id="bp-1", match_url="/api")

    manager.add_breakpoint(bp)
    listed = manager.list_breakpoints()
    assert len(listed) == 1
    assert listed[0].id == "bp-1"

    toggled_off = manager.toggle_breakpoint("bp-1")
    assert toggled_off is not None
    assert toggled_off.enabled is False

    toggled_on = manager.toggle_breakpoint("bp-1", True)
    assert toggled_on is not None
    assert toggled_on.enabled is True

    assert manager.remove_breakpoint("bp-1") is True
    assert manager.remove_breakpoint("bp-1") is False
    assert manager.list_breakpoints() == []


def test_matches_breakpoint_url_method_header_phase_filters():
    manager = BreakpointManager()
    bp = Breakpoint(
        id="bp-match",
        match_url="/api/items",
        match_method="POST",
        match_headers={"X-Test": "yes"},
        intercept="request",
    )
    manager.add_breakpoint(bp)

    good_flow = _make_flow(method="POST", request_headers={"X-Test": "yes", "X-Other": "value"})
    bad_url = _make_flow(url="https://example.com/other", method="POST", request_headers={"X-Test": "yes"})
    bad_method = _make_flow(method="GET", request_headers={"X-Test": "yes"})
    bad_header = _make_flow(method="POST", request_headers={"X-Test": "no"})

    assert manager.matches_breakpoint(good_flow, "request") is bp
    assert manager.matches_breakpoint(good_flow, "response") is None
    assert manager.matches_breakpoint(bad_url, "request") is None
    assert manager.matches_breakpoint(bad_method, "request") is None
    assert manager.matches_breakpoint(bad_header, "request") is None


def test_matches_breakpoint_response_phase_and_both():
    manager = BreakpointManager()
    response_bp = Breakpoint(id="bp-response", intercept="response", match_headers={"X-Resp": "ok"})
    both_bp = Breakpoint(id="bp-both", intercept="both")
    manager.add_breakpoint(response_bp)
    manager.add_breakpoint(both_bp)

    flow = _make_flow()

    assert manager.matches_breakpoint(flow, "response") is response_bp
    assert manager.matches_breakpoint(flow, "request") is both_bp


def test_intercept_flow_and_list_intercepted():
    manager = BreakpointManager()
    bp = Breakpoint(id="bp-1")
    flow = _make_flow()

    intercepted = manager.intercept_flow(flow, bp, "request")

    assert intercepted.id == "flow-1"
    assert intercepted.breakpoint_id == "bp-1"
    listed = manager.list_intercepted()
    assert len(listed) == 1
    assert listed[0].id == "flow-1"
    assert manager.get_intercepted("flow-1") is intercepted


def test_resume_flow():
    manager = BreakpointManager()
    bp = Breakpoint(id="bp-1")
    flow = _make_flow()
    manager.intercept_flow(flow, bp, "request")

    resumed = manager.resume_flow("flow-1")

    assert resumed is not None
    assert resumed["id"] == "flow-1"
    assert manager.get_intercepted("flow-1") is None


def test_modify_and_resume_updates_response_fields():
    manager = BreakpointManager()
    bp = Breakpoint(id="bp-1")
    flow = _make_flow()
    manager.intercept_flow(flow, bp, "response")

    resumed = manager.modify_and_resume(
        "flow-1",
        {
            "response": {
                "status_code": 418,
                "headers": {"X-Modified": "yes"},
                "body": "modified",
            }
        },
    )

    assert resumed is not None
    response = resumed["response"]
    assert response["status_code"] == 418
    assert response["headers"]["X-Modified"] == "yes"
    assert response["body"] == "modified"
    assert manager.get_intercepted("flow-1") is None


def test_drop_flow():
    manager = BreakpointManager()
    bp = Breakpoint(id="bp-1")
    flow = _make_flow()
    manager.intercept_flow(flow, bp, "request")

    assert manager.drop_flow("flow-1") is True
    assert manager.drop_flow("flow-1") is False
    assert manager.list_intercepted() == []


def test_auto_resume_after_timer():
    manager = BreakpointManager()
    bp = Breakpoint(id="bp-timer", auto_resume_after=0.1)
    flow = _make_flow()

    manager.intercept_flow(flow, bp, "request")
    assert manager.get_intercepted("flow-1") is not None

    time.sleep(0.2)

    assert manager.get_intercepted("flow-1") is None
    assert manager.resume_flow("flow-1") is None


def test_add_remove_list_rules():
    manager = BreakpointManager()
    rule_one = AutoResponseRule(id="rule-1", name="first")
    rule_two = AutoResponseRule(id="rule-2", name="second")

    manager.add_rule(rule_one)
    manager.add_rule(rule_two)
    rules = manager.list_rules()

    assert [rule.id for rule in rules] == ["rule-1", "rule-2"]
    assert manager.remove_rule("rule-1") is True
    assert manager.remove_rule("rule-1") is False
    assert [rule.id for rule in manager.list_rules()] == ["rule-2"]


def test_match_rule_priority_ordering():
    manager = BreakpointManager()
    low = AutoResponseRule(id="rule-low", name="low", priority=1, match_url="example.com")
    high = AutoResponseRule(id="rule-high", name="high", priority=10, match_url="example.com")
    manager.add_rule(low)
    manager.add_rule(high)

    matched = manager.match_rule(_make_flow())

    assert matched is high


def test_match_rule_url_and_method():
    manager = BreakpointManager()
    rule = AutoResponseRule(id="rule-post", name="post-only", match_url="/api/items", match_method="POST")
    manager.add_rule(rule)

    assert manager.match_rule(_make_flow(method="GET")) is None
    assert manager.match_rule(_make_flow(method="POST")) is rule


def test_disabled_breakpoints_skipped():
    manager = BreakpointManager()
    disabled = Breakpoint(id="bp-disabled", enabled=False, match_url="/api")
    enabled = Breakpoint(id="bp-enabled", enabled=True, match_url="/api")
    manager.add_breakpoint(disabled)
    manager.add_breakpoint(enabled)

    matched = manager.matches_breakpoint(_make_flow(), "request")

    assert matched is enabled


def test_disabled_rules_skipped():
    manager = BreakpointManager()
    disabled = AutoResponseRule(id="rule-disabled", name="disabled", enabled=False, priority=100, match_url="example")
    enabled = AutoResponseRule(id="rule-enabled", name="enabled", enabled=True, priority=1, match_url="example")
    manager.add_rule(disabled)
    manager.add_rule(enabled)

    matched = manager.match_rule(_make_flow())

    assert matched is enabled


def test_get_manager_singleton():
    intercept_module._manager = None
    first = get_manager()
    second = get_manager()

    assert first is second
    assert isinstance(first, BreakpointManager)

    intercept_module._manager = None
