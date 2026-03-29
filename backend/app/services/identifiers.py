"""ISRC and UPC identifier generation per ISO 3901 and EAN-13."""
from __future__ import annotations
import random
import string
from datetime import datetime
import structlog

logger = structlog.get_logger()
from app.core.config import settings


def generate_isrc(country: str = "ZA") -> str:
    """
    Generate ISRC per ISO 3901.
    Format: CC-XXX-YY-NNNNN (without hyphens in final form)
    CC = country code (2 alpha), XXX = registrant code (3 alphanumeric),
    YY = 2-digit year, NNNNN = designation code (5 digits)
    """
    registrant = (settings.ISRC_REGISTRANT_CODE or "ARC")[:3].upper()
    year = datetime.now().year % 100
    designation = "".join(random.choices(string.digits, k=5))
    return f"{country}{registrant}{year:02d}{designation}"


def generate_upc() -> str:
    """
    Generate UPC/EAN-13.
    Uses GS1 prefix (6 digits) + item number (6 digits) + EAN-13 check digit.
    """
    prefix = (settings.UPC_GS1_PREFIX or "000000")[:6]
    item = "".join(random.choices(string.digits, k=6))
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
