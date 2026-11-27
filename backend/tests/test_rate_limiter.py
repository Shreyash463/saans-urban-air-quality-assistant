"""Unit tests for SlidingWindowRateLimiter bucket sweeping and capacity bounds."""

from __future__ import annotations

import pytest
from app.services.rate_limit import SlidingWindowRateLimiter


@pytest.mark.asyncio
async def test_rate_limiter_evicts_expired_idle_buckets() -> None:
    now = 0.0
    limiter = SlidingWindowRateLimiter(max_requests=2, window_seconds=10.0, clock=lambda: now)
    assert (await limiter.check("10.0.0.1")) == (True, 0)
    assert (await limiter.check("10.0.0.2")) == (True, 0)
    assert limiter.active_bucket_count == 2

    now = 25.0
    assert (await limiter.check("10.0.0.3")) == (True, 0)
    assert limiter.active_bucket_count == 1
    await limiter.reset()
    assert limiter.active_bucket_count == 0


@pytest.mark.asyncio
async def test_rate_limiter_sweep_max_buckets_and_reset() -> None:
    now = 0.0
    limiter = SlidingWindowRateLimiter(
        max_requests=2,
        window_seconds=10.0,
        max_tracked_ips=16,
        clock=lambda: now,
    )
    for i in range(20):
        ok, _ = await limiter.check(f"198.51.100.{i}")
        assert ok is True
    assert limiter.active_bucket_count == 16

    now = 30.0
    ok, _ = await limiter.check("203.0.113.1")
    assert ok is True
    assert limiter.active_bucket_count == 1
    await limiter.reset()
    assert limiter.active_bucket_count == 0
