# ─────────────────────────────────────────────────────────────────────────────
#  humanly — client (sync + async)
# ─────────────────────────────────────────────────────────────────────────────

from __future__ import annotations

import asyncio
import time
from dataclasses import asdict
from typing import Any, TypeVar

import httpx

from ._exceptions import HumanlyError, HumanlyTimeoutError
from ._models import (
    Agent,
    Baseline,
    CheckScore,
    Connector,
    ConversationResult,
    CreateBaselineOptions,
    Persona,
    Report,
    Run,
    Suite,
    TriggerRunOptions,
)

DEFAULT_BASE_URL = "http://localhost:5000"
DEFAULT_TIMEOUT = 30.0
DEFAULT_POLL_INTERVAL = 3.0
DEFAULT_POLL_TIMEOUT = 600.0

T = TypeVar("T")


def _camel(s: str) -> str:
    """Convert snake_case to camelCase for API payloads."""
    parts = s.split("_")
    return parts[0] + "".join(p.title() for p in parts[1:])


def _to_api(obj: Any) -> dict[str, Any]:
    """Dataclass → camelCase dict, dropping None values."""
    return {_camel(k): v for k, v in asdict(obj).items() if v is not None}


def _parse_check_score(d: dict) -> CheckScore:
    return CheckScore(
        check_name=d["checkName"],
        score=d["score"],
        passed=d["passed"],
        explanation=d["explanation"],
    )


def _parse_conversation(d: dict) -> ConversationResult:
    return ConversationResult(
        id=d["id"],
        persona_name=d["personaName"],
        turn_count=d["turnCount"],
        overall_score=d["overallScore"],
        passed=d["passed"],
        check_scores=[_parse_check_score(c) for c in d.get("checkScores", [])],
    )


def _parse_agent(d: dict) -> Agent:
    return Agent(
        id=d["id"],
        name=d["name"],
        model=d["model"],
        system_prompt=d["systemPrompt"],
        created_at=d["createdAt"],
    )


def _parse_persona(d: dict) -> Persona:
    return Persona(
        id=d["id"],
        name=d["name"],
        description=d["description"],
        behavior_mode=d["behaviorMode"],
        created_at=d["createdAt"],
    )


def _parse_connector(d: dict) -> Connector:
    return Connector(
        id=d["id"],
        name=d["name"],
        endpoint_url=d["endpointUrl"],
        environment=d["environment"],
        created_at=d["createdAt"],
    )


def _parse_suite(d: dict) -> Suite:
    return Suite(
        id=d["id"],
        name=d["name"],
        description=d.get("description"),
        conversation_count=d["conversationCount"],
        created_at=d["createdAt"],
    )


def _parse_run(d: dict) -> Run:
    return Run(
        id=d["id"],
        status=d["status"],
        suite_id=d["suiteId"],
        connector_id=d["connectorId"],
        label=d.get("label"),
        created_at=d["createdAt"],
        completed_at=d.get("completedAt"),
    )


def _parse_report(d: dict) -> Report:
    return Report(
        run_id=d["runId"],
        status=d["status"],
        overall_score=d["overallScore"],
        pass_rate=d["passRate"],
        conversation_count=d["conversationCount"],
        conversations=[_parse_conversation(c) for c in d.get("conversations", [])],
        baseline_breach=d["baselineBreach"],
        baseline_id=d.get("baselineId"),
        baseline_delta=d.get("baselineDelta"),
        created_at=d["createdAt"],
        completed_at=d.get("completedAt"),
    )


def _parse_baseline(d: dict) -> Baseline:
    return Baseline(
        id=d["id"],
        name=d["name"],
        run_id=d["runId"],
        overall_score=d["overallScore"],
        threshold=d["threshold"],
        created_at=d["createdAt"],
    )


def _raise_for(status: int, data: dict) -> None:
    raise HumanlyError(
        status,
        data.get("message", f"HTTP {status}"),
        data.get("code"),
    )


# ── Sync client ───────────────────────────────────────────────────────────────


class HumanlyClient:
    """
    Synchronous Humanly API client.

    Example::

        from humanly import HumanlyClient

        client = HumanlyClient(api_key="hmnly_...")
        run = client.trigger_run(suite_id="s_abc")
        report = client.wait_for_run(run.id)
        if report.baseline_breach:
            raise SystemExit(1)
    """

    def __init__(
        self,
        api_key: str,
        base_url: str = DEFAULT_BASE_URL,
        timeout: float = DEFAULT_TIMEOUT,
    ) -> None:
        if not api_key:
            raise ValueError("HumanlyClient: api_key is required")
        self._api_key = api_key
        self._base_url = base_url.rstrip("/")
        self._http = httpx.Client(
            base_url=self._base_url,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            timeout=timeout,
        )

    def _request(self, method: str, path: str, json: dict | None = None) -> dict:
        resp = self._http.request(method, path, json=json)
        if resp.status_code == 429:
            retry_after = float(resp.headers.get("Retry-After", 5))
            time.sleep(retry_after)
            return self._request(method, path, json)
        data = resp.json() if resp.content else {}
        if not resp.is_success:
            _raise_for(resp.status_code, data)
        return data

    # ── Agents ────────────────────────────────────────────────────────────────

    def list_agents(self) -> list[Agent]:
        """List all agents in your workspace."""
        return [_parse_agent(a) for a in self._request("GET", "/v1/agents")]

    # ── Personas ──────────────────────────────────────────────────────────────

    def list_personas(self) -> list[Persona]:
        """List all test personas in your workspace."""
        return [_parse_persona(p) for p in self._request("GET", "/v1/personas")]

    # ── Connectors ────────────────────────────────────────────────────────────

    def list_connectors(self) -> list[Connector]:
        """List all AgentConnectors in your workspace."""
        return [_parse_connector(c) for c in self._request("GET", "/v1/connectors")]

    # ── Suites ────────────────────────────────────────────────────────────────

    def list_suites(self) -> list[Suite]:
        """List all test suites in your workspace."""
        return [_parse_suite(s) for s in self._request("GET", "/v1/suites")]

    # ── Runs ──────────────────────────────────────────────────────────────────

    def trigger_run(
        self,
        suite_id: str,
        connector_id: str | None = None,
        baseline_id: str | None = None,
        label: str | None = None,
    ) -> Run:
        """Trigger a new test run."""
        body: dict[str, Any] = {"suiteId": suite_id}
        if connector_id:
            body["connectorId"] = connector_id
        if baseline_id:
            body["baselineId"] = baseline_id
        if label:
            body["label"] = label
        return _parse_run(self._request("POST", "/v1/runs", body))

    def get_run(self, run_id: str) -> Run:
        """Get the current status of a run."""
        return _parse_run(self._request("GET", f"/v1/runs/{run_id}"))

    def list_runs(self) -> list[Run]:
        """List all runs in your workspace."""
        return [_parse_run(r) for r in self._request("GET", "/v1/runs")]

    def get_report(self, run_id: str) -> Report:
        """Get the full evaluation report for a completed run."""
        return _parse_report(self._request("GET", f"/v1/runs/{run_id}/report"))

    def wait_for_run(
        self,
        run_id: str,
        poll_interval: float = DEFAULT_POLL_INTERVAL,
        timeout: float = DEFAULT_POLL_TIMEOUT,
    ) -> Report:
        """
        Poll until a run completes, then return its report.

        Raises ``HumanlyTimeoutError`` if the poll timeout is exceeded.
        Raises ``HumanlyError`` if the run fails or is cancelled.

        Example::

            report = client.wait_for_run(run.id)
            if report.baseline_breach:
                raise SystemExit(1)
        """
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            run = self.get_run(run_id)
            if run.status == "completed":
                return self.get_report(run_id)
            if run.status == "failed":
                raise HumanlyError(500, f"Run {run_id} failed")
            if run.status == "cancelled":
                raise HumanlyError(409, f"Run {run_id} was cancelled")
            time.sleep(poll_interval)
        raise HumanlyTimeoutError(run_id)

    # ── Baselines ─────────────────────────────────────────────────────────────

    def create_baseline(
        self,
        run_id: str,
        name: str,
        threshold: float = 0.0,
    ) -> Baseline:
        """Register a run as a quality baseline."""
        body = {"runId": run_id, "name": name, "threshold": threshold}
        return _parse_baseline(self._request("POST", "/v1/baselines", body))

    def get_baseline(self, baseline_id: str) -> Baseline:
        """Get a specific baseline by ID."""
        return _parse_baseline(self._request("GET", f"/v1/baselines/{baseline_id}"))

    def list_baselines(self) -> list[Baseline]:
        """List all baselines in your workspace."""
        return [_parse_baseline(b) for b in self._request("GET", "/v1/baselines")]

    def close(self) -> None:
        self._http.close()

    def __enter__(self) -> "HumanlyClient":
        return self

    def __exit__(self, *_: Any) -> None:
        self.close()


# ── Async client ──────────────────────────────────────────────────────────────


class AsyncHumanlyClient:
    """
    Async Humanly API client (asyncio + httpx).

    Example::

        from humanly import AsyncHumanlyClient

        async def main():
            async with AsyncHumanlyClient(api_key="hmnly_...") as client:
                run = await client.trigger_run(suite_id="s_abc")
                report = await client.wait_for_run(run.id)
                if report.baseline_breach:
                    raise SystemExit(1)
    """

    def __init__(
        self,
        api_key: str,
        base_url: str = DEFAULT_BASE_URL,
        timeout: float = DEFAULT_TIMEOUT,
    ) -> None:
        if not api_key:
            raise ValueError("AsyncHumanlyClient: api_key is required")
        self._api_key = api_key
        self._base_url = base_url.rstrip("/")
        self._http = httpx.AsyncClient(
            base_url=self._base_url,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            timeout=timeout,
        )

    async def _request(self, method: str, path: str, json: dict | None = None) -> dict:
        resp = await self._http.request(method, path, json=json)
        if resp.status_code == 429:
            retry_after = float(resp.headers.get("Retry-After", 5))
            await asyncio.sleep(retry_after)
            return await self._request(method, path, json)
        data = resp.json() if resp.content else {}
        if not resp.is_success:
            _raise_for(resp.status_code, data)
        return data

    async def list_agents(self) -> list[Agent]:
        return [_parse_agent(a) for a in await self._request("GET", "/v1/agents")]

    async def list_personas(self) -> list[Persona]:
        return [_parse_persona(p) for p in await self._request("GET", "/v1/personas")]

    async def list_connectors(self) -> list[Connector]:
        return [_parse_connector(c) for c in await self._request("GET", "/v1/connectors")]

    async def list_suites(self) -> list[Suite]:
        return [_parse_suite(s) for s in await self._request("GET", "/v1/suites")]

    async def trigger_run(
        self,
        suite_id: str,
        connector_id: str | None = None,
        baseline_id: str | None = None,
        label: str | None = None,
    ) -> Run:
        body: dict[str, Any] = {"suiteId": suite_id}
        if connector_id:
            body["connectorId"] = connector_id
        if baseline_id:
            body["baselineId"] = baseline_id
        if label:
            body["label"] = label
        return _parse_run(await self._request("POST", "/v1/runs", body))

    async def get_run(self, run_id: str) -> Run:
        return _parse_run(await self._request("GET", f"/v1/runs/{run_id}"))

    async def list_runs(self) -> list[Run]:
        return [_parse_run(r) for r in await self._request("GET", "/v1/runs")]

    async def get_report(self, run_id: str) -> Report:
        return _parse_report(await self._request("GET", f"/v1/runs/{run_id}/report"))

    async def wait_for_run(
        self,
        run_id: str,
        poll_interval: float = DEFAULT_POLL_INTERVAL,
        timeout: float = DEFAULT_POLL_TIMEOUT,
    ) -> Report:
        deadline = asyncio.get_event_loop().time() + timeout
        while asyncio.get_event_loop().time() < deadline:
            run = await self.get_run(run_id)
            if run.status == "completed":
                return await self.get_report(run_id)
            if run.status == "failed":
                raise HumanlyError(500, f"Run {run_id} failed")
            if run.status == "cancelled":
                raise HumanlyError(409, f"Run {run_id} was cancelled")
            await asyncio.sleep(poll_interval)
        raise HumanlyTimeoutError(run_id)

    async def create_baseline(
        self,
        run_id: str,
        name: str,
        threshold: float = 0.0,
    ) -> Baseline:
        body = {"runId": run_id, "name": name, "threshold": threshold}
        return _parse_baseline(await self._request("POST", "/v1/baselines", body))

    async def get_baseline(self, baseline_id: str) -> Baseline:
        return _parse_baseline(await self._request("GET", f"/v1/baselines/{baseline_id}"))

    async def list_baselines(self) -> list[Baseline]:
        return [_parse_baseline(b) for b in await self._request("GET", "/v1/baselines")]

    async def close(self) -> None:
        await self._http.aclose()

    async def __aenter__(self) -> "AsyncHumanlyClient":
        return self

    async def __aexit__(self, *_: Any) -> None:
        await self.close()
