"""Grounded follow-up chat endpoint."""

from fastapi import APIRouter, HTTPException, Request

from app.routers.air_quality import get_client_ip
from app.schemas import ChatReply, ChatRequest
from app.services.fallback_plan import generate_fallback_chat_reply

router = APIRouter(prefix="/api", tags=["chat"])


@router.post("/chat", response_model=ChatReply, response_model_by_alias=True)
async def chat_endpoint(
    body: ChatRequest,
    request: Request,
) -> ChatReply:
    """Answers follow-up questions grounded in household profile, active plan, and AQI."""
    limiter = request.app.state.chat_limiter
    allowed, retry_after = await limiter.check(get_client_ip(request))
    if not allowed:
        raise HTTPException(
            status_code=429,
            detail="Too many chat requests. Please try again shortly.",
            headers={"Retry-After": str(retry_after)},
        )

    gemini_client = request.app.state.gemini_client
    reply = await gemini_client.generate_chat_reply(body.question, body.profile, body.plan)
    if reply is not None:
        return reply

    return generate_fallback_chat_reply(body.question, body.profile, body.plan)
