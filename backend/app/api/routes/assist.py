"""
RAIN AI Assist Routes — Claude-powered mastering suggestions and reports.

Tier gate: Creator tier and above.
  - Creator: 10 Claude calls/month
  - Artist: 20 Claude calls/month
  - Studio Pro: 50 Claude calls/month
  - Enterprise: unlimited

Error codes:
  RAIN-E101: Insufficient tier (below Creator)
  RAIN-E900: Claude API auth failure
  RAIN-E901: Claude API timeout / network error
  RAIN-E902: Claude response parse failure
"""

from __future__ import annotations

from typing import Any, Dict, List
from uuid import UUID

import structlog
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.services.claude_service import claude_service

logger = structlog.get_logger()

router = APIRouter(prefix="/assist", tags=["AI Assist"])

# Claude usage limits per tier per month
TIER_CLAUDE_LIMITS: dict[str, int] = {
    "free": 0,
    "spark": 0,
    "creator": 10,
    "artist": 20,
    "studio_pro": 50,
    "enterprise": 999999,
}

# Tiers that have access
ALLOWED_TIERS = frozenset({"creator", "artist", "studio_pro", "enterprise"})


# ---------------------------------------------------------------------------
# Request / Response schemas
# ---------------------------------------------------------------------------

class SuggestRequest(BaseModel):
    """Request body for POST /assist/suggest."""
    features: Dict[str, Any] = Field(..., description="Audio feature vector from analysis")
    current_macros: Dict[str, float] = Field(
        ..., description="Current macro values (BRIGHTEN, GLUE, WIDTH, PUNCH, WARMTH, SPACE, REPAIR)"
    )
    genre: Dict[str, float] = Field(default_factory=dict, description="Genre classification probabilities")
    style: str = Field(default="default", description="User-selected style preset")
    platform_targets: List[str] = Field(default_factory=lambda: ["spotify"], description="Target platform slugs")
    user_query: str = Field(..., min_length=1, max_length=2000, description="Natural language request")
    conversation_history: List[Dict[str, str]] = Field(
        default_factory=list,
        description="Prior messages for multi-turn context [{role, content}]",
    )
    session_id: str | None = Field(default=None, description="Session ID for logging")
    tier: str = Field(default="free", description="User's current subscription tier")


class SuggestResponse(BaseModel):
    macros: Dict[str, float]
    explanation: str
    confidence: float


class ReportRequest(BaseModel):
    """Request body for POST /assist/report."""
    before_features: Dict[str, Any] = Field(..., description="Feature vector before mastering")
    after_features: Dict[str, Any] = Field(..., description="Feature vector after mastering")
    applied_macros: Dict[str, float] = Field(..., description="Macro values that were applied")
    qc_results: List[Dict[str, Any]] = Field(default_factory=list, description="QC check results")
    session_id: str | None = Field(default=None, description="Session ID for logging")
    tier: str = Field(default="free", description="User's current subscription tier")


class ReportResponse(BaseModel):
    report: str


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.post("/suggest", response_model=SuggestResponse)
async def suggest_macros(req: SuggestRequest) -> SuggestResponse:
    """Get AI macro suggestions from Claude based on audio analysis and user intent.

    Tier gate: Creator+ only. Returns structured macro adjustments with
    explanation and confidence score.
    """
    # Tier gate
    if req.tier not in ALLOWED_TIERS:
        logger.warning(
            "assist_tier_blocked",
            error_code="RAIN-E101",
            session_id=req.session_id,
            stage="claude_inference",
            tier=req.tier,
        )
        raise HTTPException(
            status_code=403,
            detail={
                "error_code": "RAIN-E101",
                "message": f"AI Assist requires Creator tier or above (current: {req.tier})",
            },
        )

    try:
        result = await claude_service.analyze_and_suggest(
            features=req.features,
            current_macros=req.current_macros,
            genre=req.genre,
            style=req.style,
            platform_targets=req.platform_targets,
            user_query=req.user_query,
            session_id=req.session_id,
        )
    except Exception as exc:
        error_msg = str(exc)
        if "RAIN-E900" in error_msg:
            raise HTTPException(status_code=503, detail={"error_code": "RAIN-E900", "message": error_msg})
        if "RAIN-E902" in error_msg:
            raise HTTPException(status_code=502, detail={"error_code": "RAIN-E902", "message": error_msg})
        # RAIN-E901 or unknown
        raise HTTPException(status_code=502, detail={"error_code": "RAIN-E901", "message": error_msg})

    return SuggestResponse(
        macros=result["macros"],
        explanation=result["explanation"],
        confidence=result["confidence"],
    )


@router.post("/report", response_model=ReportResponse)
async def generate_report(req: ReportRequest) -> ReportResponse:
    """Generate a before/after mastering report via Claude.

    Tier gate: Creator+ only.
    """
    if req.tier not in ALLOWED_TIERS:
        raise HTTPException(
            status_code=403,
            detail={
                "error_code": "RAIN-E101",
                "message": f"AI reports require Creator tier or above (current: {req.tier})",
            },
        )

    try:
        report = await claude_service.generate_before_after_report(
            before_features=req.before_features,
            after_features=req.after_features,
            applied_macros=req.applied_macros,
            qc_results=req.qc_results,
            session_id=req.session_id,
        )
    except Exception as exc:
        error_msg = str(exc)
        if "RAIN-E900" in error_msg:
            raise HTTPException(status_code=503, detail={"error_code": "RAIN-E900", "message": error_msg})
        raise HTTPException(status_code=502, detail={"error_code": "RAIN-E901", "message": error_msg})

    return ReportResponse(report=report)
