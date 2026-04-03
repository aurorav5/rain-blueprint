"""
RAIN Heuristic Fallback — Delegates to AUTHORITATIVE source.

The AUTHORITATIVE heuristic parameter source is ml/rainnet/heuristics.py.
This module wraps it for backward compatibility with service-layer imports.

Per CLAUDE.md: "The PART-4 backend definition is AUTHORITATIVE — the frontend
must match it exactly." All three sources (this file, ml/rainnet/heuristics.py,
frontend/src/utils/heuristic-params.ts) MUST produce identical output for
the same (genre, platform) pair.
"""

from __future__ import annotations

from typing import Any

from ml.rainnet.heuristics import (
    BASE_PARAMS,
    GENRE_PRESETS,
    PLATFORM_LUFS,
    PLATFORM_TRUE_PEAK,
    get_heuristic_params,
)


def default_params() -> dict[str, Any]:
    """Return the canonical ProcessingParams with all defaults.

    Delegates to the AUTHORITATIVE ml/rainnet/heuristics.BASE_PARAMS.
    """
    return {k: (v.copy() if isinstance(v, list) else v) for k, v in BASE_PARAMS.items()}


def generate_heuristic_params(genre: str, platform: str) -> dict[str, Any]:
    """Generate a deterministic ProcessingParams dict from (genre, platform).

    Delegates to the AUTHORITATIVE ml/rainnet/heuristics.get_heuristic_params().
    """
    vinyl = platform == "vinyl"
    return get_heuristic_params(genre, platform, vinyl=vinyl)


def validate_processing_params(params: dict[str, Any]) -> list[str]:
    """Validate a ProcessingParams dict against the canonical schema.

    Returns a list of error strings. Empty list = valid.
    """
    errors: list[str] = []
    canonical = default_params()

    # Check all required fields present
    for key in canonical:
        if key not in params:
            errors.append(f"Missing field: {key}")

    # Range checks
    if "target_lufs" in params:
        v = params["target_lufs"]
        if not (-24.0 <= v <= -8.0):
            errors.append(f"target_lufs {v} out of range [-24.0, -8.0]")

    if "true_peak_ceiling" in params:
        v = params["true_peak_ceiling"]
        if not (-6.0 <= v <= 0.0):
            errors.append(f"true_peak_ceiling {v} out of range [-6.0, 0.0]")

    if "eq_gains" in params:
        eq = params["eq_gains"]
        if not isinstance(eq, list) or len(eq) != 8:
            errors.append(f"eq_gains must be float[8], got length {len(eq) if isinstance(eq, list) else type(eq)}")
        elif any(not (-12.0 <= g <= 12.0) for g in eq):
            errors.append("eq_gains values must be in range [-12.0, +12.0]")

    if "sail_stem_gains" in params:
        sg = params["sail_stem_gains"]
        if not isinstance(sg, list) or len(sg) != 6:
            errors.append(f"sail_stem_gains must be float[6], got length {len(sg) if isinstance(sg, list) else type(sg)}")

    for prefix in ("mb_ratio_",):
        for band in ("low", "mid", "high"):
            key = f"{prefix}{band}"
            if key in params and not (1.0 <= params[key] <= 20.0):
                errors.append(f"{key} {params[key]} out of range [1.0, 20.0]")

    if "stereo_width" in params:
        v = params["stereo_width"]
        if not (0.0 <= v <= 2.0):
            errors.append(f"stereo_width {v} out of range [0.0, 2.0]")

    return errors
