"""Unit tests for SaansError hierarchy and structured key-value route logging."""

from __future__ import annotations

import logging

import pytest
from app.exceptions import InvalidInputError, RateLimitExceededError, SaansError, log_route_event


def test_saans_errors_and_structured_log_event(caplog: pytest.LogCaptureFixture) -> None:
    base = SaansError("boom")
    assert base.code == "INTERNAL_ERROR"
    assert base.status_code == 500
    rate = RateLimitExceededError("slow down", retry_after_seconds=45)
    assert rate.status_code == 429 and rate.retry_after_seconds == 45
    assert InvalidInputError("bad").status_code == 422

    logger = logging.getLogger("saans.test")
    with caplog.at_level(logging.INFO, logger="saans.test"):
        log_route_event(logger, "/api/plan", cache="hit", latency_ms=12)
    assert "route=/api/plan cache=hit latency_ms=12" in caplog.text
