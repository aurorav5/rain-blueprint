"""
Shared pytest fixtures for RAIN backend tests.

Provides:
  - Async test client for FastAPI endpoints
  - Test database session with rollback
  - Audio fixture generation
  - Auth helper (JWT token for test user)
"""
from __future__ import annotations

import asyncio
import io
import struct
from typing import AsyncGenerator
from uuid import uuid4

import numpy as np
import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app.main import app


@pytest.fixture(scope="session")
def event_loop():
    """Use a single event loop for all async tests."""
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture
async def client() -> AsyncGenerator[AsyncClient, None]:
    """Async HTTP client for testing FastAPI endpoints."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.fixture
def test_wav_bytes() -> bytes:
    """Generate a valid 48kHz stereo WAV file (1 second of 440Hz sine) as bytes.

    This is a real WAV file — not random data — so it passes format validation
    and produces meaningful LUFS/true peak measurements.
    """
    sr = 48000
    duration = 1.0
    n_samples = int(sr * duration)
    channels = 2

    # Generate 440Hz sine at -20 dBFS
    amplitude = 10 ** (-20.0 / 20.0)  # ~0.1
    t = np.linspace(0, duration, n_samples, endpoint=False)
    mono = (amplitude * np.sin(2 * np.pi * 440 * t)).astype(np.float64)

    # Stereo: left = sine, right = sine shifted 90 degrees
    left = mono
    right = (amplitude * np.sin(2 * np.pi * 440 * t + np.pi / 2)).astype(np.float64)

    # Encode as 24-bit PCM WAV
    buf = io.BytesIO()
    bits_per_sample = 24
    byte_rate = sr * channels * (bits_per_sample // 8)
    block_align = channels * (bits_per_sample // 8)
    data_size = n_samples * block_align

    # WAV header
    buf.write(b"RIFF")
    buf.write(struct.pack("<I", 36 + data_size))
    buf.write(b"WAVE")
    buf.write(b"fmt ")
    buf.write(struct.pack("<I", 16))  # chunk size
    buf.write(struct.pack("<H", 1))   # PCM format
    buf.write(struct.pack("<H", channels))
    buf.write(struct.pack("<I", sr))
    buf.write(struct.pack("<I", byte_rate))
    buf.write(struct.pack("<H", block_align))
    buf.write(struct.pack("<H", bits_per_sample))
    buf.write(b"data")
    buf.write(struct.pack("<I", data_size))

    # Interleave samples as 24-bit signed integers
    scale = 2 ** 23 - 1
    for i in range(n_samples):
        for sample in (left[i], right[i]):
            val = int(np.clip(sample, -1.0, 1.0) * scale)
            buf.write(struct.pack("<i", val)[:3])  # 24-bit = 3 bytes

    return buf.getvalue()


@pytest.fixture
def test_user_id() -> str:
    """Generate a test user UUID."""
    return str(uuid4())


@pytest.fixture
def test_session_id() -> str:
    """Generate a test session UUID."""
    return str(uuid4())
