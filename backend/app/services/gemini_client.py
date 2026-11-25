"""Google Gemini client using google-genai SDK with startup model discovery, structured JSON, and fallback."""

from __future__ import annotations

import asyncio
import json
import logging
import re
import time
from typing import Any

from google import genai
from google.genai import errors as genai_errors
from google.genai import types
from pydantic import BaseModel, ConfigDict, Field, ValidationError

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
    IndoorHack,
    PlanResponse,
    RoutineItem,
    RoutineTimeSlot,
    UserProfile,
)
from app.services.impact import build_profile_facts, ground_alternatives_numbers
from app.services.safety import (
    build_disclaimer,
    build_injection_refusal,
    detect_emergency_symptoms,
    detect_prompt_injection,
    enforce_plan_safety,
    sanitize_chat_reply,
    sanitize_untrusted_question,
)

logger = logging.getLogger(__name__)

_DEFAULT_FLASH_FALLBACKS: tuple[str, ...] = (
    "gemini-3.6-flash",
    "gemini-3.5-flash",
    "gemini-3.8-flash",
    "gemini-3.7-flash",
    "gemini-3.5-flash-lite",
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


class _RawGeminiAlternative(BaseModel):
    """Permissive alternative schema prior to deterministic numeric grounding/clamping."""

    model_config = ConfigDict(extra="ignore")

    current: str = Field(min_length=1, max_length=300)
    swap: str = Field(min_length=1, max_length=300)
    why: str = Field(min_length=1, max_length=700)
    pm25ReductionPct: float = 0
    co2SavedKgPerMonth: float = 0


class _GeminiPlanDraft(BaseModel):
    """Schema requested from Gemini structured output (validated strictly after generation)."""

    model_config = ConfigDict(extra="ignore")

    summary: str = Field(min_length=1, max_length=1500)
    healthAdvisory: str = Field(min_length=1, max_length=2000)
    routine: list[RoutineItem] = Field(min_length=4, max_length=4)
    indoorHacks: list[IndoorHack] = Field(min_length=5, max_length=7)
    alternatives: list[_RawGeminiAlternative] = Field(min_length=3, max_length=5)
    maskGuidance: str = Field(min_length=1, max_length=1500)


_SIMPLE_PLAN_JSON_SCHEMA: dict[str, Any] = {
    "type": "OBJECT",
    "required": [
        "summary",
        "healthAdvisory",
        "routine",
        "indoorHacks",
        "alternatives",
        "maskGuidance",
    ],
    "properties": {
        "summary": {"type": "STRING"},
        "healthAdvisory": {"type": "STRING"},
        "maskGuidance": {"type": "STRING"},
        "routine": {
            "type": "ARRAY",
            "items": {
                "type": "OBJECT",
                "required": ["timeSlot", "title", "detail", "impactNote"],
                "properties": {
                    "timeSlot": {"type": "STRING", "enum": ["morning", "midday", "evening", "night"]},
                    "title": {"type": "STRING"},
                    "detail": {"type": "STRING"},
                    "impactNote": {"type": "STRING"},
                },
            },
        },
        "indoorHacks": {
            "type": "ARRAY",
            "items": {
                "type": "OBJECT",
                "required": ["title", "howTo", "estimatedBenefit", "costLevel"],
                "properties": {
                    "title": {"type": "STRING"},
                    "howTo": {"type": "STRING"},
                    "estimatedBenefit": {"type": "STRING"},
                    "costLevel": {"type": "STRING", "enum": ["free", "low", "medium", "high"]},
                },
            },
        },
        "alternatives": {
            "type": "ARRAY",
            "items": {
                "type": "OBJECT",
                "required": ["current", "swap", "why", "pm25ReductionPct", "co2SavedKgPerMonth"],
                "properties": {
                    "current": {"type": "STRING"},
                    "swap": {"type": "STRING"},
                    "why": {"type": "STRING"},
                    "pm25ReductionPct": {"type": "INTEGER"},
                    "co2SavedKgPerMonth": {"type": "INTEGER"},
                },
            },
        },
    },
}


def _model_rank_key(model_name: str) -> tuple[tuple[int, ...], int, int, str]:
    """Ranks flash models so newest stable non-lite flash sorts highest."""
    lower = model_name.lower()
    nums: list[int] = []
    for match in _VERSION_RE.findall(lower):
        for part in match.split("."):
            nums.append(int(part))
    version_tuple = tuple(nums) if nums else (0,)
    is_non_lite = 0 if "lite" in lower else 1
    is_stable = 0 if any(tag in lower for tag in ("preview", "exp", "experimental")) else 1
    return (version_tuple, is_non_lite, is_stable, lower)


def select_best_flash_models(models: list[Any]) -> list[str]:
    """Selects and orders flash-class models supporting generateContent."""
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
    return unique


def _strip_json_fences(raw_text: str) -> str:
    text = raw_text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.IGNORECASE)
        text = re.sub(r"\s*```$", "", text)
    return text.strip()


def _is_schema_rejection(exc: Exception) -> bool:
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


def _is_thinking_rejection(exc: Exception) -> bool:
    msg = str(exc).lower()
    return "thinking" in msg


def _is_auth_error(exc: Exception) -> bool:
    code = getattr(exc, "code", None)
    if code in {401, 403}:
        return True
    msg = str(exc).lower()
    return any(tok in msg for tok in ("api key not valid", "permission_denied", "unauthenticated"))


def _is_rate_limit_429(exc: Exception) -> bool:
    code = getattr(exc, "code", None)
    if code == 429:
        return True
    msg = str(exc).lower()
    return any(tok in msg for tok in ("resource_exhausted", "quota", "rate limit", "429"))


def _is_timeout_error(exc: Exception) -> bool:
    code = getattr(exc, "code", None)
    return (
        code == 504
        or isinstance(exc, TimeoutError | asyncio.TimeoutError)
        or "timeout" in type(exc).__name__.lower()
        or "deadline_exceeded" in str(exc).lower()
    )


def _thinking_config_for_model(model_name: str) -> types.ThinkingConfig | None:
    """Chooses lowest-latency supported ThinkingConfig per Gemini Flash generation."""
    lower = model_name.lower()
    if "3.1" in lower or "3.5" in lower or "3.6" in lower:
        return types.ThinkingConfig(thinking_level=types.ThinkingLevel.MINIMAL)
    if "3.7" in lower or "3.8" in lower or "gemini-3" in lower:
        return types.ThinkingConfig(thinking_level=types.ThinkingLevel.LOW)
    if "2.5" in lower:
        return types.ThinkingConfig(thinking_budget=0)
    return None


class GeminiClient:
    """Async Gemini client managing model discovery, failover, thinking control, and fast fallback."""

    def __init__(self, settings: Settings, sdk_client: Any | None = None) -> None:
        self._settings = settings
        self._api_key = settings.effective_gemini_api_key
        self._client = sdk_client
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

    async def generate_plan(
        self,
        profile: UserProfile,
        aqi_reading: AirQualityReading,
    ) -> PlanResponse | None:
        """Calls Gemini to generate personalized plan text, then grounds numbers & safety."""
        if not self._client:
            return None

        if not self._model_chain:
            await self.initialize_models()

        facts = build_profile_facts(profile)
        user_prompt = build_plan_user_prompt(
            profile=profile,
            aqi=aqi_reading.aqi,
            dominant_pollutant=aqi_reading.dominant_pollutant,
            facts=facts,
        )

        deadline = time.monotonic() + self._settings.gemini_timeout_seconds
        slot_order: tuple[RoutineTimeSlot, ...] = ("morning", "midday", "evening", "night")
        candidates = list(self._model_chain[:6])

        for model_name in candidates:
            remaining = deadline - time.monotonic()
            if remaining <= 1.0:
                break
            draft, outcome = await self._call_plan_model_with_retry(
                model_name,
                user_prompt,
                deadline,
            )
            if draft is None:
                if outcome == "abort":
                    break
                self._demote_failing_model(model_name)
                continue

            # Ensure exactly 4 unique routine slots in canonical order
            by_slot = {item.time_slot: item for item in draft.routine}
            if not all(slot in by_slot for slot in slot_order):
                continue

            self._promote_working_model(model_name)
            ordered_routine = [by_slot[slot] for slot in slot_order]
            converted_alts = [
                Alternative(
                    current=alt.current,
                    swap=alt.swap,
                    why=alt.why,
                    pm25_reduction_pct=min(95, max(0, int(round(alt.pm25ReductionPct)))),
                    co2_saved_kg_per_month=min(1000, max(0, int(round(alt.co2SavedKgPerMonth)))),
                )
                for alt in draft.alternatives
            ]
            grounded_alts = ground_alternatives_numbers(converted_alts, profile)

            raw_plan = PlanResponse(
                aqi=aqi_reading,
                summary=draft.summary,
                health_advisory=draft.healthAdvisory,
                routine=ordered_routine,
                indoor_hacks=draft.indoorHacks,
                alternatives=grounded_alts,
                mask_guidance=draft.maskGuidance,
                disclaimer=build_disclaimer(profile.language),
                generated_by="gemini",
            )
            return enforce_plan_safety(raw_plan, profile)

        return None

    async def _call_plan_model_with_retry(
        self,
        model_name: str,
        user_prompt: str,
        deadline: float,
    ) -> tuple[_GeminiPlanDraft | None, str]:
        """Uses clean _SIMPLE_PLAN_JSON_SCHEMA upfront; returns (draft_or_none, status)."""
        client = self._client
        if client is None:
            return None, "abort"

        drop_schema = False
        use_thinking = True

        for attempt in range(2):
            remaining = deadline - time.monotonic()
            if remaining <= 1.0:
                return None, "abort"
            attempt_timeout = min(13.0, remaining)
            try:
                config_kwargs: dict[str, Any] = {
                    "system_instruction": PLAN_SYSTEM_PROMPT,
                    "temperature": 0.3,
                    "max_output_tokens": self._settings.gemini_max_output_tokens,
                    "response_mime_type": "application/json",
                }
                if not drop_schema:
                    config_kwargs["response_schema"] = _SIMPLE_PLAN_JSON_SCHEMA
                if use_thinking:
                    tc = _thinking_config_for_model(model_name)
                    if tc is not None:
                        config_kwargs["thinking_config"] = tc

                response = await asyncio.wait_for(
                    client.aio.models.generate_content(
                        model=model_name,
                        contents=user_prompt,
                        config=types.GenerateContentConfig(**config_kwargs),
                    ),
                    timeout=attempt_timeout,
                )
                raw_text = getattr(response, "text", None) or ""
                cleaned_json = _strip_json_fences(raw_text)
                if not cleaned_json:
                    raise ValueError("Empty Gemini JSON output")
                json.loads(cleaned_json)
                return _GeminiPlanDraft.model_validate_json(cleaned_json), "ok"
            except (ValidationError, ValueError, json.JSONDecodeError) as exc:
                logger.warning(
                    "Invalid JSON/schema from model=%s attempt=%d (%s)",
                    model_name,
                    attempt + 1,
                    type(exc).__name__,
                )
                continue
            except Exception as exc:
                if _is_auth_error(exc):
                    logger.warning(
                        "Gemini auth failure (%s); falling back immediately.",
                        type(exc).__name__,
                    )
                    return None, "abort"
                if _is_rate_limit_429(exc):
                    logger.warning(
                        "Gemini model=%s rate-limited (429); trying next model without retry storm.",
                        model_name,
                    )
                    return None, "rate_limited"
                if _is_thinking_rejection(exc) and use_thinking:
                    use_thinking = False
                    continue
                if _is_schema_rejection(exc) and not drop_schema:
                    drop_schema = True
                    continue
                if _is_timeout_error(exc):
                    logger.warning(
                        "Gemini timeout on model=%s attempt=%d; advancing chain.",
                        model_name,
                        attempt + 1,
                    )
                    return None, "next_model"
                if isinstance(exc, genai_errors.APIError) and getattr(exc, "code", None) in {
                    400,
                    404,
                    503,
                }:
                    logger.warning(
                        "Gemini model=%s unavailable/rejected (%s code=%s); trying next model.",
                        model_name,
                        type(exc).__name__,
                        getattr(exc, "code", None),
                    )
                    return None, "next_model"
                logger.warning(
                    "Transient Gemini error on model=%s attempt=%d (%s)",
                    model_name,
                    attempt + 1,
                    type(exc).__name__,
                )
                continue

        return None, "next_model"

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
        if detect_emergency_symptoms(safe_q):
            # Still allow safety layer to enforce emergency guidance even if Gemini is bypassed
            pass

        if not self._client:
            return None

        if not self._model_chain:
            await self.initialize_models()

        user_prompt = build_chat_user_prompt(safe_q, profile, plan)
        max_chat_tokens = min(512, self._settings.gemini_max_output_tokens)
        deadline = time.monotonic() + min(18.0, self._settings.gemini_timeout_seconds)
        candidates = list(self._model_chain[:6])

        for model_name in candidates:
            use_thinking = True
            for attempt in range(2):
                remaining = deadline - time.monotonic()
                if remaining <= 1.0:
                    return None
                attempt_timeout = min(7.0, remaining)
                try:
                    config_kwargs: dict[str, Any] = {
                        "system_instruction": CHAT_SYSTEM_PROMPT,
                        "temperature": 0.3,
                        "max_output_tokens": max_chat_tokens,
                    }
                    if use_thinking:
                        tc = _thinking_config_for_model(model_name)
                        if tc is not None:
                            config_kwargs["thinking_config"] = tc

                    response = await asyncio.wait_for(
                        self._client.aio.models.generate_content(
                            model=model_name,
                            contents=user_prompt,
                            config=types.GenerateContentConfig(**config_kwargs),
                        ),
                        timeout=attempt_timeout,
                    )
                    raw_text = (getattr(response, "text", None) or "").strip()
                    if not raw_text:
                        raise ValueError("Empty Gemini chat output")
                    self._promote_working_model(model_name)
                    safe_answer = sanitize_chat_reply(raw_text, safe_q, profile, plan.aqi.aqi)
                    return ChatReply(answer=safe_answer)
                except Exception as exc:
                    if _is_auth_error(exc):
                        logger.warning("Gemini chat auth failure (%s)", type(exc).__name__)
                        return None
                    if _is_rate_limit_429(exc):
                        logger.warning(
                            "Gemini chat model=%s rate-limited (429); trying next model.",
                            model_name,
                        )
                        self._demote_failing_model(model_name)
                        break
                    if _is_thinking_rejection(exc) and use_thinking:
                        use_thinking = False
                        continue
                    if _is_timeout_error(exc):
                        self._demote_failing_model(model_name)
                        break
                    if isinstance(exc, genai_errors.APIError) and getattr(exc, "code", None) in {
                        400,
                        404,
                        503,
                    }:
                        logger.warning(
                            "Gemini chat model=%s unavailable (%s code=%s)",
                            model_name,
                            type(exc).__name__,
                            getattr(exc, "code", None),
                        )
                        self._demote_failing_model(model_name)
                        break
                    logger.warning(
                        "Gemini chat error model=%s attempt=%d (%s)",
                        model_name,
                        attempt + 1,
                        type(exc).__name__,
                    )
                    continue

        return None
