import jwt
import hashlib
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional
from uuid import UUID
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.backends import default_backend
from app.core.config import settings


def _load_private_key():
    path = Path(settings.JWT_PRIVATE_KEY_PATH)
    return serialization.load_pem_private_key(
        path.read_bytes(),
        password=None,
        backend=default_backend()
    )


def _load_public_key():
    path = Path(settings.JWT_PUBLIC_KEY_PATH)
    return serialization.load_pem_public_key(
        path.read_bytes(),
        backend=default_backend()
    )


def create_access_token(user_id: UUID, tier: str, expires_minutes: int = 60) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=expires_minutes)
    payload = {
        "sub": str(user_id),
        "tier": tier,
        "exp": expire,
        "iat": datetime.now(timezone.utc),
        "iss": "rain.arcovel.com",
    }
    private_key = _load_private_key()
    return jwt.encode(payload, private_key, algorithm="RS256")


def create_refresh_token(user_id: UUID) -> str:
    expire = datetime.now(timezone.utc) + timedelta(days=30)
    payload = {
        "sub": str(user_id),
        "type": "refresh",
        "exp": expire,
        "iat": datetime.now(timezone.utc),
    }
    private_key = _load_private_key()
    return jwt.encode(payload, private_key, algorithm="RS256")


def decode_token(token: str) -> dict:
    """Raises jwt.PyJWTError on invalid token. Caller handles RAIN-E100."""
    public_key = _load_public_key()
    return jwt.decode(
        token,
        public_key,
        algorithms=["RS256"],
        options={"require": ["exp", "iat", "sub"]}
    )


def hash_password(password: str) -> str:
    import bcrypt
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, hashed: str) -> bool:
    import bcrypt
    return bcrypt.checkpw(password.encode(), hashed.encode())


def hash_file(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()
