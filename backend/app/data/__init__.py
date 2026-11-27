"""Static bilingual copy templates for safety guardrails and rule-based fallbacks."""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

_DATA_DIR = Path(__file__).resolve().parent


@lru_cache(maxsize=8)
def load_copy_data(filename: str) -> dict[str, Any]:
    return dict(json.loads((_DATA_DIR / filename).read_text(encoding="utf-8")))
