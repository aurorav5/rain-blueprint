"""
Heuristic fallback processing parameters.
Used when RAIN_NORMALIZATION_VALIDATED=false (always currently) or inference fails.
This is AUTHORITATIVE — the frontend (PART-5 heuristic-params.ts) must match these values exactly.
All field names follow the canonical ProcessingParams schema from CLAUDE.md.
"""
from typing import Optional

GENRE_PRESETS: dict[str, dict] = {
    "electronic": {
        "mb_threshold_low": -18, "mb_threshold_mid": -16, "mb_threshold_high": -14,
        "mb_ratio_low": 3.0, "mb_ratio_mid": 2.5, "mb_ratio_high": 2.0,
        "stereo_width": 1.3, "analog_saturation": False,
    },
    "hiphop": {
        "mb_threshold_low": -16, "mb_threshold_mid": -14, "mb_threshold_high": -14,
        "mb_ratio_low": 3.5, "mb_ratio_mid": 2.5, "mb_ratio_high": 2.0,
        "stereo_width": 1.1, "analog_saturation": True, "saturation_drive": 0.2,
    },
    "rock": {
        "mb_threshold_low": -18, "mb_threshold_mid": -16, "mb_threshold_high": -12,
        "mb_ratio_low": 2.5, "mb_ratio_mid": 2.0, "mb_ratio_high": 2.5,
        "analog_saturation": True, "saturation_drive": 0.15,
    },
    "pop": {
        "mb_threshold_low": -20, "mb_threshold_mid": -18, "mb_threshold_high": -16,
        "mb_ratio_low": 2.0, "mb_ratio_mid": 2.0, "mb_ratio_high": 1.8,
        "stereo_width": 1.1,
    },
    "classical": {
        "mb_threshold_low": -24, "mb_threshold_mid": -22, "mb_threshold_high": -22,
        "mb_ratio_low": 1.5, "mb_ratio_mid": 1.5, "mb_ratio_high": 1.5,
        "stereo_width": 0.95,
    },
    "jazz": {
        "mb_threshold_low": -22, "mb_threshold_mid": -20, "mb_threshold_high": -20,
        "mb_ratio_low": 2.0, "mb_ratio_mid": 1.8, "mb_ratio_high": 1.5,
        "analog_saturation": True, "saturation_drive": 0.1,
    },
    "default": {
        "mb_threshold_low": -20, "mb_threshold_mid": -18, "mb_threshold_high": -16,
        "mb_ratio_low": 2.5, "mb_ratio_mid": 2.0, "mb_ratio_high": 2.0,
    },
}

PLATFORM_LUFS: dict[str, float] = {
    "spotify": -14.0,
    "apple_music": -16.0,
    "youtube": -14.0,
    "tidal": -14.0,
    "amazon_music": -14.0,
    "tiktok": -14.0,
    "soundcloud": -14.0,
    "vinyl": -14.0,
}

BASE_PARAMS: dict = {
    "mb_attack_low": 10.0, "mb_attack_mid": 5.0, "mb_attack_high": 2.0,
    "mb_release_low": 150.0, "mb_release_mid": 80.0, "mb_release_high": 40.0,
    "eq_gains": [0.0] * 8,
    "analog_saturation": False, "saturation_drive": 0.0, "saturation_mode": "tape",
    "ms_enabled": False, "mid_gain": 0.0, "side_gain": 0.0, "stereo_width": 1.0,
    "sail_enabled": False, "sail_stem_gains": [0.0] * 6,
    "vinyl_mode": False,
}


def get_heuristic_params(
    genre: Optional[str],
    platform: str,
    vinyl: bool = False,
) -> dict:
    """
    Returns a complete ProcessingParams dict. Output is deterministic for the same
    (genre, platform) pair. Always returns all fields — no optional keys.
    """
    params = BASE_PARAMS.copy()
    preset = GENRE_PRESETS.get(genre or "default", GENRE_PRESETS["default"])
    params.update(preset)
    params["target_lufs"] = PLATFORM_LUFS.get(platform, -14.0)
    params["true_peak_ceiling"] = -3.0 if vinyl else -1.0
    params["vinyl_mode"] = vinyl
    return params
