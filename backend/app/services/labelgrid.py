"""LabelGrid distribution API client with retry/backoff."""
from __future__ import annotations
import asyncio
import httpx
import structlog
from app.core.config import settings

logger = structlog.get_logger()

_RETRY_DELAYS = [1, 2, 4]


async def submit_release(
    release_data: dict,
    ddex_xml: str,
    audio_s3_key: str,
) -> dict:
    """
    Submit a release to LabelGrid for distribution.
    Retries 3 times with exponential backoff.
    Raises RuntimeError with RAIN-E600 code on all retries exhausted.
    """
    if not settings.LABELGRID_API_KEY:
        return {"status": "skipped", "reason": "no_api_key"}

    headers = {"Authorization": f"Bearer {settings.LABELGRID_API_KEY}"}
    payload = {
        "metadata": release_data,
        "ddex_xml": ddex_xml,
        "audio_reference": audio_s3_key,
        "sandbox": settings.LABELGRID_SANDBOX,
    }

    for attempt, delay in enumerate(_RETRY_DELAYS):
        try:
            async with httpx.AsyncClient(timeout=60) as client:
                resp = await client.post(
                    f"{settings.LABELGRID_API_BASE}/releases",
                    headers=headers,
                    json=payload,
                )
                resp.raise_for_status()
                return resp.json()
        except Exception as e:
            logger.warning(
                "labelgrid_retry",
                attempt=attempt + 1,
                error=str(e),
                error_code="RAIN-E600",
            )
            if attempt < len(_RETRY_DELAYS) - 1:
                await asyncio.sleep(delay)

    raise RuntimeError("RAIN-E600: LabelGrid submission failed after 3 attempts")


async def get_release_status(labelgrid_release_id: str) -> dict:
    """Fetch release status from LabelGrid."""
    if not settings.LABELGRID_API_KEY:
        return {"status": "skipped", "reason": "no_api_key"}

    headers = {"Authorization": f"Bearer {settings.LABELGRID_API_KEY}"}
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(
            f"{settings.LABELGRID_API_BASE}/releases/{labelgrid_release_id}",
            headers=headers,
        )
        resp.raise_for_status()
        return resp.json()
