"""Single-attempt execution helpers for Gemini plan and chat generation."""

from __future__ import annotations

import asyncio
import json
import logging
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from google.genai import errors as genai_errors
from google.genai import types
from pydantic import ValidationError

from app.prompts import CHAT_SYSTEM_PROMPT, PLAN_SYSTEM_PROMPT
from app.services.gemini.budget import DailyCallBudget
from app.services.gemini.circuit_breaker import FailureKind
from app.services.gemini.model_selection import (
    is_auth_error,
    is_schema_rejection,
    is_thinking_rejection,
    log_usage_metadata,
    strip_json_fences,
    thinking_config_for_model,
)
from app.services.gemini.schema import SIMPLE_PLAN_JSON_SCHEMA, GeminiPlanDraft

logger = logging.getLogger(__name__)


@dataclass(frozen=True, slots=True)
class GeminiCallContext:
    sdk_client: Any
    budget: DailyCallBudget
    max_output_tokens: int
    record_failure: Callable[[str, Exception], FailureKind | None]


def build_plan_config(
    model_name: str,
    max_output_tokens: int,
    drop_schema: bool,
    use_thinking: bool,
) -> types.GenerateContentConfig:
    kwargs: dict[str, Any] = {
        "system_instruction": PLAN_SYSTEM_PROMPT,
        "temperature": 0.3,
        "max_output_tokens": max_output_tokens,
        "response_mime_type": "application/json",
    }
    if not drop_schema:
        kwargs["response_schema"] = SIMPLE_PLAN_JSON_SCHEMA
    if use_thinking and (tc := thinking_config_for_model(model_name)) is not None:
        kwargs["thinking_config"] = tc
    return types.GenerateContentConfig(**kwargs)


def classify_attempt_exception(
    exc: Exception,
    model_name: str,
    drop_schema: bool,
    use_thinking: bool,
    record_failure: Callable[[str, Exception], FailureKind | None],
) -> tuple[str, bool, bool]:
    """Maps a Gemini SDK exception into (status, next_drop_schema, next_use_thinking)."""
    if is_auth_error(exc):
        return "abort", drop_schema, use_thinking
    if is_thinking_rejection(exc) and use_thinking:
        return "retry", drop_schema, False
    if is_schema_rejection(exc) and not drop_schema:
        return "retry", True, use_thinking
    failure_kind = record_failure(model_name, exc)
    if failure_kind is None and not isinstance(exc, genai_errors.APIError | TimeoutError | OSError):
        logger.warning("Unexpected Gemini call failure (%s) on model=%s", type(exc).__name__, model_name)
    return (failure_kind or "retry"), drop_schema, use_thinking


async def execute_plan_attempt(
    ctx: GeminiCallContext,
    model_name: str,
    user_prompt: str,
    remaining: float,
    attempt_num: int,
    drop_schema: bool,
    use_thinking: bool,
) -> tuple[GeminiPlanDraft | None, str, bool, bool]:
    if not ctx.budget.can_spend():
        return None, "rate_limit", drop_schema, use_thinking
    try:
        ctx.budget.record_call()
        config = build_plan_config(model_name, ctx.max_output_tokens, drop_schema, use_thinking)
        response = await asyncio.wait_for(
            ctx.sdk_client.aio.models.generate_content(model=model_name, contents=user_prompt, config=config),
            timeout=min(13.0, remaining),
        )
        log_usage_metadata("plan", model_name, response)
        cleaned_json = strip_json_fences(getattr(response, "text", None) or "")
        if not cleaned_json:
            raise ValueError("Empty Gemini JSON output")
        json.loads(cleaned_json)
        return GeminiPlanDraft.model_validate_json(cleaned_json), "ok", drop_schema, use_thinking
    except (ValidationError, ValueError, json.JSONDecodeError) as exc:
        logger.warning("Invalid JSON/schema from model=%s attempt=%d (%s)", model_name, attempt_num, type(exc).__name__)
        return None, "retry", drop_schema, use_thinking
    except Exception as exc:  # google-genai + httpx raise heterogeneous transport/status exceptions
        status, next_drop, next_think = classify_attempt_exception(
            exc, model_name, drop_schema, use_thinking, ctx.record_failure
        )
        return None, status, next_drop, next_think


async def execute_chat_attempt(
    ctx: GeminiCallContext,
    model_name: str,
    user_prompt: str,
    max_tokens: int,
    remaining: float,
    use_thinking: bool,
) -> tuple[str | None, str, bool]:
    kwargs: dict[str, Any] = {
        "system_instruction": CHAT_SYSTEM_PROMPT,
        "temperature": 0.3,
        "max_output_tokens": max_tokens,
    }
    if use_thinking and (tc := thinking_config_for_model(model_name)) is not None:
        kwargs["thinking_config"] = tc
    try:
        ctx.budget.record_call()
        response = await asyncio.wait_for(
            ctx.sdk_client.aio.models.generate_content(
                model=model_name, contents=user_prompt, config=types.GenerateContentConfig(**kwargs)
            ),
            timeout=min(7.0, remaining),
        )
        log_usage_metadata("chat", model_name, response)
        raw_text = (getattr(response, "text", None) or "").strip()
        if not raw_text:
            raise ValueError("Empty Gemini chat output")
        return raw_text, "ok", use_thinking
    except Exception as exc:  # google-genai + httpx raise heterogeneous transport/status exceptions
        status, _, next_think = classify_attempt_exception(exc, model_name, False, use_thinking, ctx.record_failure)
        return None, ("abort" if status == "abort" else "retry" if status == "retry" else "fail"), next_think
