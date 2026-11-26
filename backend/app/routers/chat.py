"""Grounded follow-up chat endpoint."""

from __future__ import annotations

import logging
import time

from fastapi import APIRouter, Request, Response

from app.dependencies import enforce_rate_limit, get_chat_limiter, get_gemini_client
from app.schemas import ChatReply, ChatRequest
from app.services.fallback_plan import generate_fallback_chat_reply

logger = logging.getLogger("saans")
router = APIRouter(prefix="/api", tags=["chat"])


@router.post(
    "/chat",
    response_model=ChatReply,
    response_model_by_alias=True,
    response_model_exclude_none=True,
)
async def chat_endpoint(
    body: ChatRequest,
    request: Request,
    response: Response,
) -> ChatReply:
    """Answers follow-up questions grounded in household profile, active plan, and AQI."""
    started = time.monotonic()
    response.headers["Cache-Control"] = "no-store"

    await enforce_rate_limit(
        get_chat_limiter(request),
        request,
        "Too many chat requests. Please try again shortly.",
    )

    gemini_client = get_gemini_client(request)
    reply = await gemini_client.generate_chat_reply(body.question, body.profile, body.plan)
    if reply is not None:
        logger.info("route=/api/chat mode=gemini latency_ms=%d", int((time.monotonic() - started) * 1000))
        return reply

    logger.info("route=/api/chat mode=rules latency_ms=%d", int((time.monotonic() - started) * 1000))
    return generate_fallback_chat_reply(body.question, body.profile, body.plan)
