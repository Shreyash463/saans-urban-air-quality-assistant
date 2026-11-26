"""Static SPA bundle indexer and Brotli/ETag file response helpers."""

from __future__ import annotations

import mimetypes
from dataclasses import dataclass
from email.utils import formatdate
from pathlib import Path

from fastapi import Request, Response
from fastapi.responses import FileResponse

_EXTRA_MIME_TYPES: dict[str, str] = {
    ".js": "application/javascript; charset=utf-8",
    ".mjs": "application/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".svg": "image/svg+xml",
    ".woff2": "font/woff2",
    ".json": "application/json; charset=utf-8",
}


@dataclass(frozen=True, slots=True)
class StaticAsset:
    """Pre-indexed static bundle entry resolved safely at app creation."""

    file_path: Path
    br_path: Path | None
    etag: str
    last_modified: str
    media_type: str
    cache_control: str


def _guess_media_type(file_path: Path) -> str:
    suffix = file_path.suffix.lower()
    if suffix in _EXTRA_MIME_TYPES:
        return _EXTRA_MIME_TYPES[suffix]
    guessed, _ = mimetypes.guess_type(str(file_path))
    return guessed or "application/octet-stream"


def build_static_index(dist_dir: Path) -> dict[str, StaticAsset]:
    """Indexes dist files once so HTTP requests never build filesystem paths from user input."""
    if not dist_dir.is_dir():
        return {}
    dist_root = dist_dir.resolve()
    assets: dict[str, StaticAsset] = {}
    for entry in dist_root.rglob("*"):
        if not entry.is_file() or entry.name.endswith(".br"):
            continue
        rel = entry.relative_to(dist_root).as_posix()
        stat = entry.stat()
        candidate_br = entry.with_name(f"{entry.name}.br")
        cache_control = "public, max-age=31536000, immutable" if rel.startswith("assets/") else "no-cache"
        assets[rel] = StaticAsset(
            file_path=entry,
            br_path=candidate_br if candidate_br.is_file() else None,
            etag=f'W/"{stat.st_size:x}-{stat.st_mtime_ns:x}"',
            last_modified=formatdate(stat.st_mtime, usegmt=True),
            media_type=_guess_media_type(entry),
            cache_control=cache_control,
        )
    return assets


def serve_indexed_asset(request: Request, asset: StaticAsset) -> Response:
    """Serves a pre-indexed static file with ETag/304 negotiation and optional .br."""
    headers: dict[str, str] = {
        "Cache-Control": asset.cache_control,
        "ETag": asset.etag,
        "Last-Modified": asset.last_modified,
    }
    if asset.br_path is not None:
        headers["Vary"] = "Accept-Encoding"
    if request.headers.get("if-none-match") == asset.etag:
        return Response(status_code=304, headers=headers)

    accept_encoding = request.headers.get("accept-encoding", "").lower()
    if asset.br_path is not None and "br" in accept_encoding:
        headers["Content-Encoding"] = "br"
        return FileResponse(asset.br_path, media_type=asset.media_type, headers=headers)
    return FileResponse(asset.file_path, media_type=asset.media_type, headers=headers)
