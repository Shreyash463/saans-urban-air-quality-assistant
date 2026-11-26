"""Bounded in-memory TTL cache with LRU eviction for air quality and plans."""

from __future__ import annotations

import asyncio
import time
from collections import OrderedDict
from collections.abc import Callable


class TTLCache[T]:
    """Async-safe TTL cache bounded by maxsize to prevent unbounded memory growth."""

    def __init__(
        self,
        ttl_seconds: float = 600.0,
        maxsize: int = 256,
        clock: Callable[[], float] | None = None,
    ) -> None:
        self._ttl_seconds = ttl_seconds
        self._maxsize = max(1, maxsize)
        self._clock = clock or time.monotonic
        self._store: OrderedDict[str, tuple[float, T]] = OrderedDict()
        self._lock = asyncio.Lock()

    async def get(self, key: str) -> T | None:
        """Fetches a cached value if present and unexpired."""
        now = self._clock()
        async with self._lock:
            entry = self._store.get(key)
            if entry is None:
                return None
            expires_at, value = entry
            if now >= expires_at:
                del self._store[key]
                return None
            self._store.move_to_end(key)
            return value

    async def set(self, key: str, value: T, ttl_seconds: float | None = None) -> None:
        """Stores a value with optional per-entry TTL override and LRU eviction."""
        ttl = self._ttl_seconds if ttl_seconds is None else ttl_seconds
        async with self._lock:
            self._purge_expired_locked(self._clock())
            if ttl <= 0:
                self._store.pop(key, None)
                return
            expires_at = self._clock() + ttl
            if key in self._store:
                self._store.move_to_end(key)
            self._store[key] = (expires_at, value)
            while len(self._store) > self._maxsize:
                self._store.popitem(last=False)

    async def clear(self) -> None:
        """Clears all cached items."""
        async with self._lock:
            self._store.clear()

    def _purge_expired_locked(self, now: float) -> None:
        expired = [k for k, (exp, _) in self._store.items() if now >= exp]
        for k in expired:
            del self._store[k]
