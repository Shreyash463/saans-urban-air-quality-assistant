"""Google Gemini client using google-genai SDK with startup model discovery, structured JSON, and fallback."""

from __future__ import annotations

import asyncio
import json
import logging
import re
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
    "gemini-3.8-flash",
    "gemini-3.5-flash-lite",
    "gemini-4-hydrogen",
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
        actions = getattr(model, "supported_actions", None) or []
        if "generateContent" not in actions:
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
        for token in ("schema", "response_schema", "response_json_schema", "additionalproperties", "$defs")
    )


class GeminiClient:
    """Async Gemini client managing model discovery, retries, timeouts, and structured outputs."""

    def __init__(self, settings: Settings, sdk_client: Any | None = None) -> None:
        self._settings = settings
        self._api_key = settings.effective_gemini_api_key
        self._client = sdk_client
        self._model_chain: list[str] = []
        self._selected_model: str | None = None

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
        """Discovers the newest flash model at startup if GEMINI_MODEL is unset."""
        if not self._client:
            logger.info("Gemini API key not configured; operating with rule-based fallback.")
            return

        if self._selected_model:
            logger.info("Using configured Gemini model: %s", self._selected_model)
            return

        try:
            pager = await asyncio.wait_for(
                self._client.aio.models.list(),
                timeout=self._settings.gemini_timeout_seconds,
            )
            discovered: list[Any] = []
            async for item in pager:
                discovered.append(item)
            ranked = select_best_flash_models(discovered)
            if ranked:
                self._selected_model = ranked[0]
                self._model_chain = ranked[:3] + [
                    m for m in _DEFAULT_FLASH_FALLBACKS if m not in ranked[:3]
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

        for model_name in self._model_chain[:3]:
            draft = await self._call_plan_model_with_retry(model_name, user_prompt)
            if draft is None:
                continue

            # Ensure exactly 4 unique routine slots in canonical order
            slot_order = ("morning", "midday", "evening", "night")
            by_slot = {item.time_slot: item for item in draft.routine}
            if not all(slot in by_slot for slot in slot_order):
                continue

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
    ) -> _GeminiPlanDraft | None:
        client = self._client
        if client is None:
            return None

        use_simplified_schema = False
        drop_schema = False

        for attempt in range(2):
            try:
                config_kwargs: dict[str, Any] = {
                    "system_instruction": PLAN_SYSTEM_PROMPT,
                    "temperature": 0.3,
                    "max_output_tokens": self._settings.gemini_max_output_tokens,
                    "response_mime_type": "application/json",
                }
                if not drop_schema:
                    config_kwargs["response_schema"] = (
                        _SIMPLE_PLAN_JSON_SCHEMA if use_simplified_schema else _GeminiPlanDraft
                    )

                response = await asyncio.wait_for(
                    client.aio.models.generate_content(
                        model=model_name,
                        contents=user_prompt,
                        config=types.GenerateContentConfig(**config_kwargs),
                    ),
                    timeout=self._settings.gemini_timeout_seconds,
                )
                raw_text = getattr(response, "text", None) or ""
                cleaned_json = _strip_json_fences(raw_text)
                if not cleaned_json:
                    raise ValueError("Empty Gemini JSON output")
                # Validate valid JSON and strict Pydantic structure
                json.loads(cleaned_json)
                return _GeminiPlanDraft.model_validate_json(cleaned_json)
            except (ValidationError, ValueError, json.JSONDecodeError) as exc:
                logger.warning(
                    "Invalid JSON/schema from model=%s attempt=%d (%s)",
                    model_name,
                    attempt + 1,
                    type(exc).__name__,
                )
                continue
            except Exception as exc:
                if _is_schema_rejection(exc):
                    if not use_simplified_schema:
                        use_simplified_schema = True
                        continue
                    if not drop_schema:
                        drop_schema = True
                        continue
                if isinstance(exc, genai_errors.APIError) and getattr(exc, "code", None) in {400, 401, 403, 404}:
                    logger.warning("Gemini model=%s rejected request (%s)", model_name, type(exc).__name__)
                    return None
                logger.warning(
                    "Transient Gemini error on model=%s attempt=%d (%s)",
                    model_name,
                    attempt + 1,
                    type(exc).__name__,
                )
                continue

        return None

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

        for model_name in self._model_chain[:3]:
            for attempt in range(2):
                try:
                    response = await asyncio.wait_for(
                        self._client.aio.models.generate_content(
                            model=model_name,
                            contents=user_prompt,
                            config=types.GenerateContentConfig(
                                system_instruction=CHAT_SYSTEM_PROMPT,
                                temperature=0.3,
                                max_output_tokens=max_chat_tokens,
                            ),
                        ),
                        timeout=self._settings.gemini_timeout_seconds,
                    )
                    raw_text = (getattr(response, "text", None) or "").strip()
                    if not raw_text:
                        raise ValueError("Empty Gemini chat output")
                    safe_answer = sanitize_chat_reply(raw_text, safe_q, profile, plan.aqi.aqi)
                    return ChatReply(answer=safe_answer)
                except Exception as exc:
                    if isinstance(exc, genai_errors.APIError) and getattr(exc, "code", None) in {400, 401, 403, 404}:
                        logger.warning("Gemini chat model=%s failed (%s)", model_name, type(exc).__name__)
                        break
                    logger.warning(
                        "Gemini chat error model=%s attempt=%d (%s)",
                        model_name,
                        attempt + 1,
                        type(exc).__name__,
                    )
                    continue

        return None
