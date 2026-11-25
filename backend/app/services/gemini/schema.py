"""Compact Gemini response JSON schema and post-generation Pydantic validation draft."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.schemas import CommunityAction, IndoorHack, RoutineItem


class RawGeminiAlternative(BaseModel):
    """Permissive alternative draft; numeric impact is always supplied deterministically."""

    model_config = ConfigDict(extra="ignore")

    current: str = Field(min_length=1, max_length=300)
    swap: str = Field(min_length=1, max_length=300)
    why: str = Field(min_length=1, max_length=700)
    pm25ReductionPct: float = 0
    co2SavedKgPerMonth: float = 0


class GeminiPlanDraft(BaseModel):
    """Narrative fields requested from Gemini (extra legacy keys accepted if returned)."""

    model_config = ConfigDict(extra="ignore")

    summary: str = Field(min_length=1, max_length=1500)
    routine: list[RoutineItem] = Field(min_length=4, max_length=4)
    indoorHacks: list[IndoorHack] = Field(min_length=5, max_length=7)
    alternatives: list[RawGeminiAlternative] = Field(min_length=3, max_length=5)
    communityActions: list[CommunityAction] = Field(default_factory=list, max_length=6)


SIMPLE_PLAN_JSON_SCHEMA: dict[str, Any] = {
    "type": "OBJECT",
    "required": [
        "summary",
        "routine",
        "indoorHacks",
        "alternatives",
        "communityActions",
    ],
    "properties": {
        "summary": {"type": "STRING"},
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
                "required": ["current", "swap", "why"],
                "properties": {
                    "current": {"type": "STRING"},
                    "swap": {"type": "STRING"},
                    "why": {"type": "STRING"},
                },
            },
        },
        "communityActions": {
            "type": "ARRAY",
            "items": {
                "type": "OBJECT",
                "required": ["title", "who", "howTo", "estimatedImpact", "effort"],
                "properties": {
                    "title": {"type": "STRING"},
                    "who": {"type": "STRING", "enum": ["rwa", "school", "workplace", "neighbours"]},
                    "howTo": {"type": "STRING"},
                    "estimatedImpact": {"type": "STRING"},
                    "effort": {"type": "STRING", "enum": ["low", "medium", "high"]},
                },
            },
        },
    },
}
