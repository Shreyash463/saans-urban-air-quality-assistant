"""In-memory sliding-window per-IP rate limiter returning 429 + Retry-After."""

from __future__ import annotations

import asyncio
import math
import time
from collections import OrderedDict, deque
from collections.abc import Callable


class SlidingWindowRateLimiter:
    """Bounded per-IP sliding-window rate limiter with O(1) amortized eviction and idle sweep."""

    def __init__(
        self,
        max_requests: int,
        window_seconds: float = 60.0,
        max_tracked_ips: int = 4096,
        clock: Callable[[], float] | None = None,
    ) -> None:
        self.max_requests = max(1, max_requests)
        self.window_seconds = max(1.0, window_seconds)
        self.max_tracked_ips = max(16, max_tracked_ips)
        self._clock = clock or time.monotonic
        self._buckets: OrderedDict[str, deque[float]] = OrderedDict()
        self._lock = asyncio.Lock()
        self._last_sweep = self._clock()

    def _sweep_expired_buckets(self, cutoff: float, now: float) -> None:
        """Evicts idle IP buckets from the LRU front when all their timestamps expired."""
        if now - self._last_sweep < self.window_seconds:
            return
        self._last_sweep = now
        while self._buckets:
            oldest_ip, oldest_bucket = next(iter(self._buckets.items()))
            if not oldest_bucket or oldest_bucket[-1] <= cutoff:
                self._buckets.pop(oldest_ip, None)
            else:
                break

    async def check(self, client_ip: str) -> tuple[bool, int]:
        """Checks whether a request is allowed and returns (allowed, retry_after_seconds)."""
        now = self._clock()
        cutoff = now - self.window_seconds

        async with self._lock:
            self._sweep_expired_buckets(cutoff, now)

            bucket = self._buckets.get(client_ip)
            if bucket is None:
                bucket = deque()
                self._buckets[client_ip] = bucket
            else:
                self._buckets.move_to_end(client_ip)

            while bucket and bucket[0] <= cutoff:
                bucket.popleft()

            if len(bucket) >= self.max_requests:
                oldest = bucket[0]
                retry_after = max(1, math.ceil(oldest + self.window_seconds - now))
                return False, retry_after

            bucket.append(now)

            while len(self._buckets) > self.max_tracked_ips:
                self._buckets.popitem(last=False)

            return True, 0

    @property
    def active_bucket_count(self) -> int:
        """Number of currently tracked IP buckets (primarily for diagnostics/tests)."""
        return len(self._buckets)

    async def reset(self) -> None:
        """Clears all rate-limit tracking buckets (useful in tests)."""
        async with self._lock:
            self._buckets.clear()
            self._last_sweep = self._clock()
