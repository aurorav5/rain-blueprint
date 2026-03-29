"""
RainNet inference service.
RAIN_NORMALIZATION_VALIDATED gate is enforced here.
When gate=false: heuristic fallback is mandatory. No inference runs.
"""
import time
from typing import Optional
import numpy as np
import structlog

logger = structlog.get_logger()


def _sigmoid(x: np.ndarray) -> np.ndarray:
    return 1.0 / (1.0 + np.exp(-x))


def _softplus(x: np.ndarray) -> np.ndarray:
    return np.log1p(np.exp(x))


def _decode_params(raw: np.ndarray) -> dict:
    """Convert raw ONNX output vector to ProcessingParams dict."""
    return {
        "mb_threshold_low":  float(_sigmoid(raw[0]) * -40),
        "mb_threshold_mid":  float(_sigmoid(raw[1]) * -40),
        "mb_threshold_high": float(_sigmoid(raw[2]) * -40),
        "mb_ratio_low":      float(_softplus(raw[3]) + 1.0),
        "mb_ratio_mid":      float(_softplus(raw[4]) + 1.0),
        "mb_ratio_high":     float(_softplus(raw[5]) + 1.0),
        "mb_attack_low":     float(_softplus(raw[6])),
        "mb_attack_mid":     float(_softplus(raw[7])),
        "mb_attack_high":    float(_softplus(raw[8])),
        "mb_release_low":    float(_softplus(raw[9]) * 10),
        "mb_release_mid":    float(_softplus(raw[10]) * 10),
        "mb_release_high":   float(_softplus(raw[11]) * 10),
        "eq_gains":          [float(np.tanh(raw[12 + i]) * 12) for i in range(8)],
        "analog_saturation": bool(_sigmoid(raw[20]) > 0.5),
        "saturation_drive":  float(_sigmoid(raw[21])),
        "saturation_mode":   "tape",
        "ms_enabled":        bool(_sigmoid(raw[22]) > 0.5),
        "mid_gain":          float(np.tanh(raw[23]) * 6),
        "side_gain":         float(np.tanh(raw[24]) * 6),
        "stereo_width":      float(_sigmoid(raw[25]) * 2),
        "sail_enabled":      bool(_sigmoid(raw[26]) > 0.5),
        "sail_stem_gains":   [float(np.tanh(raw[27 + i]) * 3) for i in range(5)] + [0.0],
        "target_lufs":       -14.0,   # set by caller based on platform
        "true_peak_ceiling": -1.0,    # set by caller based on platform
        "vinyl_mode":        False,
    }


class InferenceService:
    _instance: Optional["InferenceService"] = None
    _session = None  # ort.InferenceSession when loaded

    @classmethod
    def get(cls) -> "InferenceService":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def __init__(self) -> None:
        self._load_model()

    def _load_model(self) -> None:
        from pathlib import Path
        from app.core.config import settings
        model_path = Path(settings.ONNX_MODEL_PATH)
        if not model_path.exists():
            logger.warning("rainnet_model_not_found", path=str(model_path))
            return
        try:
            import onnxruntime as ort
            opts = ort.SessionOptions()
            opts.intra_op_num_threads = 2
            self._session = ort.InferenceSession(
                str(model_path),
                sess_options=opts,
                providers=["CPUExecutionProvider"],
            )
            logger.info("rainnet_loaded", path=str(model_path))
        except Exception as e:
            logger.error("rainnet_load_failed", error=str(e), error_code="RAIN-E401")

    def predict(
        self,
        mel_spectrogram: np.ndarray,
        artist_vector: np.ndarray,
        genre_id: int,
        platform_id: int,
        simple_mode: bool,
    ) -> Optional[dict]:
        """Returns ProcessingParams dict or None if gate blocked / inference failed."""
        from app.core.config import settings

        if not settings.RAIN_NORMALIZATION_VALIDATED:
            logger.info(
                "rainnet_blocked_by_gate",
                error_code="RAIN-E400",
                message="RAIN_NORMALIZATION_VALIDATED=false — heuristic fallback active",
            )
            return None

        if self._session is None:
            logger.error("rainnet_model_unavailable", error_code="RAIN-E401")
            return None

        t0 = time.time()
        try:
            outputs = self._session.run(
                ["params_raw"],
                {
                    "mel":          mel_spectrogram[np.newaxis, np.newaxis].astype(np.float32),
                    "artist_vec":   artist_vector[np.newaxis].astype(np.float32),
                    "genre_id":     np.array([genre_id], dtype=np.int64),
                    "platform_id":  np.array([platform_id], dtype=np.int64),
                    "simple_mode":  np.array([[1.0 if simple_mode else 0.0]], dtype=np.float32),
                },
            )
            elapsed = time.time() - t0
            if elapsed > 2.0:
                logger.warning("rainnet_slow_inference", elapsed_s=round(elapsed, 3), error_code="RAIN-E402")
            return _decode_params(outputs[0][0])

        except Exception as e:
            logger.error("rainnet_inference_error", error=str(e), error_code="RAIN-E402")
            return None

    PLATFORM_ID_MAP: dict[str, int] = {
        "spotify": 0, "apple_music": 1, "youtube": 2, "tidal": 3,
        "amazon_music": 4, "tiktok": 5, "soundcloud": 6, "vinyl": 7,
    }

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
        Never raises. Always returns a valid full ProcessingParams dict.
        """
        from ml.rainnet.heuristics import get_heuristic_params, PLATFORM_LUFS

        platform_id = self.PLATFORM_ID_MAP.get(platform, 0)

        # Cold-start check: zero artist vector means no sessions yet
        if artist_vector is not None and np.all(np.abs(artist_vector) < 1e-8):
            from ml.rainnet.heuristics import get_heuristic_params
            params = get_heuristic_params(genre or "default", platform or "spotify")
            return params, "heuristic_cold_start"

        result = self.predict(mel_spectrogram, artist_vector, 0, platform_id, simple_mode)
        if result is None:
            vinyl = platform == "vinyl"
            params = get_heuristic_params(genre, platform, vinyl=vinyl)
            return params, "heuristic"

        # Patch platform-dependent fields that are not predicted
        result["target_lufs"] = PLATFORM_LUFS.get(platform, -14.0)
        result["true_peak_ceiling"] = -3.0 if platform == "vinyl" else -1.0
        result["vinyl_mode"] = platform == "vinyl"
        return result, "rainnet"
