"""Air quality lookup endpoints: GET for city, POST body for ephemeral coordinates."""

from fastapi import APIRouter, HTTPException, Query, Request, Response

from app.dependencies import (
    enforce_rate_limit,
    get_air_quality_limiter,
    get_air_quality_service,
    get_client_ip,
    get_http_client,
)
from app.schemas import (
    CITY_MAX_LENGTH,
    AirQualityReading,
    CoordinatesBody,
    is_valid_city_text,
    strip_control_chars,
)

__all__ = ["get_client_ip", "router"]

router = APIRouter(prefix="/api", tags=["air-quality"])


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
) -> AirQualityReading:
    """Returns live Open-Meteo CPCB-calibrated AQI for a city (never accepts query coordinates)."""
    if "lat" in request.query_params or "lon" in request.query_params:
        raise HTTPException(
            status_code=422,
            detail="Latitude and longitude must be sent in a POST JSON body, not query parameters.",
        )

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
    response.headers["Cache-Control"] = "public, max-age=180"
    return await service.get_air_quality(cleaned_city, http_client)


@router.post(
    "/air-quality",
    response_model=AirQualityReading,
    response_model_by_alias=True,
    response_model_exclude_none=True,
)
async def post_air_quality_coords_endpoint(
    coords: CoordinatesBody,
    request: Request,
    response: Response,
) -> AirQualityReading:
    """Returns live Open-Meteo AQI for ephemeral coordinates supplied via POST body only."""
    await enforce_rate_limit(
        get_air_quality_limiter(request),
        request,
        "Rate limit exceeded. Please wait before requesting air quality again.",
    )

    service = get_air_quality_service(request)
    http_client = get_http_client(request)
    response.headers["Cache-Control"] = "no-store"
    return await service.get_air_quality_by_coords(coords.lat, coords.lon, http_client)
