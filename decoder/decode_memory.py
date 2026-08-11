from __future__ import annotations
import hashlib
import json
import sqlite3
import time
from dataclasses import dataclass
from pathlib import Path

from backchannel.file_security import secure_sqlite_files

_DEFAULT_DB = Path.home() / ".mitmproxy" / "decode_memory.db"
_SCHEMA = """
CREATE TABLE IF NOT EXISTS decode_memory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fingerprint TEXT NOT NULL,
    chain_json TEXT NOT NULL,
    success_count INTEGER DEFAULT 1,
    last_seen REAL NOT NULL,
    url_pattern TEXT,
    content_type TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_dm_fp ON decode_memory (fingerprint);
CREATE INDEX IF NOT EXISTS idx_dm_url ON decode_memory (url_pattern);
"""

@dataclass
class ChainRecord:
    fingerprint: str
    chain: list[str]
    success_count: int
    last_seen: float
    url_pattern: str | None = None
    content_type: str | None = None

def _fingerprint(data: bytes, ec: str, content_type: str) -> str:
    ph = hashlib.sha256(data[:128]).hexdigest()[:16]
    sb = len(data) // 512
    ct = content_type.split(";")[0].strip()[:32]
    return f"{ph}:{ec}:{sb}:{ct}"

def _entropy_class(data: bytes) -> str:
    from decoder.crypto import shannon_entropy
    e = shannon_entropy(data[:2048])
    if e < 3.5:
        return "low"
    if e < 6.0:
        return "medium"
    if e < 7.5:
        return "high"
    return "encrypted"

class DecodeMemory:
    def __init__(self, db_path: Path | str | None = None):
        self._db_path = Path(db_path) if db_path else _DEFAULT_DB
        self._db_path.parent.mkdir(parents=True, exist_ok=True)
        self._conn = sqlite3.connect(str(self._db_path), check_same_thread=False)
        self._conn.executescript(_SCHEMA)
        self._conn.commit()
        secure_sqlite_files(self._db_path)

    def lookup(self, data: bytes, content_type: str = "") -> list[ChainRecord]:
        fp = _fingerprint(data, _entropy_class(data), content_type)
        rows = self._conn.execute(
            "SELECT fingerprint,chain_json,success_count,last_seen,url_pattern,content_type "
            "FROM decode_memory WHERE fingerprint=? ORDER BY success_count DESC",
            (fp,),
        ).fetchall()
        return [ChainRecord(r[0], json.loads(r[1]), r[2], r[3], r[4], r[5]) for r in rows]

    def record(self, data: bytes, chain: list[str], *, content_type: str = "", url_pattern: str | None = None) -> None:
        fp = _fingerprint(data, _entropy_class(data), content_type)
        self._conn.execute(
            "INSERT INTO decode_memory(fingerprint,chain_json,success_count,last_seen,url_pattern,content_type) "
            "VALUES(?,?,1,?,?,?) ON CONFLICT(fingerprint) DO UPDATE SET "
            "success_count=success_count+1,last_seen=excluded.last_seen",
            (fp, json.dumps(chain), time.time(), url_pattern, content_type),
        )
        self._conn.commit()
        secure_sqlite_files(self._db_path)

    def list_recent(self, limit: int = 50) -> list[ChainRecord]:
        rows = self._conn.execute(
            "SELECT fingerprint,chain_json,success_count,last_seen,url_pattern,content_type "
            "FROM decode_memory ORDER BY last_seen DESC LIMIT ?",
            (limit,),
        ).fetchall()
        return [ChainRecord(r[0], json.loads(r[1]), r[2], r[3], r[4], r[5]) for r in rows]

    def close(self) -> None:
        self._conn.close()
