# RAIN — PART-8: Content Verification + RAIN-CERT
## Three-Layer Scan, Provenance Chain, Ed25519 Certification

**Blueprint ref:** RAIN-BLUEPRINT-v1.0 / PART-8  
**Depends on:** PART-6 (Pipeline — sessions must be completable)  
**Gates next:** PART-9 (Distribution requires RAIN-CERT)

---

## Entry Checklist (confirm before starting)
- [ ] External APIs (AcoustID, AudD, ACRCloud): 30s timeout, 3 retries with exponential backoff
- [ ] Failure isolation: any single layer failing does NOT abort the scan — status becomes "incomplete"
- [ ] Content scan failure does NOT block session completion
- [ ] No mocks: missing API token → `{"status": "skipped"}`, never a fake positive/negative
- [ ] RAIN-CERT: Ed25519 signed, contains input hash + output hash + WASM hash + all params
- [ ] RAIN-CERT signing key: from env var path, never hardcoded
- [ ] No fake hashes — compute every hash or fail
- [ ] Sub-Phase Protocol: HALT → BUILD → TEST → REPORT → WAIT after each task

---

## Objective

Implement the three-layer content verification scan (Chromaprint/AcoustID → AudD → ACRCloud)
and the RAIN-CERT provenance chain. Every completed session gets a RAIN-CERT signed with
Ed25519. Content scan runs as a background task. Scan results feed into RAIN-CERT.

---

## External API Resilience (MANDATORY for this Part)

This part integrates three external services (AcoustID, AudD, ACRCloud). Each one can be
down, slow, or returning errors. Apply these rules to every external call:

- **Timeout:** 30s per request (already set in httpx calls). Do not increase.
- **Retry:** Each scan function must retry up to 3 times with exponential backoff (1s, 2s, 4s)
  before returning a failure result. Use `tenacity` or manual retry loop.
- **Failure isolation:** If any single layer fails (timeout, 5xx, network error), log the
  failure with `RAIN-E800` and continue with the remaining layers. Do NOT abort the scan task.
- **Graceful degradation:** A content scan with 0/3 layers responding is still valid — status
  becomes `"incomplete"`, not `"failed"`. The session still completes. The user sees
  "Content scan partially complete" in the UI.
- **No mocks in production paths:** If an API token is missing, return `{"status": "skipped",
  "reason": "no_api_token"}` (already done for AudD/ACRCloud). Do NOT invent a fake positive
  or negative result.

---

## Task 8.1 — Three-Layer Content Scan

### `backend/app/tasks/content_scan.py`
```python
from celery import shared_task
import asyncio, httpx, hashlib, subprocess, json, structlog, base64
from typing import Optional

logger = structlog.get_logger()

@shared_task(name="app.tasks.content_scan.scan_content", bind=True, max_retries=2)
def scan_content(self, session_id: str, user_id: str):
    asyncio.run(_scan_async(session_id, user_id))

async def _scan_async(session_id: str, user_id: str):
    from app.core.database import AsyncSessionLocal
    from app.models.session import Session as MasteringSession
    from app.models.content_scan import ContentScan
    from app.services.storage import get_s3_client
    from app.core.config import settings
    from sqlalchemy import select, update
    from uuid import UUID, uuid4

    async with AsyncSessionLocal() as db:
        await db.execute(f"SELECT set_app_user_id('{user_id}'::uuid)")
        result = await db.execute(
            select(MasteringSession).where(MasteringSession.id == UUID(session_id))
        )
        session = result.scalar_one_or_none()
        if not session or not session.input_file_key:
            return

        s3 = get_s3_client()
        obj = s3.get_object(Bucket=settings.S3_BUCKET, Key=session.input_file_key)
        audio_data = obj["Body"].read()

        # Layer 1: Chromaprint/AcoustID
        chromaprint_result = await _scan_chromaprint(audio_data)

        # Layer 2: AudD
        audd_result = await _scan_audd(audio_data, settings.AUDD_API_TOKEN)

        # Layer 3: ACRCloud
        acrcloud_result = await _scan_acrcloud(
            audio_data, settings.ACRCLOUD_HOST,
            settings.ACRCLOUD_ACCESS_KEY, settings.ACRCLOUD_ACCESS_SECRET
        )

        # Determine overall status
        match_found = (
            (audd_result.get("status") == "success" and audd_result.get("result")) or
            (acrcloud_result.get("status", {}).get("code") == 0 and acrcloud_result.get("metadata", {}).get("music"))
        )
        overall_status = "match_found" if match_found else "clear"

        scan = ContentScan(
            session_id=UUID(session_id),
            user_id=UUID(user_id),
            chromaprint_fingerprint=chromaprint_result.get("fingerprint"),
            acoustid_result=chromaprint_result,
            audd_result=audd_result,
            acrcloud_result=acrcloud_result,
            overall_status=overall_status,
        )
        db.add(scan)
        await db.commit()

        logger.info("content_scan_complete", session_id=session_id, status=overall_status)

async def _scan_chromaprint(audio_data: bytes) -> dict:
    """Run fpcalc (Chromaprint) to get fingerprint."""
    import tempfile, os
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
        f.write(audio_data)
        tmp_path = f.name
    try:
        result = subprocess.run(
            ["fpcalc", "-json", tmp_path],
            capture_output=True, text=True, timeout=30
        )
        if result.returncode == 0:
            data = json.loads(result.stdout)
            return {"fingerprint": data.get("fingerprint"), "duration": data.get("duration")}
    finally:
        os.unlink(tmp_path)
    return {}

async def _scan_audd(audio_data: bytes, api_token: str) -> dict:
    if not api_token:
        return {"status": "skipped", "reason": "no_api_token"}
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            "https://api.audd.io/",
            data={"api_token": api_token, "return": "spotify,apple_music"},
            files={"file": ("audio.wav", audio_data, "audio/wav")},
        )
        return resp.json()

async def _scan_acrcloud(audio_data: bytes, host: str, access_key: str, access_secret: str) -> dict:
    if not access_key or not access_secret:
        return {"status": {"code": -1, "msg": "skipped"}}
    import hmac, time
    timestamp = str(int(time.time()))
    string_to_sign = "\n".join(["POST", "/v1/identify", access_key, "audio", "1", timestamp])
    signature = base64.b64encode(
        hmac.new(access_secret.encode(), string_to_sign.encode(), hashlib.sha1).digest()
    ).decode()

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            f"https://{host}/v1/identify",
            data={
                "access_key": access_key,
                "sample_bytes": str(len(audio_data)),
                "timestamp": timestamp,
                "signature": signature,
                "data_type": "audio",
                "signature_version": "1",
            },
            files={"sample": ("audio.wav", audio_data[:10 * 44100 * 2 * 2], "audio/wav")},
        )
        return resp.json()
```

---

## Task 8.2 — RAIN-CERT Signing

### `backend/app/tasks/certification.py`
```python
from celery import shared_task
import asyncio, json, hashlib
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives import serialization
from pathlib import Path
import structlog, base64

logger = structlog.get_logger()

def _load_cert_key() -> Ed25519PrivateKey:
    from app.core.config import settings
    return serialization.load_pem_private_key(
        Path(settings.RAIN_CERT_SIGNING_KEY_PATH).read_bytes(),
        password=None
    )

@shared_task(name="app.tasks.certification.sign_rain_cert")
def sign_rain_cert(session_id: str, user_id: str):
    asyncio.run(_sign_cert_async(session_id, user_id))

async def _sign_cert_async(session_id: str, user_id: str):
    from app.core.database import AsyncSessionLocal
    from app.models.session import Session as MasteringSession
    from app.models.cert import RainCert
    from app.models.content_scan import ContentScan
    from sqlalchemy import select, update
    from uuid import UUID, uuid4
    from datetime import datetime, timezone

    async with AsyncSessionLocal() as db:
        await db.execute(f"SELECT set_app_user_id('{user_id}'::uuid)")

        sess_result = await db.execute(
            select(MasteringSession).where(MasteringSession.id == UUID(session_id))
        )
        session = sess_result.scalar_one_or_none()
        if not session:
            return

        # Build canonical cert payload
        scan_result = await db.execute(
            select(ContentScan).where(ContentScan.session_id == UUID(session_id))
        )
        scan = scan_result.scalar_one_or_none()

        cert_payload = {
            "session_id": session_id,
            "user_id_hash": hashlib.sha256(user_id.encode()).hexdigest(),
            "input_hash": session.input_file_hash,
            "output_hash": session.output_file_hash,
            "wasm_hash": session.wasm_binary_hash,
            "model_version": session.rainnet_model_version or "heuristic",
            "processing_params_hash": hashlib.sha256(
                json.dumps(session.processing_params, sort_keys=True).encode()
            ).hexdigest() if session.processing_params else "none",
            "content_scan_status": scan.overall_status if scan else "not_run",
            "ai_generated": False,  # Updated if Suno import mode active
            "issued_at": datetime.now(timezone.utc).isoformat(),
        }

        canonical_json = json.dumps(cert_payload, sort_keys=True, separators=(",", ":"))
        private_key = _load_cert_key()
        signature = private_key.sign(canonical_json.encode())
        signature_b64 = base64.b64encode(signature).decode()

        cert = RainCert(
            id=uuid4(),
            session_id=UUID(session_id),
            user_id=UUID(user_id),
            input_hash=session.input_file_hash or "",
            output_hash=session.output_file_hash or "",
            wasm_hash=session.wasm_binary_hash,
            model_version=session.rainnet_model_version or "heuristic",
            processing_params_hash=cert_payload["processing_params_hash"],
            content_scan_passed=(scan.overall_status == "clear" if scan else None),
            signature=signature_b64,
        )
        db.add(cert)

        await db.execute(
            update(MasteringSession)
            .where(MasteringSession.id == UUID(session_id))
            .values(rain_cert_id=cert.id)
        )
        await db.commit()
        logger.info("rain_cert_signed", session_id=session_id, cert_id=str(cert.id))
```

---

## Task 8.3 — RAIN-CERT API Route

```python
@router.get("/sessions/{session_id}/cert")
async def get_rain_cert(session_id: UUID, current_user: CurrentUser = Depends(get_current_user)):
    """Returns the RAIN-CERT JSON + signature for a completed session."""
```

---

## Tests to Pass Before Reporting

```
✓ Content scan task: runs all three layers, stores results
✓ ACRCloud scan: returns dict (even if API key missing — returns 'skipped')
✓ AudD scan: returns dict (even if token missing — returns 'skipped')
✓ Chromaprint: runs fpcalc, returns fingerprint
✓ RAIN-CERT: signed with Ed25519, signature verifies with public key
✓ GET /sessions/{id}/cert: returns cert JSON
✓ Content scan 'clear': cert has content_scan_passed=True
```

**HALT. Wait for instruction.**

---
---

