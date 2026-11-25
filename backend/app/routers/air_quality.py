"""Air quality lookup endpoint."""

from fastapi import APIRouter, HTTPException, Query, Request

from app.dependencies import (
    enforce_rate_limit,
    get_air_quality_limiter,
    get_air_quality_service,
    get_client_ip,
    get_http_client,
)
from app.schemas import CITY_MAX_LENGTH, AirQualityReading, is_valid_city_text, strip_control_chars

__all__ = ["get_client_ip", "router"]

router = APIRouter(prefix="/api", tags=["air-quality"])


@router.get("/air-quality", response_model=AirQualityReading, response_model_by_alias=True)
async def get_air_quality_endpoint(
    request: Request,
    city: str = Query(default="Delhi", min_length=1, max_length=CITY_MAX_LENGTH),
) -> AirQualityReading:
    """Returns live Open-Meteo CPCB-calibrated AQI or deterministic demo fallback."""
    await enforce_rate_limit(
        get_air_quality_limiter(request),
        request,
        "Rate limit exceeded. Please wait before requesting air quality again.",
    )

    cleaned_city = strip_control_chars(city)
    if not is_valid_city_text(cleaned_city):
        raise HTTPException(
            status_code=422,
            detail="Invalid city parameter. Use 1-60 letters, spaces, commas, periods, or hyphens.",
        )

    service = get_air_quality_service(request)
    http_client = get_http_client(request)
    return await service.get_air_quality(cleaned_city, http_client)
