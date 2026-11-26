"""Model ranking, ThinkingConfig selection, error classification, and usage metadata helpers."""

from __future__ import annotations

import asyncio
import logging
import re
from typing import Any

from google.genai import errors as genai_errors
from google.genai import types

from app.services.gemini.circuit_breaker import FailureKind

logger = logging.getLogger(__name__)

_DEFAULT_FLASH_FALLBACKS: tuple[str, ...] = (
    "gemini-3.5-flash-lite",
    "gemini-3.1-flash-lite",
    "gemini-3.6-flash",
    "gemini-3.8-flash",
    "gemini-3.7-flash",
    "gemini-3.5-flash",
)

_EXCLUDED_MODEL_MARKERS = (
    "tts",
    "image",
    "omni",
    "live",
    "embedding",
    "transcribe",
    "audio",
    "robotics",
    "computer-use",
    "vision",
)

_VERSION_RE = re.compile(r"(\d+(?:\.\d+)?)")


def _model_rank_key(model_name: str) -> tuple[int, tuple[int, ...], int, str]:
    """Ranks flash models so Flash-Lite (highest free-tier quota) and newest stable sort highest."""
    lower = model_name.lower()
    nums: list[int] = []
    for match in _VERSION_RE.findall(lower):
        for part in match.split("."):
            nums.append(int(part))
    version_tuple = tuple(nums) if nums else (0,)
    is_lite = 1 if "lite" in lower else 0
    is_stable = 0 if any(tag in lower for tag in ("preview", "exp", "experimental")) else 1
    return (is_lite, version_tuple, is_stable, lower)


def select_best_flash_models(
    models: list[Any],
    priority: list[str] | None = None,
) -> list[str]:
    """Selects and orders flash-class models supporting generateContent, Flash-Lite first."""
    candidates: list[str] = []
    for model in models:
        raw_name = getattr(model, "name", None)
        if not isinstance(raw_name, str) or not raw_name.strip():
            continue
        short_name = raw_name.removeprefix("models/").strip()
        lower = short_name.lower()
        if "flash" not in lower:
            continue
        if any(marker in lower for marker in _EXCLUDED_MODEL_MARKERS):
            continue
        actions = [str(action).lower() for action in (getattr(model, "supported_actions", None) or [])]
        if "generatecontent" not in actions and "generate_content" not in actions:
            continue
        candidates.append(short_name)

    unique = list(dict.fromkeys(candidates))
    unique.sort(key=_model_rank_key, reverse=True)
    if not priority:
        return unique
    priority_index = {name.lower(): idx for idx, name in enumerate(priority)}
    prioritized = sorted(
        [m for m in unique if m.lower() in priority_index],
        key=lambda m: priority_index[m.lower()],
    )
    remainder = [m for m in unique if m.lower() not in priority_index]
    return [*prioritized, *remainder]


def thinking_config_for_model(model_name: str) -> types.ThinkingConfig | None:
    """Chooses lowest-latency supported ThinkingConfig per Gemini Flash generation."""
    lower = model_name.lower()
    if "3.1" in lower or "3.5" in lower or "3.6" in lower:
        return types.ThinkingConfig(thinking_level=types.ThinkingLevel.MINIMAL)
    if "3.7" in lower or "3.8" in lower or "gemini-3" in lower:
        return types.ThinkingConfig(thinking_level=types.ThinkingLevel.LOW)
    if "2.5" in lower:
        return types.ThinkingConfig(thinking_budget=0)
    return None


def strip_json_fences(raw_text: str) -> str:
    text = raw_text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.IGNORECASE)
        text = re.sub(r"\s*```$", "", text)
    return text.strip()


def is_schema_rejection(exc: Exception) -> bool:
    msg = str(exc).lower()
    return any(
        token in msg
        for token in (
            "schema",
            "response_schema",
            "response_json_schema",
            "additionalproperties",
            "additional_properties",
            "$defs",
        )
    )


def is_thinking_rejection(exc: Exception) -> bool:
    return "thinking" in str(exc).lower()


def is_auth_error(exc: Exception) -> bool:
    if getattr(exc, "code", None) in {401, 403}:
        return True
    msg = str(exc).lower()
    return any(tok in msg for tok in ("api key not valid", "permission_denied", "unauthenticated"))


def is_rate_limit_429(exc: Exception) -> bool:
    if getattr(exc, "code", None) == 429:
        return True
    msg = str(exc).lower()
    return any(tok in msg for tok in ("resource_exhausted", "quota", "rate limit", "429"))


def is_not_found_404(exc: Exception) -> bool:
    if getattr(exc, "code", None) == 404:
        return True
    msg = str(exc).lower()
    return "not_found" in msg or "is not found" in msg


def is_timeout_error(exc: Exception) -> bool:
    return (
        getattr(exc, "code", None) == 504
        or isinstance(exc, TimeoutError | asyncio.TimeoutError)
        or "timeout" in type(exc).__name__.lower()
        or "deadline_exceeded" in str(exc).lower()
    )


_RETRY_IN_RE = re.compile(r"retry\s+(?:in|after)\s+(\d+(?:\.\d+)?)\s*(ms|s|sec|seconds|m|min|minutes)?", re.IGNORECASE)
_RETRY_DELAY_FIELD_RE = re.compile(r"retryDelay['\"]?\s*[:=]\s*['\"]?(\d+(?:\.\d+)?)\s*(ms|s|m)?", re.IGNORECASE)


def _clamp_retry_seconds(raw_seconds: float) -> float:
    return min(900.0, max(10.0, raw_seconds))


def _unit_to_seconds(value: float, unit: str | None) -> float:
    if not unit:
        return value
    u = unit.lower()
    if u == "ms":
        return value / 1000.0
    if u in {"m", "min", "minutes"}:
        return value * 60.0
    return value


def is_daily_quota_exhausted(exc: Exception) -> bool:
    """Detects daily RPD/quota exhaustion where short backoff retries are futile."""
    text = f"{exc} {getattr(exc, 'details', '')}".lower()
    return any(
        marker in text
        for marker in (
            "generaterequestsperday",
            "perday",
            "per_day",
            "requests per day",
            "daily quota",
            "daily limit",
        )
    )


def extract_retry_after_seconds(exc: Exception) -> float | None:
    """Extracts and bounds [10s, 15m] retry delay from RetryInfo, headers, or message."""
    response = getattr(exc, "response", None)
    headers = getattr(response, "headers", None)
    if headers is not None and hasattr(headers, "get"):
        raw_hdr = headers.get("retry-after") or headers.get("Retry-After")
        if raw_hdr is not None:
            try:
                return _clamp_retry_seconds(float(str(raw_hdr).strip()))
            except ValueError:
                pass

    details = getattr(exc, "details", None)
    blob = f"{details!r} {exc}" if details is not None else str(exc)
    for pattern in (_RETRY_DELAY_FIELD_RE, _RETRY_IN_RE):
        match = pattern.search(blob)
        if match:
            secs = _unit_to_seconds(float(match.group(1)), match.group(2))
            return _clamp_retry_seconds(secs)
    return None


def classify_api_failure(exc: Exception) -> FailureKind | None:
    """Maps non-retryable upstream exceptions to circuit breaker FailureKind."""
    if is_rate_limit_429(exc):
        return "rate_limit"
    if is_not_found_404(exc):
        return "not_found"
    if is_timeout_error(exc):
        return "unavailable"
    code = getattr(exc, "code", None)
    if code in {400, 404, 500, 502, 503}:
        return "not_found" if code == 404 else "unavailable"
    if isinstance(exc, genai_errors.APIError) and code is not None:
        return "unavailable"
    return None


def log_usage_metadata(op: str, model_name: str, response: Any) -> None:
    """Logs aggregate Gemini token counts only (never prompts, responses, or PII)."""
    usage = getattr(response, "usage_metadata", None)
    if usage is None:
        return
    logger.info(
        "gemini_usage op=%s model=%s prompt_tokens=%s output_tokens=%s thought_tokens=%s total_tokens=%s",
        op,
        model_name,
        getattr(usage, "prompt_token_count", None),
        getattr(usage, "candidates_token_count", None),
        getattr(usage, "thoughts_token_count", None),
        getattr(usage, "total_token_count", None),
    )
