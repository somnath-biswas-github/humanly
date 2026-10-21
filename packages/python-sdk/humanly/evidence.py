"""Conversation-scoped runtime evidence. No model calls or implicit approvals."""
from copy import deepcopy
from threading import RLock
from uuid import uuid4


class EvidenceRecorder:
    def __init__(self, session_id, sensitive_fields=("password", "token", "secret", "authorization", "api_key")):
        if not isinstance(session_id, str) or not session_id:
            raise ValueError("session_id is required")
        self.session_id = session_id
        self.sensitive_fields = {str(k).lower() for k in sensitive_fields}
        self.events = []
        self.warnings = []
        self._pending = {}
        self._turn = 0
        self._closed = False
        self._lock = RLock()

    def _redact(self, value):
        if isinstance(value, dict):
            return {k: "[REDACTED]" if str(k).lower() in self.sensitive_fields else self._redact(v) for k, v in value.items()}
        if isinstance(value, (tuple, list)):
            return [self._redact(v) for v in value]
        if value is None or isinstance(value, (str, int, float, bool)):
            return value
        return "[UNSERIALIZABLE]"

    def begin_turn(self, turn):
        with self._lock:
            if self._pending or not isinstance(turn, int) or turn != self._turn + 1:
                raise ValueError("Finish pending tools and advance turns sequentially")
            self._turn = turn
            self._closed = False
            self._emit("progress", values={"turnStarted": turn})

    def _emit(self, kind, **fields):
        with self._lock:
            if not self._turn or self._closed:
                raise ValueError("Begin an open turn before recording events")
            event = {"seq": len(self.events) + 1, "turn": self._turn, "type": kind, **self._redact(fields)}
            self.events.append(event)
            return deepcopy(event)

    def start_tool(self, name, arguments, target, operation_id=None, call_id=None):
        with self._lock:
            if not isinstance(arguments, dict) or not name or not target:
                raise ValueError("Explicit tool name, structured arguments and target required")
            call_id = call_id or str(uuid4())
            if call_id in self._pending:
                raise ValueError("Duplicate active tool call")
            self._emit("action", callId=call_id, operationId=operation_id or call_id,
                       binding={"action": name, "target": target, "params": arguments})
            self._pending[call_id] = self._turn
            return call_id

    def end_tool(self, call_id, status):
        with self._lock:
            if call_id not in self._pending or status not in ("success", "failure", "timeout", "unknown"):
                raise ValueError("Unknown tool call or outcome")
            self._emit("outcome", callId=call_id, status=status)
            del self._pending[call_id]

    def state(self, values):
        if not isinstance(values, dict):
            raise ValueError("State must be supplied by the application")
        self._emit("state", values=values)

    def approval(self, approval_id, binding, user_turn):
        """Only call after the host application independently validates user consent."""
        if not approval_id or not isinstance(binding, dict) or not 1 <= user_turn <= self._turn:
            raise ValueError("Explicit approval binding and originating user turn required")
        if not binding.get("action") or not binding.get("target") or not isinstance(binding.get("params"), dict):
            raise ValueError("Material approval binding required")
        self._emit("approval", approvalId=approval_id, binding=binding, userTurn=user_turn)

    def revoke(self, approval_id):
        if not approval_id:
            raise ValueError("approval_id required")
        self._emit("revoke", approvalId=approval_id)

    def incomplete(self, reason):
        self.warnings.append(reason)

    def finish_turn(self, status="completed", reason=None):
        with self._lock:
            if status not in ("completed", "waiting", "failed", "budget_exhausted"):
                raise ValueError("Invalid completion status")
            if self._pending:
                self.incomplete("Pending tool calls at turn completion")
            self._emit("end", status=status, **({"reason": reason} if reason else {}))
            self._closed = True

    def snapshot(self, turn_only=False):
        with self._lock:
            events = [e for e in self.events if not turn_only or e["turn"] == self._turn]
            return {"version": 1, "source": "runtime", "complete": bool(self._closed and not self._pending and not self.warnings),
                    "events": deepcopy(events)}

    def diagnostics(self):
        return {"sessionId": self.session_id, "warnings": list(self.warnings),
                "pendingCalls": len(self._pending), "turnClosed": self._closed}
