"""Healthcheck endpoint."""

import os

from fastapi import APIRouter, Request, Response

from app.schemas import HealthResponse

router = APIRouter(prefix="/api", tags=["health"])


@router.get("/health", response_model=HealthResponse, response_model_by_alias=True)
async def health_check(request: Request, response: Response) -> HealthResponse:
    """Returns service health status, current healthy model, and short commit SHA."""
    response.headers["Cache-Control"] = "no-cache"
    gemini = getattr(request.app.state, "gemini_client", None)
    configured = gemini is not None and bool(gemini.is_configured)
    healthy = gemini.healthy_model if gemini is not None and configured else None
    raw_sha = os.environ.get("RENDER_GIT_COMMIT", "").strip()
    commit_sha = raw_sha[:7] if raw_sha else "dev"
    return HealthResponse(
        status="ok",
        gemini_configured=configured,
        selected_model=healthy,
        commit_sha=commit_sha,
    )
