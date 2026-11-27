"""UTC daily upstream Gemini call budget guard (resets at 00:00 UTC)."""

from __future__ import annotations

import time
from collections.abc import Callable
from datetime import UTC, date, datetime, timedelta


class DailyCallBudget:
    """Tracks daily upstream Gemini API calls with automatic 00:00 UTC reset."""

    def __init__(
        self,
        daily_limit: int = 400,
        utc_clock: Callable[[], float] | None = None,
    ) -> None:
        self._limit = max(1, int(daily_limit))
        self._clock = utc_clock or time.time
        self._utc_date: date = self._current_utc_date()
        self._calls_used = 0

    def _current_utc_date(self) -> date:
        return datetime.fromtimestamp(self._clock(), tz=UTC).date()

    def _rollover_if_new_day(self) -> None:
        today = self._current_utc_date()
        if today != self._utc_date:
            self._utc_date = today
            self._calls_used = 0

    @property
    def limit(self) -> int:
        return self._limit

    @property
    def calls_used(self) -> int:
        self._rollover_if_new_day()
        return self._calls_used

    @property
    def remaining(self) -> int:
        self._rollover_if_new_day()
        return max(0, self._limit - self._calls_used)

    def can_spend(self) -> bool:
        return self.remaining > 0

    def record_call(self) -> None:
        self._rollover_if_new_day()
        self._calls_used += 1

    def seconds_until_reset(self) -> int:
        """Returns seconds remaining until next 00:00 UTC reset (bounded 60..3600 for UI retry)."""
        now_dt = datetime.fromtimestamp(self._clock(), tz=UTC)
        next_midnight = datetime.combine(
            now_dt.date() + timedelta(days=1),
            datetime.min.time(),
            tzinfo=UTC,
        )
        delta = max(60, int((next_midnight - now_dt).total_seconds()))
        return min(3600, delta)
