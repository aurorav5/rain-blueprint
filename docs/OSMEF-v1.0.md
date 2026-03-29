# OSMEF — Open Stem Mastering Exchange Format
## Version 1.0
## License: MIT
## Author: ARCOVEL Technologies International / RAIN

### Overview

OSMEF defines a standard container format for exchanging stem packages between AI music
generators (Suno, Udio), DAWs, and mastering services. It resolves the ad-hoc WAV
collection problem by providing a self-describing, hash-verified stem bundle.

### Container Formats

**Primary:** MKA (Matroska Audio) — ISO/IEC 23001-7
**Fallback:** ZIP archive containing WAV files + `manifest.json`

File extension: `.osmef` (either container format)

### Manifest Schema (`manifest.json`)

```json
{
  "osmef_version": "1.0",
  "title": "string",
  "artist": "string",
  "bpm": "number | null",
  "key": "string | null",
  "sample_rate": "44100 | 48000 | 88200 | 96000",
  "bit_depth": "16 | 24 | 32",
  "source_platform": "suno | udio | daw | other",
  "ai_generated": "boolean",
  "stems": [
    {
      "role": "vocals | drums | bass | instruments | fx | accompaniment | mix | other",
      "file": "filename.wav",
      "sha256": "string (hex)",
      "channel_layout": "mono | stereo",
      "duration_ms": "number"
    }
  ]
}
```

### Validation Rules

1. `osmef_version` MUST be present and equal to `"1.0"`
2. `sample_rate` MUST be one of: 44100, 48000, 88200, 96000
3. `bit_depth` MUST be one of: 16, 24, 32
4. Each stem's `sha256` MUST verify against the actual file contents
5. Each stem's `role` MUST be one of the enumerated values
6. `stems` array MUST contain at least one entry with `role: "mix"`

### Integration with RAIN

RAIN accepts `.osmef` packages on the upload screen (Artist tier+). The platform:
1. Validates the manifest against this schema
2. Verifies all SHA-256 hashes
3. Routes stems to the appropriate processing pipeline (Demucs bypass if stems present)
4. Attaches OSMEF provenance to the RAIN-CERT for the session

### Reference Implementations

- Python: `osmef-python` — `pip install osmef`
- JavaScript/TypeScript: `osmef-js` — `npm install @arcovel/osmef`
- C++: `osmef-cpp` — header-only, MIT

GitHub: `https://github.com/arcovel/osmef`
Zenodo DOI: To be assigned on first stable release.

### Changelog

| Version | Date | Notes |
|---|---|---|
| 1.0 | 2026-03-29 | Initial specification |
