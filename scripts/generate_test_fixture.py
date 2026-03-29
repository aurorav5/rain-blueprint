"""Generate a 5-second 48kHz stereo sine wave WAV for E2E testing."""
import numpy as np
import soundfile as sf
import os

SR = 48000
DURATION = 5.0
FREQ = 997.0  # near 1kHz, avoids aliasing at bin boundaries
AMPLITUDE = 0.5  # -6 dBFS, avoids true peak clipping

n = int(SR * DURATION)
t = np.linspace(0, DURATION, n, endpoint=False)
sine = AMPLITUDE * np.sin(2.0 * np.pi * FREQ * t)
stereo = np.stack([sine, sine], axis=1)

os.makedirs("backend/tests/fixtures", exist_ok=True)
sf.write("backend/tests/fixtures/test_48k_stereo.wav", stereo, SR, subtype="PCM_24")
print(f"Written backend/tests/fixtures/test_48k_stereo.wav ({n} samples, {DURATION}s, {SR}Hz)")
