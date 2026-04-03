"""ISRC and UPC identifier generation per ISO 3901 and EAN-13.

Identifiers are deterministic: same (session_id, user_id) → same ISRC/UPC.
Uses SHA-256 hash derivation instead of random.choices per CLAUDE.md execution discipline.
"""
from __future__ import annotations
import hashlib
from datetime import datetime
import structlog

logger = structlog.get_logger()
from app.core.config import settings


def generate_isrc(country: str = "ZA", *, session_id: str = "", user_id: str = "") -> str:
    """
    Generate ISRC per ISO 3901.
    Format: CC-XXX-YY-NNNNN (without hyphens in final form)
    CC = country code (2 alpha), XXX = registrant code (3 alphanumeric),
    YY = 2-digit year, NNNNN = designation code (5 digits)

    Deterministic: same (session_id, user_id) → same designation code.
    """
    registrant = (settings.ISRC_REGISTRANT_CODE or "ARC")[:3].upper()
    year = datetime.now().year % 100
    # Derive designation from session data — deterministic, not random
    seed = f"isrc:{session_id}:{user_id}:{year}"
    digest = hashlib.sha256(seed.encode()).hexdigest()
    designation = str(int(digest[:10], 16) % 100000).zfill(5)
    return f"{country}{registrant}{year:02d}{designation}"


def generate_upc(*, session_id: str = "", user_id: str = "") -> str:
    """
    Generate UPC/EAN-13.
    Uses GS1 prefix (6 digits) + item number (6 digits) + EAN-13 check digit.

    Deterministic: same (session_id, user_id) → same UPC.
    """
    prefix = (settings.UPC_GS1_PREFIX or "000000")[:6]
    seed = f"upc:{session_id}:{user_id}"
    digest = hashlib.sha256(seed.encode()).hexdigest()
    item = str(int(digest[:12], 16) % 1000000).zfill(6)
    base = prefix + item  # 12 digits
    check = _ean13_check_digit(base)
    return base + str(check)


def _ean13_check_digit(digits: str) -> int:
    """Compute EAN-13 check digit from 12-digit base."""
    total = sum(
        int(d) * (1 if i % 2 == 0 else 3)
        for i, d in enumerate(digits)
    )
    return (10 - total % 10) % 10
