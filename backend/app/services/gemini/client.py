"""Async Gemini client managing model discovery, budget guard, circuit breaker, and failover."""

from __future__ import annotations

import asyncio
import logging
import time
from collections.abc import Callable
from typing import Any

from google import genai
from google.genai import errors as genai_errors
from google.genai import types

from app.config import Settings
from app.prompts import build_chat_user_prompt, build_plan_user_prompt
from app.schemas import AirQualityReading, ChatReply, FallbackReason, PlanResponse, UserProfile
from app.services.gemini.assembler import assemble_gemini_plan
from app.services.gemini.attempts import (
    GeminiCallContext,
    execute_chat_attempt,
    execute_plan_attempt,
)
from app.services.gemini.budget import DailyCallBudget
from app.services.gemini.circuit_breaker import FailureKind, ModelCircuitBreaker
from app.services.gemini.model_selection import (
    _DEFAULT_FLASH_FALLBACKS,
    classify_api_failure,
    extract_retry_after_seconds,
    is_daily_quota_exhausted,
    select_best_flash_models,
)
from app.services.gemini.schema import GeminiPlanDraft
from app.services.impact import ProfileFacts, build_profile_facts
from app.services.safety import (
    build_injection_refusal,
    detect_prompt_injection,
    sanitize_chat_reply,
    sanitize_untrusted_question,
)

logger = logging.getLogger(__name__)

_MAX_MODEL_CANDIDATES = 6
_DEFAULT_RETRY_AFTER_S = 60
_QUOTA_COOLDOWN_S = 1800.0
_CHAT_MAX_TOKENS_CAP = 384
_CHAT_MAX_TIMEOUT_S = 18.0


class GeminiClient:
    """Async Gemini client with Flash-Lite-first discovery, budget guard, and circuit breaker."""

    def __init__(
        self,
        settings: Settings,
        sdk_client: Any | None = None,
        breaker: ModelCircuitBreaker | None = None,
        clock: Callable[[], float] | None = None,
        budget: DailyCallBudget | None = None,
        utc_clock: Callable[[], float] | None = None,
    ) -> None:
        self._settings = settings
        self._api_key = settings.effective_gemini_api_key
        self._client = sdk_client
        self._clock = clock or time.monotonic
        self._breaker = breaker or ModelCircuitBreaker(clock=self._clock)
        self._budget = budget or DailyCallBudget(
            daily_limit=settings.gemini_daily_call_budget,
            utc_clock=utc_clock,
        )
        self._model_chain: list[str] = []
        self._selected_model: str | None = None
        self._discovery_lock = asyncio.Lock()

        if self._client is None and self._api_key:
            timeout_ms = int(settings.gemini_timeout_seconds * 1000)
            self._client = genai.Client(
                api_key=self._api_key,
                http_options=types.HttpOptions(timeout=timeout_ms),
            )

        configured = settings.effective_gemini_model
        if configured:
            self._selected_model = configured
            self._model_chain = [configured]

    @property
    def is_configured(self) -> bool:
        return self._client is not None

    @property
    def selected_model(self) -> str | None:
        return self._selected_model

    @property
    def healthy_model(self) -> str | None:
        return self._breaker.first_healthy(self._model_chain, self._selected_model)

    @property
    def remaining_daily_budget(self) -> int:
        return self._budget.remaining

    @property
    def daily_budget_limit(self) -> int:
        return self._budget.limit

    async def initialize_models(self) -> None:
        """Discovers flash models with bounded timeout; prioritizes Flash-Lite models first."""
        if not self._client:
            logger.info("Gemini API key not configured; operating with rule-based fallback.")
            return
        async with self._discovery_lock:
            if self._model_chain:
                return
            try:
                pager = await asyncio.wait_for(
                    self._client.aio.models.list(),
                    timeout=self._settings.gemini_discovery_timeout_seconds,
                )
                discovered = [item async for item in pager]
                ranked = select_best_flash_models(discovered, priority=self._settings.parsed_model_priority)
                if ranked:
                    self._selected_model = ranked[0]
                    top_ranked = ranked[:_MAX_MODEL_CANDIDATES]
                    self._model_chain = top_ranked + [m for m in _DEFAULT_FLASH_FALLBACKS if m not in top_ranked]
                    logger.info("Auto-selected Gemini flash model: %s", self._selected_model)
                    return
            except (genai_errors.APIError, TimeoutError, OSError, ValueError, RuntimeError, TypeError) as exc:
                logger.warning("Gemini model list discovery failed (%s); falling back to default chain.", type(exc).__name__)
            self._model_chain = list(_DEFAULT_FLASH_FALLBACKS)
            self._selected_model = self._model_chain[0]

    def _promote_working_model(self, model_name: str) -> None:
        self._breaker.record_success(model_name)
        if self._selected_model != model_name:
            logger.info("Working Gemini model active: %s (previous: %s)", model_name, self._selected_model)
            self._selected_model = model_name
        if model_name in self._model_chain and self._model_chain[0] != model_name:
            self._model_chain = [model_name, *[m for m in self._model_chain if m != model_name]]

    def _demote_failing_model(self, model_name: str) -> None:
        if model_name in self._model_chain and len(self._model_chain) > 1:
            self._model_chain = [*[m for m in self._model_chain if m != model_name], model_name]

    async def generate_plan(
        self,
        profile: UserProfile,
        aqi_reading: AirQualityReading,
        facts: ProfileFacts | None = None,
    ) -> PlanResponse | None:
        plan, _reason, _retry = await self.generate_plan_with_status(profile, aqi_reading, facts=facts)
        return plan

    async def generate_plan_with_status(
        self,
        profile: UserProfile,
        aqi_reading: AirQualityReading,
        facts: ProfileFacts | None = None,
    ) -> tuple[PlanResponse | None, FallbackReason | None, int | None]:
        """Generates a plan or returns (None, fallback_reason, retry_after_seconds)."""
        if not self._client:
            return None, "no_key", None
        if not self._budget.can_spend():
            return None, "ai_busy", self._budget.seconds_until_reset()
        if not self._model_chain:
            await self.initialize_models()
        candidates = self._breaker.filter_candidates(self._model_chain[:_MAX_MODEL_CANDIDATES])
        if not candidates:
            retry_s = self._breaker.min_retry_after_seconds(self._model_chain[:_MAX_MODEL_CANDIDATES])
            return None, "ai_busy", retry_s or _DEFAULT_RETRY_AFTER_S
        user_prompt = build_plan_user_prompt(profile, aqi_reading.aqi, aqi_reading.dominant_pollutant, facts or build_profile_facts(profile))
        deadline = self._clock() + self._settings.gemini_timeout_seconds
        return await self._try_plan_candidates(candidates, user_prompt, profile, aqi_reading, deadline)

    async def _try_plan_candidates(
        self,
        candidates: list[str],
        user_prompt: str,
        profile: UserProfile,
        aqi_reading: AirQualityReading,
        deadline: float,
    ) -> tuple[PlanResponse | None, FallbackReason | None, int | None]:
        saw_busy = False
        for model_name in candidates:
            if deadline - self._clock() <= 1.0:
                saw_busy = True
                break
            draft, outcome = await self._call_plan_model_with_retry(model_name, user_prompt, deadline)
            if draft is None:
                saw_busy = saw_busy or outcome in {"rate_limit", "unavailable"}
                if outcome == "abort":
                    return None, "ai_error", _DEFAULT_RETRY_AFTER_S
                self._demote_failing_model(model_name)
                continue
            assembled = assemble_gemini_plan(draft, profile, aqi_reading)
            if assembled is not None:
                self._promote_working_model(model_name)
                return assembled, None, None
        retry_after = self._breaker.min_retry_after_seconds(self._model_chain[:_MAX_MODEL_CANDIDATES])
        return None, ("ai_busy" if saw_busy else "ai_error"), (retry_after if retry_after is not None else _DEFAULT_RETRY_AFTER_S)

    def _record_api_failure(self, model_name: str, exc: Exception) -> FailureKind | None:
        failure_kind = classify_api_failure(exc)
        if failure_kind is None:
            return None
        cooldown = (
            (_QUOTA_COOLDOWN_S if is_daily_quota_exhausted(exc) else extract_retry_after_seconds(exc))
            if failure_kind == "rate_limit"
            else None
        )
        self._breaker.record_failure(model_name, failure_kind, cooldown_seconds=cooldown)
        logger.warning("Gemini model=%s circuit opened (%s, code=%s, cooldown_s=%s).", model_name, failure_kind, getattr(exc, "code", None), cooldown)
        return failure_kind

    def _call_context(self) -> GeminiCallContext:
        return GeminiCallContext(
            sdk_client=self._client,
            budget=self._budget,
            max_output_tokens=self._settings.gemini_max_output_tokens,
            record_failure=self._record_api_failure,
        )

    async def _call_plan_model_with_retry(
        self,
        model_name: str,
        user_prompt: str,
        deadline: float,
    ) -> tuple[GeminiPlanDraft | None, str]:
        if self._client is None:
            return None, "abort"
        ctx = self._call_context()
        drop_schema, use_thinking = False, True
        for attempt in range(2):
            remaining = deadline - self._clock()
            if remaining <= 1.0:
                return None, "abort"
            draft, outcome, drop_schema, use_thinking = await execute_plan_attempt(
                ctx, model_name, user_prompt, remaining, attempt + 1, drop_schema, use_thinking,
            )
            if outcome != "retry":
                return draft, outcome
        self._breaker.record_failure(model_name, "unavailable")
        return None, "next_model"

    async def generate_chat_reply(self, question: str, profile: UserProfile, plan: PlanResponse) -> ChatReply | None:
        """Generates a safety-validated follow-up chat reply or returns None for fallback."""
        safe_q = sanitize_untrusted_question(question)
        if detect_prompt_injection(safe_q):
            return ChatReply(answer=build_injection_refusal(profile.language))
        if not self._client or not self._budget.can_spend():
            return None
        if not self._model_chain:
            await self.initialize_models()
        candidates = self._breaker.filter_candidates(self._model_chain[:_MAX_MODEL_CANDIDATES])
        if not candidates:
            return None
        user_prompt = build_chat_user_prompt(safe_q, profile, plan)
        max_tokens = min(_CHAT_MAX_TOKENS_CAP, self._settings.gemini_max_output_tokens)
        deadline = self._clock() + min(_CHAT_MAX_TIMEOUT_S, self._settings.gemini_timeout_seconds)
        for model_name in candidates:
            reply_text, abort_all = await self._call_chat_model(model_name, user_prompt, max_tokens, deadline)
            if abort_all:
                return None
            if reply_text is not None:
                self._promote_working_model(model_name)
                return ChatReply(answer=sanitize_chat_reply(reply_text, safe_q, profile, plan.aqi.aqi))
            self._demote_failing_model(model_name)
        return None

    async def _call_chat_model(
        self,
        model_name: str,
        user_prompt: str,
        max_tokens: int,
        deadline: float,
    ) -> tuple[str | None, bool]:
        if self._client is None:
            return None, True
        ctx = self._call_context()
        use_thinking = True
        for _attempt in range(2):
            remaining = deadline - self._clock()
            if remaining <= 1.0 or not self._budget.can_spend():
                return None, True
            text, status, use_thinking = await execute_chat_attempt(
                ctx, model_name, user_prompt, max_tokens, remaining, use_thinking,
            )
            if status == "ok":
                return text, False
            if status in {"abort", "fail"}:
                return None, status == "abort"
        self._breaker.record_failure(model_name, "unavailable")
        return None, False
