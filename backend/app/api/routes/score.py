"""Public RAIN Score API — no authentication required, rate-limited by IP."""
from __future__ import annotations
from fastapi import APIRouter, UploadFile, File, HTTPException, Request
from collections import defaultdict
from datetime import datetime, timezone
import time
import structlog

logger = structlog.get_logger()
router = APIRouter(prefix="/score", tags=["score"])

# Simple in-memory rate limiter: 10 requests per hour per IP
_rate_limit: dict[str, list[float]] = defaultdict(list)
_RATE_WINDOW = 3600  # 1 hour in seconds
_RATE_MAX = 10


def _check_rate_limit(ip: str) -> None:
    """Raise 429 if IP has exceeded 10 requests/hour."""
    now = time.time()
    _rate_limit[ip] = [t for t in _rate_limit[ip] if now - t < _RATE_WINDOW]
    if len(_rate_limit[ip]) >= _RATE_MAX:
        raise HTTPException(
            429,
            detail={"code": "RAIN-E503", "message": "Rate limit: 10 scores per hour per IP"},
        )
    _rate_limit[ip].append(now)


@router.post("/")
async def public_rain_score(
    request: Request,
    file: UploadFile = File(...),
    platform: str = "spotify",
) -> dict:
    """
    Public RAIN Score endpoint. No authentication required.
    Rate limit: 10 requests per hour per IP.
    Accepts: WAV, FLAC, MP3 (max 20 MB for public endpoint).
    """
    client_ip = request.client.host if request.client else "unknown"
    _check_rate_limit(client_ip)

    data = await file.read()
    if len(data) > 20 * 1024 * 1024:
        raise HTTPException(413, detail={"code": "RAIN-E201", "message": "File exceeds 20 MB public limit"})

    try:
        from app.services.rain_score import compute_rain_score
        from app.services.audio_analysis import extract_mel_spectrogram
        mel, duration, sr = extract_mel_spectrogram(data)
        score = await compute_rain_score(data, platform, mel)
        return {
            "score": score,
            "platform": platform,
            "duration_seconds": round(duration, 1),
            "computed_at": datetime.now(timezone.utc).isoformat(),
        }
    except Exception as e:
        logger.error("public_score_failed", error=str(e), ip=client_ip)
        raise HTTPException(500, detail={"code": "RAIN-E300", "message": "Score computation failed"})
