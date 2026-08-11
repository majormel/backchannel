from __future__ import annotations

import sys
import time
import types
from unittest.mock import MagicMock, patch


def _install_mock_frida():
    mock_frida = types.ModuleType("frida")

    class MockDevice:
        def __init__(self, id="local", name="Local System", type="local"):
            self.id = id
            self.name = name
            self.type = type

        def attach(self, target):
            session = MockSession()
            return session

    class MockSession:
        def __init__(self):
            self.scripts = []

        def create_script(self, source):
            script = MockScript(source)
            self.scripts.append(script)
            return script

        def detach(self):
            pass

    class MockScript:
        def __init__(self, source):
            self.source = source
            self._callbacks = {}
            self.loaded = False

        def on(self, event, callback):
            self._callbacks[event] = callback

        def load(self):
            self.loaded = True

        def unload(self):
            self.loaded = False

    mock_frida.enumerate_devices = MagicMock(
        return_value=[MockDevice(), MockDevice("usb1", "iPhone", "usb")]
    )
    mock_frida.get_local_device = MagicMock(return_value=MockDevice())
    mock_frida.get_usb_device = MagicMock(
        return_value=MockDevice("usb1", "iPhone", "usb")
    )
    mock_frida.get_device = MagicMock(return_value=MockDevice("remote1", "Remote", "remote"))
    mock_frida.MockDevice = MockDevice
    mock_frida.MockSession = MockSession
    mock_frida.MockScript = MockScript
    sys.modules["frida"] = mock_frida
    return mock_frida


mock_frida = _install_mock_frida()


import importlib
from backchannel import frida_bridge

importlib.reload(frida_bridge)


class TestFridaAvailability:
    def test_frida_available_flag(self):
        assert frida_bridge.FRIDA_AVAILABLE is True

    def test_status_shows_available(self):
        bridge = frida_bridge.FridaBridge()
        status = bridge.status()
        assert status["frida_available"] is True
        assert status["hook_count"] == 0
        assert status["event_count"] == 0

    def test_not_installed_fallback(self):
        original = frida_bridge.FRIDA_AVAILABLE
        try:
            frida_bridge.FRIDA_AVAILABLE = False
            bridge = frida_bridge.FridaBridge()
            assert "error" in bridge.list_devices()
            assert "error" in bridge.attach("test")
            assert "error" in bridge.add_hook("func")
            assert "error" in bridge.remove_hook("x")
            assert "error" in bridge.trace()
            assert "error" in bridge.memory_scan("00 FF")
            assert "error" in bridge.read_memory("0x1000")
        finally:
            frida_bridge.FRIDA_AVAILABLE = original


class TestDeviceEnumeration:
    def test_list_devices(self):
        bridge = frida_bridge.FridaBridge()
        result = bridge.list_devices()
        assert "devices" in result
        assert len(result["devices"]) == 2
        assert result["devices"][0]["id"] == "local"
        assert result["devices"][1]["type"] == "usb"


class TestAttachDetach:
    def test_attach_by_name(self):
        bridge = frida_bridge.FridaBridge()
        result = bridge.attach("com.game.app")
        assert result.get("attached") is True
        assert result["process"] == "com.game.app"
        assert bridge._session_state.attached is True

    def test_attach_by_pid(self):
        bridge = frida_bridge.FridaBridge()
        result = bridge.attach(1234)
        assert result.get("attached") is True
        assert bridge._session_state.process_pid == 1234

    def test_attach_usb(self):
        bridge = frida_bridge.FridaBridge()
        result = bridge.attach("com.game.app", device="usb")
        assert result.get("attached") is True

    def test_double_attach_rejected(self):
        bridge = frida_bridge.FridaBridge()
        bridge.attach("com.game.app")
        result = bridge.attach("other.app")
        assert "error" in result
        assert "already attached" in result["error"]

    def test_detach(self):
        bridge = frida_bridge.FridaBridge()
        bridge.attach("com.game.app")
        result = bridge.detach()
        assert result["detached"] is True
        assert bridge._session_state.attached is False

    def test_detach_when_not_attached(self):
        bridge = frida_bridge.FridaBridge()
        result = bridge.detach()
        assert result["detached"] is True
        assert "not attached" in result.get("message", "")


class TestHookCRUD:
    def _attached_bridge(self):
        bridge = frida_bridge.FridaBridge()
        bridge.attach("com.game.app")
        return bridge

    def test_add_hook(self):
        bridge = self._attached_bridge()
        result = bridge.add_hook("CCHmac", script_type="generic_tracer")
        assert "hook_id" in result
        assert result["target"] == "CCHmac"

    def test_list_hooks(self):
        bridge = self._attached_bridge()
        bridge.add_hook("func1")
        bridge.add_hook("func2")
        result = bridge.list_hooks()
        assert len(result["hooks"]) == 2

    def test_remove_hook(self):
        bridge = self._attached_bridge()
        added = bridge.add_hook("func1")
        hook_id = added["hook_id"]
        result = bridge.remove_hook(hook_id)
        assert result["removed"] is True
        assert len(bridge.list_hooks()["hooks"]) == 0

    def test_remove_nonexistent_hook(self):
        bridge = self._attached_bridge()
        result = bridge.remove_hook("nonexistent")
        assert "error" in result

    def test_add_hook_not_attached(self):
        bridge = frida_bridge.FridaBridge()
        result = bridge.add_hook("func")
        assert "error" in result
        assert "not attached" in result["error"]


class TestTrace:
    def test_trace_captures_events(self):
        bridge = frida_bridge.FridaBridge()
        bridge.attach("com.game.app")
        bridge._events.append(frida_bridge.FridaEvent(
            hook_id="h1", timestamp=time.time(), event_type="call", data={"target": "func1"}
        ))
        with patch("time.sleep"):
            result = bridge.trace(duration_seconds=1.0)
        assert result["event_count"] == 0

    def test_trace_not_attached(self):
        bridge = frida_bridge.FridaBridge()
        result = bridge.trace()
        assert "error" in result


class TestEventStructure:
    def test_on_message_creates_event(self):
        bridge = frida_bridge.FridaBridge()
        hook = frida_bridge.FridaHook(id="h1", target="func1")
        bridge._hooks["h1"] = hook
        bridge._on_message(
            {"type": "send", "payload": {"hook_id": "h1", "event_type": "call", "data": {"arg0": "0x42"}}},
            None,
        )
        assert len(bridge._events) == 1
        assert bridge._events[0].hook_id == "h1"
        assert bridge._events[0].event_type == "call"
        assert hook.call_count == 1

    def test_on_message_ignores_non_send(self):
        bridge = frida_bridge.FridaBridge()
        bridge._on_message({"type": "error", "description": "fail"}, None)
        assert len(bridge._events) == 0


class TestMemory:
    def test_memory_scan_not_attached(self):
        bridge = frida_bridge.FridaBridge()
        result = bridge.memory_scan("00 FF")
        assert "error" in result

    def test_read_memory_not_attached(self):
        bridge = frida_bridge.FridaBridge()
        result = bridge.read_memory("0x1000")
        assert "error" in result


class TestFlowCorrelation:
    def test_correlate_by_timestamp(self):
        bridge = frida_bridge.FridaBridge()
        now = time.time()
        bridge._events = [
            frida_bridge.FridaEvent(hook_id="h1", timestamp=now, event_type="call"),
            frida_bridge.FridaEvent(hook_id="h2", timestamp=now + 2, event_type="call"),
        ]
        flows = [
            {"id": "f1", "timestamp_start": now + 0.1},
            {"id": "f2", "timestamp_start": now + 5},
        ]
        result = bridge.correlate_events_with_flows(flows, window_ms=500)
        assert result["matched"] == 1
        assert result["correlations"][0]["flow_id"] == "f1"

    def test_correlate_empty(self):
        bridge = frida_bridge.FridaBridge()
        result = bridge.correlate_events_with_flows([], window_ms=500)
        assert result["matched"] == 0


class TestSingleton:
    def test_get_bridge_returns_same_instance(self):
        frida_bridge._bridge = None
        b1 = frida_bridge.get_bridge()
        b2 = frida_bridge.get_bridge()
        assert b1 is b2
        frida_bridge._bridge = None
