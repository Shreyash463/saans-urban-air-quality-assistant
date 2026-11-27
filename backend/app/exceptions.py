"""Application exception hierarchy with stable error codes and structured logging."""

from __future__ import annotations

import logging


class SaansError(Exception):
    """Base application exception carrying a stable machine-readable error code."""

    def __init__(
        self,
        message: str,
        *,
        code: str = "INTERNAL_ERROR",
        status_code: int = 500,
    ) -> None:
        super().__init__(message)
        self.message = message
        self.code = code
        self.status_code = status_code


class RateLimitExceededError(SaansError):
    """Raised when a caller exceeds a route's sliding-window request quota."""

    def __init__(self, message: str, retry_after_seconds: int = 60) -> None:
        super().__init__(message, code="RATE_LIMIT_EXCEEDED", status_code=429)
        self.retry_after_seconds = retry_after_seconds


class InvalidInputError(SaansError):
    """Raised on malformed user or query parameters."""

    def __init__(self, message: str) -> None:
        super().__init__(message, code="INVALID_INPUT", status_code=422)


def log_route_event(logger: logging.Logger, route: str, **fields: object) -> None:
    """Emits a consistent structured key=value log entry without secrets or PII."""
    parts = [f"route={route}", *(f"{k}={v}" for k, v in fields.items())]
    logger.info(" ".join(parts))
