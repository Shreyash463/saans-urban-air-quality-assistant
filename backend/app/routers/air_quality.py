"""Air quality lookup endpoint."""

from fastapi import APIRouter, HTTPException, Query, Request

from app.schemas import CITY_MAX_LENGTH, AirQualityReading, is_valid_city_text, strip_control_chars

router = APIRouter(prefix="/api", tags=["air-quality"])


def get_client_ip(request: Request) -> str:
    """Extracts client IP safely without trusting spoofable forwarding headers by default."""
    settings = request.app.state.settings
    if settings.trust_proxy_headers:
        forwarded = request.headers.get("x-forwarded-for", "").split(",")[0].strip()
        if forwarded:
            return forwarded
    return request.client.host if request.client else "unknown"


@router.get("/air-quality", response_model=AirQualityReading, response_model_by_alias=True)
async def get_air_quality_endpoint(
    request: Request,
    city: str = Query(default="Delhi", min_length=1, max_length=CITY_MAX_LENGTH),
) -> AirQualityReading:
    """Returns live Open-Meteo CPCB-calibrated AQI or deterministic demo fallback."""
    limiter = request.app.state.air_quality_limiter
    allowed, retry_after = await limiter.check(get_client_ip(request))
    if not allowed:
        raise HTTPException(
            status_code=429,
            detail="Rate limit exceeded. Please wait before requesting air quality again.",
            headers={"Retry-After": str(retry_after)},
        )

    cleaned_city = strip_control_chars(city)
    if not is_valid_city_text(cleaned_city):
        raise HTTPException(
            status_code=422,
            detail="Invalid city parameter. Use 1-60 letters, spaces, commas, periods, or hyphens.",
        )

    service = request.app.state.air_quality_service
    http_client = request.app.state.http_client
    return await service.get_air_quality(cleaned_city, http_client)
