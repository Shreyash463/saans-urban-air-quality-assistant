"""Backwards-compatible facade re-exporting GeminiClient package symbols."""

from app.services.gemini.circuit_breaker import ModelCircuitBreaker
from app.services.gemini.client import GeminiClient
from app.services.gemini.model_selection import (
    is_rate_limit_429,
    select_best_flash_models,
    thinking_config_for_model,
)
from app.services.gemini.schema import SIMPLE_PLAN_JSON_SCHEMA

_SIMPLE_PLAN_JSON_SCHEMA = SIMPLE_PLAN_JSON_SCHEMA
_is_rate_limit_429 = is_rate_limit_429
_thinking_config_for_model = thinking_config_for_model

__all__ = [
    "GeminiClient",
    "ModelCircuitBreaker",
    "_SIMPLE_PLAN_JSON_SCHEMA",
    "_is_rate_limit_429",
    "_thinking_config_for_model",
    "select_best_flash_models",
]
