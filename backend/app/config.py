"""Application configuration loaded from project-root .env via pydantic-settings."""

from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_ENV_FILE = PROJECT_ROOT / ".env"

_PLACEHOLDER_KEY_MARKERS = frozenset(
    {
        "",
        "your_gemini_api_key_here",
        "your_api_key",
        "your-api-key",
        "your_key_here",
        "my_gemini_key",
        "my_api_key",
        "placeholder",
        "changeme",
        "api_key_here",
    }
)


class Settings(BaseSettings):
    """Typed runtime settings for the Saans FastAPI service."""

    model_config = SettingsConfigDict(
        env_file=str(DEFAULT_ENV_FILE),
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    gemini_api_key: str | None = Field(default=None)
    gemini_model: str | None = Field(default=None)
    allowed_origins: str = Field(default="http://localhost:5173,http://localhost:4173")
    max_body_bytes: int = Field(default=20_480, ge=1024, le=1_048_576)
    cache_ttl_seconds: int = Field(default=600, ge=1, le=86_400)
    air_quality_timeout_seconds: float = Field(default=8.0, ge=1.0, le=30.0)
    gemini_timeout_seconds: float = Field(default=20.0, ge=1.0, le=60.0)
    gemini_max_output_tokens: int = Field(default=2048, ge=256, le=8192)
    trust_proxy_headers: bool = Field(default=False)
    log_level: str = Field(default="INFO")

    @property
    def parsed_allowed_origins(self) -> list[str]:
        """Returns sanitized CORS origins, never permitting wildcard '*'."""
        origins = [
            origin.strip().rstrip("/")
            for origin in self.allowed_origins.split(",")
            if origin.strip() and origin.strip() != "*"
        ]
        return origins or ["http://localhost:5173", "http://localhost:4173"]

    @property
    def effective_gemini_api_key(self) -> str | None:
        """Returns the Gemini API key only when non-empty and not a placeholder."""
        if not self.gemini_api_key:
            return None
        cleaned = self.gemini_api_key.strip().strip('"').strip("'")
        if cleaned.lower() in _PLACEHOLDER_KEY_MARKERS:
            return None
        return cleaned or None

    @property
    def effective_gemini_model(self) -> str | None:
        """Returns configured model override when non-empty."""
        if not self.gemini_model:
            return None
        cleaned = self.gemini_model.strip()
        return cleaned or None


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Cached Settings singleton."""
    return Settings()
