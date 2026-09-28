# ─────────────────────────────────────────────────────────────────────────────
#  humanly — Python SDK type definitions
# ─────────────────────────────────────────────────────────────────────────────

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal, Optional


# ── Agents ────────────────────────────────────────────────────────────────────

@dataclass
class Agent:
    id: str
    name: str
    model: str
    system_prompt: str
    created_at: str


# ── Personas ──────────────────────────────────────────────────────────────────

@dataclass
class Persona:
    id: str
    name: str
    description: str
    behavior_mode: Literal["good", "bad", "liar"]
    created_at: str


# ── Connectors ────────────────────────────────────────────────────────────────

@dataclass
class Connector:
    id: str
    name: str
    endpoint_url: str
    environment: str
    created_at: str


# ── Suites ────────────────────────────────────────────────────────────────────

@dataclass
class Suite:
    id: str
    name: str
    conversation_count: int
    created_at: str
    description: Optional[str] = None


# ── Runs ──────────────────────────────────────────────────────────────────────

RunStatus = Literal["pending", "running", "completed", "failed", "cancelled"]


@dataclass
class TriggerRunOptions:
    suite_id: str
    connector_id: Optional[str] = None
    baseline_id: Optional[str] = None
    label: Optional[str] = None


@dataclass
class Run:
    id: str
    status: RunStatus
    suite_id: str
    connector_id: str
    created_at: str
    label: Optional[str] = None
    completed_at: Optional[str] = None


# ── Reports ───────────────────────────────────────────────────────────────────

@dataclass
class CheckScore:
    check_name: str
    score: float
    passed: bool
    explanation: str


@dataclass
class ConversationResult:
    id: str
    persona_name: str
    turn_count: int
    overall_score: float
    passed: bool
    check_scores: list[CheckScore] = field(default_factory=list)


@dataclass
class Report:
    run_id: str
    status: RunStatus
    overall_score: float
    pass_rate: float
    conversation_count: int
    baseline_breach: bool
    created_at: str
    conversations: list[ConversationResult] = field(default_factory=list)
    baseline_id: Optional[str] = None
    baseline_delta: Optional[float] = None
    completed_at: Optional[str] = None


# ── Baselines ─────────────────────────────────────────────────────────────────

@dataclass
class CreateBaselineOptions:
    run_id: str
    name: str
    threshold: float = 0.0


@dataclass
class Baseline:
    id: str
    name: str
    run_id: str
    overall_score: float
    threshold: float
    created_at: str
