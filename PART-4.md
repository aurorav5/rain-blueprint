# RAIN — PART-4: RainNet v2
## ML Model Architecture, ONNX Export, Inference Service

**Blueprint ref:** RAIN-BLUEPRINT-v1.0 / PART-4  
**Depends on:** PART-1 (structure), PART-3 (backend services)  
**Gates next:** PART-6 (Pipeline) — inference service must be operational first

---

## Entry Checklist (confirm before starting)
- [ ] RAIN_NORMALIZATION_VALIDATED=false — RainNet inference is BLOCKED, heuristic fallback MANDATORY
- [ ] Heuristic fallback must output all fields from CLAUDE.md §Canonical ProcessingParams Schema
- [ ] Field names are strict — use `eq_gains` not `eq_bands`, `target_lufs` not `lufs_target`
- [ ] Backend heuristic params are AUTHORITATIVE — frontend (PART-5) must match these values
- [ ] ONNX export must validate: load in onnxruntime, run dummy input, output shape correct
- [ ] No fake data: no invented model weights, no hardcoded inference results
- [ ] Error codes: RAIN-E* only
- [ ] Sub-Phase Protocol: HALT → BUILD → TEST → REPORT → WAIT after each task

---

## Objective

Build the RainNet v2 model architecture, define the training pipeline, export to ONNX, and
implement the backend inference service. The `RAIN_NORMALIZATION_VALIDATED` gate is enforced
throughout — when false, RainNet inference is BLOCKED and the heuristic fallback is MANDATORY.

This part also defines all supporting models: AnalogNet, SpectralRepairNet, CodecNet,
GenreClassifier, ReferenceEncoder.

---

## Task 4.1 — RainNet v2 Model Architecture

### `ml/rainnet/model.py`

RainNet v2 is a conditional transformer that takes a multi-modal input and outputs a
processing parameter vector for RainDSP.

**Architecture:**
- **Input encoders** (all outputs projected to 256-dim):
  - Mel spectrogram encoder: 3-layer CNN → global avg pool → 256-dim
    - Input: 128 mel bins × 128 frames (approximately 3s at 48kHz/hop=512)
    - Conv blocks: [128, 256, 256] channels, kernel 3×3, GELU, LayerNorm
  - Artist identity vector: 64-dim → Linear(64, 256) → GELU
  - Genre embedding: vocab=87 → Embedding(87, 64) → Linear(64, 256)
  - Platform target: vocab=8 → Embedding(8, 32) → Linear(32, 256)
  - Mode flag (simple/advanced): Linear(1, 32) → Linear(32, 256)

- **Cross-modal transformer:**
  - 4 encoder layers, 8 heads, d_model=256, ffn=1024
  - Input: concatenated tokens [spectrogram_token, artist_token, genre_token, platform_token, mode_token]
  - Positional encoding: learned, 5 positions
  - Output: CLS token (add learnable [CLS] at position 0)

- **Parameter decoder:**
  - MLP(256 → 512 → 256 → N_PARAMS)
  - N_PARAMS = 32 (covers all ProcessingParams in rain_dsp.h)
  - Output activations per parameter group:
    - Thresholds: Sigmoid → scale to [-40, 0] dB
    - Ratios: Softplus + 1.0 → [1.0, ∞)
    - Times (attack/release): Softplus → ms
    - Gains: Tanh → scale to [-12, +12] dB
    - Booleans: Sigmoid (threshold at 0.5 during inference)
    - Drive: Sigmoid → [0.0, 1.0]
    - LUFS target: Fixed based on platform embedding (not predicted)
    - True peak ceiling: Fixed at -1.0 dBTP (or -3.0 for vinyl)

```python
import torch
import torch.nn as nn
from typing import Optional

class MelSpecEncoder(nn.Module):
    def __init__(self, output_dim: int = 256):
        super().__init__()
        self.convs = nn.Sequential(
            nn.Conv2d(1, 128, 3, padding=1), nn.GELU(), nn.LayerNorm([128, 128, 128]),
            nn.Conv2d(128, 256, 3, padding=1, stride=2), nn.GELU(),
            nn.Conv2d(256, 256, 3, padding=1, stride=2), nn.GELU(),
        )
        self.pool = nn.AdaptiveAvgPool2d(1)
        self.proj = nn.Linear(256, output_dim)

    def forward(self, mel: torch.Tensor) -> torch.Tensor:
        # mel: [B, 1, 128, 128]
        x = self.convs(mel)
        x = self.pool(x).squeeze(-1).squeeze(-1)
        return self.proj(x)

class RainNetV2(nn.Module):
    N_PARAMS = 32

    def __init__(self, d_model: int = 256, n_heads: int = 8, n_layers: int = 4,
                 n_genres: int = 87, n_platforms: int = 8):
        super().__init__()
        self.d_model = d_model

        # Input encoders
        self.mel_encoder = MelSpecEncoder(d_model)
        self.artist_proj = nn.Sequential(nn.Linear(64, d_model), nn.GELU())
        self.genre_embed = nn.Sequential(nn.Embedding(n_genres, 64), nn.Linear(64, d_model))
        self.platform_embed = nn.Sequential(nn.Embedding(n_platforms, 32), nn.Linear(32, d_model))
        self.mode_proj = nn.Sequential(nn.Linear(1, 32), nn.GELU(), nn.Linear(32, d_model))

        # Learnable CLS token
        self.cls_token = nn.Parameter(torch.randn(1, 1, d_model))

        # Positional encoding (6 positions: CLS + 5 modalities)
        self.pos_embed = nn.Parameter(torch.randn(1, 6, d_model))

        # Transformer
        encoder_layer = nn.TransformerEncoderLayer(
            d_model=d_model, nhead=n_heads, dim_feedforward=1024,
            activation="gelu", batch_first=True, norm_first=True
        )
        self.transformer = nn.TransformerEncoder(encoder_layer, num_layers=n_layers)

        # Parameter decoder
        self.decoder = nn.Sequential(
            nn.Linear(d_model, 512), nn.GELU(),
            nn.Linear(512, 256), nn.GELU(),
            nn.Linear(256, self.N_PARAMS)
        )

    def forward(
        self,
        mel: torch.Tensor,          # [B, 1, 128, 128]
        artist_vec: torch.Tensor,   # [B, 64]
        genre_id: torch.Tensor,     # [B] int
        platform_id: torch.Tensor,  # [B] int
        simple_mode: torch.Tensor,  # [B, 1] float
    ) -> torch.Tensor:              # [B, N_PARAMS]

        B = mel.shape[0]

        # Encode each modality
        mel_tok = self.mel_encoder(mel).unsqueeze(1)              # [B, 1, D]
        art_tok = self.artist_proj(artist_vec).unsqueeze(1)       # [B, 1, D]
        gen_tok = self.genre_embed(genre_id).unsqueeze(1)         # [B, 1, D]
        plt_tok = self.platform_embed(platform_id).unsqueeze(1)   # [B, 1, D]
        mod_tok = self.mode_proj(simple_mode).unsqueeze(1)        # [B, 1, D]

        cls = self.cls_token.expand(B, -1, -1)                   # [B, 1, D]
        tokens = torch.cat([cls, mel_tok, art_tok, gen_tok, plt_tok, mod_tok], dim=1)
        tokens = tokens + self.pos_embed

        out = self.transformer(tokens)
        cls_out = out[:, 0, :]  # CLS token
        return self.decoder(cls_out)

    def decode_params(self, raw: torch.Tensor) -> dict:
        """Convert raw model output to ProcessingParams-compatible dict."""
        p = raw.squeeze(0)
        return {
            "mb_threshold_low":  (torch.sigmoid(p[0]) * -40).item(),
            "mb_threshold_mid":  (torch.sigmoid(p[1]) * -40).item(),
            "mb_threshold_high": (torch.sigmoid(p[2]) * -40).item(),
            "mb_ratio_low":      (torch.nn.functional.softplus(p[3]) + 1.0).item(),
            "mb_ratio_mid":      (torch.nn.functional.softplus(p[4]) + 1.0).item(),
            "mb_ratio_high":     (torch.nn.functional.softplus(p[5]) + 1.0).item(),
            "mb_attack_low":     torch.nn.functional.softplus(p[6]).item(),
            "mb_attack_mid":     torch.nn.functional.softplus(p[7]).item(),
            "mb_attack_high":    torch.nn.functional.softplus(p[8]).item(),
            "mb_release_low":    (torch.nn.functional.softplus(p[9]) * 10).item(),
            "mb_release_mid":    (torch.nn.functional.softplus(p[10]) * 10).item(),
            "mb_release_high":   (torch.nn.functional.softplus(p[11]) * 10).item(),
            "eq_gains":          [(torch.tanh(p[12 + i]) * 12).item() for i in range(8)],
            "analog_saturation": (torch.sigmoid(p[20]) > 0.5).item(),
            "saturation_drive":  torch.sigmoid(p[21]).item(),
            "ms_enabled":        (torch.sigmoid(p[22]) > 0.5).item(),
            "mid_gain":          (torch.tanh(p[23]) * 6).item(),
            "side_gain":         (torch.tanh(p[24]) * 6).item(),
            "stereo_width":      (torch.sigmoid(p[25]) * 2).item(),
            "sail_enabled":      (torch.sigmoid(p[26]) > 0.5).item(),
            "sail_stem_gains":   [(torch.tanh(p[27 + i]) * 3).item() for i in range(5)],
        }
```

---

## Task 4.2 — Heuristic Fallback (Always Available)

### `ml/rainnet/heuristics.py`

This runs whenever `RAIN_NORMALIZATION_VALIDATED=false` or inference fails. It MUST always
produce a valid `ProcessingParams` dict. This is never behind the gate.

```python
from typing import Optional

# Genre-matched presets. Key = genre class label.
GENRE_PRESETS = {
    "electronic": {"mb_threshold_low": -18, "mb_threshold_mid": -16, "mb_threshold_high": -14,
                   "mb_ratio_low": 3.0, "mb_ratio_mid": 2.5, "mb_ratio_high": 2.0,
                   "stereo_width": 1.3, "analog_saturation": False},
    "hiphop":     {"mb_threshold_low": -16, "mb_threshold_mid": -14, "mb_threshold_high": -14,
                   "mb_ratio_low": 3.5, "mb_ratio_mid": 2.5, "mb_ratio_high": 2.0,
                   "stereo_width": 1.1, "analog_saturation": True, "saturation_drive": 0.2},
    "rock":       {"mb_threshold_low": -18, "mb_threshold_mid": -16, "mb_threshold_high": -12,
                   "mb_ratio_low": 2.5, "mb_ratio_mid": 2.0, "mb_ratio_high": 2.5,
                   "analog_saturation": True, "saturation_drive": 0.15},
    "pop":        {"mb_threshold_low": -20, "mb_threshold_mid": -18, "mb_threshold_high": -16,
                   "mb_ratio_low": 2.0, "mb_ratio_mid": 2.0, "mb_ratio_high": 1.8,
                   "stereo_width": 1.1},
    "classical":  {"mb_threshold_low": -24, "mb_threshold_mid": -22, "mb_threshold_high": -22,
                   "mb_ratio_low": 1.5, "mb_ratio_mid": 1.5, "mb_ratio_high": 1.5,
                   "stereo_width": 0.95},
    "jazz":       {"mb_threshold_low": -22, "mb_threshold_mid": -20, "mb_threshold_high": -20,
                   "mb_ratio_low": 2.0, "mb_ratio_mid": 1.8, "mb_ratio_high": 1.5,
                   "analog_saturation": True, "saturation_drive": 0.1},
    "default":    {"mb_threshold_low": -20, "mb_threshold_mid": -18, "mb_threshold_high": -16,
                   "mb_ratio_low": 2.5, "mb_ratio_mid": 2.0, "mb_ratio_high": 2.0},
}

PLATFORM_LUFS = {
    "spotify": -14.0,
    "apple_music": -16.0,
    "youtube": -14.0,
    "tidal": -14.0,
    "amazon_music": -14.0,
    "tiktok": -14.0,
    "soundcloud": -14.0,
    "vinyl": -14.0,  # SAIL + RIAA handles vinyl specifics
}

BASE_PARAMS = {
    "mb_attack_low": 10.0, "mb_attack_mid": 5.0, "mb_attack_high": 2.0,
    "mb_release_low": 150.0, "mb_release_mid": 80.0, "mb_release_high": 40.0,
    "eq_gains": [0.0] * 8,
    "analog_saturation": False, "saturation_drive": 0.0, "saturation_mode": "tape",
    "ms_enabled": False, "mid_gain": 0.0, "side_gain": 0.0, "stereo_width": 1.0,
    "sail_enabled": False, "sail_stem_gains": [0.0] * 6,
    "vinyl_mode": False,
}

def get_heuristic_params(genre: Optional[str], platform: str, vinyl: bool = False) -> dict:
    params = BASE_PARAMS.copy()
    preset = GENRE_PRESETS.get(genre or "default", GENRE_PRESETS["default"])
    params.update(preset)
    params["target_lufs"] = PLATFORM_LUFS.get(platform, -14.0)
    params["true_peak_ceiling"] = -3.0 if vinyl else -1.0
    params["vinyl_mode"] = vinyl
    return params
```

---

## Task 4.3 — ONNX Export

### `ml/rainnet/export.py`
```python
import torch
import torch.onnx
from pathlib import Path
from model import RainNetV2

def export_onnx(checkpoint_path: str, output_path: str = "rain_base.onnx"):
    model = RainNetV2()
    if checkpoint_path:
        state = torch.load(checkpoint_path, map_location="cpu")
        model.load_state_dict(state["model_state_dict"])
    model.eval()

    # Dummy inputs for tracing
    dummy_mel = torch.randn(1, 1, 128, 128)
    dummy_artist = torch.zeros(1, 64)  # cold-start: zero vector
    dummy_genre = torch.zeros(1, dtype=torch.long)
    dummy_platform = torch.zeros(1, dtype=torch.long)
    dummy_mode = torch.ones(1, 1)

    torch.onnx.export(
        model,
        (dummy_mel, dummy_artist, dummy_genre, dummy_platform, dummy_mode),
        output_path,
        input_names=["mel", "artist_vec", "genre_id", "platform_id", "simple_mode"],
        output_names=["params_raw"],
        dynamic_axes={
            "mel": {0: "batch"},
            "artist_vec": {0: "batch"},
            "genre_id": {0: "batch"},
            "platform_id": {0: "batch"},
            "simple_mode": {0: "batch"},
            "params_raw": {0: "batch"},
        },
        opset_version=17,
        do_constant_folding=True,
    )
    print(f"Exported RainNet v2 to {output_path}")

    # Validate
    import onnx
    import onnxruntime as ort
    onnx_model = onnx.load(output_path)
    onnx.checker.check_model(onnx_model)
    sess = ort.InferenceSession(output_path)
    out = sess.run(None, {
        "mel": dummy_mel.numpy(),
        "artist_vec": dummy_artist.numpy(),
        "genre_id": dummy_genre.numpy(),
        "platform_id": dummy_platform.numpy(),
        "simple_mode": dummy_mode.numpy(),
    })
    print(f"ONNX validation OK. Output shape: {out[0].shape}")
    return output_path
```

---

## Task 4.4 — Backend Inference Service

### `backend/app/services/inference.py`
```python
import numpy as np
import onnxruntime as ort
import structlog
import time
from typing import Optional
from pathlib import Path
from app.core.config import settings
from ml.rainnet.heuristics import get_heuristic_params

logger = structlog.get_logger()

class InferenceService:
    _instance: Optional["InferenceService"] = None
    _session: Optional[ort.InferenceSession] = None

    @classmethod
    def get(cls) -> "InferenceService":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def __init__(self):
        self._load_model()

    def _load_model(self):
        model_path = Path(settings.ONNX_MODEL_PATH)
        if not model_path.exists():
            logger.warning("rainnet_model_not_found", path=str(model_path))
            return
        try:
            opts = ort.SessionOptions()
            opts.intra_op_num_threads = 2
            self._session = ort.InferenceSession(
                str(model_path),
                sess_options=opts,
                providers=["CPUExecutionProvider"],
            )
            logger.info("rainnet_loaded", path=str(model_path))
        except Exception as e:
            logger.error("rainnet_load_failed", error=str(e))

    def predict(
        self,
        mel_spectrogram: np.ndarray,    # [1, 128, 128] float32
        artist_vector: np.ndarray,       # [64] float32
        genre_id: int,
        platform_id: int,
        simple_mode: bool,
    ) -> Optional[dict]:
        """
        Returns ProcessingParams dict or None if inference blocked/failed.
        RAIN_NORMALIZATION_VALIDATED gate is enforced here.
        """
        if not settings.RAIN_NORMALIZATION_VALIDATED:
            logger.info("rainnet_blocked_by_gate",
                        message="RAIN_NORMALIZATION_VALIDATED=false — heuristic fallback active")
            return None  # Caller must use heuristic fallback

        if self._session is None:
            logger.error("rainnet_inference_failed", code="RAIN-E401")
            return None

        t0 = time.time()
        try:
            outputs = self._session.run(
                ["params_raw"],
                {
                    "mel": mel_spectrogram[np.newaxis, np.newaxis],  # [1, 1, 128, 128]
                    "artist_vec": artist_vector[np.newaxis],          # [1, 64]
                    "genre_id": np.array([genre_id], dtype=np.int64),
                    "platform_id": np.array([platform_id], dtype=np.int64),
                    "simple_mode": np.array([[1.0 if simple_mode else 0.0]], dtype=np.float32),
                }
            )
            elapsed = time.time() - t0
            if elapsed > 2.0:
                logger.warning("rainnet_slow_inference", elapsed_s=elapsed)

            raw = outputs[0][0]  # [N_PARAMS]
            return _decode_params(raw)

        except Exception as e:
            logger.error("rainnet_inference_error", error=str(e), code="RAIN-E402")
            return None

    def get_params(
        self,
        mel_spectrogram: np.ndarray,
        artist_vector: np.ndarray,
        genre: Optional[str],
        platform: str,
        simple_mode: bool,
    ) -> tuple[dict, str]:
        """
        Returns (params_dict, source) where source is 'rainnet' or 'heuristic'.
        NEVER raises. Always returns a valid params dict.
        """
        PLATFORM_ID_MAP = {
            "spotify": 0, "apple_music": 1, "youtube": 2, "tidal": 3,
            "amazon_music": 4, "tiktok": 5, "soundcloud": 6, "vinyl": 7
        }
        GENRE_ID_MAP = {}  # populated from genre classifier vocab

        platform_id = PLATFORM_ID_MAP.get(platform, 0)
        genre_id = GENRE_ID_MAP.get(genre or "default", 0)

        result = self.predict(mel_spectrogram, artist_vector, genre_id, platform_id, simple_mode)
        if result is None:
            params = get_heuristic_params(genre, platform, vinyl=(platform == "vinyl"))
            return params, "heuristic"

        return result, "rainnet"


def _decode_params(raw: np.ndarray) -> dict:
    """Convert raw ONNX output to ProcessingParams dict."""
    def sigmoid(x): return 1 / (1 + np.exp(-x))
    def softplus(x): return np.log(1 + np.exp(x))
    def tanh(x): return np.tanh(x)

    return {
        "mb_threshold_low":  float(sigmoid(raw[0]) * -40),
        "mb_threshold_mid":  float(sigmoid(raw[1]) * -40),
        "mb_threshold_high": float(sigmoid(raw[2]) * -40),
        "mb_ratio_low":      float(softplus(raw[3]) + 1.0),
        "mb_ratio_mid":      float(softplus(raw[4]) + 1.0),
        "mb_ratio_high":     float(softplus(raw[5]) + 1.0),
        "mb_attack_low":     float(softplus(raw[6])),
        "mb_attack_mid":     float(softplus(raw[7])),
        "mb_attack_high":    float(softplus(raw[8])),
        "mb_release_low":    float(softplus(raw[9]) * 10),
        "mb_release_mid":    float(softplus(raw[10]) * 10),
        "mb_release_high":   float(softplus(raw[11]) * 10),
        "eq_gains":          [float(tanh(raw[12 + i]) * 12) for i in range(8)],
        "analog_saturation": bool(sigmoid(raw[20]) > 0.5),
        "saturation_drive":  float(sigmoid(raw[21])),
        "ms_enabled":        bool(sigmoid(raw[22]) > 0.5),
        "mid_gain":          float(tanh(raw[23]) * 6),
        "side_gain":         float(tanh(raw[24]) * 6),
        "stereo_width":      float(sigmoid(raw[25]) * 2),
        "sail_enabled":      bool(sigmoid(raw[26]) > 0.5),
        "sail_stem_gains":   [float(tanh(raw[27 + i]) * 3) for i in range(5)],
    }
```

---

## Task 4.5 — Mel Spectrogram Extractor

### `backend/app/services/audio_analysis.py`
```python
import numpy as np
import librosa
import soundfile as sf
from io import BytesIO
from typing import Optional, Tuple

def extract_mel_spectrogram(
    audio_data: bytes,
    sr_target: int = 48000,
    n_mels: int = 128,
    n_frames: int = 128,
    hop_length: int = 512,
    n_fft: int = 2048,
) -> Tuple[np.ndarray, float, float]:
    """
    Returns (mel_spectrogram, duration_seconds, sample_rate).
    mel_spectrogram shape: [128, 128] float32
    """
    audio, sr = sf.read(BytesIO(audio_data), dtype="float32", always_2d=False)
    if len(audio.shape) > 1:
        audio = audio.mean(axis=1)  # mono downmix

    if sr != sr_target:
        audio = librosa.resample(audio, orig_sr=sr, target_sr=sr_target)
        sr = sr_target

    duration = len(audio) / sr

    # Extract fixed-length mel spectrogram from center of audio
    target_len = n_frames * hop_length
    if len(audio) < target_len:
        audio = np.pad(audio, (0, target_len - len(audio)))
    else:
        start = max(0, (len(audio) - target_len) // 2)
        audio = audio[start:start + target_len]

    mel = librosa.feature.melspectrogram(
        y=audio, sr=sr, n_mels=n_mels, n_fft=n_fft, hop_length=hop_length
    )
    mel_db = librosa.power_to_db(mel, ref=np.max)
    mel_norm = (mel_db - mel_db.min()) / (mel_db.max() - mel_db.min() + 1e-8)

    return mel_norm.astype(np.float32)[:, :n_frames], duration, float(sr)
```

---

## Task 4.6 — Supporting Models (Stubs + Architecture)

### `ml/genre_classifier/model.py`
EfficientNet-B0 based classifier. 87 genre classes.
Input: same mel spectrogram as RainNet.
Training: multi-label (a track can be multiple genres).
Export to ONNX with same dynamic axes pattern as RainNet.

### `ml/analog_net/model.py`
Lightweight 1D CNN. Processes frequency-domain features.
Three output heads (one per saturation mode: tape, transformer, tube).
Each head outputs a 128-point gain curve.

### `ml/codec_net/model.py`
Regression network. Predicts per-band codec penalty (dB) for each target platform.
Input: mel spectrogram + platform one-hot.
Output: [8 bands × 8 platforms] penalty matrix.
This feeds directly into RAIN Score computation (PART-10).

### `ml/spectral_repair/model.py`
U-Net architecture operating in STFT domain.
Targets three artifact classes: codec ringing, clipping, AI synthesis artifacts.
Input/output: spectrogram magnitude + phase (complex STFT).

### `ml/analog_net/reference_encoder.py`
Shared encoder architecture reused from RainNetV2's MelSpecEncoder.
Fine-tuned to produce 64-dim embeddings that cluster by artist/style.
Used for "sound like [reference]" feature and AIE reference matching.

---

## Task 4.7 — Training Pipeline Scaffold

### `ml/rainnet/train.py`

Define the training loop but do not require training to complete for this part.
The ONNX export of an **untrained** model is sufficient to pass the gate test —
real training happens on GPU infrastructure separately.

Required components:
- `RainNetDataset`: loads (audio_path, genre_label, platform_label, target_params) tuples
- Loss function: MSELoss on parameter vector + KL divergence term for mode prediction
- Optimizer: AdamW, lr=1e-4, weight_decay=1e-2
- LR scheduler: CosineAnnealingLR
- Checkpointing: save every epoch to `models/checkpoints/rainnet_v2_epoch_{N}.pt`
- Validation: hold-out 10%, report parameter-wise MAE

---

## Build Commands

```bash
# Export untrained model for integration testing
cd ml/rainnet
python export.py --checkpoint="" --output="../../models/rain_base.onnx"

# Test inference service
cd backend
python -c "
from app.services.inference import InferenceService
import numpy as np
svc = InferenceService.get()
mel = np.zeros((128, 128), dtype=np.float32)
vec = np.zeros(64, dtype=np.float32)
# With gate=false, should return heuristic
params, source = svc.get_params(mel, vec, 'pop', 'spotify', True)
print(f'Source: {source}')
print(f'Target LUFS: {params[\"target_lufs\"]}')
assert source == 'heuristic', 'Gate must block inference when RAIN_NORMALIZATION_VALIDATED=false'
print('GATE TEST PASSED')
"
```

---

## Tests to Pass Before Reporting

```
✓ ONNX export validates (onnx.checker.check_model passes)
✓ ONNX model loads in onnxruntime without error
✓ Inference service: with RAIN_NORMALIZATION_VALIDATED=false → source='heuristic' every time
✓ Heuristic fallback: returns valid params for all 8 target platforms and all preset genres
✓ Mel spectrogram extractor: returns [128, 128] float32 array for any valid audio input
✓ Inference latency: < 2s on CPU (onnxruntime, 1 thread)
```

---

## Report Format

```
PART-4 COMPLETE
RainNet v2: architecture defined, ONNX exported
ONNX model: [path], [size] bytes
Gate test: RAIN_NORMALIZATION_VALIDATED=false → heuristic confirmed
Inference latency: [X]ms on CPU
Supporting models: stubs in place
Deviations from spec: [none | list any]
Ready for: PART-5 (Frontend), PART-6 (Pipeline)
```

**HALT. Wait for instruction: "Proceed to Part 5" or "Proceed to Part 6".**
