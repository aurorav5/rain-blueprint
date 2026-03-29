from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.subscription import Subscription
from uuid import UUID


async def get_current_tier(user_id: UUID, db: AsyncSession) -> str:
    result = await db.execute(
        select(Subscription)
        .where(Subscription.user_id == user_id, Subscription.status == "active")
        .order_by(Subscription.current_period_end.desc())
    )
    sub = result.scalar_one_or_none()
    return sub.tier if sub else "free"
