# RAIN — PART-10: RAIN Score + Suno Import Mode + AI Declaration
## Composite Quality Scoring, Suno Pipeline, AI Content Declaration

**Blueprint ref:** RAIN-BLUEPRINT-v1.0 / PART-10  
**Depends on:** PART-6 (Pipeline), PART-9 (Distribution metadata)

---

## Entry Checklist (confirm before starting)
- [ ] RAIN Score weights: Loudness 40 + True peak 20 + Codec 20 + Spectral 10 + Stereo 10 = 100
- [ ] RAIN Score: deterministic — same input = identical scores every time
- [ ] RAIN Score: per-platform scores computed independently (different LUFS/codec targets)
- [ ] Suno Import Mode: receives stems directly — no Demucs needed, stems already separated
- [ ] Suno session: auto-sets ai_generated=True, ai_source='suno'
- [ ] AI declaration: embedded in WAV metadata AND in DDEX ERN 4.3 XML
- [ ] Public score API: no auth required, rate limited (10/hr per IP)
- [ ] No fake data: stub scoring functions must vary with input, never return constants
- [ ] Sub-Phase Protocol: HALT → BUILD → TEST → REPORT → WAIT after each task

---

## Objective

Implement the RAIN Score composite quality metric, Suno Import Mode (dedicated upload flow
for AI-generated stems), and the AI declaration system that embeds in DDEX and all output
formats. This part activates the primary TAM strategy from the strategic analysis.

---

## Task 10.1 — RAIN Score Service

### Scoring Weights (Authoritative)

The RAIN Score is a composite 0–100 metric. Weights are fixed constants, not configurable
per-user. These values are deliberately conservative — the score should be hard to max out.

| Component | Max Points | Weight | Metric |
|-----------|-----------|--------|--------|
| Loudness compliance | 40 | 40% | \|LUFS − target\| penalty, 10 pts/LU deviation |
| True peak headroom | 20 | 20% | dBTP margin above ceiling, 10 pts/dB penalty |
| Codec penalty | 20 | 20% | Estimated quality loss from platform re-encoding (CodecNet) |
| Spectral balance | 10 | 10% | Deviation from genre-matched spectral centroid reference |
| Stereo field | 10 | 10% | Correlation coefficient + width vs. genre reference |

**Normalization:** Each component is independently scored 0–max, then summed. No
cross-component normalization. Overall = mean across all platforms. Per-platform scores
are computed independently against each platform's LUFS/codec target.

**Stub handling:** Until CodecNet and stereo analysis are fully implemented, use the
estimation functions below. Do NOT hardcode a constant — the estimate must vary with input.

### `backend/app/services/rain_score.py`
```python
import numpy as np
from typing import Optional

PLATFORM_TARGETS = {
    "spotify":      {"lufs": -14.0, "tp_max": -1.0, "codec": "ogg_q9"},
    "apple_music":  {"lufs": -16.0, "tp_max": -1.0, "codec": "aac_256"},
    "youtube":      {"lufs": -14.0, "tp_max": -1.0, "codec": "aac_128"},
    "tidal":        {"lufs": -14.0, "tp_max": -1.0, "codec": "flac"},
    "amazon_music": {"lufs": -14.0, "tp_max": -1.0, "codec": "aac_256"},
    "tiktok":       {"lufs": -14.0, "tp_max": -1.0, "codec": "aac_128"},
    "soundcloud":   {"lufs": -14.0, "tp_max": -1.0, "codec": "ogg_128"},
}

async def compute_rain_score(
    audio_data: bytes,
    primary_platform: str,
    mel: Optional[np.ndarray] = None,
) -> dict:
    """
    Compute RAIN Score: composite 0-100 quality metric.
    Returns per-platform subscores and overall.
    """
    from app.services.audio_analysis import measure_lufs_true_peak
    lufs, tp = await measure_lufs_true_peak(audio_data)

    scores = {}
    for platform, target in PLATFORM_TARGETS.items():
        # Loudness compliance score (0-40 points)
        lufs_delta = abs(lufs - target["lufs"])
        loudness_score = max(0, 40 - lufs_delta * 10)

        # True peak headroom score (0-20 points)
        tp_margin = target["tp_max"] - tp
        tp_score = 20 if tp_margin >= 0 else max(0, 20 + tp_margin * 10)

        # Codec penalty score (0-20 points) — from CodecNet ONNX
        codec_penalty = _estimate_codec_penalty(mel, platform) if mel is not None else 5.0
        codec_score = max(0, 20 - codec_penalty * 4)

        # Spectral balance score (0-10 points)
        spectral_score = _estimate_spectral_balance(mel) if mel is not None else 7.0

        # Stereo field score (0-10 points)
        stereo_score = 8.0  # TODO: compute from M/S ratio

        platform_score = loudness_score + tp_score + codec_score + spectral_score + stereo_score
        scores[platform] = round(min(100, platform_score))

    overall = round(sum(scores.values()) / len(scores))
    return {"overall": overall, **scores, "true_peak_dbtp": round(tp, 2), "integrated_lufs": round(lufs, 2)}

def _estimate_codec_penalty(mel: np.ndarray, platform: str) -> float:
    """Estimate codec quality loss in dB. Stub until CodecNet is trained."""
    high_freq_energy = mel[-16:].mean()  # top frequency bins
    # Higher high-freq energy = more codec penalty on lossy platforms
    if platform in ("tiktok", "soundcloud", "youtube"):
        return min(5.0, high_freq_energy * 3.0)
    return min(2.0, high_freq_energy * 1.0)

def _estimate_spectral_balance(mel: np.ndarray) -> float:
    """Score spectral balance 0-10. Good balance = energy distributed across spectrum."""
    band_energies = [mel[i*16:(i+1)*16].mean() for i in range(8)]
    variance = np.var(band_energies)
    return max(0.0, 10.0 - variance * 20)
```

---

## Task 10.2 — Suno Import Mode

### `backend/app/api/routes/suno_import.py`
```python
from fastapi import APIRouter, Depends, UploadFile, File, Form
from typing import List, Optional
import json

router = APIRouter(prefix="/suno-import", tags=["suno"])

SUNO_STEM_MAP = {
    # Suno v5 12-stem labels → OSMEF roles
    "vocals": "vocals",
    "vocals_bg": "vocals",
    "drums": "drums",
    "bass": "bass",
    "guitar": "instruments",
    "piano": "instruments",
    "synth": "instruments",
    "strings": "instruments",
    "brass": "instruments",
    "fx": "fx",
    "accompaniment": "accompaniment",
    "other": "other",
}

@router.post("/", status_code=201)
async def suno_import(
    stems: List[UploadFile] = File(...),
    metadata: str = Form(...),  # JSON: title, artist, genre, bpm, key
    target_platform: str = Form("spotify"),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Suno Import Mode: accepts up to 12 stems from Suno export.
    Auto-detects stem roles from filename.
    Runs stem-aware mastering chain — no Demucs needed.
    Sets ai_generated=True and ai_source='suno' automatically.
    """
    meta = json.loads(metadata)
    session_id = uuid4()

    # Auto-detect stem roles from filename
    uploaded_stems = []
    for stem_file in stems:
        filename = stem_file.filename or ""
        detected_role = "other"
        for suno_label, osmef_role in SUNO_STEM_MAP.items():
            if suno_label in filename.lower():
                detected_role = osmef_role
                break

        data = await stem_file.read()
        if current_user.tier != "free":
            key, file_hash = await upload_to_s3(data, str(current_user.user_id), str(session_id), filename)
        else:
            key, file_hash = None, hashlib.sha256(data).hexdigest()

        uploaded_stems.append({
            "role": detected_role,
            "file_key": key,
            "file_hash": file_hash,
            "filename": filename,
        })

    # Create session with ai_generated=True, ai_source='suno', stems attached
    # Dispatch stem-aware analysis + render (no Demucs needed — stems already separated)
    # Dispatch AI declaration embedding
    # ...
```

---

## Task 10.3 — AI Declaration Embedding

### `backend/app/services/ai_declaration.py`
```python
def embed_ai_declaration(audio_data: bytes, ai_source: str, declaration_text: str) -> bytes:
    """
    Embed AI generation declaration in WAV file metadata (ID3/INFO chunk).
    Also generates the DDEX AI declaration field.
    Declaration text: "Generated with AI assistance using [source]."
    """
    # Write IKEY and IENG chunks in WAV INFO LIST block
    # Append AI_GENERATED=true to ID3 TXXX frame if MP3 output
    # Return modified audio bytes
```

---

## Task 10.4 — RAIN Score Public API

```python
@router.post("/score")
async def public_rain_score(file: UploadFile, platform: str = "spotify"):
    """
    Public scoring endpoint.
    Free: 10 scores/month (rate-limited by IP + API key)
    Returns RAIN Score JSON without requiring account
    """
```

---

## Tests to Pass Before Reporting

```
✓ RAIN Score: compute_rain_score returns dict with 'overall' in [0,100] and per-platform keys
✓ RAIN Score: per-platform scores are independent (Spotify ≠ Apple Music for same input)
✓ RAIN Score: -14 LUFS input scores higher on Spotify than -8 LUFS input (loudness compliance)
✓ RAIN Score: -16 LUFS input scores higher on Apple Music than -14 LUFS input
✓ RAIN Score: true peak at -0.5 dBTP scores lower than true peak at -1.5 dBTP (headroom)
✓ RAIN Score: component weights sum to 100 (40+20+20+10+10)
✓ RAIN Score: deterministic — same input produces identical scores on repeated calls
✓ Suno Import Mode: 12 stems uploaded → stem roles auto-detected → session created
✓ Suno session: ai_generated=True, ai_source='suno' set automatically
✓ AI declaration: embeds in output WAV metadata (TXXX frame or equivalent)
✓ Public score API: returns JSON without authentication, rate limited to 10/hr per IP
```

**HALT. Wait for instruction.**

---
---

