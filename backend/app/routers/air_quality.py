"""Air quality lookup endpoints: GET for city, POST body for ephemeral coordinates."""

from fastapi import APIRouter, Query, Request, Response

from app.dependencies import (
    AirQualityLimiterDep,
    AirQualityServiceDep,
    HttpClientDep,
    enforce_rate_limit,
)
from app.exceptions import InvalidInputError
from app.schemas import (
    CITY_MAX_LENGTH,
    AirQualityReading,
    CoordinatesBody,
    is_valid_city_text,
    strip_control_chars,
)

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
    limiter: AirQualityLimiterDep,
    service: AirQualityServiceDep,
    http_client: HttpClientDep,
    city: str = Query(default="Delhi", min_length=1, max_length=CITY_MAX_LENGTH),
) -> AirQualityReading:
    """Returns live Open-Meteo CPCB-calibrated AQI for a city (never accepts query coordinates)."""
    if "lat" in request.query_params or "lon" in request.query_params:
        raise InvalidInputError(
            "Latitude and longitude must be sent in a POST JSON body, not query parameters."
        )

    await enforce_rate_limit(
        limiter,
        request,
        "Rate limit exceeded. Please wait before requesting air quality again.",
    )

    cleaned_city = strip_control_chars(city)
    if not is_valid_city_text(cleaned_city):
        raise InvalidInputError(
            "Invalid city parameter. Use 1-60 letters, spaces, commas, periods, or hyphens."
        )

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
    limiter: AirQualityLimiterDep,
    service: AirQualityServiceDep,
    http_client: HttpClientDep,
) -> AirQualityReading:
    """Returns live Open-Meteo AQI for ephemeral coordinates supplied via POST body only."""
    await enforce_rate_limit(
        limiter,
        request,
        "Rate limit exceeded. Please wait before requesting air quality again.",
    )

    response.headers["Cache-Control"] = "no-store"
    return await service.get_air_quality_by_coords(coords.lat, coords.lon, http_client)
