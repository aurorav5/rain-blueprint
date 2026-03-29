"""AI Declaration — embeds AI generation metadata in WAV files (INFO chunk + ID3)."""
from __future__ import annotations
import struct
import io
import structlog

logger = structlog.get_logger()

# WAV RIFF chunk identifiers
_RIFF = b"RIFF"
_WAVE = b"WAVE"
_LIST = b"LIST"
_INFO = b"INFO"
_IKEY = b"IKEY"  # Keywords chunk (repurposed for AI flag)
_IENG = b"IENG"  # Engineer chunk (stores tool info)
_ICMT = b"ICMT"  # Comment chunk


def embed_ai_declaration(
    audio_data: bytes,
    ai_source: str,
    declaration_text: str,
) -> bytes:
    """
    Embed AI generation declaration in WAV file INFO LIST metadata chunk.
    Writes IKEY=AI_GENERATED, IENG=<source>, ICMT=<declaration_text>.
    Returns modified WAV bytes.
    Falls back to returning original bytes on any parse error.
    """
    try:
        return _embed_wav_info(audio_data, ai_source, declaration_text)
    except Exception as e:
        logger.warning("ai_declaration_embed_failed", error=str(e))
        return audio_data  # return unmodified rather than fail the pipeline


def _embed_wav_info(audio_data: bytes, ai_source: str, declaration_text: str) -> bytes:
    """Write/replace INFO LIST chunk in WAV with AI metadata."""
    buf = io.BytesIO(audio_data)

    # Validate RIFF header
    riff_tag = buf.read(4)
    if riff_tag != _RIFF:
        return audio_data  # Not a WAV file, return unchanged

    buf.read(4)  # file size (will be recalculated)
    wave_tag = buf.read(4)
    if wave_tag != _WAVE:
        return audio_data

    # Read all chunks, strip any existing LIST INFO
    chunks: list[tuple[bytes, bytes]] = []
    while True:
        header = buf.read(8)
        if len(header) < 8:
            break
        chunk_id = header[:4]
        chunk_size = struct.unpack("<I", header[4:])[0]
        chunk_data = buf.read(chunk_size)
        if chunk_size % 2 == 1:
            buf.read(1)  # pad byte

        # Skip existing LIST INFO chunk — we'll write a new one
        if chunk_id == _LIST and chunk_data[:4] == _INFO:
            continue
        chunks.append((chunk_id, chunk_data))

    # Build new LIST INFO chunk
    info_payload = _build_info_chunk(ai_source, declaration_text)
    list_chunk = _LIST + struct.pack("<I", len(info_payload)) + info_payload
    if len(list_chunk) % 2 == 1:
        list_chunk += b"\x00"

    # Rebuild WAV
    out = io.BytesIO()
    body = b""
    for cid, cdata in chunks:
        entry = cid + struct.pack("<I", len(cdata)) + cdata
        if len(cdata) % 2 == 1:
            entry += b"\x00"
        body += entry
    body += list_chunk

    out.write(_RIFF)
    out.write(struct.pack("<I", 4 + len(body)))
    out.write(_WAVE)
    out.write(body)
    return out.getvalue()


def _build_info_chunk(ai_source: str, declaration_text: str) -> bytes:
    """Build INFO sub-chunks: IKEY, IENG, ICMT."""
    def _sub(tag: bytes, text: str) -> bytes:
        encoded = (text + "\x00").encode("utf-8")
        if len(encoded) % 2 == 1:
            encoded += b"\x00"
        return tag + struct.pack("<I", len(encoded)) + encoded

    payload = _INFO
    payload += _sub(_IKEY, "AI_GENERATED=true")
    payload += _sub(_IENG, f"RAIN/{ai_source}")
    payload += _sub(_ICMT, declaration_text)
    return payload
