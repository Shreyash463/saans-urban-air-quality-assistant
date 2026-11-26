"""Air quality lookup endpoint supporting city name or opt-in coordinates."""

import math

from fastapi import APIRouter, HTTPException, Query, Request, Response

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


def validate_optional_coords(lat: float | None, lon: float | None) -> tuple[float, float] | None:
    """Validates paired finite latitude/longitude parameters; raises 422 if malformed."""
    if lat is None and lon is None:
        return None
    if lat is None or lon is None:
        raise HTTPException(
            status_code=422,
            detail="Both lat and lon query parameters must be provided together.",
        )
    if not (math.isfinite(lat) and math.isfinite(lon)):
        raise HTTPException(
            status_code=422,
            detail="Latitude and longitude must be finite numbers.",
        )
    return lat, lon


@router.get(
    "/air-quality",
    response_model=AirQualityReading,
    response_model_by_alias=True,
    response_model_exclude_none=True,
)
async def get_air_quality_endpoint(
    request: Request,
    response: Response,
    city: str = Query(default="Delhi", min_length=1, max_length=CITY_MAX_LENGTH),
    lat: float | None = Query(default=None, ge=-90.0, le=90.0),
    lon: float | None = Query(default=None, ge=-180.0, le=180.0),
) -> AirQualityReading:
    """Returns live Open-Meteo CPCB-calibrated AQI or deterministic demo fallback."""
    await enforce_rate_limit(
        get_air_quality_limiter(request),
        request,
        "Rate limit exceeded. Please wait before requesting air quality again.",
    )

    coords = validate_optional_coords(lat, lon)
    service = get_air_quality_service(request)
    http_client = get_http_client(request)

    if coords is not None:
        response.headers["Cache-Control"] = "private, max-age=120"
        return await service.get_air_quality_by_coords(coords[0], coords[1], http_client)

    cleaned_city = strip_control_chars(city)
    if not is_valid_city_text(cleaned_city):
        raise HTTPException(
            status_code=422,
            detail="Invalid city parameter. Use 1-60 letters, spaces, commas, periods, or hyphens.",
        )

    response.headers["Cache-Control"] = "public, max-age=180"
    return await service.get_air_quality(cleaned_city, http_client)
