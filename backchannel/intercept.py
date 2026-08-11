from __future__ import annotations

from dataclasses import asdict, dataclass, field, is_dataclass
import threading
import time
import uuid


@dataclass
class Breakpoint:
    id: str
    enabled: bool = True
    match_url: str = ""
    match_method: str = ""
    match_headers: dict | None = None
    intercept: str = "request"
    auto_resume_after: int = 0
    created_at: float = field(default_factory=time.time)


@dataclass
class InterceptedFlow:
    id: str
    flow_data: dict
    breakpoint_id: str
    phase: str
    intercepted_at: float = field(default_factory=time.time)


@dataclass
class AutoResponseRule:
    id: str
    name: str
    enabled: bool = True
    priority: int = 0
    match_url: str = ""
    match_method: str = ""
    response_status: int = 200
    response_headers: dict = field(default_factory=dict)
    response_body: str = ""
    latency_ms: int = 0
    created_at: float = field(default_factory=time.time)


class BreakpointManager:
    def __init__(self):
        self._breakpoints: dict[str, Breakpoint] = {}
        self._intercepted: dict[str, InterceptedFlow] = {}
        self._rules: dict[str, AutoResponseRule] = {}
        self._auto_resume_timers: dict[str, threading.Timer] = {}
        self._lock = threading.RLock()

    def add_breakpoint(self, bp: Breakpoint) -> Breakpoint:
        with self._lock:
            self._breakpoints[bp.id] = bp
        return bp

    def remove_breakpoint(self, breakpoint_id: str) -> bool:
        with self._lock:
            return self._breakpoints.pop(breakpoint_id, None) is not None

    def list_breakpoints(self) -> list[Breakpoint]:
        with self._lock:
            return list(self._breakpoints.values())

    def toggle_breakpoint(self, breakpoint_id: str, enabled: bool | None = None) -> Breakpoint | None:
        with self._lock:
            bp = self._breakpoints.get(breakpoint_id)
            if bp is None:
                return None
            if enabled is None:
                bp.enabled = not bp.enabled
            else:
                bp.enabled = enabled
            return bp

    def _matches_headers(self, expected: dict | None, actual: dict) -> bool:
        if not expected:
            return True
        normalized_actual = {str(key).lower(): str(value) for key, value in actual.items()}
        for key, value in expected.items():
            actual_value = normalized_actual.get(str(key).lower())
            if actual_value != str(value):
                return False
        return True

    def matches_breakpoint(self, flow_data: dict, phase: str) -> Breakpoint | None:
        request = flow_data.get("request") or {}
        response = flow_data.get("response") or {}
        url = str(request.get("url") or "")
        method = str(request.get("method") or "").upper()
        phase_name = str(phase or "").lower()
        request_headers = request.get("headers") if isinstance(request.get("headers"), dict) else {}
        response_headers = response.get("headers") if isinstance(response.get("headers"), dict) else {}
        headers = response_headers if phase_name == "response" else request_headers

        with self._lock:
            for bp in self._breakpoints.values():
                if not bp.enabled:
                    continue
                intercept_mode = str(bp.intercept or "request").lower()
                if intercept_mode not in {"request", "response", "both"}:
                    continue
                if intercept_mode != "both" and intercept_mode != phase_name:
                    continue
                if bp.match_url and bp.match_url not in url:
                    continue
                if bp.match_method and method != bp.match_method.upper():
                    continue
                if not self._matches_headers(bp.match_headers, headers):
                    continue
                return bp
        return None

    def intercept_flow(self, flow_data: dict, bp: Breakpoint, phase: str) -> InterceptedFlow:
        with self._lock:
            flow_id = str(flow_data.get("id") or uuid.uuid4())
            flow_data["id"] = flow_id
            intercepted = InterceptedFlow(
                id=flow_id,
                flow_data=flow_data,
                breakpoint_id=bp.id,
                phase=phase,
            )
            self._intercepted[flow_id] = intercepted
            old_timer = self._auto_resume_timers.pop(flow_id, None)
            if old_timer is not None:
                old_timer.cancel()
            if bp.auto_resume_after > 0:
                timer = threading.Timer(bp.auto_resume_after, self.resume_flow, args=(flow_id,))
                timer.daemon = True
                self._auto_resume_timers[flow_id] = timer
                timer.start()
            return intercepted

    def list_intercepted(self) -> list[InterceptedFlow]:
        with self._lock:
            return list(self._intercepted.values())

    def get_intercepted(self, flow_id: str) -> InterceptedFlow | None:
        with self._lock:
            return self._intercepted.get(flow_id)

    def resume_flow(self, flow_id: str) -> dict | None:
        with self._lock:
            intercepted = self._intercepted.pop(flow_id, None)
            timer = self._auto_resume_timers.pop(flow_id, None)
        if timer is not None:
            timer.cancel()
        if intercepted is None:
            return None
        return intercepted.flow_data

    def modify_and_resume(self, flow_id: str, modifications: dict) -> dict | None:
        with self._lock:
            intercepted = self._intercepted.get(flow_id)
            if intercepted is None:
                return None
            flow_data = intercepted.flow_data
            if isinstance(modifications, dict):
                for section in ("request", "response"):
                    section_mods = modifications.get(section)
                    if not isinstance(section_mods, dict):
                        continue
                    current_section = flow_data.get(section)
                    if not isinstance(current_section, dict):
                        current_section = {}
                        flow_data[section] = current_section
                    for key, value in section_mods.items():
                        if key == "headers" and isinstance(value, dict):
                            existing_headers = current_section.get("headers")
                            if not isinstance(existing_headers, dict):
                                existing_headers = {}
                            merged_headers = dict(existing_headers)
                            merged_headers.update(value)
                            current_section["headers"] = merged_headers
                        else:
                            current_section[key] = value
                for key, value in modifications.items():
                    if key not in {"request", "response"}:
                        flow_data[key] = value
        return self.resume_flow(flow_id)

    def drop_flow(self, flow_id: str) -> bool:
        with self._lock:
            intercepted = self._intercepted.pop(flow_id, None)
            timer = self._auto_resume_timers.pop(flow_id, None)
        if timer is not None:
            timer.cancel()
        return intercepted is not None

    def add_rule(self, rule: AutoResponseRule) -> AutoResponseRule:
        with self._lock:
            self._rules[rule.id] = rule
        return rule

    def remove_rule(self, rule_id: str) -> bool:
        with self._lock:
            return self._rules.pop(rule_id, None) is not None

    def list_rules(self) -> list[AutoResponseRule]:
        with self._lock:
            return list(self._rules.values())

    def match_rule(self, flow_data: dict) -> AutoResponseRule | None:
        request = flow_data.get("request") or {}
        url = str(request.get("url") or "")
        method = str(request.get("method") or "").upper()
        with self._lock:
            enabled_rules = [rule for rule in self._rules.values() if rule.enabled]
        for rule in sorted(enabled_rules, key=lambda item: item.priority, reverse=True):
            if rule.match_url and rule.match_url not in url:
                continue
            if rule.match_method and method != rule.match_method.upper():
                continue
            return rule
        return None

    def to_dict(self, obj):
        if is_dataclass(obj):
            return asdict(obj)
        if isinstance(obj, list):
            return [self.to_dict(item) for item in obj]
        if isinstance(obj, dict):
            return {key: self.to_dict(value) for key, value in obj.items()}
        return obj


_manager: BreakpointManager | None = None


def get_manager() -> BreakpointManager:
    global _manager
    if _manager is None:
        _manager = BreakpointManager()
    return _manager
