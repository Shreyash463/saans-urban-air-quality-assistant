"""Shared builders and fake Gemini SDK helpers for backend tests."""

from __future__ import annotations

import json
from collections.abc import Callable
from pathlib import Path
from typing import Any

import httpx
from app.config import Settings
from app.main import create_app
from app.schemas import AirQualityReading, UserProfile
from app.services.gemini import GeminiClient
from fastapi import FastAPI
from tests.conftest import build_mock_http_client


class ApiStatusError(Exception):
    """Test error carrying optional HTTP status code, details, and response headers."""

    def __init__(
        self,
        message: str,
        code: int,
        details: Any = None,
        headers: dict[str, str] | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.details = details
        self.response = type("R", (), {"headers": headers})() if headers else None


class FakeAsyncModels:
    """Async stub replacing google.genai.aio.models in unit and endpoint tests."""

    def __init__(
        self,
        responder: str | Exception | Callable[..., Any],
        model_names: list[str] | None = None,
        list_error: Exception | None = None,
    ) -> None:
        self._responder = responder
        self._model_names = model_names or ["models/gemini-3.8-flash"]
        self._list_error = list_error

    async def list(self) -> Any:
        if self._list_error is not None:
            raise self._list_error
        items = [
            type("M", (), {"name": name, "supported_actions": ["generateContent"]})()
            for name in self._model_names
        ]

        class _Pager:
            def __init__(self) -> None:
                self._idx = 0

            def __aiter__(self) -> _Pager:
                return self

            async def __anext__(self) -> Any:
                if self._idx >= len(items):
                    raise StopAsyncIteration
                item = items[self._idx]
                self._idx += 1
                return item

        return _Pager()

    async def generate_content(self, **kwargs: Any) -> Any:
        if isinstance(self._responder, Exception):
            raise self._responder
        if callable(self._responder):
            return self._responder(**kwargs)
        return type("Resp", (), {"text": self._responder})()


def make_sdk_client(
    responder: str | Exception | Callable[..., Any],
    model_names: list[str] | None = None,
    list_error: Exception | None = None,
) -> Any:
    """Wraps FakeAsyncModels into the shape expected by GeminiClient(sdk_client=...)."""
    models = FakeAsyncModels(responder, model_names=model_names, list_error=list_error)
    return type("Sdk", (), {"aio": type("Aio", (), {"models": models})()})()


def make_profile_dict(**overrides: Any) -> dict[str, Any]:
    base: dict[str, Any] = {
        "city": "Delhi",
        "householdSize": 4,
        "hasChildren": True,
        "hasElderly": False,
        "hasRespiratoryCondition": True,
        "commuteMode": "car",
        "commuteKm": 18,
        "homeType": "apartment",
        "hasAirPurifier": False,
        "cookingFuel": "lpg",
        "budget": "low",
        "language": "en",
    }
    base.update(overrides)
    return base


def make_profile(lang: str = "en", **overrides: Any) -> UserProfile:
    return UserProfile.model_validate(make_profile_dict(language=lang, **overrides))


def make_reading(**overrides: Any) -> AirQualityReading:
    base: dict[str, Any] = {
        "city": "Delhi",
        "aqi": 310,
        "dominantPollutant": "PM2.5",
        "updated_at": "2026-11-25T15:00:00+05:30",
        "source": "live",
        "sourceDetail": "Open-Meteo",
    }
    base.update(overrides)
    return AirQualityReading(**base)


def make_compact_narrative(include_community: bool = True) -> dict[str, Any]:
    """Minimal schema-valid Gemini narrative JSON dictionary."""
    payload: dict[str, Any] = {
        "summary": "Clean Gemini summary for Delhi.",
        "routine": [
            {"timeSlot": slot, "title": f"Step {slot}", "detail": "Act safely.", "impactNote": "Cuts PM2.5."}
            for slot in ("morning", "midday", "evening", "night")
        ],
        "indoorHacks": [
            {"title": f"Hack {i}", "howTo": "Daily step.", "estimatedBenefit": "~20% less dust", "costLevel": "free"}
            for i in range(5)
        ],
        "alternatives": [
            {"current": "Car", "swap": "Metro 3x/week", "why": "Lower NO2."},
            {"current": "LPG", "swap": "Kettle boiling", "why": "Cleaner kitchen."},
            {"current": "Unfiltered sleep", "swap": "Box-fan HEPA", "why": "Night recovery."},
            {"current": "Leaf fires", "swap": "Compost", "why": "Stops lane smog."},
        ],
    }
    if include_community:
        payload["communityActions"] = [
            {"title": "RWA heaters", "who": "rwa", "howTo": "Guard heaters.", "estimatedImpact": "Zero fires", "effort": "low"},
            {"title": "Lane alerts", "who": "neighbours", "howTo": "Report trash fires.", "estimatedImpact": "Lower PM2.5", "effort": "low"},
            {"title": "School indoor", "who": "school", "howTo": "Indoor recess >200 AQI.", "estimatedImpact": "Protects kids", "effort": "medium"},
        ]
    return payload


def make_full_gemini_payload(unsafe: bool = False) -> str:
    """Serialized Gemini JSON with healthAdvisory, maskGuidance, and numeric alternatives."""
    narrative = make_compact_narrative(include_community=False)
    narrative["healthAdvisory"] = "Outdoor exercise is safe for everyone today!" if unsafe else "Avoid outdoor exertion."
    narrative["maskGuidance"] = "No mask needed today." if unsafe else "Wear a fitted N95 mask."
    narrative["alternatives"] = [
        {"current": cur, "swap": swp, "why": "Cleaner air", "pm25ReductionPct": 99, "co2SavedKgPerMonth": 999}
        for cur, swp in [("Car", "Metro"), ("LPG boiling", "Kettle"), ("Open bedroom", "DIY HEPA fan"), ("Leaf burning", "Compost")]
    ]
    return json.dumps(narrative)


def make_test_app(
    tmp_path: Path,
    *,
    settings: Settings | None = None,
    gemini_client: GeminiClient | None = None,
    http_client: httpx.AsyncClient | None = None,
) -> FastAPI:
    """Creates an isolated FastAPI app backed by a temporary SPA dist folder."""
    dist_dir = tmp_path / "dist"
    dist_dir.mkdir(exist_ok=True)
    if not (dist_dir / "index.html").exists():
        (dist_dir / "index.html").write_text("<!doctype html><html><body>Saans</body></html>", encoding="utf-8")
    return create_app(
        settings=settings or Settings(),
        gemini_client=gemini_client,
        http_client=http_client or build_mock_http_client(),
        dist_dir=dist_dir,
    )
