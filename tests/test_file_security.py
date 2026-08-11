import json
import os
import stat
from pathlib import Path
from unittest.mock import patch

import pytest

from backchannel.file_security import (
    open_private_text_append,
    truncate_private_file,
    write_private_bytes,
    write_private_text_atomic,
)
from backchannel.flow_index import FlowIndex
from backchannel.server import DashboardState, _save_dashboard_state, _write_dashboard_state, dashboard_info, state
from decoder.decode_memory import DecodeMemory


pytestmark = pytest.mark.skipif(os.name == "nt", reason="POSIX file modes are required")


def _mode(path: Path) -> int:
    return stat.S_IMODE(path.stat().st_mode)


def test_private_writers_create_and_repair_owner_only_files(tmp_path: Path):
    append_path = tmp_path / "capture.jsonl"
    append_path.write_text("old\n", encoding="utf-8")
    append_path.chmod(0o644)

    with open_private_text_append(append_path) as handle:
        handle.write("new\n")

    assert _mode(append_path) == 0o600

    truncate_private_file(append_path)
    assert append_path.read_text(encoding="utf-8") == ""
    assert _mode(append_path) == 0o600

    binary_path = tmp_path / "body.bin"
    write_private_bytes(binary_path, b"synthetic")
    assert _mode(binary_path) == 0o600


def test_atomic_private_writer_replaces_existing_mode(tmp_path: Path):
    target = tmp_path / "state.json"
    target.write_text("old", encoding="utf-8")
    target.chmod(0o644)

    write_private_text_atomic(target, '{"ready":true}\n')

    assert json.loads(target.read_text(encoding="utf-8"))["ready"] is True
    assert _mode(target) == 0o600


def test_dashboard_state_files_are_owner_only(tmp_path: Path):
    legacy_path = tmp_path / "dashboard.json"
    current_path = tmp_path / "dashboard_state.json"

    with patch("backchannel.server.DASHBOARD_STATE_PATH", str(legacy_path)):
        _write_dashboard_state("127.0.0.1", 8800, "temporary-token")
    _save_dashboard_state(
        current_path,
        DashboardState(
            host="127.0.0.1",
            port=8800,
            token="temporary-token",
            url="http://127.0.0.1:8800/",
            saved_at=1.0,
        ),
    )

    assert _mode(legacy_path) == 0o600
    assert _mode(current_path) == 0o600


def test_sqlite_state_is_owner_only(tmp_path: Path):
    index_path = tmp_path / "flows.db"
    memory_path = tmp_path / "decode.db"

    index = FlowIndex(str(index_path))
    memory = DecodeMemory(memory_path)
    try:
        assert _mode(index_path) == 0o600
        assert _mode(memory_path) == 0o600
        for suffix in ("-wal", "-shm"):
            candidate = Path(str(index_path) + suffix)
            if candidate.exists():
                assert _mode(candidate) == 0o600
    finally:
        memory.close()
        index.close()


def test_dashboard_info_never_returns_the_credential():
    original = (state.dashboard_host, state.dashboard_port, state.dashboard_token)
    state.dashboard_host = "127.0.0.1"
    state.dashboard_port = 8800
    state.dashboard_token = "temporary-token"
    try:
        with patch("backchannel.server.client_config", None):
            payload = dashboard_info()
    finally:
        state.dashboard_host, state.dashboard_port, state.dashboard_token = original

    assert payload["auth_enabled"] is True
    assert payload["url"] == "http://127.0.0.1:8800/"
    assert "token" not in payload
    assert "temporary-token" not in json.dumps(payload)
