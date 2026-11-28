"""Grounded follow-up chat endpoint."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Request, Response

from app.dependencies import (
    AppStateDep,
    ChatLimiterDep,
    GeminiClientDep,
    elapsed_ms,
    enforce_rate_limit,
    resolve_clock,
)
from app.exceptions import log_route_event
from app.schemas import ChatReply, ChatRequest
from app.services.fallback_chat import generate_fallback_chat_reply

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
    app_state: AppStateDep,
    limiter: ChatLimiterDep,
    gemini_client: GeminiClientDep,
) -> ChatReply:
    """Answers follow-up questions grounded in household profile, active plan, and AQI."""
    clock = resolve_clock(app_state)
    started = clock()
    response.headers["Cache-Control"] = "no-store"

    await enforce_rate_limit(
        limiter,
        request,
        "Too many chat requests. Please try again shortly.",
    )

    reply = await gemini_client.generate_chat_reply(body.question, body.profile, body.plan)
    latency_ms = elapsed_ms(started, clock())
    if reply is not None:
        log_route_event(logger, "/api/chat", mode="gemini", latency_ms=latency_ms)
        return reply

    log_route_event(logger, "/api/chat", mode="rules", latency_ms=latency_ms)
    return generate_fallback_chat_reply(body.question, body.profile, body.plan)
