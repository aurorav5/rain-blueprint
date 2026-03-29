# RAIN — PART-3: Backend Core
## FastAPI, Auth, Tier Gates, Storage, Worker

**Blueprint ref:** RAIN-BLUEPRINT-v1.0 / PART-3  
**Depends on:** PART-1 (schema, Docker)  
**Gates next:** PART-5 (Frontend) and PART-6 (Pipeline) — requires auth + upload working

---

## Entry Checklist (confirm before starting)
- [ ] JWT algorithm: RS256 (not HS256) — asymmetric keys from env vars
- [ ] Every DB query on user data: `WHERE user_id = $user_id` — no exceptions
- [ ] RLS enabled on ALL tables with user data
- [ ] Free tier: session created but NO S3 key, no file persistence
- [ ] Paid tiers: S3 prefix `users/{user_id}/{session_id}/{file_hash}.{ext}`
- [ ] Error codes: RAIN-E* only — never raw exception messages or stack traces to client
- [ ] Cross-tenant access returns 404 (not 403) to prevent enumeration
- [ ] CLAUDE.md §Execution Discipline: no fake data, structured logging on all critical paths
- [ ] Sub-Phase Protocol: HALT → BUILD → TEST → REPORT → WAIT after each task

---

## Objective

Build the complete backend API core: authentication (JWT RS256), user management, tier
enforcement middleware, file upload/download with S3, the Celery worker scaffold, and all
foundation API routes. By the end of this part, a client can register, log in, upload a
file, have it stored on S3 (paid tier) or held in memory (free tier), and retrieve tier
status.

No ML inference here. No DSP. No billing webhooks yet. Pure API plumbing.

---

## Task 3.1 — Authentication Service

### `backend/app/core/security.py`
```python
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
```

### `backend/app/api/dependencies.py`
```python
from fastapi import Depends, HTTPException, Header
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional
from uuid import UUID
import jwt
import structlog
from app.core.security import decode_token
from app.core.database import get_db
from app.models.user import User
from app.services.billing import get_current_tier

logger = structlog.get_logger()
bearer_scheme = HTTPBearer()

class CurrentUser:
    def __init__(self, user_id: UUID, tier: str, is_admin: bool = False):
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
    async def check_tier(current_user: CurrentUser = Depends(get_current_user)):
        if current_user.tier not in allowed_tiers and not current_user.is_admin:
            raise HTTPException(403, detail={
                "code": "RAIN-E101",
                "message": f"This feature requires one of: {', '.join(allowed_tiers)}"
            })
        return current_user
    return check_tier

# Tier ordering for comparison
TIER_RANK = {"free": 0, "spark": 1, "creator": 2, "artist": 3, "studio_pro": 4, "enterprise": 5}

def tier_gte(tier: str, minimum: str) -> bool:
    return TIER_RANK.get(tier, 0) >= TIER_RANK.get(minimum, 0)
```

---

## Task 3.2 — User Models

### `backend/app/models/user.py`
```python
from sqlalchemy import Column, String, Boolean, DateTime, UUID
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.sql import func
import uuid
from app.core.database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String, unique=True, nullable=False, index=True)
    email_verified = Column(Boolean, nullable=False, default=False)
    password_hash = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    last_login_at = Column(DateTime(timezone=True), nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    is_admin = Column(Boolean, nullable=False, default=False)
```

Create equivalent models for `Subscription`, `UsageQuota`, `Session`, `Stem` matching the
schema in PART-1. Each model includes a `set_rls_user_id` classmethod that calls
`set_app_user_id(user_id)` before any query.

---

## Task 3.3 — Schemas (Pydantic)

### `backend/app/schemas/auth.py`
```python
from pydantic import BaseModel, EmailStr, field_validator
from typing import Optional
from uuid import UUID

class RegisterRequest(BaseModel):
    email: EmailStr
    password: str

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    tier: str
    user_id: UUID

class RefreshRequest(BaseModel):
    refresh_token: str
```

### `backend/app/schemas/session.py`
```python
from pydantic import BaseModel
from typing import Optional, List
from uuid import UUID
from datetime import datetime

class SessionCreateRequest(BaseModel):
    target_platform: str = "spotify"
    simple_mode: bool = True
    genre: Optional[str] = None
    ai_generated: bool = False
    ai_source: Optional[str] = None  # "suno", "udio", "other"

class SessionResponse(BaseModel):
    id: UUID
    status: str
    tier_at_creation: str
    input_duration_ms: Optional[int]
    input_lufs: Optional[float]
    input_true_peak: Optional[float]
    output_lufs: Optional[float]
    output_true_peak: Optional[float]
    target_platform: str
    rain_score: Optional[dict]
    rain_cert_id: Optional[UUID]
    error_code: Optional[str]
    created_at: datetime
    completed_at: Optional[datetime]

    model_config = {"from_attributes": True}
```

---

## Task 3.4 — Auth Routes

### `backend/app/api/routes/auth.py`
```python
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
async def register(req: RegisterRequest, db: AsyncSession = Depends(get_db)):
    # Check existing
    existing = await db.execute(select(User).where(User.email == req.email))
    if existing.scalar_one_or_none():
        raise HTTPException(409, detail={"code": "RAIN-E100", "message": "Email already registered"})

    user = User(
        id=uuid.uuid4(),
        email=req.email,
        password_hash=hash_password(req.password),
    )
    db.add(user)

    # Create free subscription
    now = datetime.now(timezone.utc)
    sub = Subscription(
        user_id=user.id,
        tier="free",
        status="active",
        current_period_start=now,
        current_period_end=now + timedelta(days=36500),  # free = no expiry
    )
    db.add(sub)
    await db.commit()

    access_token = create_access_token(user.id, "free")
    refresh_token = create_refresh_token(user.id)
    return TokenResponse(access_token=access_token, refresh_token=refresh_token, tier="free", user_id=user.id)

@router.post("/login", response_model=TokenResponse)
async def login(req: LoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == req.email))
    user = result.scalar_one_or_none()
    if not user or not user.password_hash or not verify_password(req.password, user.password_hash):
        raise HTTPException(401, detail={"code": "RAIN-E100", "message": "Invalid credentials"})
    if not user.is_active:
        raise HTTPException(403, detail={"code": "RAIN-E100", "message": "Account deactivated"})

    # Get current tier from subscription
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
```

---

## Task 3.5 — Upload Service

### `backend/app/services/storage.py`
```python
import boto3
import hashlib
from botocore.exceptions import ClientError
from app.core.config import settings
import structlog

logger = structlog.get_logger()

_s3_client = None

def get_s3_client():
    global _s3_client
    if _s3_client is None:
        _s3_client = boto3.client(
            "s3",
            endpoint_url=settings.S3_ENDPOINT_URL,
            aws_access_key_id=settings.S3_ACCESS_KEY,
            aws_secret_access_key=settings.S3_SECRET_KEY,
        )
    return _s3_client

def s3_key(user_id: str, session_id: str, filename: str) -> str:
    """Canonical S3 key format. IMMUTABLE. Never deviate."""
    ext = filename.rsplit(".", 1)[-1] if "." in filename else "wav"
    file_hash = hashlib.sha256(filename.encode()).hexdigest()[:12]
    return f"users/{user_id}/{session_id}/{file_hash}.{ext}"

async def upload_to_s3(
    data: bytes,
    user_id: str,
    session_id: str,
    filename: str,
    content_type: str = "audio/wav",
) -> tuple[str, str]:
    """Upload file to S3. Returns (s3_key, sha256_hash)."""
    key = s3_key(user_id, session_id, filename)
    file_hash = hashlib.sha256(data).hexdigest()
    client = get_s3_client()
    try:
        client.put_object(
            Bucket=settings.S3_BUCKET,
            Key=key,
            Body=data,
            ContentType=content_type,
            Metadata={"sha256": file_hash, "user_id": user_id},
        )
        logger.info("s3_upload_success", key=key, size=len(data))
        return key, file_hash
    except ClientError as e:
        logger.error("s3_upload_failed", key=key, error=str(e))
        raise

def generate_presigned_url(key: str, expires_seconds: int = 3600) -> str:
    client = get_s3_client()
    return client.generate_presigned_url(
        "get_object",
        Params={"Bucket": settings.S3_BUCKET, "Key": key},
        ExpiresIn=expires_seconds,
    )
```

### `backend/app/api/routes/upload.py`
```python
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional
import uuid
from app.core.database import get_db
from app.api.dependencies import get_current_user, CurrentUser, tier_gte
from app.services.storage import upload_to_s3
from app.services.quota import check_and_increment_renders
from app.models.session import Session as MasteringSession
from app.schemas.session import SessionCreateRequest, SessionResponse
from app.core.config import settings
import hashlib, structlog

logger = structlog.get_logger()
router = APIRouter(prefix="/sessions", tags=["sessions"])

ACCEPTED_FORMATS = {".wav", ".flac", ".aiff", ".aif", ".mp3", ".m4a"}
MAX_FILE_SIZE_MB = 500

@router.post("/", response_model=SessionResponse, status_code=201)
async def create_session(
    params: SessionCreateRequest,
    file: UploadFile = File(...),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Validate format
    ext = "." + file.filename.rsplit(".", 1)[-1].lower() if file.filename else ""
    if ext not in ACCEPTED_FORMATS:
        raise HTTPException(422, detail={"code": "RAIN-E200", "message": f"Format {ext} not accepted"})

    # Read file
    data = await file.read()
    if len(data) > MAX_FILE_SIZE_MB * 1024 * 1024:
        raise HTTPException(413, detail={"code": "RAIN-E201", "message": f"File exceeds {MAX_FILE_SIZE_MB}MB limit"})

    file_hash = hashlib.sha256(data).hexdigest()
    session_id = uuid.uuid4()

    # Free tier: no S3 upload
    if current_user.tier == "free":
        s3_key_val = None
        # Free tier: file stays in memory for preview only
        # session persists with no file_key
    else:
        # Paid tier: upload to S3
        try:
            s3_key_val, _ = await upload_to_s3(
                data, str(current_user.user_id), str(session_id), file.filename or "upload.wav"
            )
        except Exception:
            raise HTTPException(503, detail={"code": "RAIN-E203", "message": "Storage write failed"})

    # Create session record
    # NOTE: Free tier sessions are created but have no file_key
    # They expire after the session ends and cannot be retrieved
    wasm_hash = (settings.WASM_BINARY_HASH if hasattr(settings, "WASM_BINARY_HASH") else "pending")

    session = MasteringSession(
        id=session_id,
        user_id=current_user.user_id,
        status="analyzing",
        tier_at_creation=current_user.tier,
        input_file_key=s3_key_val if current_user.tier != "free" else None,
        input_file_hash=file_hash,
        target_platform=params.target_platform,
        simple_mode=params.simple_mode,
        genre=params.genre,
        wasm_binary_hash=wasm_hash,
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)

    # Dispatch analysis job
    from app.worker import analyze_session
    analyze_session.delay(str(session_id), str(current_user.user_id))

    logger.info("session_created", session_id=str(session_id), tier=current_user.tier)
    return SessionResponse.model_validate(session)
```

---

## Task 3.6 — Quota Service

### `backend/app/services/quota.py`
```python
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from fastapi import HTTPException
from datetime import datetime, timezone
from uuid import UUID
from app.models.quota import UsageQuota
from app.models.subscription import Subscription

TIER_LIMITS = {
    "free":       {"renders": 0,   "downloads": 0,  "claude": 0},
    "spark":      {"renders": 50,  "downloads": 50, "claude": 0},
    "creator":    {"renders": 10,  "downloads": 10, "claude": 10},
    "artist":     {"renders": 25,  "downloads": 25, "claude": 20},
    "studio_pro": {"renders": 75,  "downloads": 75, "claude": 50},
    "enterprise": {"renders": -1,  "downloads": -1, "claude": -1},  # -1 = unlimited
}

async def check_and_increment_renders(user_id: UUID, tier: str, db: AsyncSession) -> None:
    limit = TIER_LIMITS.get(tier, {}).get("renders", 0)
    if limit == -1:
        return  # unlimited

    quota = await _get_or_create_quota(user_id, db)
    if quota.renders_used >= limit:
        raise HTTPException(429, detail={
            "code": "RAIN-E701",
            "message": f"Render quota exhausted ({quota.renders_used}/{limit} this period)"
        })

    quota.renders_used += 1
    await db.commit()

async def check_and_increment_downloads(user_id: UUID, tier: str, db: AsyncSession) -> None:
    if tier == "free":
        raise HTTPException(403, detail={"code": "RAIN-E101", "message": "Free tier cannot download"})
    limit = TIER_LIMITS.get(tier, {}).get("downloads", 0)
    if limit == -1:
        return

    quota = await _get_or_create_quota(user_id, db)
    if quota.downloads_used >= limit:
        raise HTTPException(429, detail={
            "code": "RAIN-E702",
            "message": f"Download quota exhausted ({quota.downloads_used}/{limit} this period)"
        })

    quota.downloads_used += 1
    await db.commit()

async def _get_or_create_quota(user_id: UUID, db: AsyncSession) -> UsageQuota:
    from datetime import timedelta
    now = datetime.now(timezone.utc)
    start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    result = await db.execute(
        select(UsageQuota)
        .where(UsageQuota.user_id == user_id, UsageQuota.period_start == start)
    )
    quota = result.scalar_one_or_none()
    if not quota:
        import calendar
        last_day = calendar.monthrange(now.year, now.month)[1]
        end = start.replace(day=last_day, hour=23, minute=59, second=59)
        quota = UsageQuota(user_id=user_id, period_start=start, period_end=end)
        db.add(quota)
        await db.commit()
        await db.refresh(quota)
    return quota
```

---

## Task 3.7 — Celery Worker Scaffold

### `backend/app/worker.py`
```python
from celery import Celery
from app.core.config import settings

celery_app = Celery(
    "rain_worker",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
    include=["app.tasks.analysis", "app.tasks.render", "app.tasks.demucs",
             "app.tasks.certification", "app.tasks.distribution"],
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    task_routes={
        "app.tasks.demucs.*": {"queue": "demucs"},
        "app.tasks.distribution.*": {"queue": "distribution"},
        "app.tasks.certification.*": {"queue": "certification"},
        "*": {"queue": "default"},
    },
    task_acks_late=True,
    worker_prefetch_multiplier=1,
)

# Stub tasks — real implementations in respective PART files
from celery import shared_task

@shared_task(name="app.tasks.analysis.analyze_session", bind=True, max_retries=3)
def analyze_session(self, session_id: str, user_id: str):
    """Stub — implemented in PART-6."""
    pass

@shared_task(name="app.tasks.render.render_session", bind=True, max_retries=2)
def render_session(self, session_id: str, user_id: str, params: dict):
    """Stub — implemented in PART-6."""
    pass
```

---

## Task 3.8 — Billing Routes (Stripe Stubs)

### `backend/app/api/routes/billing.py`

Implement stub routes for billing. Full webhook logic arrives in PART-6.

```python
from fastapi import APIRouter, Request, Header, HTTPException
import stripe
from app.core.config import settings

router = APIRouter(prefix="/billing", tags=["billing"])
stripe.api_key = settings.STRIPE_SECRET_KEY

@router.post("/webhook")
async def stripe_webhook(request: Request, stripe_signature: str = Header(None)):
    """Stripe webhook handler stub. Full implementation in PART-6."""
    payload = await request.body()
    try:
        event = stripe.Webhook.construct_event(
            payload, stripe_signature, settings.STRIPE_WEBHOOK_SECRET
        )
    except stripe.error.SignatureVerificationError:
        raise HTTPException(400, detail={"code": "RAIN-E700", "message": "Webhook verification failed"})

    # Stub: log and return 200
    import structlog
    structlog.get_logger().info("stripe_webhook_received", type=event.type)
    return {"received": True}
```

---

## Task 3.9 — Route Registration

### Update `backend/app/main.py`
```python
from app.api.routes import auth, upload, billing, sessions, download

app.include_router(auth.router, prefix="/api/v1")
app.include_router(upload.router, prefix="/api/v1")
app.include_router(billing.router, prefix="/api/v1")
app.include_router(sessions.router, prefix="/api/v1")
app.include_router(download.router, prefix="/api/v1")
```

---

## Task 3.10 — Integration Tests

### `backend/tests/test_auth.py`
Test the full auth flow:
- Register new user → 201, receives tokens
- Register same email again → 409 RAIN-E100
- Login with correct credentials → 200, tokens match tier
- Login with wrong password → 401 RAIN-E100
- Access protected endpoint without token → 401
- Access tier-gated endpoint with lower tier → 403 RAIN-E101

### `backend/tests/test_upload.py`
Test upload:
- Free tier: upload WAV → 201, session created, `input_file_key` is None, `status = analyzing`
- Spark tier: upload WAV → 201, session created, `input_file_key` is NOT None
- Upload unsupported format → 422 RAIN-E200
- Upload oversized file → 413 RAIN-E201

### `backend/tests/test_quota.py`
Test quota enforcement:
- Exhaust renders for spark tier (50) → next attempt → 429 RAIN-E701
- Free tier download attempt → 403 RAIN-E101

### `backend/tests/test_rls.py`
Critical security test:
- Create two users (user_A, user_B)
- User_A creates a session
- User_B attempts to query that session → must return empty / 404
- Verify `set_config('app.user_id', ...)` is called correctly on every DB access

---

## Build Commands

```bash
# Run from repo root
docker-compose up -d postgres redis minio
docker-compose exec backend alembic upgrade head
docker-compose exec backend pytest tests/ -v --tb=short -x

# Integration smoke test
curl -X POST http://localhost:8000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@rain.test","password":"testpass123"}'
```

---

## Tests to Pass Before Reporting

```
✓ test_auth_register: POST /auth/register → 201, returns access_token + refresh_token
✓ test_auth_register_duplicate: POST /auth/register with same email → 409 RAIN-E100
✓ test_auth_login: POST /auth/login → 200, returns valid JWT with exp + sub claims
✓ test_auth_login_wrong_password: POST /auth/login wrong pw → 401 RAIN-E100
✓ test_auth_protected: GET protected route with valid token → 200
✓ test_auth_protected_invalid: GET protected route with expired/invalid token → 401 RAIN-E100
✓ test_auth_tier_gate: creator-gated route with free user → 403 RAIN-E101
✓ test_upload: free tier → session created, no S3 key; paid tier → S3 key present
✓ test_upload_format: reject non-audio file → 400 RAIN-E200
✓ test_quota: render quota exhaustion → 403 RAIN-E101; free tier download → 403 RAIN-E101
✓ test_rls: user A cannot read user B's session → 404 (not 403, to prevent enumeration)
✓ All API integration tests: 0 failures
```

---

## Report Format

```
PART-3 COMPLETE
Auth: JWT RS256 working, register/login/refresh all pass
Upload: Free tier (no S3) + paid tier (S3) both working
RLS: Cross-tenant isolation verified
Quota: Render and download limits enforced
Worker: Celery scaffold running, stub tasks registered
Integration tests: N/N PASSED
Deviations from spec: [none | list any]
Ready for: PART-4 (ML), PART-5 (Frontend)
```

**HALT. Wait for instruction: "Proceed to Part 4" or "Proceed to Part 5".**
