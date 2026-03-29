from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from uuid import UUID
import jwt
import structlog
from app.core.security import decode_token
from app.core.database import get_db

logger = structlog.get_logger()
bearer_scheme = HTTPBearer()


class CurrentUser:
    def __init__(self, user_id: UUID, tier: str, is_admin: bool = False) -> None:
        self.user_id = user_id
        self.tier = tier
        self.is_admin = is_admin


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> CurrentUser:
    try:
        payload = decode_token(credentials.credentials)
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, detail={"code": "RAIN-E100", "message": "Token expired"})
    except jwt.PyJWTError:
        raise HTTPException(401, detail={"code": "RAIN-E100", "message": "Invalid token"})

    user_id = UUID(payload["sub"])
    tier = payload.get("tier", "free")
    return CurrentUser(user_id=user_id, tier=tier)


def require_tier(*allowed_tiers: str):
    """Decorator factory for tier-gated endpoints."""
    async def check_tier(current_user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
        if current_user.tier not in allowed_tiers and not current_user.is_admin:
            raise HTTPException(403, detail={
                "code": "RAIN-E101",
                "message": f"This feature requires one of: {', '.join(allowed_tiers)}"
            })
        return current_user
    return check_tier


TIER_RANK: dict[str, int] = {
    "free": 0, "spark": 1, "creator": 2,
    "artist": 3, "studio_pro": 4, "enterprise": 5
}


def tier_gte(tier: str, minimum: str) -> bool:
    return TIER_RANK.get(tier, 0) >= TIER_RANK.get(minimum, 0)
