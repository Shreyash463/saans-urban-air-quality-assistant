"""Health check endpoint."""

from fastapi import APIRouter, Request

from app.schemas import HealthResponse

router = APIRouter(prefix="/api", tags=["health"])


@router.get("/health", response_model=HealthResponse, response_model_by_alias=True)
async def health_check(request: Request) -> HealthResponse:
    """Returns service health status without exposing secrets."""
    gemini = getattr(request.app.state, "gemini_client", None)
    configured = gemini is not None and bool(gemini.is_configured)
    model = gemini.selected_model if gemini is not None and configured else None
    return HealthResponse(status="ok", gemini_configured=configured, selected_model=model)
