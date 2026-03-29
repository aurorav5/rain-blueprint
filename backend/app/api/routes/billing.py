from fastapi import APIRouter, Request, Header, HTTPException
import stripe
import structlog
from app.core.config import settings

router = APIRouter(prefix="/billing", tags=["billing"])
stripe.api_key = settings.STRIPE_SECRET_KEY


@router.post("/webhook")
async def stripe_webhook(
    request: Request,
    stripe_signature: str = Header(None, alias="stripe-signature"),
) -> dict:
    """Stripe webhook handler stub. Full implementation in PART-6."""
    if not settings.STRIPE_WEBHOOK_SECRET:
        raise HTTPException(503, detail={"code": "RAIN-E700", "message": "Webhook not configured"})
    payload = await request.body()
    try:
        event = stripe.Webhook.construct_event(
            payload, stripe_signature, settings.STRIPE_WEBHOOK_SECRET
        )
    except stripe.error.SignatureVerificationError:
        raise HTTPException(400, detail={"code": "RAIN-E700", "message": "Webhook verification failed"})

    structlog.get_logger().info("stripe_webhook_received", type=event["type"])
    return {"received": True}
