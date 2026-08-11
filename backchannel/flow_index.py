import json
import os
import re
import sqlite3
import threading
import urllib.parse
import datetime

from backchannel.file_security import secure_sqlite_files


class FlowIndex:
    def __init__(self, db_path: str):
        self.db_path = os.path.expanduser(db_path)
        parent = os.path.dirname(self.db_path)
        if parent:
            os.makedirs(parent, exist_ok=True)
        self._lock = threading.RLock()
        self._conn = sqlite3.connect(self.db_path, check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._conn.execute("PRAGMA journal_mode=WAL")
        self._conn.execute("PRAGMA synchronous=NORMAL")
        secure_sqlite_files(self.db_path)
        self.init_schema()

    def _commit(self):
        self._conn.commit()
        secure_sqlite_files(self.db_path)

    def init_schema(self):
        with self._lock:
            cursor = self._conn.cursor()
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS flows (
                    id TEXT PRIMARY KEY,
                    timestamp REAL,
                    method TEXT,
                    url TEXT,
                    host TEXT,
                    path TEXT,
                    status_code INTEGER,
                    duration_ms INTEGER,
                    body_size INTEGER,
                    request_body TEXT,
                    response_body TEXT,
                    jsonl_offset INTEGER,
                    jsonl_length INTEGER
                )
                """
            )
            try:
                cursor.execute("ALTER TABLE flows ADD COLUMN request_body TEXT")
            except Exception:
                pass
            try:
                cursor.execute("ALTER TABLE flows ADD COLUMN response_body TEXT")
            except Exception:
                pass
            fts_row = cursor.execute(
                "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'flow_fts'"
            ).fetchone()
            existing_fts_sql = (fts_row["sql"] if fts_row else "") or ""
            if "flow_id UNINDEXED" not in existing_fts_sql:
                cursor.execute("DROP TABLE IF EXISTS flow_fts")
                cursor.execute(
                    """
                    CREATE VIRTUAL TABLE flow_fts USING fts5(
                        flow_id UNINDEXED,
                        url,
                        request_body,
                        response_body
                    )
                    """
                )
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS flow_headers (
                    flow_id TEXT,
                    name TEXT,
                    value TEXT,
                    direction TEXT
                )
                """
            )
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_ts ON flows(timestamp)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_status ON flows(status_code)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_method ON flows(method)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_host ON flows(host)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_flow_headers_flow_id ON flow_headers(flow_id)")
            self._commit()

    def _to_int(self, value):
        if value is None:
            return None
        try:
            return int(value)
        except Exception:
            return None

    def _to_float(self, value):
        if value is None:
            return None
        try:
            return float(value)
        except Exception:
            return None

    def _to_timestamp(self, value):
        numeric = self._to_float(value)
        if numeric is not None:
            return numeric
        if value is None:
            return None
        text = str(value).strip()
        if not text:
            return None
        if text.endswith("Z"):
            text = text[:-1] + "+00:00"
        try:
            parsed = datetime.datetime.fromisoformat(text)
        except Exception:
            return None
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=datetime.timezone.utc)
        return parsed.timestamp()

    def _normalize_filters(self, filters: dict | None) -> dict:
        result = {}
        if not filters:
            return result
        if filters.get("url_contains"):
            result["url_contains"] = str(filters["url_contains"])
        if filters.get("method"):
            result["method"] = str(filters["method"]).upper()
        if filters.get("status_min") is not None:
            result["status_min"] = self._to_int(filters.get("status_min"))
        if filters.get("status_max") is not None:
            result["status_max"] = self._to_int(filters.get("status_max"))
        if filters.get("time_from") is not None:
            value = self._to_float(filters.get("time_from"))
            if value is not None:
                result["time_from"] = value
        if filters.get("time_to") is not None:
            value = self._to_float(filters.get("time_to"))
            if value is not None:
                result["time_to"] = value
        if "time_from" not in result and filters.get("date_from") is not None:
            value = self._to_timestamp(filters.get("date_from"))
            if value is not None:
                result["time_from"] = value
        if "time_to" not in result and filters.get("date_to") is not None:
            value = self._to_timestamp(filters.get("date_to"))
            if value is not None:
                result["time_to"] = value
        return result

    def _build_where_clause(self, filters: dict | None):
        normalized = self._normalize_filters(filters)
        clauses = []
        params: list[object] = []
        url_contains = normalized.get("url_contains")
        if url_contains:
            clauses.append("flows.url LIKE ?")
            params.append(f"%{url_contains}%")
        method = normalized.get("method")
        if method:
            clauses.append("flows.method = ?")
            params.append(method)
        status_min = normalized.get("status_min")
        if status_min is not None:
            clauses.append("flows.status_code >= ?")
            params.append(status_min)
        status_max = normalized.get("status_max")
        if status_max is not None:
            clauses.append("flows.status_code <= ?")
            params.append(status_max)
        time_from = normalized.get("time_from")
        if time_from is not None:
            clauses.append("flows.timestamp >= ?")
            params.append(float(time_from))
        time_to = normalized.get("time_to")
        if time_to is not None:
            clauses.append("flows.timestamp <= ?")
            params.append(float(time_to))
        if not clauses:
            return "", params
        return " WHERE " + " AND ".join(clauses), params

    def _build_fts_query(self, query: str) -> str:
        tokens = re.findall(r"[A-Za-z0-9_]+", query.lower())
        if not tokens:
            return ""
        return " AND ".join(f"{token}*" for token in tokens[:12])

    def _row_to_dict(self, row: sqlite3.Row) -> dict:
        return {
            "id": row["id"],
            "timestamp": row["timestamp"],
            "method": row["method"],
            "url": row["url"],
            "host": row["host"],
            "path": row["path"],
            "status_code": row["status_code"],
            "duration_ms": row["duration_ms"],
            "body_size": row["body_size"],
            "jsonl_offset": row["jsonl_offset"],
            "jsonl_length": row["jsonl_length"],
        }

    def _parse_url_parts(self, url: str):
        if not url:
            return None, None
        try:
            parsed = urllib.parse.urlparse(url)
        except Exception:
            return None, None
        host = parsed.hostname or parsed.netloc or None
        path = parsed.path or "/"
        if parsed.query:
            path = f"{path}?{parsed.query}"
        return host, path

    def _index_flow_with_cursor(self, cursor: sqlite3.Cursor, flow: dict, jsonl_offset: int, jsonl_length: int):
        flow_id = flow.get("id")
        if not flow_id:
            return
        request = flow.get("request") or {}
        response = flow.get("response") or {}
        timing = flow.get("timing") or {}
        url = request.get("url") or ""
        method = (request.get("method") or "").upper()
        host = request.get("host")
        path = request.get("path")
        if not host or not path:
            parsed_host, parsed_path = self._parse_url_parts(url)
            host = host or parsed_host
            path = path or parsed_path
        timestamp = self._to_float(flow.get("ts"))
        status_code = self._to_int(response.get("status_code"))
        duration_ms = self._to_int(timing.get("total_duration_ms"))
        body_size = self._to_int(response.get("body_size"))
        request_body = request.get("body") or ""
        response_body = response.get("body") or ""

        cursor.execute(
            """
            INSERT INTO flows (
                id, timestamp, method, url, host, path, status_code, duration_ms, body_size, request_body, response_body, jsonl_offset, jsonl_length
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                timestamp = excluded.timestamp,
                method = excluded.method,
                url = excluded.url,
                host = excluded.host,
                path = excluded.path,
                status_code = excluded.status_code,
                duration_ms = excluded.duration_ms,
                body_size = excluded.body_size,
                request_body = excluded.request_body,
                response_body = excluded.response_body,
                jsonl_offset = excluded.jsonl_offset,
                jsonl_length = excluded.jsonl_length
            """,
            (
                str(flow_id),
                timestamp,
                method,
                url,
                host,
                path,
                status_code,
                duration_ms,
                body_size,
                request_body,
                response_body,
                int(jsonl_offset),
                int(jsonl_length),
            ),
        )
        cursor.execute("DELETE FROM flow_fts WHERE flow_id = ?", (str(flow_id),))
        cursor.execute(
            "INSERT INTO flow_fts (flow_id, url, request_body, response_body) VALUES (?, ?, ?, ?)",
            (str(flow_id), url, request_body, response_body),
        )
        cursor.execute("DELETE FROM flow_headers WHERE flow_id = ?", (str(flow_id),))
        request_headers = request.get("headers") or {}
        response_headers = response.get("headers") or {}
        headers_rows = []
        for name, value in request_headers.items():
            headers_rows.append((str(flow_id), str(name), str(value), "request"))
        for name, value in response_headers.items():
            headers_rows.append((str(flow_id), str(name), str(value), "response"))
        if headers_rows:
            cursor.executemany(
                "INSERT INTO flow_headers (flow_id, name, value, direction) VALUES (?, ?, ?, ?)",
                headers_rows,
            )

    def index_flow(self, flow: dict, jsonl_offset: int, jsonl_length: int):
        with self._lock:
            cursor = self._conn.cursor()
            self._index_flow_with_cursor(cursor, flow, jsonl_offset, jsonl_length)
            self._commit()

    def search(self, query: str, filters: dict, limit: int = 200) -> list[dict]:
        query_text = (query or "").strip()
        if not query_text:
            return self.tail(limit, filters)

        normalized_limit = max(1, min(int(limit), 2000))
        where_clause, where_params = self._build_where_clause(filters)
        like_query = f"%{query_text.lower()}%"
        fts_query = self._build_fts_query(query_text)

        clauses = []
        params: list[object] = []
        if fts_query:
            clauses.append("flows.id IN (SELECT flow_id FROM flow_fts WHERE flow_fts MATCH ?)")
            params.append(fts_query)
        clauses.append("LOWER(flows.url) LIKE ?")
        params.append(like_query)
        clauses.append("LOWER(flows.method) LIKE ?")
        params.append(like_query)
        clauses.append(
            "EXISTS (SELECT 1 FROM flow_headers WHERE flow_headers.flow_id = flows.id AND (LOWER(flow_headers.name) LIKE ? OR LOWER(flow_headers.value) LIKE ?))"
        )
        params.append(like_query)
        params.append(like_query)

        query_clause = " OR ".join(clauses)
        where_prefix = "WHERE (" + query_clause + ")"
        if where_clause:
            where_prefix += " AND " + where_clause.replace(" WHERE ", "")

        sql = (
            "SELECT flows.id, flows.timestamp, flows.method, flows.url, flows.host, flows.path, "
            "flows.status_code, flows.duration_ms, flows.body_size, flows.jsonl_offset, flows.jsonl_length "
            "FROM flows "
            f"{where_prefix} "
            "ORDER BY flows.timestamp DESC, flows.rowid DESC "
            "LIMIT ?"
        )
        params.extend(where_params)
        params.append(normalized_limit)

        with self._lock:
            rows = self._conn.execute(sql, params).fetchall()
        results = [self._row_to_dict(row) for row in rows]
        results.reverse()
        return results

    def tail(self, n: int, filters: dict) -> list[dict]:
        normalized_limit = max(1, min(int(n), 2000))
        where_clause, params = self._build_where_clause(filters)
        sql = (
            "SELECT id, timestamp, method, url, host, path, status_code, duration_ms, body_size, jsonl_offset, jsonl_length "
            "FROM flows "
            f"{where_clause} "
            "ORDER BY timestamp DESC, rowid DESC "
            "LIMIT ?"
        )
        params.append(normalized_limit)
        with self._lock:
            rows = self._conn.execute(sql, params).fetchall()
        results = [self._row_to_dict(row) for row in rows]
        results.reverse()
        return results

    def get_by_id(self, flow_id: str) -> dict | None:
        with self._lock:
            row = self._conn.execute(
                "SELECT jsonl_offset, jsonl_length FROM flows WHERE id = ?",
                (str(flow_id),),
            ).fetchone()
        if row is None:
            return None
        return {"jsonl_offset": int(row["jsonl_offset"]), "jsonl_length": int(row["jsonl_length"])}

    def count(self) -> int:
        with self._lock:
            row = self._conn.execute("SELECT COUNT(*) AS count FROM flows").fetchone()
        if row is None:
            return 0
        return int(row["count"])

    def last_indexed_offset(self) -> int:
        with self._lock:
            row = self._conn.execute(
                "SELECT COALESCE(MAX(jsonl_offset + jsonl_length), 0) AS max_offset FROM flows"
            ).fetchone()
        if row is None:
            return 0
        return int(row["max_offset"] or 0)

    def clear(self):
        with self._lock:
            cursor = self._conn.cursor()
            cursor.execute("DELETE FROM flow_headers")
            cursor.execute("DELETE FROM flow_fts")
            cursor.execute("DELETE FROM flows")
            self._commit()

    def close(self):
        with self._lock:
            self._conn.close()

    def index_existing_file(self, jsonl_path: str, progress_cb=None):
        source_path = os.path.expanduser(jsonl_path)
        if not os.path.exists(source_path):
            self.clear()
            if progress_cb:
                progress_cb(0, 0)
            return

        total = 0
        with open(source_path, "rb") as handle:
            for raw_line in handle:
                if raw_line.strip():
                    total += 1
        if progress_cb:
            progress_cb(0, total)

        with self._lock:
            cursor = self._conn.cursor()
            cursor.execute("DELETE FROM flow_headers")
            cursor.execute("DELETE FROM flow_fts")
            cursor.execute("DELETE FROM flows")
            self._commit()

        indexed = 0
        offset = 0
        with open(source_path, "rb") as handle:
            batch = []
            for raw_line in handle:
                line_length = len(raw_line)
                line_content = raw_line.strip()
                if line_content:
                    try:
                        flow = json.loads(line_content.decode("utf-8"))
                    except Exception:
                        offset += line_length
                        continue
                    batch.append((flow, offset, line_length))
                    indexed += 1
                    if len(batch) >= 250:
                        with self._lock:
                            cursor = self._conn.cursor()
                            cursor.execute("BEGIN")
                            for f, o, l in batch:
                                self._index_flow_with_cursor(cursor, f, o, l)
                            self._commit()
                        batch = []
                    if progress_cb and (indexed % 50 == 0 or indexed == total):
                        progress_cb(indexed, total)
                offset += line_length
            if batch:
                with self._lock:
                    cursor = self._conn.cursor()
                    cursor.execute("BEGIN")
                    for f, o, l in batch:
                        self._index_flow_with_cursor(cursor, f, o, l)
                    self._commit()
