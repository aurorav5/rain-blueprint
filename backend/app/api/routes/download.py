from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from uuid import UUID
from app.core.database import get_db
from app.api.dependencies import get_current_user, CurrentUser
from app.models.session import Session as MasteringSession
from app.services.storage import generate_presigned_url
from app.services.quota import check_and_increment_downloads

router = APIRouter(prefix="/download", tags=["download"])


@router.get("/{session_id}")
async def download_session(
    session_id: UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    # Quota check first
    await check_and_increment_downloads(current_user.user_id, current_user.tier, db)

    result = await db.execute(
        select(MasteringSession).where(
            MasteringSession.id == session_id,
            MasteringSession.user_id == current_user.user_id,  # RLS enforced
        )
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(404, detail={"code": "RAIN-E100", "message": "Session not found"})
    if session.status != "complete":
        raise HTTPException(409, detail={"code": "RAIN-E100", "message": "Session not complete"})
    if not session.output_file_key:
        raise HTTPException(404, detail={"code": "RAIN-E100", "message": "No output file available"})

    url = generate_presigned_url(session.output_file_key)
    return {"url": url, "expires_in": 3600}
