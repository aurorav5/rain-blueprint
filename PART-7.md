# RAIN — PART-7: Artist Identity Engine
## AIE, Cold-Start, EMA Profile Update, Export

**Blueprint ref:** RAIN-BLUEPRINT-v1.0 / PART-7  
**Depends on:** PART-6 (Pipeline)  
**Gates next:** PART-11 (requires AIE for offline sync)

---

## Entry Checklist (confirm before starting)
- [ ] Voice vector: length=64, values ∈ [−1.0, 1.0], L2 normalized (‖v‖₂ = 1.0 ± 1e-6)
- [ ] Cold-start: sessions 1–5 use genre heuristics, vector is zero, do NOT normalize until session 5
- [ ] EMA update: validate_voice_vector() called before every DB write
- [ ] Idempotent: re-running AIE update on completed session must not double-update the vector
- [ ] Every DB query includes user_id — RLS enforced
- [ ] Sub-Phase Protocol: HALT → BUILD → TEST → REPORT → WAIT after each task

---

## Objective

Implement the Artist Identity Engine (AIE): the 64-dimensional artist voice vector that
updates via Exponential Moving Average (EMA) after each session. Cold-start: first 5
sessions use genre-matched heuristics while the vector stabilizes. Session 6+ biases
RainNet inference with the artist vector.

---

## Task 7.1 — AIE Profile Model

`backend/app/models/aie.py` — already defined in schema (PART-1). Ensure:
- `voice_vector`: JSONB storing 64 float values
- `session_count`: increments each completed session
- `genre_distribution`: running frequency count of processed genres
- `platform_preferences`: running frequency count of target platforms

**Voice Vector Invariants (enforce on every write):**
- Length MUST equal 64. Reject any vector with len ≠ 64.
- All values MUST be in range [−1.0, 1.0]. Clamp after EMA update.
- Vector MUST be L2-normalized (‖v‖₂ = 1.0 ± 1e-6) after every update.
- Cold-start vector (session_count < 5): initialize as zero vector, do NOT normalize until session 5.
- Add a `validate_voice_vector(v: list[float]) -> list[float]` function that enforces all three
  constraints (length, bounds, normalization) and is called before every DB write.

## Task 7.2 — AIE Update Task

### `backend/app/tasks/aie.py`
```python
from celery import shared_task
import numpy as np
import asyncio, structlog

logger = structlog.get_logger()
EMA_ALPHA = 0.15       # Learning rate: 0.15 per session (slower stabilization = better)
COLD_START_SESSIONS = 5  # Below this: heuristic only

@shared_task(name="app.tasks.aie.update_aie_profile")
def update_aie_profile(session_id: str, user_id: str, mel_list: list, params: dict, genre: str):
    asyncio.run(_update_aie_async(session_id, user_id, np.array(mel_list, dtype=np.float32), params, genre))

async def _update_aie_async(session_id: str, user_id: str, mel: np.ndarray, params: dict, genre: str):
    from app.core.database import AsyncSessionLocal
    from app.models.aie import AIEProfile
    from sqlalchemy import select
    from uuid import UUID

    async with AsyncSessionLocal() as db:
        await db.execute(f"SELECT set_app_user_id('{user_id}'::uuid)")

        result = await db.execute(
            select(AIEProfile).where(AIEProfile.user_id == UUID(user_id))
        )
        profile = result.scalar_one_or_none()

        if not profile:
            profile = AIEProfile(
                user_id=UUID(user_id),
                voice_vector=[0.0] * 64,
                session_count=0,
                genre_distribution={},
                platform_preferences={},
            )
            db.add(profile)

        # Compute session embedding from mel + params
        session_embedding = _compute_session_embedding(mel, params)

        # EMA update
        current_vec = np.array(profile.voice_vector)
        new_vec = (1 - EMA_ALPHA) * current_vec + EMA_ALPHA * session_embedding
        new_vec = new_vec / (np.linalg.norm(new_vec) + 1e-8)  # normalize

        # Update genre distribution
        genre_dist = profile.genre_distribution.copy()
        genre_dist[genre] = genre_dist.get(genre, 0) + 1

        profile.voice_vector = new_vec.tolist()
        profile.session_count += 1
        profile.genre_distribution = genre_dist
        await db.commit()

        logger.info("aie_updated",
            user_id=user_id,
            session_count=profile.session_count,
            cold_start=(profile.session_count <= COLD_START_SESSIONS))

def _compute_session_embedding(mel: np.ndarray, params: dict) -> np.ndarray:
    """
    Derive a 64-dim session vector from spectral + parameter features.
    This is a deterministic projection — not ML, so it works before training.
    Uses a fixed random projection matrix seeded by RAIN version (deterministic).
    """
    rng = np.random.RandomState(42)  # fixed seed for reproducibility

    # Spectral features (mel statistics)
    spec_features = np.concatenate([
        mel.mean(axis=1),    # per-band mean (128)
        mel.std(axis=1),     # per-band std (128)
    ])  # 256-dim

    # Param features
    param_features = np.array([
        params.get("mb_threshold_low", -20) / -40.0,
        params.get("mb_threshold_mid", -18) / -40.0,
        params.get("mb_threshold_high", -16) / -40.0,
        params.get("mb_ratio_low", 2.5) / 5.0,
        params.get("stereo_width", 1.0) / 2.0,
        float(params.get("analog_saturation", False)),
        params.get("saturation_drive", 0.0),
        params.get("target_lufs", -14.0) / -20.0,
    ], dtype=np.float32)

    combined = np.concatenate([spec_features, param_features])  # 264-dim

    # Project to 64-dim via random matrix
    W = rng.randn(64, len(combined)).astype(np.float32)
    W /= np.linalg.norm(W, axis=1, keepdims=True)
    return W @ combined
```

## Task 7.3 — Cold-Start Logic in Inference Service

Update `backend/app/services/inference.py`:
```python
def get_params(self, ...) -> tuple[dict, str]:
    # Check cold-start
    if artist_vector is not None and np.all(artist_vector == 0):
        # Cold start — zero vector means no sessions yet, use heuristic
        params = get_heuristic_params(genre, platform)
        return params, "heuristic_cold_start"

    # Otherwise proceed with RainNet or heuristic as before
```

## Task 7.4 — AIE Export API

### `backend/app/api/routes/aie.py`
```python
@router.get("/aie/profile/export")
async def export_aie_profile(current_user: CurrentUser = Depends(require_tier("artist","studio_pro","enterprise"))):
    """
    Export AIE profile as a signed, encrypted file.
    The profile works best on RAIN but is portable — user owns it.
    """
    # Serialize profile to JSON
    # Encrypt with user-specific key (HKDF from user_id + RAIN_WATERMARK_KEY)
    # Sign with RAIN cert key (Ed25519)
    # Return as binary download
```

## Task 7.5 — Reference Artist Matching (Artist+ tier)

### `backend/app/api/routes/aie.py`
```python
@router.post("/aie/reference-match")
async def reference_match(
    file: UploadFile,  # reference audio file
    current_user: CurrentUser = Depends(require_tier("artist","studio_pro","enterprise"))
):
    """
    Compute reference artist embedding, return interpolated target vector.
    Frontend uses this to steer the next mastering session.
    """
    # Extract mel from reference audio
    # Run through ReferenceEncoder ONNX
    # Interpolate between user's voice_vector and reference embedding
    # Store as session-scoped target override
```

---

## Tests to Pass Before Reporting

```
✓ AIE profile created on first session completion
✓ session_count increments correctly
✓ EMA update: after 5 sessions, voice_vector is non-zero
✓ Cold-start: sessions 1-5 return source='heuristic_cold_start'
✓ Session 6+: voice_vector non-zero → passed to inference
✓ Profile export: Ed25519 signature validates
```

## Report Format
```
PART-7 COMPLETE
AIE: EMA updates working, cold-start threshold 5 sessions
Profile export: signed and encrypted
Reference matching: ONNX encoder loaded (stub if untrained)
Ready for: PART-8, PART-9 (may proceed in parallel)
```

**HALT. Wait for instruction.**

---
---

