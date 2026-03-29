"""RAIN Score computation — weighted quality heuristic for the mastering output."""
from __future__ import annotations
import numpy as np
import structlog

logger = structlog.get_logger()

# Platform LUFS targets (must match heuristics.py)
PLATFORM_LUFS: dict[str, float] = {
    "spotify": -14.0,
    "apple_music": -16.0,
    "youtube": -14.0,
    "tidal": -14.0,
    "amazon": -14.0,
    "soundcloud": -14.0,
    "cd": -9.0,
    "vinyl": -12.0,
}


async def compute_rain_score(
    output_audio: bytes,
    platform: str,
    mel: np.ndarray,
) -> dict:
    """
    Compute RAIN Score from rendered output.
    Returns a dict with sub-scores and a composite score [0-100].
    All values are heuristic estimates — not perceptual ground truth.
    """
    try:
        import soundfile as sf
        import pyloudnorm as pyln
        import io

        audio, sr = sf.read(io.BytesIO(output_audio), dtype="float64", always_2d=True)
        meter = pyln.Meter(sr)
        integrated = meter.integrated_loudness(audio)
        target = PLATFORM_LUFS.get(platform, -14.0)

        # LUFS accuracy score (100 = perfect, -10 per 0.5 LU off)
        lufs_error = abs(integrated - target)
        lufs_score = max(0.0, 100.0 - lufs_error * 20.0)

        # Dynamic range proxy: crest factor from mel energy
        mel_energy = float(np.mean(mel))
        dynamic_score = min(100.0, max(0.0, (1.0 - mel_energy) * 100.0))

        # Stereo width proxy: correlation between channels
        if audio.shape[1] >= 2:
            corr = float(np.corrcoef(audio[:, 0], audio[:, 1])[0, 1])
            width_score = min(100.0, (1.0 - corr) * 50.0 + 50.0)
        else:
            width_score = 50.0

        composite = round(0.6 * lufs_score + 0.2 * dynamic_score + 0.2 * width_score, 1)

        return {
            "composite": composite,
            "lufs_accuracy": round(lufs_score, 1),
            "dynamic_range": round(dynamic_score, 1),
            "stereo_width": round(width_score, 1),
        }
    except Exception as e:
        logger.warning("rain_score_failed", error=str(e))
        return {"composite": 0.0, "lufs_accuracy": 0.0, "dynamic_range": 0.0, "stereo_width": 0.0}
