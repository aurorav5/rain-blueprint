# RAIN — PART-9: Distribution Pipeline
## ISRC/UPC, DDEX ERN 4.3, LabelGrid API, OSMEF

**Blueprint ref:** RAIN-BLUEPRINT-v1.0 / PART-9  
**Depends on:** PART-6 (Pipeline), PART-8 (RAIN-CERT)  
**Gates next:** PART-10 (AI Declaration uses this pipeline)

---

## Entry Checklist (confirm before starting)
- [ ] DDEX ERN 4.3 XML must validate against the official XSD schema — this is the hard gate
- [ ] LabelGrid API: follows CLAUDE.md §External API Integration Requirements (timeout, retry, backoff)
- [ ] ISRC/UPC: generated deterministically from session data — no random components
- [ ] All metadata embedded in output files, not just in the XML sidecar
- [ ] RAIN-CERT must be attached to every distributed release
- [ ] Tier gate: distribution features require Artist tier or above
- [ ] Sub-Phase Protocol: HALT → BUILD → TEST → REPORT → WAIT after each task

---

## Objective

Implement the full distribution pipeline: ISRC/UPC generation, metadata collection, DDEX ERN
4.3 XML generation, and LabelGrid API integration. Also define the OSMEF (Open Stem Mastering
Exchange Format) specification as a published document.

---

## Task 9.1 — ISRC/UPC Generation Service

### `backend/app/services/identifiers.py`
```python
import random, string, re
from app.core.config import settings

def generate_isrc(country: str = "ZA") -> str:
    """
    Generate ISRC per ISO 3901.
    Format: CC-XXX-YY-NNNNN
    CC = country code, XXX = registrant code, YY = year, NNNNN = designation code
    """
    registrant = settings.ISRC_REGISTRANT_CODE or "ARC"
    year = __import__("datetime").datetime.now().year % 100
    designation = "".join(random.choices(string.digits, k=5))
    isrc = f"{country}{registrant}{year:02d}{designation}"
    return isrc

def generate_upc() -> str:
    """
    Generate UPC/EAN-13 barcode.
    Uses GS1 prefix + sequential number + check digit.
    """
    prefix = settings.UPC_GS1_PREFIX or "000000"
    item = "".join(random.choices(string.digits, k=6))
    base = prefix + item
    check = _ean13_check_digit(base)
    return base + str(check)

def _ean13_check_digit(digits: str) -> int:
    s = sum(int(d) * (1 if i % 2 == 0 else 3) for i, d in enumerate(digits))
    return (10 - s % 10) % 10
```

---

## Task 9.2 — DDEX ERN 4.3 XML Generator

### `backend/app/services/ddex.py`
```python
from xml.etree.ElementTree import Element, SubElement, tostring, indent
from datetime import datetime, timezone
from typing import Optional
import uuid

def generate_ddex_ern43(
    release_id: str,
    title: str,
    artist_name: str,
    isrc: str,
    upc: str,
    audio_file_path: str,
    audio_sha256: str,
    duration_seconds: int,
    genre: str,
    release_date: str,
    territory: str = "Worldwide",
    ai_generated: bool = False,
    ai_source: Optional[str] = None,
    explicit: bool = False,
    label_name: str = "ARCOVEL RAIN Distribution",
) -> str:
    """Generate DDEX ERN 4.3 compliant XML for DSP delivery."""

    ern = Element("ernm:NewReleaseMessage")
    ern.set("xmlns:ernm", "http://ddex.net/xml/ern/43")
    ern.set("xmlns:avs", "http://ddex.net/xml/avs/avs")
    ern.set("MessageSchemaVersionId", "ern/43")
    ern.set("LanguageAndScriptCode", "en")

    # MessageHeader
    header = SubElement(ern, "MessageHeader")
    SubElement(header, "MessageThreadId").text = str(uuid.uuid4())
    SubElement(header, "MessageId").text = str(uuid.uuid4())
    SubElement(header, "MessageSender").text = "RAIN"
    SubElement(header, "MessageCreatedDateTime").text = datetime.now(timezone.utc).isoformat()

    # SoundRecording
    resources = SubElement(ern, "ResourceList")
    sr = SubElement(resources, "SoundRecording")
    sr_id = SubElement(sr, "SoundRecordingId")
    SubElement(sr_id, "ISRC").text = isrc
    SubElement(sr, "SoundRecordingType").text = "MusicalWorkSoundRecording"

    details = SubElement(sr, "SoundRecordingDetailsByTerritory")
    SubElement(details, "TerritoryCode").text = "Worldwide"
    SubElement(details, "Title").text = title
    SubElement(details, "DisplayArtist").text = artist_name
    SubElement(details, "PLine").text = f"℗ {datetime.now().year} {label_name}"
    SubElement(details, "Genre").text = genre
    SubElement(details, "ParentalWarningType").text = "Explicit" if explicit else "NotExplicit"

    if ai_generated:
        # AI declaration per current DSP policies
        ai_flag = SubElement(details, "AdditionalInformation")
        SubElement(ai_flag, "Type").text = "AIGenerated"
        SubElement(ai_flag, "Value").text = "true"
        if ai_source:
            SubElement(ai_flag, "Source").text = ai_source

    # File reference
    tech_details = SubElement(sr, "TechnicalSoundRecordingDetails")
    SubElement(tech_details, "TechnicalResourceDetailsReference").text = "T1"
    SubElement(tech_details, "AudioCodecType").text = "WAV"
    SubElement(tech_details, "BitDepth").text = "24"
    SubElement(tech_details, "SamplingRate").text = "48000"
    file_ref = SubElement(tech_details, "File")
    SubElement(file_ref, "FileName").text = audio_file_path
    SubElement(file_ref, "HashSum").text = audio_sha256
    SubElement(file_ref, "HashSumAlgorithmType").text = "SHA256"

    # Release
    releases = SubElement(ern, "ReleaseList")
    release = SubElement(releases, "Release")
    rel_id = SubElement(release, "ReleaseId")
    SubElement(rel_id, "GRid").text = upc
    SubElement(release, "ReleaseType").text = "Single"
    rel_details = SubElement(release, "ReleaseDetailsByTerritory")
    SubElement(rel_details, "TerritoryCode").text = territory
    SubElement(rel_details, "Title").text = title
    SubElement(rel_details, "DisplayArtist").text = artist_name
    SubElement(rel_details, "LabelName").text = label_name
    SubElement(rel_details, "ReleaseDate").text = release_date

    indent(ern, space="  ")
    return '<?xml version="1.0" encoding="UTF-8"?>\n' + tostring(ern, encoding="unicode")
```

---

## Task 9.3 — LabelGrid API Integration

### `backend/app/services/labelgrid.py`
```python
import httpx
from app.core.config import settings
import structlog

logger = structlog.get_logger()
BASE = settings.LABELGRID_API_BASE

async def submit_release(release_data: dict, ddex_xml: str, audio_s3_key: str) -> dict:
    """Submit release to LabelGrid for distribution."""
    async with httpx.AsyncClient(timeout=60) as client:
        headers = {"Authorization": f"Bearer {settings.LABELGRID_API_KEY}"}
        resp = await client.post(f"{BASE}/releases", headers=headers, json={
            "metadata": release_data,
            "ddex_xml": ddex_xml,
            "audio_reference": audio_s3_key,
            "sandbox": settings.LABELGRID_SANDBOX,
        })
        resp.raise_for_status()
        return resp.json()

async def get_release_status(labelgrid_release_id: str) -> dict:
    async with httpx.AsyncClient(timeout=30) as client:
        headers = {"Authorization": f"Bearer {settings.LABELGRID_API_KEY}"}
        resp = await client.get(f"{BASE}/releases/{labelgrid_release_id}", headers=headers)
        resp.raise_for_status()
        return resp.json()
```

---

## Task 9.4 — Distribution Route

### `backend/app/api/routes/distribution.py`
```python
@router.post("/releases/", status_code=201)
async def create_release(
    req: ReleaseCreateRequest,
    current_user: CurrentUser = Depends(require_tier("artist","studio_pro","enterprise")),
    db: AsyncSession = Depends(get_db),
):
    """
    Create a release from a completed session.
    Generates ISRC/UPC, builds DDEX ERN 4.3 XML, submits to LabelGrid.
    """
    # 1. Verify session is complete + RAIN-CERT exists
    # 2. generate_isrc() + generate_upc()
    # 3. generate_ddex_ern43(...)
    # 4. await labelgrid.submit_release(...)
    # 5. Create Release record in DB
    # 6. Return release with ISRC, UPC, LabelGrid reference
```

---

## Task 9.5 — OSMEF Specification

### `docs/OSMEF-v1.0.md`

Publish the Open Stem Mastering Exchange Format specification:

```markdown
# OSMEF — Open Stem Mastering Exchange Format
## Version 1.0
## License: MIT
## Author: ARCOVEL Technologies International / RAIN

### Overview
OSMEF defines a standard for exchanging stem packages between AI generators, DAWs,
and mastering services. It resolves the ad-hoc WAV collection problem.

### Container
Primary: MKA (Matroska Audio) — ISO/IEC 23001-7
Fallback: ZIP containing WAV files + manifest.json

### Manifest Schema (manifest.json)
{
  "osmef_version": "1.0",
  "title": "string",
  "artist": "string",
  "bpm": number | null,
  "key": "string | null",
  "sample_rate": 44100 | 48000 | 88200 | 96000,
  "bit_depth": 16 | 24 | 32,
  "source_platform": "suno" | "udio" | "daw" | "other",
  "ai_generated": boolean,
  "stems": [
    {
      "role": "vocals" | "drums" | "bass" | "instruments" | "fx" | "accompaniment" | "mix" | "other",
      "file": "filename.wav",
      "sha256": "string",
      "channel_layout": "mono" | "stereo",
      "duration_ms": number
    }
  ]
}
```

Reference libraries to publish: `osmef-python`, `osmef-js`, `osmef-cpp`.
GitHub: `github.com/arcovel/osmef`
Zenodo: DOI to be assigned on first release.
```

---

## Tests to Pass Before Reporting

```
✓ ISRC format: matches pattern [A-Z]{2}[A-Z0-9]{3}[0-9]{7}
✓ UPC: EAN-13 check digit validates
✓ DDEX XML: validates against ERN 4.3 schema (use xmllint)
✓ LabelGrid sandbox: submit_release returns 201 (sandbox mode)
✓ Distribution route: artist+ tier → 201, free/spark/creator → 403
✓ OSMEF spec: manifest.json validates against JSON Schema
```

**HALT. Wait for instruction.**

---
---

