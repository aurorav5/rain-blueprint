"""RainDSP Python bridge. Prefers pybind11 native extension, falls back to subprocess CLI."""
from __future__ import annotations
import json
import subprocess
import tempfile
import os
import io
from dataclasses import dataclass
import soundfile as sf
import numpy as np
import structlog

logger = structlog.get_logger()


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
    Tries pybind11 native extension first; falls back to subprocess CLI.
    """

    def process(self, audio_data: bytes, params: dict) -> tuple[bytes, RenderResult]:
        try:
            return self._process_native(audio_data, params)
        except ImportError:
            logger.info("raindsp_bridge_fallback", reason="pybind11 extension not built")
            return self._process_subprocess(audio_data, params)

    def _process_native(self, audio_data: bytes, params: dict) -> tuple[bytes, RenderResult]:
        """Use pybind11 extension. Raises ImportError if not built."""
        import rain_dsp_native as rdsp  # type: ignore[import]
        audio, sr = sf.read(io.BytesIO(audio_data), dtype="float64", always_2d=True)
        left = np.ascontiguousarray(audio[:, 0])
        right = np.ascontiguousarray(audio[:, 1] if audio.shape[1] > 1 else audio[:, 0])

        out_left, out_right, result_json = rdsp.process(left, right, sr, json.dumps(params))
        result_dict = json.loads(result_json)

        out_audio = np.stack([out_left, out_right], axis=1)
        buf = io.BytesIO()
        sf.write(buf, out_audio, int(sr), subtype="PCM_24", format="WAV")
        return buf.getvalue(), RenderResult(**result_dict)

    def _process_subprocess(self, audio_data: bytes, params: dict) -> tuple[bytes, RenderResult]:
        """Subprocess fallback. Requires rain_dsp_cli binary on PATH."""
        with tempfile.TemporaryDirectory() as tmpdir:
            input_path = os.path.join(tmpdir, "input.wav")
            output_path = os.path.join(tmpdir, "output.wav")
            params_path = os.path.join(tmpdir, "params.json")

            with open(input_path, "wb") as f:
                f.write(audio_data)
            with open(params_path, "w") as f:
                json.dump(params, f)

            proc = subprocess.run(
                ["rain_dsp_cli", "--input", input_path, "--output", output_path,
                 "--params", params_path],
                capture_output=True, text=True, timeout=120,
            )
            if proc.returncode != 0:
                raise RuntimeError(f"RAIN-E300: RainDSP subprocess failed: {proc.stderr}")

            result_dict = json.loads(proc.stdout)
            with open(output_path, "rb") as f:
                output_audio = f.read()

        return output_audio, RenderResult(**result_dict)
