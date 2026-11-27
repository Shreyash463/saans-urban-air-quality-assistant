"""Per-model circuit breaker / negative cache preventing repeated failover walks."""

from __future__ import annotations

import math
import time
from collections.abc import Callable
from dataclasses import dataclass
from typing import Literal

FailureKind = Literal["rate_limit", "unavailable", "not_found"]
BreakerStatus = Literal["closed", "open", "half_open"]


@dataclass
class _ModelBreakerEntry:
    status: Literal["open", "half_open"]
    opened_until: float
    kind: FailureKind


class ModelCircuitBreaker:
    """Tracks per-model failure cooldowns with an injectable monotonic clock."""

    def __init__(
        self,
        rate_limit_cooldown_s: float = 60.0,
        unavailable_cooldown_s: float = 300.0,
        not_found_cooldown_s: float = 900.0,
        clock: Callable[[], float] | None = None,
    ) -> None:
        self._cooldowns: dict[FailureKind, float] = {
            "rate_limit": max(1.0, rate_limit_cooldown_s),
            "unavailable": max(1.0, unavailable_cooldown_s),
            "not_found": max(1.0, not_found_cooldown_s),
        }
        self._clock = clock or time.monotonic
        self._entries: dict[str, _ModelBreakerEntry] = {}

    def state_of(self, model_name: str) -> BreakerStatus:
        """Returns current breaker state for `model_name` at the current clock time."""
        entry = self._entries.get(model_name)
        if entry is None:
            return "closed"
        if entry.status == "half_open":
            return "half_open"
        if self._clock() >= entry.opened_until:
            entry.status = "half_open"
            return "half_open"
        return "open"

    def is_available(self, model_name: str) -> bool:
        return self.state_of(model_name) != "open"

    def record_success(self, model_name: str) -> None:
        self._entries.pop(model_name, None)

    def record_failure(
        self,
        model_name: str,
        kind: FailureKind,
        cooldown_seconds: float | None = None,
    ) -> None:
        """Opens the circuit for `model_name` using an explicit or default cooldown."""
        cooldown = (
            max(1.0, cooldown_seconds)
            if cooldown_seconds is not None
            else self._cooldowns[kind]
        )
        self._entries[model_name] = _ModelBreakerEntry(
            status="open",
            opened_until=self._clock() + cooldown,
            kind=kind,
        )

    def min_retry_after_seconds(self, models: list[str]) -> int | None:
        """Returns remaining open cooldown seconds when every candidate model is open."""
        now = self._clock()
        remaining: list[float] = []
        for model in models:
            if self.is_available(model):
                return None
            entry = self._entries.get(model)
            if entry is not None and entry.opened_until > now:
                remaining.append(entry.opened_until - now)
        if not remaining:
            return None
        return max(1, math.ceil(min(remaining)))

    def filter_candidates(self, models: list[str]) -> list[str]:
        """Returns models whose circuit is closed or ready for half-open probe."""
        return [model for model in models if self.is_available(model)]

    def first_healthy(self, models: list[str], preferred: str | None = None) -> str | None:
        """Returns the active healthy model for /api/health, or None if all are open."""
        if preferred and self.is_available(preferred):
            return preferred
        for model in models:
            if self.is_available(model):
                return model
        return None
