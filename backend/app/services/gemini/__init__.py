"""Google Gemini async client package with circuit breaker, daily budget guard, and failover."""

from app.services.gemini.budget import DailyCallBudget
from app.services.gemini.circuit_breaker import ModelCircuitBreaker
from app.services.gemini.client import GeminiClient
from app.services.gemini.model_selection import (
    is_rate_limit_429,
    select_best_flash_models,
    thinking_config_for_model,
)
from app.services.gemini.schema import SIMPLE_PLAN_JSON_SCHEMA

__all__ = [
    "DailyCallBudget",
    "GeminiClient",
    "ModelCircuitBreaker",
    "SIMPLE_PLAN_JSON_SCHEMA",
    "is_rate_limit_429",
    "select_best_flash_models",
    "thinking_config_for_model",
]
