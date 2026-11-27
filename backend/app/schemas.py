"""Pydantic v2 API contract models mirroring src/types/index.ts with camelCase aliases."""

from __future__ import annotations

import math
import re
import unicodedata
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator
from pydantic.alias_generators import to_camel

CommuteMode = Literal[
    "car",
    "two_wheeler",
    "public_transport",
    "walk_cycle",
    "work_from_home",
]
HomeType = Literal["apartment", "independent_house"]
CookingFuel = Literal["lpg", "induction_electric", "piped_gas", "biomass_wood"]
BudgetLevel = Literal["low", "medium", "high"]
LanguageCode = Literal["en", "hi"]
ReadingSource = Literal["live", "demo"]
RoutineTimeSlot = Literal["morning", "midday", "evening", "night"]
CostLevel = Literal["free", "low", "medium", "high"]
GeneratedBy = Literal["gemini", "rules"]
FallbackReason = Literal["no_key", "ai_busy", "ai_error"]
CommunityActor = Literal["rwa", "school", "workplace", "neighbours"]
EffortLevel = Literal["low", "medium", "high"]

_CONTROL_CHARS_RE = re.compile(r"[\x00-\x1f\x7f\u200b-\u200f\u202a-\u202e\u2066-\u2069]")
_WHITESPACE_RE = re.compile(r"\s+")

CITY_MAX_LENGTH = 60
QUESTION_MAX_LENGTH = 500
HOUSEHOLD_SIZE_MIN = 1
HOUSEHOLD_SIZE_MAX = 20
COMMUTE_KM_MIN = 0
COMMUTE_KM_MAX = 300


def strip_control_chars(value: str) -> str:
    """Removes ASCII control and invisible bidi/zero-width characters and collapses whitespace."""
    cleaned = _CONTROL_CHARS_RE.sub(" ", value)
    return _WHITESPACE_RE.sub(" ", cleaned).strip()


def is_valid_city_text(value: str) -> bool:
    """Validates city text: Unicode letters/marks, spaces, commas, hyphens, periods."""
    if not value or len(value) > CITY_MAX_LENGTH:
        return False
    has_letter = False
    for ch in value:
        cat = unicodedata.category(ch)
        if cat.startswith("L"):
            has_letter = True
        elif cat.startswith("M") or ch in {" ", ",", ".", "-"}:
            continue
        else:
            return False
    return has_letter


class CamelBaseModel(BaseModel):
    """Strict base model using camelCase JSON aliases and forbidding extra fields."""

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        extra="forbid",
        str_strip_whitespace=True,
    )


class UserProfile(CamelBaseModel):
    """Household lifestyle profile submitted by the frontend."""

    city: str = Field(min_length=1, max_length=CITY_MAX_LENGTH)
    household_size: int = Field(ge=HOUSEHOLD_SIZE_MIN, le=HOUSEHOLD_SIZE_MAX)
    has_children: bool
    has_elderly: bool
    has_respiratory_condition: bool
    commute_mode: CommuteMode
    commute_km: int = Field(ge=COMMUTE_KM_MIN, le=COMMUTE_KM_MAX)
    home_type: HomeType
    has_air_purifier: bool
    cooking_fuel: CookingFuel
    budget: BudgetLevel
    language: LanguageCode

    @field_validator("city", mode="before")
    @classmethod
    def validate_city(_cls, raw: object) -> str:
        if not isinstance(raw, str):
            raise ValueError("City must be a string.")
        cleaned = strip_control_chars(raw)
        if not is_valid_city_text(cleaned):
            raise ValueError(
                f"City must be 1-{CITY_MAX_LENGTH} characters and contain only letters, spaces, commas, periods, or hyphens."
            )
        return cleaned


class AirQualityReading(CamelBaseModel):
    """Air quality reading returned by /api/air-quality and embedded in PlanResponse."""

    city: str = Field(min_length=1, max_length=120)
    aqi: int = Field(ge=0, le=500)
    dominant_pollutant: str = Field(min_length=1, max_length=32)
    updated_at: str = Field(max_length=64)
    source: ReadingSource
    source_detail: str | None = Field(default=None, max_length=120)


class RoutineItem(CamelBaseModel):
    """Single time-slot item in the daily clean-air routine."""

    time_slot: RoutineTimeSlot
    title: str = Field(min_length=1, max_length=220)
    detail: str = Field(min_length=1, max_length=900)
    impact_note: str = Field(min_length=1, max_length=400)


class IndoorHack(CamelBaseModel):
    """Practical indoor air-quality improvement action ranked by budget."""

    title: str = Field(min_length=1, max_length=220)
    how_to: str = Field(min_length=1, max_length=900)
    estimated_benefit: str = Field(min_length=1, max_length=400)
    cost_level: CostLevel


class Alternative(CamelBaseModel):
    """Low-emission lifestyle swap with bounded PM2.5 and CO2 estimates."""

    current: str = Field(min_length=1, max_length=300)
    swap: str = Field(min_length=1, max_length=300)
    why: str = Field(min_length=1, max_length=700)
    pm25_reduction_pct: int = Field(ge=0, le=95)
    co2_saved_kg_per_month: int = Field(ge=0, le=1000)


class CommunityAction(CamelBaseModel):
    """Neighborhood, RWA, school, or workplace collective clean-air action."""

    title: str = Field(min_length=1, max_length=220)
    who: CommunityActor
    how_to: str = Field(min_length=1, max_length=700)
    estimated_impact: str = Field(min_length=1, max_length=400)
    effort: EffortLevel


class CoordinatesBody(CamelBaseModel):
    """Ephemeral geolocation coordinates submitted inside a POST JSON body."""

    lat: float = Field(ge=-90.0, le=90.0)
    lon: float = Field(ge=-180.0, le=180.0)

    @field_validator("lat", "lon")
    @classmethod
    def validate_finite(_cls, val: float) -> float:
        if not math.isfinite(val):
            raise ValueError("Coordinate must be finite.")
        return val


class PlanRequest(UserProfile):
    """Plan request body supporting optional ephemeral coordinates without query strings."""

    coords: CoordinatesBody | None = None
    prefer_coords: bool | None = None


class PlanResponse(CamelBaseModel):
    """Complete personalized clean-air plan matching src/types/index.ts."""

    aqi: AirQualityReading
    summary: str = Field(min_length=1, max_length=1500)
    health_advisory: str = Field(min_length=1, max_length=2000)
    routine: list[RoutineItem] = Field(min_length=4, max_length=4)
    indoor_hacks: list[IndoorHack] = Field(min_length=1, max_length=10)
    alternatives: list[Alternative] = Field(min_length=1, max_length=8)
    community_actions: list[CommunityAction] = Field(default_factory=list, max_length=6)
    mask_guidance: str = Field(min_length=1, max_length=1500)
    disclaimer: str = Field(min_length=1, max_length=1000)
    generated_by: GeneratedBy | None = None
    fallback_reason: FallbackReason | None = None
    retry_after_seconds: int | None = Field(default=None, ge=0, le=3600)


class ChatRequest(CamelBaseModel):
    """Follow-up assistant request payload."""

    question: str = Field(min_length=1, max_length=QUESTION_MAX_LENGTH)
    profile: UserProfile
    plan: PlanResponse

    @field_validator("question", mode="before")
    @classmethod
    def validate_question(_cls, raw: object) -> str:
        if not isinstance(raw, str):
            raise ValueError("Question must be a string.")
        cleaned = strip_control_chars(raw)
        if not cleaned:
            raise ValueError("Question must not be empty.")
        if len(cleaned) > QUESTION_MAX_LENGTH:
            raise ValueError(f"Question must be {QUESTION_MAX_LENGTH} characters or fewer.")
        return cleaned


class ChatReply(CamelBaseModel):
    """Assistant reply payload."""

    answer: str = Field(min_length=1, max_length=2500)


class HealthResponse(CamelBaseModel):
    """Service readiness payload for /api/health."""

    status: Literal["ok"]
    gemini_configured: bool
    selected_model: str | None = None
    remaining_daily_budget: int | None = None
    daily_budget_limit: int | None = None
    commit_sha: str | None = Field(default=None, max_length=64)
