"""Async Gemini client managing model discovery, circuit breaker failover, and compact output."""

from __future__ import annotations

import asyncio
import json
import logging
import time
from collections.abc import Callable
from typing import Any

from google import genai
from google.genai import types
from pydantic import ValidationError

from app.config import Settings
from app.prompts import (
    CHAT_SYSTEM_PROMPT,
    PLAN_SYSTEM_PROMPT,
    build_chat_user_prompt,
    build_plan_user_prompt,
)
from app.schemas import (
    AirQualityReading,
    Alternative,
    ChatReply,
    CommunityAction,
    PlanResponse,
    RoutineTimeSlot,
    UserProfile,
)
from app.services.fallback_plan import build_community_actions
from app.services.gemini.circuit_breaker import ModelCircuitBreaker
from app.services.gemini.model_selection import (
    _DEFAULT_FLASH_FALLBACKS,
    classify_api_failure,
    is_auth_error,
    is_schema_rejection,
    is_thinking_rejection,
    log_usage_metadata,
    select_best_flash_models,
    strip_json_fences,
    thinking_config_for_model,
)
from app.services.gemini.schema import SIMPLE_PLAN_JSON_SCHEMA, GeminiPlanDraft
from app.services.impact import ProfileFacts, build_profile_facts, ground_alternatives_numbers
from app.services.safety import (
    build_disclaimer,
    build_health_advisory,
    build_injection_refusal,
    build_mask_guidance,
    detect_prompt_injection,
    enforce_plan_safety,
    sanitize_chat_reply,
    sanitize_untrusted_question,
)

logger = logging.getLogger(__name__)
_SLOT_ORDER: tuple[RoutineTimeSlot, ...] = ("morning", "midday", "evening", "night")


class GeminiClient:
    """Async Gemini client with startup discovery, per-model circuit breaker, and fallback."""

    def __init__(
        self,
        settings: Settings,
        sdk_client: Any | None = None,
        breaker: ModelCircuitBreaker | None = None,
        clock: Callable[[], float] | None = None,
    ) -> None:
        self._settings = settings
        self._api_key = settings.effective_gemini_api_key
        self._client = sdk_client
        self._clock = clock or time.monotonic
        self._breaker = breaker or ModelCircuitBreaker(clock=self._clock)
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
            self._model_chain = [
                configured,
                *[m for m in _DEFAULT_FLASH_FALLBACKS if m != configured],
            ]

    @property
    def is_configured(self) -> bool:
        return self._client is not None

    @property
    def selected_model(self) -> str | None:
        return self._selected_model

    @property
    def healthy_model(self) -> str | None:
        """Returns the current healthy non-open model for /api/health."""
        return self._breaker.first_healthy(self._model_chain, self._selected_model)

    @property
    def circuit_breaker(self) -> ModelCircuitBreaker:
        return self._breaker

    async def initialize_models(self) -> None:
        """Discovers current flash models with bounded timeout; never fails startup."""
        if not self._client:
            logger.info("Gemini API key not configured; operating with rule-based fallback.")
            return

        async with self._discovery_lock:
            if self._model_chain:
                logger.info("Using Gemini model: %s", self._selected_model)
                return

            try:
                pager = await asyncio.wait_for(
                    self._client.aio.models.list(),
                    timeout=self._settings.gemini_discovery_timeout_seconds,
                )
                discovered: list[Any] = []
                async for item in pager:
                    discovered.append(item)
                ranked = select_best_flash_models(discovered)
                if ranked:
                    self._selected_model = ranked[0]
                    self._model_chain = ranked[:6] + [
                        m for m in _DEFAULT_FLASH_FALLBACKS if m not in ranked[:6]
                    ]
                    logger.info("Auto-selected Gemini flash model: %s", self._selected_model)
                    return
            except Exception as exc:
                logger.warning(
                    "Gemini model list discovery failed (%s); falling back to default chain.",
                    type(exc).__name__,
                )

            self._model_chain = list(_DEFAULT_FLASH_FALLBACKS)
            self._selected_model = self._model_chain[0]

    def _promote_working_model(self, model_name: str) -> None:
        self._breaker.record_success(model_name)
        if self._selected_model != model_name:
            logger.info(
                "Working Gemini model active: %s (previous: %s)",
                model_name,
                self._selected_model,
            )
            self._selected_model = model_name
        if model_name in self._model_chain and self._model_chain[0] != model_name:
            self._model_chain = [model_name, *[m for m in self._model_chain if m != model_name]]

    def _demote_failing_model(self, model_name: str) -> None:
        if model_name in self._model_chain and len(self._model_chain) > 1:
            self._model_chain = [*[m for m in self._model_chain if m != model_name], model_name]

    def _assemble_plan(
        self,
        draft: GeminiPlanDraft,
        profile: UserProfile,
        aqi_reading: AirQualityReading,
    ) -> PlanResponse | None:
        by_slot = {item.time_slot: item for item in draft.routine}
        if not all(slot in by_slot for slot in _SLOT_ORDER):
            return None

        ordered_routine = [by_slot[slot] for slot in _SLOT_ORDER]
        raw_alts = [
            Alternative(
                current=alt.current,
                swap=alt.swap,
                why=alt.why,
                pm25_reduction_pct=min(95, max(0, int(round(alt.pm25ReductionPct)))),
                co2_saved_kg_per_month=min(1000, max(0, int(round(alt.co2SavedKgPerMonth)))),
            )
            for alt in draft.alternatives
        ]
        grounded_alts = ground_alternatives_numbers(raw_alts, profile)
        community: list[CommunityAction] = (
            draft.communityActions[:5]
            if len(draft.communityActions) >= 3
            else build_community_actions(profile, aqi_reading.aqi)
        )

        raw_plan = PlanResponse(
            aqi=aqi_reading,
            summary=draft.summary,
            health_advisory=build_health_advisory(profile, aqi_reading.aqi),
            routine=ordered_routine,
            indoor_hacks=draft.indoorHacks,
            alternatives=grounded_alts,
            community_actions=community,
            mask_guidance=build_mask_guidance(profile, aqi_reading.aqi),
            disclaimer=build_disclaimer(profile.language),
            generated_by="gemini",
        )
        return enforce_plan_safety(raw_plan, profile)

    async def generate_plan(
        self,
        profile: UserProfile,
        aqi_reading: AirQualityReading,
        facts: ProfileFacts | None = None,
    ) -> PlanResponse | None:
        """Calls Gemini for narrative plan fields, then grounds safety, numbers & community actions."""
        if not self._client:
            return None
        if not self._model_chain:
            await self.initialize_models()

        resolved_facts = facts or build_profile_facts(profile)
        user_prompt = build_plan_user_prompt(
            profile=profile,
            aqi=aqi_reading.aqi,
            dominant_pollutant=aqi_reading.dominant_pollutant,
            facts=resolved_facts,
        )

        candidates = self._breaker.filter_candidates(self._model_chain[:6])
        if not candidates:
            logger.info("All Gemini models in circuit-breaker cooldown; using rule-based fallback.")
            return None

        deadline = self._clock() + self._settings.gemini_timeout_seconds
        for model_name in candidates:
            if deadline - self._clock() <= 1.0:
                break
            draft, outcome = await self._call_plan_model_with_retry(model_name, user_prompt, deadline)
            if draft is None:
                if outcome == "abort":
                    break
                self._demote_failing_model(model_name)
                continue

            assembled = self._assemble_plan(draft, profile, aqi_reading)
            if assembled is None:
                continue
            self._promote_working_model(model_name)
            return assembled

        return None

    async def _call_plan_model_with_retry(
        self,
        model_name: str,
        user_prompt: str,
        deadline: float,
    ) -> tuple[GeminiPlanDraft | None, str]:
        """Generates JSON with compact schema; single-pass failover on HTTP/timeout errors."""
        client = self._client
        if client is None:
            return None, "abort"

        drop_schema = False
        use_thinking = True

        for attempt in range(2):
            remaining = deadline - self._clock()
            if remaining <= 1.0:
                return None, "abort"
            try:
                config = self._build_plan_config(model_name, drop_schema, use_thinking)
                response = await asyncio.wait_for(
                    client.aio.models.generate_content(
                        model=model_name,
                        contents=user_prompt,
                        config=config,
                    ),
                    timeout=min(13.0, remaining),
                )
                log_usage_metadata("plan", model_name, response)
                cleaned_json = strip_json_fences(getattr(response, "text", None) or "")
                if not cleaned_json:
                    raise ValueError("Empty Gemini JSON output")
                json.loads(cleaned_json)
                return GeminiPlanDraft.model_validate_json(cleaned_json), "ok"
            except (ValidationError, ValueError, json.JSONDecodeError) as exc:
                logger.warning(
                    "Invalid JSON/schema from model=%s attempt=%d (%s)",
                    model_name,
                    attempt + 1,
                    type(exc).__name__,
                )
                continue
            except Exception as exc:
                if is_auth_error(exc):
                    logger.warning("Gemini auth failure (%s); falling back.", type(exc).__name__)
                    return None, "abort"
                if is_thinking_rejection(exc) and use_thinking:
                    use_thinking = False
                    continue
                if is_schema_rejection(exc) and not drop_schema:
                    drop_schema = True
                    continue
                failure_kind = classify_api_failure(exc)
                if failure_kind is not None:
                    self._breaker.record_failure(model_name, failure_kind)
                    logger.warning(
                        "Gemini model=%s circuit opened (%s, code=%s).",
                        model_name,
                        failure_kind,
                        getattr(exc, "code", None),
                    )
                    return None, failure_kind
                logger.warning("Transient error model=%s attempt=%d (%s)", model_name, attempt + 1, type(exc).__name__)

        self._breaker.record_failure(model_name, "unavailable")
        return None, "next_model"

    def _build_plan_config(
        self,
        model_name: str,
        drop_schema: bool,
        use_thinking: bool,
    ) -> types.GenerateContentConfig:
        config_kwargs: dict[str, Any] = {
            "system_instruction": PLAN_SYSTEM_PROMPT,
            "temperature": 0.3,
            "max_output_tokens": self._settings.gemini_max_output_tokens,
            "response_mime_type": "application/json",
        }
        if not drop_schema:
            config_kwargs["response_schema"] = SIMPLE_PLAN_JSON_SCHEMA
        if use_thinking:
            tc = thinking_config_for_model(model_name)
            if tc is not None:
                config_kwargs["thinking_config"] = tc
        return types.GenerateContentConfig(**config_kwargs)

    async def generate_chat_reply(
        self,
        question: str,
        profile: UserProfile,
        plan: PlanResponse,
    ) -> ChatReply | None:
        """Generates a grounded follow-up answer with prompt-injection & medical guards."""
        safe_q = sanitize_untrusted_question(question)
        if detect_prompt_injection(safe_q):
            return ChatReply(answer=build_injection_refusal(profile.language))
        if not self._client:
            return None
        if not self._model_chain:
            await self.initialize_models()

        candidates = self._breaker.filter_candidates(self._model_chain[:6])
        if not candidates:
            return None

        user_prompt = build_chat_user_prompt(safe_q, profile, plan)
        max_chat_tokens = min(384, self._settings.gemini_max_output_tokens)
        deadline = self._clock() + min(18.0, self._settings.gemini_timeout_seconds)

        for model_name in candidates:
            reply_text, abort_all = await self._call_chat_model(
                model_name,
                user_prompt,
                max_chat_tokens,
                deadline,
            )
            if abort_all:
                return None
            if reply_text is not None:
                self._promote_working_model(model_name)
                return ChatReply(
                    answer=sanitize_chat_reply(reply_text, safe_q, profile, plan.aqi.aqi)
                )
            self._demote_failing_model(model_name)

        return None

    async def _call_chat_model(
        self,
        model_name: str,
        user_prompt: str,
        max_tokens: int,
        deadline: float,
    ) -> tuple[str | None, bool]:
        client = self._client
        if client is None:
            return None, True

        use_thinking = True
        for attempt in range(2):
            remaining = deadline - self._clock()
            if remaining <= 1.0:
                return None, True
            try:
                config_kwargs: dict[str, Any] = {
                    "system_instruction": CHAT_SYSTEM_PROMPT,
                    "temperature": 0.3,
                    "max_output_tokens": max_tokens,
                }
                if use_thinking:
                    tc = thinking_config_for_model(model_name)
                    if tc is not None:
                        config_kwargs["thinking_config"] = tc

                response = await asyncio.wait_for(
                    client.aio.models.generate_content(
                        model=model_name,
                        contents=user_prompt,
                        config=types.GenerateContentConfig(**config_kwargs),
                    ),
                    timeout=min(7.0, remaining),
                )
                log_usage_metadata("chat", model_name, response)
                raw_text = (getattr(response, "text", None) or "").strip()
                if not raw_text:
                    raise ValueError("Empty Gemini chat output")
                return raw_text, False
            except Exception as exc:
                if is_auth_error(exc):
                    logger.warning("Gemini chat auth failure (%s)", type(exc).__name__)
                    return None, True
                if is_thinking_rejection(exc) and use_thinking:
                    use_thinking = False
                    continue
                failure_kind = classify_api_failure(exc)
                if failure_kind is not None:
                    self._breaker.record_failure(model_name, failure_kind)
                    logger.warning("Gemini chat circuit opened model=%s (%s)", model_name, failure_kind)
                    return None, False
                logger.warning("Gemini chat error model=%s attempt=%d (%s)", model_name, attempt + 1, type(exc).__name__)

        self._breaker.record_failure(model_name, "unavailable")
        return None, False
