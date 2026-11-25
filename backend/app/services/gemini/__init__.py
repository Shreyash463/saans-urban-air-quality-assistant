"""Google Gemini async client package with circuit breaker, compact schema, and failover."""

from app.services.gemini.circuit_breaker import ModelCircuitBreaker
from app.services.gemini.client import GeminiClient
from app.services.gemini.model_selection import (
    select_best_flash_models,
    thinking_config_for_model,
)
from app.services.gemini.schema import SIMPLE_PLAN_JSON_SCHEMA

__all__ = [
    "GeminiClient",
    "ModelCircuitBreaker",
    "SIMPLE_PLAN_JSON_SCHEMA",
    "select_best_flash_models",
    "thinking_config_for_model",
]
