from fastapi import APIRouter, Request, Header, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import AsyncSessionLocal
from app.models.subscription import Subscription
from app.core.config import settings
from datetime import datetime, timezone
import stripe
import structlog

logger = structlog.get_logger()
stripe.api_key = settings.STRIPE_SECRET_KEY
router = APIRouter(prefix="/billing", tags=["billing"])

STRIPE_TIER_MAP: dict[str, str] = {
    settings.STRIPE_PRICE_SPARK_MONTHLY: "spark",
    settings.STRIPE_PRICE_CREATOR_MONTHLY: "creator",
    settings.STRIPE_PRICE_ARTIST_MONTHLY: "artist",
    settings.STRIPE_PRICE_STUDIO_PRO_MONTHLY: "studio_pro",
}


@router.post("/webhook")
async def stripe_webhook(
    request: Request,
    stripe_signature: str = Header(None, alias="stripe-signature"),
) -> dict:
    payload = await request.body()
    try:
        event = stripe.Webhook.construct_event(
            payload, stripe_signature, settings.STRIPE_WEBHOOK_SECRET
        )
    except stripe.error.SignatureVerificationError:
        raise HTTPException(400, detail={"code": "RAIN-E700", "message": "Signature verification failed"})

    logger.info("stripe_webhook", event_type=event["type"])

    async with AsyncSessionLocal() as db:
        match event["type"]:
            case "customer.subscription.created" | "customer.subscription.updated":
                await _handle_subscription_update(event["data"]["object"], db)
            case "customer.subscription.deleted":
                await _handle_subscription_deleted(event["data"]["object"], db)
            case "invoice.payment_failed":
                await _handle_payment_failed(event["data"]["object"], db)
            case _:
                pass

    return {"received": True}


async def _handle_subscription_update(sub_obj: dict, db: AsyncSession) -> None:
    customer_id: str = sub_obj["customer"]
    price_id: str = sub_obj["items"]["data"][0]["price"]["id"]
    tier = STRIPE_TIER_MAP.get(price_id, "spark")

    result = await db.execute(
        select(Subscription).where(Subscription.stripe_customer_id == customer_id)
    )
    sub = result.scalar_one_or_none()
    if sub:
        sub.tier = tier
        sub.status = sub_obj["status"]
        sub.stripe_subscription_id = sub_obj["id"]
        sub.current_period_end = datetime.fromtimestamp(
            sub_obj["current_period_end"], tz=timezone.utc
        )
        await db.commit()
        logger.info("subscription_updated", customer=customer_id, tier=tier)


async def _handle_subscription_deleted(sub_obj: dict, db: AsyncSession) -> None:
    result = await db.execute(
        select(Subscription).where(Subscription.stripe_subscription_id == sub_obj["id"])
    )
    sub = result.scalar_one_or_none()
    if sub:
        sub.status = "canceled"
        sub.tier = "free"
        await db.commit()
        logger.info("subscription_canceled", sub_id=sub_obj["id"])


async def _handle_payment_failed(invoice_obj: dict, db: AsyncSession) -> None:
    result = await db.execute(
        select(Subscription).where(Subscription.stripe_customer_id == invoice_obj["customer"])
    )
    sub = result.scalar_one_or_none()
    if sub:
        sub.status = "past_due"
        await db.commit()
        logger.warning("payment_failed", customer=invoice_obj["customer"])
