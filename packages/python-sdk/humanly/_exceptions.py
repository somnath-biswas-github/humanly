# ─────────────────────────────────────────────────────────────────────────────
#  humanly — exceptions
# ─────────────────────────────────────────────────────────────────────────────

from __future__ import annotations


class HumanlyError(Exception):
    """Raised when the Humanly API returns a non-2xx response."""

    def __init__(self, status: int, message: str, code: str | None = None) -> None:
        super().__init__(message)
        self.status = status
        self.code = code

    def __repr__(self) -> str:
        return f"HumanlyError(status={self.status}, message={str(self)!r}, code={self.code!r})"


class HumanlyTimeoutError(HumanlyError):
    """Raised when waitForRun exceeds the poll timeout."""

    def __init__(self, run_id: str) -> None:
        super().__init__(408, f"Timed out waiting for run {run_id}")
        self.run_id = run_id
