"""Healthcheck endpoint."""

import os

from fastapi import APIRouter, Response
from fastapi.responses import PlainTextResponse

from app.dependencies import GeminiClientDep
from app.schemas import HealthResponse

router = APIRouter(prefix="/api", tags=["health"])
public_router = APIRouter(tags=["security"])

_SECURITY_TXT = "\n".join(
    [
        "Contact: https://github.com/Shreyash463/saans-urban-air-quality-assistant/security/advisories/new",
        "Expires: 2027-12-31T23:59:59Z",
        "Preferred-Languages: en, hi",
        "Policy: https://github.com/Shreyash463/saans-urban-air-quality-assistant/blob/main/SECURITY.md",
        "Canonical: https://saans-urban-air-quality-assistant.onrender.com/.well-known/security.txt",
        "",
    ]
)


@router.get(
    "/health",
    response_model=HealthResponse,
    response_model_by_alias=True,
    response_model_exclude_none=True,
)
async def health_check(response: Response, gemini: GeminiClientDep) -> HealthResponse:
    """Returns service health status, current healthy model, and short commit SHA."""
    response.headers["Cache-Control"] = "no-cache"
    configured = bool(gemini.is_configured)
    healthy = gemini.healthy_model if configured else None
    remaining_budget = gemini.remaining_daily_budget if configured else None
    budget_limit = gemini.daily_budget_limit if configured else None
    raw_sha = os.environ.get("RENDER_GIT_COMMIT", "").strip()
    commit_sha = raw_sha[:7] if raw_sha else "dev"
    return HealthResponse(
        status="ok",
        gemini_configured=configured,
        selected_model=healthy,
        remaining_daily_budget=remaining_budget,
        daily_budget_limit=budget_limit,
        commit_sha=commit_sha,
    )


@public_router.get("/.well-known/security.txt", include_in_schema=False)
async def security_txt() -> PlainTextResponse:
    """Publishes RFC 9116 security disclosure contact metadata."""
    return PlainTextResponse(
        content=_SECURITY_TXT,
        media_type="text/plain; charset=utf-8",
        headers={"Cache-Control": "public, max-age=3600"},
    )
