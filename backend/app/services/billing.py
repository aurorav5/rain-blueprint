"""
RAIN Billing Service — Stripe Integration

Handles subscription lifecycle: checkout, portal, webhook events, tier resolution.

Error codes:
  RAIN-E700: Stripe webhook verification failed
  RAIN-E701: Render quota exceeded
  RAIN-E702: Download quota exceeded
  RAIN-E703: Tier downgrade blocks active features
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import UUID

import stripe
import structlog
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.subscription import Subscription
from app.models.quota import QuotaUsage
from app.models.enums import SubscriptionStatus

logger = structlog.get_logger()

# Tier → Stripe Price ID mapping
TIER_PRICE_MAP: dict[str, str] = {
    "spark": settings.STRIPE_PRICE_SPARK_MONTHLY,
    "creator": settings.STRIPE_PRICE_CREATOR_MONTHLY,
    "artist": settings.STRIPE_PRICE_ARTIST_MONTHLY,
    "studio_pro": settings.STRIPE_PRICE_STUDIO_PRO_MONTHLY,
}

# Reverse: Price ID → tier
PRICE_TIER_MAP: dict[str, str] = {v: k for k, v in TIER_PRICE_MAP.items() if v}

# Tier download limits per month
TIER_DOWNLOAD_LIMITS: dict[str, int] = {
    "free": 0,
    "spark": 50,
    "creator": 10,
    "artist": 25,
    "studio_pro": 75,
    "enterprise": 999999,
}

# Tier render limits per month
TIER_RENDER_LIMITS: dict[str, int] = {
    "free": 999999,  # Free can render (WASM), just can't download
    "spark": 50,
    "creator": 10,
    "artist": 25,
    "studio_pro": 75,
    "enterprise": 999999,
}


class BillingService:
    """Stripe billing operations — checkout, portal, webhook routing, tier queries."""

    def __init__(self) -> None:
        stripe.api_key = settings.STRIPE_SECRET_KEY

    async def get_current_tier(self, user_id: UUID, db: AsyncSession) -> str:
        """Get the user's current subscription tier. Returns 'free' if no active sub."""
        result = await db.execute(
            select(Subscription)
            .where(Subscription.user_id == user_id, Subscription.status == "active")
            .order_by(Subscription.current_period_end.desc())
        )
        sub = result.scalar_one_or_none()
        return sub.tier if sub else "free"

    async def create_checkout_session(
        self,
        user_id: UUID,
        user_email: str,
        tier: str,
        *,
        session_id: str | None = None,
    ) -> str:
        """Create a Stripe Checkout session for subscription.

        Returns the checkout session URL.
        """
        price_id = TIER_PRICE_MAP.get(tier)
        if not price_id:
            logger.error(
                "billing_invalid_tier",
                error_code="RAIN-E703",
                user_id=str(user_id),
                session_id=session_id,
                stage="billing",
                detail=f"No Stripe price configured for tier '{tier}'",
            )
            raise ValueError(f"RAIN-E703: No Stripe price for tier '{tier}'")

        checkout_session = stripe.checkout.Session.create(
            mode="subscription",
            customer_email=user_email,
            line_items=[{"price": price_id, "quantity": 1}],
            success_url=f"{settings.FRONTEND_URL}/settings?billing=success",
            cancel_url=f"{settings.FRONTEND_URL}/settings?billing=cancel",
            metadata={
                "rain_user_id": str(user_id),
                "rain_tier": tier,
            },
        )

        logger.info(
            "checkout_session_created",
            user_id=str(user_id),
            session_id=session_id,
            stage="billing",
            tier=tier,
            checkout_id=checkout_session.id,
        )

        return checkout_session.url

    async def create_portal_session(
        self,
        user_id: UUID,
        db: AsyncSession,
    ) -> str:
        """Create a Stripe Customer Portal session for managing subscription.

        Returns the portal URL.
        """
        result = await db.execute(
            select(Subscription)
            .where(Subscription.user_id == user_id, Subscription.status == "active")
        )
        sub = result.scalar_one_or_none()
        if not sub or not sub.stripe_customer_id:
            raise ValueError("RAIN-E703: No active subscription found")

        portal_session = stripe.billing_portal.Session.create(
            customer=sub.stripe_customer_id,
            return_url=f"{settings.FRONTEND_URL}/settings",
        )
        return portal_session.url

    async def handle_webhook_event(
        self,
        payload: bytes,
        sig_header: str,
        db: AsyncSession,
    ) -> dict[str, Any]:
        """Verify and route a Stripe webhook event.

        Returns a dict with event type and outcome for logging.
        """
        try:
            event = stripe.Webhook.construct_event(
                payload, sig_header, settings.STRIPE_WEBHOOK_SECRET
            )
        except stripe.error.SignatureVerificationError as exc:
            logger.error(
                "stripe_webhook_verification_failed",
                error_code="RAIN-E700",
                stage="billing",
                detail=str(exc),
            )
            raise ValueError("RAIN-E700: Webhook signature verification failed") from exc

        event_type = event["type"]
        data = event["data"]["object"]

        logger.info(
            "stripe_webhook_received",
            stage="billing",
            event_type=event_type,
            event_id=event["id"],
        )

        if event_type == "checkout.session.completed":
            await self._handle_checkout_completed(data, db)
        elif event_type == "customer.subscription.updated":
            await self._handle_subscription_updated(data, db)
        elif event_type == "customer.subscription.deleted":
            await self._handle_subscription_deleted(data, db)
        elif event_type == "invoice.payment_failed":
            await self._handle_payment_failed(data, db)

        return {"event_type": event_type, "handled": True}

    async def _handle_checkout_completed(
        self, data: dict[str, Any], db: AsyncSession
    ) -> None:
        """Activate subscription after successful checkout."""
        metadata = data.get("metadata", {})
        user_id = metadata.get("rain_user_id")
        tier = metadata.get("rain_tier")

        if not user_id or not tier:
            logger.warning(
                "checkout_missing_metadata",
                stage="billing",
                detail="checkout.session.completed missing rain_user_id or rain_tier",
            )
            return

        stripe_sub_id = data.get("subscription")
        stripe_customer_id = data.get("customer")

        # Fetch Stripe subscription for period dates
        stripe_sub = stripe.Subscription.retrieve(stripe_sub_id)

        sub = Subscription(
            user_id=UUID(user_id),
            tier=tier,
            status="active",
            stripe_subscription_id=stripe_sub_id,
            stripe_customer_id=stripe_customer_id,
            current_period_start=datetime.fromtimestamp(
                stripe_sub.current_period_start, tz=timezone.utc
            ),
            current_period_end=datetime.fromtimestamp(
                stripe_sub.current_period_end, tz=timezone.utc
            ),
        )
        db.add(sub)
        await db.commit()

        logger.info(
            "subscription_activated",
            user_id=user_id,
            stage="billing",
            tier=tier,
            stripe_subscription_id=stripe_sub_id,
        )

    async def _handle_subscription_updated(
        self, data: dict[str, Any], db: AsyncSession
    ) -> None:
        """Handle subscription changes (upgrade, downgrade, renewal)."""
        stripe_sub_id = data.get("id")

        result = await db.execute(
            select(Subscription).where(
                Subscription.stripe_subscription_id == stripe_sub_id
            )
        )
        sub = result.scalar_one_or_none()
        if not sub:
            logger.warning(
                "subscription_update_not_found",
                stage="billing",
                stripe_subscription_id=stripe_sub_id,
            )
            return

        # Update period dates
        sub.current_period_start = datetime.fromtimestamp(
            data["current_period_start"], tz=timezone.utc
        )
        sub.current_period_end = datetime.fromtimestamp(
            data["current_period_end"], tz=timezone.utc
        )
        sub.status = data.get("status", sub.status)

        # Detect tier change from price
        items = data.get("items", {}).get("data", [])
        if items:
            price_id = items[0].get("price", {}).get("id", "")
            new_tier = PRICE_TIER_MAP.get(price_id)
            if new_tier and new_tier != sub.tier:
                logger.info(
                    "subscription_tier_changed",
                    user_id=str(sub.user_id),
                    stage="billing",
                    old_tier=sub.tier,
                    new_tier=new_tier,
                )
                sub.tier = new_tier

        await db.commit()

    async def _handle_subscription_deleted(
        self, data: dict[str, Any], db: AsyncSession
    ) -> None:
        """Handle subscription cancellation — revert to free tier."""
        stripe_sub_id = data.get("id")

        result = await db.execute(
            select(Subscription).where(
                Subscription.stripe_subscription_id == stripe_sub_id
            )
        )
        sub = result.scalar_one_or_none()
        if sub:
            sub.status = "canceled"
            await db.commit()
            logger.info(
                "subscription_canceled",
                user_id=str(sub.user_id),
                stage="billing",
                tier=sub.tier,
            )

    async def _handle_payment_failed(
        self, data: dict[str, Any], db: AsyncSession
    ) -> None:
        """Handle failed payment — log but don't immediately cancel."""
        sub_id = data.get("subscription")
        customer_id = data.get("customer")
        logger.warning(
            "payment_failed",
            stage="billing",
            stripe_subscription_id=sub_id,
            stripe_customer_id=customer_id,
            detail="Invoice payment failed. Stripe will retry automatically.",
        )

    async def check_render_quota(
        self, user_id: UUID, tier: str, db: AsyncSession
    ) -> bool:
        """Check if user has remaining render quota for the current period.

        Returns True if allowed, raises ValueError with RAIN-E701 if exceeded.
        """
        limit = TIER_RENDER_LIMITS.get(tier, 0)
        result = await db.execute(
            select(QuotaUsage).where(
                QuotaUsage.user_id == user_id,
                QuotaUsage.quota_type == "render",
            )
        )
        usage = result.scalar_one_or_none()
        current = usage.count if usage else 0

        if current >= limit:
            logger.warning(
                "render_quota_exceeded",
                error_code="RAIN-E701",
                user_id=str(user_id),
                stage="billing",
                current=current,
                limit=limit,
                tier=tier,
            )
            raise ValueError(f"RAIN-E701: Render quota exceeded ({current}/{limit})")

        return True

    async def check_download_quota(
        self, user_id: UUID, tier: str, db: AsyncSession
    ) -> bool:
        """Check if user has remaining download quota.

        Returns True if allowed, raises ValueError with RAIN-E702 if exceeded.
        """
        limit = TIER_DOWNLOAD_LIMITS.get(tier, 0)
        if tier == "free":
            raise ValueError("RAIN-E702: Free tier does not support downloads")

        result = await db.execute(
            select(QuotaUsage).where(
                QuotaUsage.user_id == user_id,
                QuotaUsage.quota_type == "download",
            )
        )
        usage = result.scalar_one_or_none()
        current = usage.count if usage else 0

        if current >= limit:
            logger.warning(
                "download_quota_exceeded",
                error_code="RAIN-E702",
                user_id=str(user_id),
                stage="billing",
                current=current,
                limit=limit,
                tier=tier,
            )
            raise ValueError(f"RAIN-E702: Download quota exceeded ({current}/{limit})")

        return True

    async def increment_usage(
        self, user_id: UUID, quota_type: str, db: AsyncSession
    ) -> None:
        """Increment render or download usage counter. Idempotent per CLAUDE.md."""
        result = await db.execute(
            select(QuotaUsage).where(
                QuotaUsage.user_id == user_id,
                QuotaUsage.quota_type == quota_type,
            )
        )
        usage = result.scalar_one_or_none()
        if usage:
            usage.count += 1
        else:
            db.add(QuotaUsage(user_id=user_id, quota_type=quota_type, count=1))
        await db.commit()


billing_service = BillingService()
