from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.core.security import hash_password, verify_password, create_access_token, create_refresh_token
from app.models.user import User
from app.models.subscription import Subscription
from app.schemas.auth import RegisterRequest, LoginRequest, TokenResponse, RefreshRequest
from datetime import datetime, timezone, timedelta
import uuid

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=TokenResponse, status_code=201)
async def register(req: RegisterRequest, db: AsyncSession = Depends(get_db)) -> TokenResponse:
    existing = await db.execute(select(User).where(User.email == req.email))
    if existing.scalar_one_or_none():
        raise HTTPException(409, detail={"code": "RAIN-E100", "message": "Email already registered"})

    user = User(
        id=uuid.uuid4(),
        email=req.email,
        password_hash=hash_password(req.password),
    )
    db.add(user)

    now = datetime.now(timezone.utc)
    sub = Subscription(
        user_id=user.id,
        tier="free",
        status="active",
        current_period_start=now,
        current_period_end=now + timedelta(days=36500),
    )
    db.add(sub)
    await db.commit()

    return TokenResponse(
        access_token=create_access_token(user.id, "free"),
        refresh_token=create_refresh_token(user.id),
        tier="free",
        user_id=user.id,
    )


@router.post("/login", response_model=TokenResponse)
async def login(req: LoginRequest, db: AsyncSession = Depends(get_db)) -> TokenResponse:
    result = await db.execute(select(User).where(User.email == req.email))
    user = result.scalar_one_or_none()
    if not user or not user.password_hash or not verify_password(req.password, user.password_hash):
        raise HTTPException(401, detail={"code": "RAIN-E100", "message": "Invalid credentials"})
    if not user.is_active:
        raise HTTPException(403, detail={"code": "RAIN-E100", "message": "Account deactivated"})

    sub_result = await db.execute(
        select(Subscription)
        .where(Subscription.user_id == user.id, Subscription.status == "active")
        .order_by(Subscription.current_period_end.desc())
    )
    sub = sub_result.scalar_one_or_none()
    tier = sub.tier if sub else "free"

    user.last_login_at = datetime.now(timezone.utc)
    await db.commit()

    return TokenResponse(
        access_token=create_access_token(user.id, tier),
        refresh_token=create_refresh_token(user.id),
        tier=tier,
        user_id=user.id,
    )
