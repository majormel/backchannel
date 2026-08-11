import os
import tempfile
from pathlib import Path
from typing import IO


PRIVATE_FILE_MODE = 0o600


def ensure_private_file(path: str | Path) -> None:
    target = Path(path)
    try:
        os.chmod(target, PRIVATE_FILE_MODE)
    except OSError:
        return


def open_private_text_append(path: str | Path) -> IO[str]:
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    descriptor = os.open(target, os.O_RDWR | os.O_APPEND | os.O_CREAT, PRIVATE_FILE_MODE)
    try:
        os.fchmod(descriptor, PRIVATE_FILE_MODE)
    except OSError:
        pass
    return os.fdopen(descriptor, "a+", encoding="utf-8")


def truncate_private_file(path: str | Path) -> None:
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    descriptor = os.open(target, os.O_WRONLY | os.O_TRUNC | os.O_CREAT, PRIVATE_FILE_MODE)
    try:
        os.fchmod(descriptor, PRIVATE_FILE_MODE)
    except OSError:
        pass
    os.close(descriptor)


def write_private_bytes(path: str | Path, payload: bytes) -> None:
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    descriptor = os.open(target, os.O_WRONLY | os.O_TRUNC | os.O_CREAT, PRIVATE_FILE_MODE)
    try:
        try:
            os.fchmod(descriptor, PRIVATE_FILE_MODE)
        except OSError:
            pass
        with os.fdopen(descriptor, "wb") as handle:
            handle.write(payload)
    except Exception:
        try:
            os.close(descriptor)
        except OSError:
            pass
        raise


def write_private_text(path: str | Path, payload: str) -> None:
    write_private_bytes(path, payload.encode("utf-8"))


def write_private_text_atomic(path: str | Path, payload: str) -> None:
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary_name = tempfile.mkstemp(prefix=f".{target.name}.", dir=str(target.parent))
    temporary_path = Path(temporary_name)
    try:
        try:
            os.fchmod(descriptor, PRIVATE_FILE_MODE)
        except OSError:
            pass
        with os.fdopen(descriptor, "wb") as handle:
            handle.write(payload.encode("utf-8"))
            handle.flush()
            os.fsync(handle.fileno())
        temporary_path.replace(target)
        ensure_private_file(target)
    except Exception:
        try:
            os.close(descriptor)
        except OSError:
            pass
        try:
            temporary_path.unlink()
        except OSError:
            pass
        raise


def secure_sqlite_files(path: str | Path) -> None:
    target = Path(path)
    for candidate in (target, Path(str(target) + "-wal"), Path(str(target) + "-shm")):
        if candidate.exists():
            ensure_private_file(candidate)
