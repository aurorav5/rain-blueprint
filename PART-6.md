# RAIN — PART-6: Mastering Pipeline
## Full Render Path E2E, Billing Webhooks, Celery Tasks

**Blueprint ref:** RAIN-BLUEPRINT-v1.0 / PART-6  
**Depends on:** PART-2 (DSP), PART-3 (Backend), PART-4 (ML), PART-5 (Frontend)  
**Gates next:** PART-7 (AIE), PART-8 (Verification), PART-9 (Distribution)

---

## Entry Checklist (confirm before starting)
- [ ] Pipeline execution order: CLAUDE.md §Pipeline Execution Order — steps 1–7 critical path, step 8 async
- [ ] ProcessingParams schema: CLAUDE.md §Canonical ProcessingParams Schema — no field renaming
- [ ] RAIN_NORMALIZATION_VALIDATED=false — heuristic fallback active, RainNet blocked
- [ ] Celery tasks: `asyncio.run()` bridge to async — never share sessions across tasks
- [ ] All tasks idempotent: check session.status at entry, skip completed stages
- [ ] RainDSPBridge: implement Option A (pybind11 native) for server. Option B (WASM subprocess) is browser-only
- [ ] Free tier: server-side analysis returns RAIN-E200 (audio not persisted) — this is correct behavior
- [ ] Output LUFS: must hit target ±0.5 LU — this is the hard gate for PART-6 completion
- [ ] Stripe webhooks: subscription mutations must be idempotent (ON CONFLICT handling)
- [ ] No fake data: no placeholder delays, no invented LUFS values
- [ ] Error codes: RAIN-E* only — never raw exceptions to client
- [ ] Sub-Phase Protocol: HALT → BUILD → TEST → REPORT → WAIT after each task

---

## Objective

Wire the complete end-to-end mastering pipeline: upload → analysis → RainNet inference (or
heuristic) → RainDSP WASM render → LUFS verification → session completion → download.
Implement Stripe billing webhooks for subscription management. Implement all Celery tasks.
The output of every render must hit the target platform LUFS within ±0.5 LU.

---

## Celery + Async DB Model (MANDATORY)

Celery workers run synchronously by default. RAIN uses `asyncio.run()` inside each Celery
task to bridge into async SQLAlchemy. This is intentional and correct — each task gets its
own event loop, its own `AsyncSession`, and tears down cleanly.

**Rules:**
- Every Celery task body calls `asyncio.run(_task_name_async(...))` as shown in Task 6.1
- The async inner function creates its own `AsyncSessionLocal()` context — never share sessions across tasks
- Never use `sync_session` or `create_engine` (non-async) in task code
- Never call `asyncio.get_event_loop()` — always `asyncio.run()` which creates a fresh loop
- DB sessions MUST be closed in a `finally` block or via `async with` context manager

**Idempotency:**
All Celery tasks MUST be safe to retry without side effects:
- Check `session.status` at task entry — if already at or past the target stage, return early
- S3 writes use deterministic keys — re-upload overwrites safely
- Billing mutations (quota increments) MUST use `INSERT ... ON CONFLICT` or equivalent
- Logging a duplicate run is fine; duplicating a user-visible side effect is not

---

## Task 6.1 — Analysis Task

### `backend/app/tasks/analysis.py`
```python
from celery import shared_task
from sqlalchemy.ext.asyncio import AsyncSession
import structlog
import io

logger = structlog.get_logger()

@shared_task(name="app.tasks.analysis.analyze_session", bind=True, max_retries=3)
def analyze_session(self, session_id: str, user_id: str):
    """
    Async Celery task. Read from S3 (or temp store for free tier),
    extract LUFS + true peak + mel spectrogram + genre.
    Update session with analysis results.
    Dispatch render task.
    """
    import asyncio
    asyncio.run(_analyze_session_async(session_id, user_id))

async def _analyze_session_async(session_id: str, user_id: str):
    from app.core.database import AsyncSessionLocal
    from app.models.session import Session as MasteringSession
    from app.services.storage import get_s3_client
    from app.services.audio_analysis import extract_mel_spectrogram, measure_lufs_true_peak
    from app.core.config import settings
    from sqlalchemy import select, update
    from uuid import UUID

    async with AsyncSessionLocal() as db:
        # Set RLS context
        await db.execute(f"SELECT set_app_user_id('{user_id}'::uuid)")

        result = await db.execute(
            select(MasteringSession).where(
                MasteringSession.id == UUID(session_id),
                MasteringSession.user_id == UUID(user_id),
            )
        )
        session = result.scalar_one_or_none()
        if not session:
            logger.error("analysis_session_not_found", session_id=session_id)
            return

        try:
            # Fetch audio
            if session.input_file_key:
                s3 = get_s3_client()
                obj = s3.get_object(Bucket=settings.S3_BUCKET, Key=session.input_file_key)
                audio_data = obj["Body"].read()
            else:
                # Free tier: audio was not persisted — cannot analyze
                # Mark as failed with informative error
                await db.execute(
                    update(MasteringSession)
                    .where(MasteringSession.id == UUID(session_id))
                    .values(status="failed", error_code="RAIN-E200",
                            error_detail="Free tier audio not persisted for analysis")
                )
                await db.commit()
                return

            # LUFS + true peak measurement (no processing, measurement only)
            lufs, tp = await measure_lufs_true_peak(audio_data)

            # Mel spectrogram + duration
            mel, duration, _ = extract_mel_spectrogram(audio_data)

            # Genre classification (GenreClassifier ONNX — stub for now, returns 'default')
            genre = _classify_genre(mel) or session.genre

            # Update session
            await db.execute(
                update(MasteringSession)
                .where(MasteringSession.id == UUID(session_id))
                .values(
                    status="processing",
                    input_duration_ms=int(duration * 1000),
                    input_lufs=round(lufs, 2),
                    input_true_peak=round(tp, 2),
                    genre=genre,
                )
            )
            await db.commit()

            # Dispatch render
            from app.tasks.render import render_session
            render_session.delay(session_id, user_id, mel.tolist(), genre)

        except Exception as e:
            logger.error("analysis_failed", session_id=session_id, error=str(e))
            await db.execute(
                update(MasteringSession)
                .where(MasteringSession.id == UUID(session_id))
                .values(status="failed", error_code="RAIN-E301", error_detail=str(e))
            )
            await db.commit()

def _classify_genre(mel) -> str:
    """Stub. Returns 'default' until GenreClassifier ONNX is trained."""
    return "default"
```

---

## Task 6.2 — Render Task

### `backend/app/tasks/render.py`
```python
from celery import shared_task
import structlog, asyncio, numpy as np

logger = structlog.get_logger()

@shared_task(name="app.tasks.render.render_session", bind=True, max_retries=2)
def render_session(self, session_id: str, user_id: str, mel_list: list, genre: str):
    asyncio.run(_render_session_async(session_id, user_id, np.array(mel_list, dtype=np.float32), genre))

async def _render_session_async(session_id: str, user_id: str, mel: np.ndarray, genre: str):
    from app.core.database import AsyncSessionLocal
    from app.models.session import Session as MasteringSession
    from app.models.aie import AIEProfile
    from app.services.inference import InferenceService
    from app.services.storage import get_s3_client, upload_to_s3
    from app.services.wasm_bridge import RainDSPBridge
    from app.core.config import settings
    from sqlalchemy import select, update
    from uuid import UUID, uuid4

    async with AsyncSessionLocal() as db:
        await db.execute(f"SELECT set_app_user_id('{user_id}'::uuid)")

        result = await db.execute(
            select(MasteringSession).where(
                MasteringSession.id == UUID(session_id),
                MasteringSession.user_id == UUID(user_id),
            )
        )
        session = result.scalar_one_or_none()
        if not session:
            return

        try:
            # Get AIE profile vector (zeros if not enough sessions)
            aie_result = await db.execute(
                select(AIEProfile).where(AIEProfile.user_id == UUID(user_id))
            )
            aie_profile = aie_result.scalar_one_or_none()
            artist_vec = np.array(aie_profile.voice_vector if aie_profile else [0.0] * 64, dtype=np.float32)

            # Get processing params (RainNet or heuristic)
            inference_svc = InferenceService.get()
            params, source = inference_svc.get_params(
                mel_spectrogram=mel,
                artist_vector=artist_vec,
                genre=genre,
                platform=session.target_platform,
                simple_mode=session.simple_mode,
            )
            logger.info("params_source", session_id=session_id, source=source)

            # Load audio for render
            s3 = get_s3_client()
            obj = s3.get_object(Bucket=settings.S3_BUCKET, Key=session.input_file_key)
            audio_data = obj["Body"].read()

            # Call RainDSP bridge (Python → C++/WASM via subprocess or native extension)
            bridge = RainDSPBridge()
            output_audio, result = bridge.process(audio_data, params)

            # Verify output LUFS is within ±0.5 LU of target
            target_lufs = params.get("target_lufs", -14.0)
            if abs(result.integrated_lufs - target_lufs) > 0.5:
                logger.warning("lufs_drift", target=target_lufs, actual=result.integrated_lufs, session_id=session_id)

            # Upload rendered output
            output_key, output_hash = await upload_to_s3(
                output_audio, user_id, session_id, f"master_{session.target_platform}.wav"
            )

            # Compute RAIN Score
            from app.services.rain_score import compute_rain_score
            rain_score = await compute_rain_score(output_audio, session.target_platform, mel)

            # Update session
            await db.execute(
                update(MasteringSession)
                .where(MasteringSession.id == UUID(session_id))
                .values(
                    status="complete",
                    output_file_key=output_key,
                    output_file_hash=output_hash,
                    output_lufs=round(result.integrated_lufs, 2),
                    output_true_peak=round(result.true_peak_dbtp, 2),
                    rain_score=rain_score,
                    processing_params=params,
                    rainnet_model_version=settings.RAIN_VERSION if source == "rainnet" else "heuristic",
                    aie_applied=(source == "rainnet"),
                )
            )
            await db.commit()

            # Dispatch AIE update and certification in parallel
            from app.tasks.certification import sign_rain_cert
            from app.tasks.aie import update_aie_profile
            sign_rain_cert.delay(session_id, user_id)
            update_aie_profile.delay(session_id, user_id, mel.tolist(), params, genre)

        except Exception as e:
            logger.error("render_failed", session_id=session_id, error=str(e))
            await db.execute(
                update(MasteringSession)
                .where(MasteringSession.id == UUID(session_id))
                .values(status="failed", error_code="RAIN-E300", error_detail=str(e))
            )
            await db.commit()
```

---

## Task 6.3 — RainDSP Bridge

### `backend/app/services/wasm_bridge.py`

The Python render path calls into RainDSP. Two approaches, in order of preference:

**Option A (preferred for production):** Compile RainDSP as a native Python extension
using Pybind11. This gives the full C++20 pipeline at native speed from Python.
```
rain-dsp/
  python_bindings/
    bindings.cpp   ← pybind11 wrapping rain_process()
    CMakeLists.txt
```

**Option B (fallback for WASM environments):** Run rain_dsp WASM binary via Node.js
subprocess, passing audio data as stdin and receiving output + JSON result on stdout.

Implement Option A for the backend server. Option B is used only in the browser (handled
by the frontend WASM loader). Both must produce bit-identical results for the same input.

```python
import subprocess, json, tempfile, os
from dataclasses import dataclass
from typing import Optional
import soundfile as sf
import numpy as np
import io

@dataclass
class RenderResult:
    integrated_lufs: float
    short_term_lufs: float
    momentary_lufs: float
    loudness_range: float
    true_peak_dbtp: float

class RainDSPBridge:
    """
    Bridge to the RainDSP C++ engine.
    Prefer Pybind11 extension when available, fall back to subprocess.
    """

    def process(self, audio_data: bytes, params: dict) -> tuple[bytes, RenderResult]:
        try:
            return self._process_native(audio_data, params)
        except ImportError:
            return self._process_subprocess(audio_data, params)

    def _process_native(self, audio_data: bytes, params: dict) -> tuple[bytes, RenderResult]:
        """Use pybind11 extension. Raises ImportError if not built."""
        import rain_dsp_native as rdsp  # built via pybind11
        audio, sr = sf.read(io.BytesIO(audio_data), dtype="float64", always_2d=True)
        left = np.ascontiguousarray(audio[:, 0])
        right = np.ascontiguousarray(audio[:, 1] if audio.shape[1] > 1 else audio[:, 0])

        out_left, out_right, result_json = rdsp.process(left, right, sr, json.dumps(params))
        result_dict = json.loads(result_json)

        # Encode output to WAV 24-bit
        out_audio = np.stack([out_left, out_right], axis=1)
        buf = io.BytesIO()
        sf.write(buf, out_audio, sr, subtype="PCM_24", format="WAV")
        return buf.getvalue(), RenderResult(**result_dict)

    def _process_subprocess(self, audio_data: bytes, params: dict) -> tuple[bytes, RenderResult]:
        """Subprocess fallback. Slower but doesn't require compiled extension."""
        with tempfile.TemporaryDirectory() as tmpdir:
            input_path = os.path.join(tmpdir, "input.wav")
            output_path = os.path.join(tmpdir, "output.wav")
            params_path = os.path.join(tmpdir, "params.json")

            with open(input_path, "wb") as f:
                f.write(audio_data)
            with open(params_path, "w") as f:
                json.dump(params, f)

            result = subprocess.run(
                ["rain_dsp_cli", "--input", input_path, "--output", output_path, "--params", params_path],
                capture_output=True, text=True, timeout=120
            )
            if result.returncode != 0:
                raise RuntimeError(f"RainDSP subprocess failed: {result.stderr}")

            result_data = json.loads(result.stdout)
            with open(output_path, "rb") as f:
                output_audio = f.read()

            return output_audio, RenderResult(**result_data)
```

---

## Task 6.4 — Download Route

### `backend/app/api/routes/download.py`
```python
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from uuid import UUID
from app.core.database import get_db
from app.api.dependencies import get_current_user, CurrentUser
from app.models.session import Session as MasteringSession
from app.services.storage import generate_presigned_url
from app.services.quota import check_and_increment_downloads

router = APIRouter(prefix="/sessions", tags=["download"])

@router.get("/{session_id}/download")
async def download_master(
    session_id: UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await db.execute(f"SELECT set_app_user_id('{current_user.user_id}'::uuid)")

    result = await db.execute(
        select(MasteringSession).where(
            MasteringSession.id == session_id,
            MasteringSession.user_id == current_user.user_id,
        )
    )
    session = result.scalar_one_or_none()

    if not session:
        raise HTTPException(404, detail={"code": "RAIN-E200", "message": "Session not found"})
    if session.status != "complete":
        raise HTTPException(400, detail={"code": "RAIN-E200", "message": "Session not complete"})
    if not session.output_file_key:
        raise HTTPException(400, detail={"code": "RAIN-E200", "message": "No output file"})

    # Quota check (also enforces free tier block)
    await check_and_increment_downloads(current_user.user_id, current_user.tier, db)

    url = generate_presigned_url(session.output_file_key, expires_seconds=300)
    return RedirectResponse(url=url, status_code=302)
```

---

## Task 6.5 — Stripe Billing Webhooks (Full Implementation)

### `backend/app/api/routes/billing.py` (replace stub from PART-3)
```python
from fastapi import APIRouter, Request, Header, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from app.core.database import get_db, AsyncSessionLocal
from app.models.subscription import Subscription
from app.models.user import User
from app.core.config import settings
from datetime import datetime, timezone
import stripe, structlog

logger = structlog.get_logger()
stripe.api_key = settings.STRIPE_SECRET_KEY
router = APIRouter(prefix="/billing", tags=["billing"])

STRIPE_TIER_MAP = {
    settings.STRIPE_PRICE_SPARK_MONTHLY: "spark",
    settings.STRIPE_PRICE_CREATOR_MONTHLY: "creator",
    settings.STRIPE_PRICE_ARTIST_MONTHLY: "artist",
    settings.STRIPE_PRICE_STUDIO_PRO_MONTHLY: "studio_pro",
}

@router.post("/webhook")
async def stripe_webhook(request: Request, stripe_signature: str = Header(None)):
    payload = await request.body()
    try:
        event = stripe.Webhook.construct_event(payload, stripe_signature, settings.STRIPE_WEBHOOK_SECRET)
    except stripe.error.SignatureVerificationError:
        raise HTTPException(400, detail={"code": "RAIN-E700", "message": "Signature verification failed"})

    async with AsyncSessionLocal() as db:
        match event.type:
            case "customer.subscription.created" | "customer.subscription.updated":
                await _handle_subscription_update(event.data.object, db)
            case "customer.subscription.deleted":
                await _handle_subscription_deleted(event.data.object, db)
            case "invoice.payment_failed":
                await _handle_payment_failed(event.data.object, db)
            case _:
                pass

    return {"received": True}

async def _handle_subscription_update(sub_obj, db: AsyncSession):
    customer_id = sub_obj.customer
    price_id = sub_obj.items.data[0].price.id
    tier = STRIPE_TIER_MAP.get(price_id, "spark")

    result = await db.execute(
        select(Subscription).where(Subscription.stripe_customer_id == customer_id)
    )
    sub = result.scalar_one_or_none()
    if sub:
        sub.tier = tier
        sub.status = sub_obj.status
        sub.stripe_subscription_id = sub_obj.id
        sub.current_period_end = datetime.fromtimestamp(sub_obj.current_period_end, tz=timezone.utc)
        await db.commit()
        logger.info("subscription_updated", customer=customer_id, tier=tier)

async def _handle_subscription_deleted(sub_obj, db: AsyncSession):
    result = await db.execute(
        select(Subscription).where(Subscription.stripe_subscription_id == sub_obj.id)
    )
    sub = result.scalar_one_or_none()
    if sub:
        sub.status = "canceled"
        sub.tier = "free"
        await db.commit()
        logger.info("subscription_canceled", sub_id=sub_obj.id)

async def _handle_payment_failed(invoice_obj, db: AsyncSession):
    result = await db.execute(
        select(Subscription).where(Subscription.stripe_customer_id == invoice_obj.customer)
    )
    sub = result.scalar_one_or_none()
    if sub:
        sub.status = "past_due"
        await db.commit()
        logger.warning("payment_failed", customer=invoice_obj.customer)
```

---

## Task 6.6 — Session Status WebSocket

### `backend/app/api/routes/sessions.py`
Add WebSocket endpoint for real-time status updates:
```python
@router.websocket("/{session_id}/status")
async def session_status_ws(websocket: WebSocket, session_id: UUID, token: str):
    # Validate token
    # Subscribe to Redis pub/sub channel: f"session:{session_id}:status"
    # Forward updates to WebSocket
    # Close on session completion or error
```

Frontend connects to this WebSocket after uploading to get real-time progress.

---

## Task 6.7 — Frontend Integration

Update `frontend/src/components/tabs/MasteringTab.tsx`:
1. Upload file → create session via API → get session_id
2. Connect WebSocket to `/api/v1/sessions/{id}/status`
3. Update session store based on WebSocket messages
4. On `status=complete`: fetch session details, update LUFS/RAIN Score display
5. On `status=failed`: show error code and message
6. Download button: calls `api.sessions.download(id)` → follows redirect to presigned URL

---

## Task 6.8 — Dolby Atmos Flag (Studio Pro — Deferred to PART-12)

In `ProcessingParams`, add:
```python
atmos_enabled: bool = False  # Studio Pro only
atmos_upmix_mode: str = "auto"  # "auto", "genre_template", "custom"
```

Add to tier gate: `atmos_enabled=True` requires studio_pro or enterprise.
Full Atmos implementation deferred to PART-12. Gate the field here.

---

## Build Commands

```bash
# Start full stack
docker-compose up -d

# Worker in separate terminal
docker-compose exec worker celery -A app.worker worker --loglevel=info -Q default,demucs

# E2E smoke test
python scripts/e2e_render_test.py
# Must produce output.wav at -14 LUFS ±0.5 LU
```

### `scripts/e2e_render_test.py`
```python
"""End-to-end render pipeline test."""
import requests, time, sys

BASE = "http://localhost:8000/api/v1"

# Register
r = requests.post(f"{BASE}/auth/register", json={"email":"e2e@test.rain","password":"testpass123"})
tokens = r.json()
headers = {"Authorization": f"Bearer {tokens['access_token']}"}

# Upload (use test WAV from tests/fixtures/test_48k_stereo.wav)
with open("backend/tests/fixtures/test_48k_stereo.wav", "rb") as f:
    r = requests.post(f"{BASE}/sessions/",
        headers=headers,
        files={"file": f},
        data={"params": '{"target_platform":"spotify","simple_mode":true}'}
    )
session = r.json()
session_id = session["id"]
print(f"Session created: {session_id}")

# Poll until complete
for _ in range(60):  # 60s timeout
    time.sleep(1)
    r = requests.get(f"{BASE}/sessions/{session_id}", headers=headers)
    s = r.json()
    if s["status"] == "complete":
        print(f"Complete. Output LUFS: {s['output_lufs']}")
        assert abs(s["output_lufs"] - (-14.0)) <= 0.5, f"LUFS drift: {s['output_lufs']}"
        print("LUFS TEST PASSED")
        sys.exit(0)
    elif s["status"] == "failed":
        print(f"FAILED: {s['error_code']} — {s.get('error_detail')}")
        sys.exit(1)

print("TIMEOUT")
sys.exit(1)
```

---

## Tests to Pass Before Reporting

```
✓ E2E render test: output LUFS = target ±0.5 LU
✓ Free tier: download attempt → 403 RAIN-E101
✓ Stripe webhook: subscription.created → tier updated in DB
✓ WebSocket: status updates flow in real time
✓ Download: presigned URL redirects to WAV file
✓ RainDSP bridge: process() returns RenderResult with non-null LUFS values
✓ Session status reaches 'complete' without errors (with heuristic fallback active)
```

---

## Report Format

```
PART-6 COMPLETE
E2E render: input → output at -14.0 LUFS ±[X] LU
RainDSP bridge: [native pybind11 | subprocess fallback]
Billing: Stripe webhook handler active
WebSocket: real-time status confirmed
Free tier: all blocks enforced
Deviations from spec: [none | list any]
Ready for: PART-7, PART-8, PART-9 (may proceed in any order)
```

**HALT. Wait for instruction: "Proceed to Part 7" or "Proceed to Part 8" or "Proceed to Part 9".**
