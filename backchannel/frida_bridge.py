from __future__ import annotations

from dataclasses import asdict, dataclass, field
import threading
import time
import uuid

try:
    import frida
    FRIDA_AVAILABLE = True
except ImportError:
    frida = None
    FRIDA_AVAILABLE = False


@dataclass
class FridaHook:
    id: str
    target: str
    capture_args: bool = True
    capture_retval: bool = True
    script_source: str = ""
    call_count: int = 0
    created_at: float = field(default_factory=time.time)


@dataclass
class FridaEvent:
    hook_id: str
    timestamp: float
    event_type: str
    data: dict = field(default_factory=dict)
    correlated_flow_id: str = ""


@dataclass
class FridaSessionState:
    device_id: str = ""
    device_name: str = ""
    process_name: str = ""
    process_pid: int = 0
    attached: bool = False
    attached_at: float = 0.0


def _not_installed():
    return {
        "error": "frida not installed. Install with: pip install frida frida-tools"
    }


class FridaBridge:
    def __init__(self):
        self._session_state = FridaSessionState()
        self._hooks: dict[str, FridaHook] = {}
        self._events: list[FridaEvent] = []
        self._scripts: dict[str, object] = {}
        self._session: object | None = None
        self._device: object | None = None
        self._lock = threading.RLock()

    def list_devices(self) -> dict:
        if not FRIDA_AVAILABLE:
            return _not_installed()
        try:
            devices = frida.enumerate_devices()
            return {
                "devices": [
                    {"id": d.id, "name": d.name, "type": d.type}
                    for d in devices
                ]
            }
        except Exception as exc:
            return {"error": str(exc)}

    def attach(self, target: str | int, device: str = "local") -> dict:
        if not FRIDA_AVAILABLE:
            return _not_installed()
        with self._lock:
            if self._session_state.attached:
                return {"error": "already attached, detach first"}
            try:
                if device == "usb":
                    dev = frida.get_usb_device()
                elif device == "local":
                    dev = frida.get_local_device()
                else:
                    dev = frida.get_device(device)
                self._device = dev
                if isinstance(target, int):
                    session = dev.attach(target)
                    pid = target
                    name = str(target)
                else:
                    try:
                        pid = int(target)
                        session = dev.attach(pid)
                        name = str(pid)
                    except ValueError:
                        session = dev.attach(target)
                        pid = 0
                        name = target
                self._session = session
                self._session_state = FridaSessionState(
                    device_id=dev.id,
                    device_name=dev.name,
                    process_name=name,
                    process_pid=pid,
                    attached=True,
                    attached_at=time.time(),
                )
                return {"attached": True, "process": name, "device": dev.name}
            except Exception as exc:
                return {"error": str(exc)}

    def detach(self) -> dict:
        if not FRIDA_AVAILABLE:
            return _not_installed()
        with self._lock:
            if not self._session_state.attached:
                return {"detached": True, "message": "not attached"}
            for script in self._scripts.values():
                try:
                    script.unload()
                except Exception:
                    pass
            self._scripts.clear()
            self._hooks.clear()
            try:
                if self._session is not None:
                    self._session.detach()
            except Exception:
                pass
            self._session = None
            self._device = None
            self._session_state = FridaSessionState()
            return {"detached": True}

    def status(self) -> dict:
        with self._lock:
            return {
                "frida_available": FRIDA_AVAILABLE,
                "session": asdict(self._session_state),
                "hook_count": len(self._hooks),
                "event_count": len(self._events),
            }

    def add_hook(
        self,
        target: str,
        capture_args: bool = True,
        capture_retval: bool = True,
        script_type: str = "generic_tracer",
    ) -> dict:
        if not FRIDA_AVAILABLE:
            return _not_installed()
        with self._lock:
            if not self._session_state.attached:
                return {"error": "not attached to a process"}
            hook_id = uuid.uuid4().hex[:12]
            source = self._load_script(script_type, {
                "{{HOOK_ID}}": hook_id,
                "{{TARGET}}": target,
                "{{CAPTURE_ARGS}}": "true" if capture_args else "false",
                "{{CAPTURE_RETVAL}}": "true" if capture_retval else "false",
            })
            try:
                script = self._session.create_script(source)
                script.on("message", self._on_message)
                script.load()
                self._scripts[hook_id] = script
            except Exception as exc:
                return {"error": str(exc)}
            hook = FridaHook(
                id=hook_id,
                target=target,
                capture_args=capture_args,
                capture_retval=capture_retval,
                script_source=source,
            )
            self._hooks[hook_id] = hook
            return {"hook_id": hook_id, "target": target, "script_type": script_type}

    def remove_hook(self, hook_id: str) -> dict:
        if not FRIDA_AVAILABLE:
            return _not_installed()
        with self._lock:
            hook = self._hooks.pop(hook_id, None)
            if hook is None:
                return {"error": "hook not found"}
            script = self._scripts.pop(hook_id, None)
            if script is not None:
                try:
                    script.unload()
                except Exception:
                    pass
            return {"removed": True, "hook_id": hook_id}

    def list_hooks(self) -> dict:
        with self._lock:
            return {
                "hooks": [
                    {
                        "id": h.id,
                        "target": h.target,
                        "capture_args": h.capture_args,
                        "capture_retval": h.capture_retval,
                        "call_count": h.call_count,
                        "created_at": h.created_at,
                    }
                    for h in self._hooks.values()
                ]
            }

    def trace(self, duration_seconds: float = 5.0) -> dict:
        if not FRIDA_AVAILABLE:
            return _not_installed()
        with self._lock:
            if not self._session_state.attached:
                return {"error": "not attached to a process"}
            self._events.clear()
        time.sleep(duration_seconds)
        with self._lock:
            events = [asdict(e) for e in self._events]
            return {"duration": duration_seconds, "event_count": len(events), "events": events}

    def memory_scan(self, pattern: str, address: str = "0", size: int = 4096) -> dict:
        if not FRIDA_AVAILABLE:
            return _not_installed()
        with self._lock:
            if not self._session_state.attached:
                return {"error": "not attached to a process"}
            source = self._load_script("memory_scanner", {
                "{{PATTERN}}": pattern,
                "{{ADDRESS}}": address,
                "{{SIZE}}": str(size),
            })
            try:
                script = self._session.create_script(source)
                results = []

                def on_scan_msg(message, data):
                    if message.get("type") == "send":
                        payload = message.get("payload")
                        if isinstance(payload, dict):
                            results.append(payload)

                script.on("message", on_scan_msg)
                script.load()
                time.sleep(0.5)
                try:
                    script.unload()
                except Exception:
                    pass
                return {"matches": results, "pattern": pattern}
            except Exception as exc:
                return {"error": str(exc)}

    def read_memory(self, address: str, size: int = 256) -> dict:
        if not FRIDA_AVAILABLE:
            return _not_installed()
        with self._lock:
            if not self._session_state.attached:
                return {"error": "not attached to a process"}
            safe_address = _js_escape(str(address))
            safe_size = int(size)
            source = (
                f"var buf = Memory.readByteArray(ptr('{safe_address}'), {safe_size});\n"
                f"send({{type: 'memory_read', hex: "
                f"Array.from(new Uint8Array(buf)).map(b => ('0' + b.toString(16)).slice(-2)).join('')}});\n"
            )
            try:
                script = self._session.create_script(source)
                result = {}

                def on_read_msg(message, data):
                    if message.get("type") == "send":
                        result.update(message.get("payload", {}))

                script.on("message", on_read_msg)
                script.load()
                time.sleep(0.2)
                try:
                    script.unload()
                except Exception:
                    pass
                return {"address": address, "size": size, "hex": result.get("hex", "")}
            except Exception as exc:
                return {"error": str(exc)}

    def correlate_events_with_flows(self, flows: list[dict], window_ms: int = 500) -> dict:
        with self._lock:
            events = list(self._events)
        correlations = []
        window_s = window_ms / 1000.0
        for event in events:
            best_flow = None
            best_delta = float("inf")
            for flow in flows:
                flow_ts = flow.get("timestamp_start") or flow.get("timestamp") or 0
                delta = abs(event.timestamp - flow_ts)
                if delta < window_s and delta < best_delta:
                    best_delta = delta
                    best_flow = flow
            if best_flow is not None:
                event.correlated_flow_id = best_flow.get("id", "")
                correlations.append({
                    "event_hook_id": event.hook_id,
                    "event_type": event.event_type,
                    "flow_id": best_flow.get("id", ""),
                    "delta_ms": round(best_delta * 1000, 1),
                })
        return {"correlations": correlations, "total_events": len(events), "matched": len(correlations)}

    def _on_message(self, message, data):
        if message.get("type") != "send":
            return
        payload = message.get("payload")
        if not isinstance(payload, dict):
            return
        hook_id = payload.get("hook_id", "")
        event_type = payload.get("event_type", "call")
        with self._lock:
            hook = self._hooks.get(hook_id)
            if hook is not None:
                hook.call_count += 1
            self._events.append(FridaEvent(
                hook_id=hook_id,
                timestamp=time.time(),
                event_type=event_type,
                data=payload.get("data", {}),
            ))

    def _load_script(self, script_type: str, replacements: dict[str, str]) -> str:
        from pathlib import Path
        script_dir = Path(__file__).resolve().parent / "frida_scripts"
        script_file = (script_dir / f"{script_type}.js").resolve()
        if not str(script_file).startswith(str(script_dir)):
            return ""
        if not script_file.exists():
            return ""
        source = script_file.read_text(encoding="utf-8")
        for placeholder, value in replacements.items():
            source = source.replace(placeholder, _js_escape(value))
        return source


def _js_escape(value: str) -> str:
    return value.replace("\\", "\\\\").replace("'", "\\'").replace("\n", "\\n").replace("\r", "\\r")


_bridge: FridaBridge | None = None
_bridge_lock = threading.Lock()


def get_bridge() -> FridaBridge:
    global _bridge
    if _bridge is None:
        with _bridge_lock:
            if _bridge is None:
                _bridge = FridaBridge()
    return _bridge
