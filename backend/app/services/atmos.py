"""Dolby Atmos automated upmixing service. Studio Pro tier only."""
from __future__ import annotations
import io
import struct
import numpy as np
import soundfile as sf
import structlog
from typing import Optional

logger = structlog.get_logger()

# Genre-specific spatial templates (azimuth in degrees, elevation in degrees)
GENRE_SPATIAL_TEMPLATES: dict[str, dict[str, tuple[float, float]]] = {
    "electronic": {
        "vocals":       (0.0, 15.0),
        "drums":        (0.0, 0.0),
        "bass":         (0.0, -5.0),
        "instruments":  (45.0, 0.0),
        "fx":           (90.0, 30.0),
    },
    "default": {
        "vocals":       (0.0, 15.0),
        "drums":        (30.0, 0.0),
        "bass":         (0.0, -5.0),
        "instruments":  (45.0, 10.0),
        "fx":           (90.0, 20.0),
    },
}


async def upmix_to_atmos(
    audio_data: bytes,
    stems: list[dict],
    genre: str,
    binaural_preview: bool = True,
) -> dict:
    """
    Automated stereo-to-Atmos upmixing. Studio Pro tier only.

    Returns:
        {
            "adm_bwf": bytes,              # ADM BWF with Dolby Atmos object metadata
            "binaural_preview": bytes | None,  # binaural mix (if requested)
            "object_count": int,
            "genre_template": str,
        }

    NOTE: Full ADM BWF encoding requires Dolby Atmos Renderer SDK (licensed separately).
    This implementation produces a valid structural stub with correct chunk headers.
    DEVIATION: Binaural convolution uses identity HRTF (bypass) until HRTF dataset loaded.
    """
    audio, sr = sf.read(io.BytesIO(audio_data), dtype="float32", always_2d=True)
    template = GENRE_SPATIAL_TEMPLATES.get(genre, GENRE_SPATIAL_TEMPLATES["default"])

    # Build ADM metadata XML (minimal compliant structure)
    objects = []
    for stem in stems:
        role = stem.get("role", "other")
        azimuth, elevation = template.get(role, (0.0, 0.0))
        objects.append({
            "role": role,
            "azimuth": azimuth,
            "elevation": elevation,
        })

    adm_xml = _build_adm_xml(objects, duration_samples=len(audio), sample_rate=int(sr))
    adm_bwf = _wrap_in_bwf(audio_data, adm_xml)

    binaural_bytes: Optional[bytes] = None
    if binaural_preview:
        # DEVIATION: identity HRTF (no convolution) — placeholder until HRTF dataset
        binaural_bytes = audio_data

    logger.info(
        "atmos_upmix_complete",
        genre=genre,
        object_count=len(objects),
        stem_count=len(stems),
        binaural=binaural_preview,
        stage="atmos",
    )
    return {
        "adm_bwf": adm_bwf,
        "binaural_preview": binaural_bytes,
        "object_count": len(objects),
        "genre_template": genre if genre in GENRE_SPATIAL_TEMPLATES else "default",
    }


def _build_adm_xml(objects: list[dict], duration_samples: int, sample_rate: int) -> bytes:
    """Build minimal ADM metadata XML per ITU-R BS.2076."""
    duration_s = duration_samples / max(sample_rate, 1)
    object_xml = ""
    for i, obj in enumerate(objects):
        oid = f"AO_{i+1:04d}"
        object_xml += f"""
  <audioObject audioObjectID="{oid}" audioObjectName="{obj['role']}" start="00:00:00.00000" duration="{duration_s:.5f}">
    <audioPackFormatIDRef>AP_{i+1:04d}</audioPackFormatIDRef>
  </audioObject>
  <audioPackFormat audioPackFormatID="AP_{i+1:04d}" audioPackFormatName="{obj['role']}" typeLabel="0003">
    <audioChannelFormatIDRef>AC_{i+1:04d}</audioChannelFormatIDRef>
  </audioPackFormat>
  <audioChannelFormat audioChannelFormatID="AC_{i+1:04d}" audioChannelFormatName="{obj['role']}" typeLabel="0003">
    <audioBlockFormat audioBlockFormatID="AB_{i+1:04d}" rtime="00:00:00.00000" duration="{duration_s:.5f}">
      <position coordinate="azimuth">{obj['azimuth']:.1f}</position>
      <position coordinate="elevation">{obj['elevation']:.1f}</position>
      <position coordinate="distance">1.0</position>
    </audioBlockFormat>
  </audioChannelFormat>"""

    xml = f"""<?xml version="1.0" encoding="UTF-8"?>
<ebuCoreMain xmlns:adm="urn:ebu:metadata-schema:ebuCore_2015" xmlns="urn:ebu:metadata-schema:ebuCore_2015">
  <coreMetadata>
    <format>
      <audioFormatExtended version="ITU-R_BS.2076-2">
        <audioProgramme audioProgrammeID="APR_0001" audioProgrammeName="RAIN Atmos Mix">{object_xml}
      </audioFormatExtended>
    </format>
  </coreMetadata>
</ebuCoreMain>"""
    return xml.encode("utf-8")


def _wrap_in_bwf(audio_data: bytes, adm_xml: bytes) -> bytes:
    """
    Embed ADM XML in a BWF (Broadcast Wave Format) axml chunk.
    Appends axml chunk to the existing WAV data.
    """
    # Append axml chunk after existing WAV data
    chunk_id = b"axml"
    chunk_size = struct.pack("<I", len(adm_xml))
    axml_chunk = chunk_id + chunk_size + adm_xml
    if len(adm_xml) % 2 == 1:
        axml_chunk += b"\x00"  # pad byte

    # Update RIFF size
    if len(audio_data) >= 8 and audio_data[:4] == b"RIFF":
        new_size = struct.pack("<I", len(audio_data) - 8 + len(axml_chunk))
        return audio_data[:4] + new_size + audio_data[8:] + axml_chunk
    return audio_data + axml_chunk
