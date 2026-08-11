import json
import queue
import shutil
import subprocess
import threading
import time
from dataclasses import dataclass, field
from uuid import uuid4


@dataclass
class CodexReview:
    id: str
    prompt: str
    cwd: str
    thread_id: str | None = None
    turn_id: str | None = None
    status: str = "starting"
    output: str = ""
    error: str | None = None
    created_at: float = field(default_factory=time.time)
    updated_at: float = field(default_factory=time.time)
    events: list[dict] = field(default_factory=list)

    def as_dict(self) -> dict:
        return {
            "id": self.id,
            "thread_id": self.thread_id,
            "turn_id": self.turn_id,
            "status": self.status,
            "output": self.output,
            "error": self.error,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
            "events": self.events[-20:],
        }


class CodexAppServerBridge:
    def __init__(self, command: list[str] | None = None):
        self.command = command or ["codex", "app-server", "--stdio"]
        self.process: subprocess.Popen | None = None
        self.initialized = False
        self.last_error: str | None = None
        self._request_id = 0
        self._pending: dict[int, queue.Queue] = {}
        self._reviews: dict[str, CodexReview] = {}
        self._review_by_thread: dict[str, str] = {}
        self._review_by_turn: dict[str, str] = {}
        self._start_lock = threading.Lock()
        self._write_lock = threading.Lock()
        self._state_lock = threading.Lock()

    def status(self) -> dict:
        process = self.process
        running = process is not None and process.poll() is None
        return {
            "available": shutil.which(self.command[0]) is not None,
            "running": running,
            "initialized": running and self.initialized,
            "last_error": self.last_error,
            "active_reviews": sum(1 for review in self._reviews.values() if review.status in {"starting", "running"}),
        }

    def start(self) -> None:
        with self._start_lock:
            if self.process is not None and self.process.poll() is None and self.initialized:
                return
            executable = shutil.which(self.command[0])
            if executable is None:
                raise RuntimeError("Codex CLI is not installed or is not on PATH")
            self.shutdown()
            try:
                process = subprocess.Popen(
                    self.command,
                    stdin=subprocess.PIPE,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    text=True,
                    bufsize=1,
                )
            except OSError as exc:
                self.last_error = str(exc)
                raise RuntimeError(f"Could not start Codex app-server: {exc}") from exc
            self.process = process
            self.initialized = False
            threading.Thread(target=self._read_stdout, args=(process,), daemon=True).start()
            threading.Thread(target=self._read_stderr, args=(process,), daemon=True).start()
            self._request(
                "initialize",
                {
                    "clientInfo": {
                        "name": "backchannel",
                        "title": "backchannel Traffic Workbench",
                        "version": "0.1.0",
                    }
                },
                timeout=20.0,
                ensure_started=False,
            )
            self._send({"method": "initialized", "params": {}})
            self.initialized = True
            self.last_error = None

    def shutdown(self) -> None:
        process = self.process
        self.process = None
        self.initialized = False
        if process is None:
            return
        if process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=2.0)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=2.0)
        for stream in (process.stdin, process.stdout, process.stderr):
            if stream is not None:
                try:
                    stream.close()
                except OSError:
                    pass

    def start_review(self, prompt: str, cwd: str) -> dict:
        normalized_prompt = str(prompt or "").strip()
        if not normalized_prompt:
            raise ValueError("review prompt required")
        self.start()
        thread_result = self._request(
            "thread/start",
            {
                "cwd": cwd,
                "approvalPolicy": "never",
                "sandbox": "read-only",
                "serviceName": "backchannel",
            },
            timeout=30.0,
        )
        thread_id = str(((thread_result.get("thread") or {}).get("id") or "")).strip()
        if not thread_id:
            raise RuntimeError("Codex app-server did not return a thread id")
        review = CodexReview(id=uuid4().hex, prompt=normalized_prompt, cwd=cwd, thread_id=thread_id)
        with self._state_lock:
            self._reviews[review.id] = review
            self._review_by_thread[thread_id] = review.id
        try:
            turn_result = self._request(
                "turn/start",
                {
                    "threadId": thread_id,
                    "input": [{"type": "text", "text": normalized_prompt}],
                    "cwd": cwd,
                    "approvalPolicy": "never",
                    "sandboxPolicy": {"type": "readOnly"},
                },
                timeout=30.0,
            )
            turn = turn_result.get("turn") or {}
            turn_id = str(turn.get("id") or "").strip()
            with self._state_lock:
                review.turn_id = turn_id or review.turn_id
                review.status = "running"
                review.updated_at = time.time()
                if turn_id:
                    self._review_by_turn[turn_id] = review.id
        except Exception as exc:
            with self._state_lock:
                review.status = "failed"
                review.error = str(exc)
                review.updated_at = time.time()
            raise
        return review.as_dict()

    def get_review(self, review_id: str) -> dict | None:
        with self._state_lock:
            review = self._reviews.get(review_id)
            return review.as_dict() if review else None

    def interrupt_review(self, review_id: str) -> dict:
        with self._state_lock:
            review = self._reviews.get(review_id)
            if review is None:
                raise KeyError(review_id)
            thread_id = review.thread_id
            turn_id = review.turn_id
        if not thread_id or not turn_id:
            raise RuntimeError("Review has not started")
        self._request("turn/interrupt", {"threadId": thread_id, "turnId": turn_id}, timeout=15.0)
        return review.as_dict()

    def _request(self, method: str, params: dict, timeout: float, ensure_started: bool = True) -> dict:
        if ensure_started:
            self.start()
        with self._state_lock:
            self._request_id += 1
            request_id = self._request_id
            response_queue: queue.Queue = queue.Queue(maxsize=1)
            self._pending[request_id] = response_queue
        try:
            self._send({"method": method, "id": request_id, "params": params})
            try:
                response = response_queue.get(timeout=timeout)
            except queue.Empty as exc:
                raise RuntimeError(f"Codex app-server timed out during {method}") from exc
        finally:
            with self._state_lock:
                self._pending.pop(request_id, None)
        error = response.get("error")
        if error:
            message = error.get("message") if isinstance(error, dict) else str(error)
            raise RuntimeError(message or f"Codex app-server failed during {method}")
        result = response.get("result")
        return result if isinstance(result, dict) else {}

    def _send(self, message: dict) -> None:
        process = self.process
        if process is None or process.poll() is not None or process.stdin is None:
            raise RuntimeError("Codex app-server is not running")
        line = json.dumps(message, ensure_ascii=True) + "\n"
        with self._write_lock:
            try:
                process.stdin.write(line)
                process.stdin.flush()
            except (BrokenPipeError, OSError) as exc:
                self.last_error = str(exc)
                raise RuntimeError("Codex app-server connection closed") from exc

    def _read_stdout(self, process: subprocess.Popen) -> None:
        if process.stdout is None:
            return
        try:
            for line in process.stdout:
                try:
                    message = json.loads(line)
                except json.JSONDecodeError:
                    continue
                request_id = message.get("id")
                if request_id is not None and "method" not in message:
                    with self._state_lock:
                        pending = self._pending.get(request_id)
                    if pending is not None:
                        try:
                            pending.put_nowait(message)
                        except queue.Full:
                            pass
                    continue
                if request_id is not None and message.get("method"):
                    try:
                        self._send({"id": request_id, "error": {"code": -32601, "message": "Client request is not supported"}})
                    except RuntimeError:
                        pass
                    continue
                self._handle_notification(message)
        finally:
            if self.process is process and process.poll() is not None:
                self.initialized = False
                if process.returncode not in {0, None} and not self.last_error:
                    self.last_error = f"Codex app-server exited with code {process.returncode}"

    def _read_stderr(self, process: subprocess.Popen) -> None:
        if process.stderr is None:
            return
        for line in process.stderr:
            message = line.strip()
            if message:
                self.last_error = message[-1000:]

    def _handle_notification(self, message: dict) -> None:
        method = str(message.get("method") or "")
        params = message.get("params") or {}
        thread_id = str(params.get("threadId") or "")
        turn = params.get("turn") or {}
        turn_id = str(params.get("turnId") or turn.get("id") or "")
        with self._state_lock:
            review_id = self._review_by_turn.get(turn_id) or self._review_by_thread.get(thread_id)
            review = self._reviews.get(review_id or "")
            if review is None:
                return
            if turn_id and not review.turn_id:
                review.turn_id = turn_id
                self._review_by_turn[turn_id] = review.id
            if method == "item/agentMessage/delta":
                review.output += str(params.get("delta") or "")
            elif method == "item/completed":
                item = params.get("item") or {}
                item_type = str(item.get("type") or "")
                if item_type == "agentMessage" and item.get("text") is not None:
                    review.output = str(item.get("text") or "")
                elif item_type in {"commandExecution", "mcpToolCall", "webSearch", "fileChange"}:
                    review.events.append({"type": item_type, "status": item.get("status") or "completed"})
            elif method == "item/started":
                item = params.get("item") or {}
                item_type = str(item.get("type") or "")
                if item_type in {"commandExecution", "mcpToolCall", "webSearch", "fileChange"}:
                    review.events.append({"type": item_type, "status": item.get("status") or "running"})
            elif method == "turn/completed":
                status = str(turn.get("status") or "completed")
                review.status = {
                    "inProgress": "running",
                    "completed": "completed",
                    "interrupted": "interrupted",
                    "failed": "failed",
                }.get(status, status)
                turn_error = turn.get("error") or {}
                if turn_error:
                    review.error = str(turn_error.get("message") or turn_error)
            elif method == "error":
                error = params.get("error") or {}
                review.error = str(error.get("message") or error or "Codex review failed")
                review.status = "failed"
            review.updated_at = time.time()


_bridge = CodexAppServerBridge()


def get_bridge() -> CodexAppServerBridge:
    return _bridge
