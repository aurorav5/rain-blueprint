# RAIN — R∞N AI MASTERING ENGINE
## BLUEPRINT-INDEX.md — Master Execution Map

**Spec ref:** RAIN-MASTER-SPEC-v6.0  
**Blueprint ref:** RAIN-BLUEPRINT-v1.0  
**Author:** Phil Bölke / ARCOVEL Technologies International  
**Date:** 29 March 2026  
**Status:** ENDGAME EXECUTION — Full Platform Build

---

## How to Use This Document

This is the master execution index for a complete end-to-end build of RAIN. Each phase is
contained in a discrete PART-N.md file. Claude Code reads PART-N.md, executes all tasks
within it, passes all specified tests, reports completion, then **halts and waits** for
instruction to proceed.

**Claude Code must not skip phases. Must not combine phases. Must not proceed without
explicit instruction: "Proceed to Part N."**

See CLAUDE.md §Sub-Phase Protocol for the mandatory halt/build/test/report/wait loop.

---

## Architecture Summary (Immutable Reference)

```
User Browser / Tauri Desktop
       ↓ upload (explicit only)
Web Audio API ← Preview Path (non-deterministic, 32-bit float)
RainDSP WASM  ← Render Path  (deterministic, 64-bit double)  ← THE ONLY RENDER ENGINE
ONNX Runtime  ← RainNet inference (local, WASM)
       ↓ user-initiated only
FastAPI Backend → PostgreSQL + Redis + S3 (Pro/paid tiers)
       ↓ user-initiated only
Distribution API (LabelGrid) → DSPs
```

**The free tier never touches S3. Audio never leaves the device unless the user initiates it.**

---

## Phase Execution Map

| Part | Title | Est. Complexity | Gate Before Next |
|------|-------|-----------------|------------------|
| PART-1 | Foundation — Scaffold, Docker, DB Schema, CI | High | `docker-compose up` green, all migrations pass |
| PART-2 | RainDSP — C++20/WASM Core DSP Engine | Very High | All 6 DSP unit tests pass (see CLAUDE.md) |
| PART-3 | Backend Core — FastAPI, Auth, Tier Gates, Storage | High | All API integration tests pass, RLS verified |
| PART-4 | RainNet v2 — ML Model, ONNX Export, Inference Service | Very High | Inference < 2s on CPU, ONNX export validates |
| PART-5 | Frontend Shell — React/Vite, Waveform, Upload, Preview | High | Upload → Web Audio preview working E2E, free tier local WASM render completes |
| PART-6 | Mastering Pipeline — Full Render Path E2E | Very High | Render path produces −14 LUFS ±0.5 LU output |
| PART-7 | Artist Identity Engine — AIE, Cold-Start, Profile | High | AIE vector updates correctly over 5 test sessions |
| PART-8 | Content Verification + RAIN-CERT Provenance | High | Three-layer scan returns results, cert signs correctly |
| PART-9 | Distribution Pipeline — ISRC/UPC/DDEX/LabelGrid | High | DDEX ERN 4.3 XML validates against schema |
| PART-10 | RAIN Score + Suno Import Mode + AI Declaration | High | RAIN Score composite computes, Suno stems route correctly |
| PART-11 | Tauri Desktop + Offline Mode + RAIN Connect Plugin | Very High | Tauri build runs, offline mastering completes, OSC fires |
| PART-12 | Production Hardening — Monitoring, E2E, Deploy | High | All E2E tests green, Prometheus metrics flowing, deploy script clean |

---

## Critical Path Dependencies

```
PART-1 (foundation)
  └─ PART-2 (DSP) ← PART-3 (backend) can begin in parallel after PART-1
       └─ PART-4 (ML inference) depends on backend services
            └─ PART-5 (frontend) depends on backend API being up
                 └─ PART-6 (pipeline) depends on DSP + frontend + backend
                      ├─ PART-7 (AIE) depends on pipeline
                      ├─ PART-8 (verification) depends on pipeline
                      ├─ PART-9 (distribution) depends on pipeline
                      └─ PART-10 (score + suno) depends on pipeline
                           ├─ PART-11 (desktop/plugin) depends on full web platform
                           └─ PART-12 (hardening) depends on everything
```

**Important:** PART-2 (RainDSP) and PART-3 (backend) can be started in parallel after PART-1
completes, but PART-6 (pipeline) requires both to be complete and tested.

---

## Global Non-Negotiables (Repeat from CLAUDE.md)

1. `RainDSP` WASM is the ONLY render engine. Never substitute Web Audio API for render output.
2. Biquad sign: `y = b0·x + b1·x1 + b2·x2 − a1·y1 − a2·y2`. a1 SUBTRACTED.
3. `RAIN_NORMALIZATION_VALIDATED=false` until ML lead + Phil sign off. Gate BLOCKS inference.
4. Every DB query on user data includes `WHERE user_id = $user_id`. RLS on all tables.
5. S3 prefix: `users/{user_id}/{session_id}/{file_hash}.{ext}`. Zero exceptions.
6. Free tier: no S3, no upload, no session persistence, WASM-only, listen only.
7. Error codes: always `RAIN-E*` or `RAIN-B*`. Never raw exception messages to client.
8. WASM binary hash verified at session start. Mismatch = RAIN-E304, render blocked.
9. `claude-opus-4-6` for all Anthropic API calls. Never a different model.
10. Sub-phase protocol: HALT → BUILD → TEST → REPORT → WAIT. No exceptions.

---

## Master Error Code Registry

| Code | Category | Meaning |
|------|----------|---------|
| RAIN-E100 | Auth | Invalid or expired JWT |
| RAIN-E101 | Auth | Insufficient tier for operation |
| RAIN-E102 | Auth | Rate limit exceeded |
| RAIN-E200 | Upload | File format not accepted |
| RAIN-E201 | Upload | File size exceeds tier limit |
| RAIN-E202 | Upload | File hash mismatch on upload |
| RAIN-E203 | Upload | S3 write failure |
| RAIN-E300 | DSP | RainDSP WASM load failure |
| RAIN-E301 | DSP | LUFS measurement out of valid range |
| RAIN-E302 | DSP | True peak exceeds 0 dBFS (clip guard) |
| RAIN-E303 | DSP | Multiband crossover integrity failure |
| RAIN-E304 | DSP | WASM binary hash mismatch — render blocked |
| RAIN-E305 | DSP | Render output silence detected |
| RAIN-E400 | ML | RainNet inference blocked (NORMALIZATION_VALIDATED=false) |
| RAIN-E401 | ML | ONNX model load failure |
| RAIN-E402 | ML | Inference timeout |
| RAIN-E403 | ML | AIE profile corruption |
| RAIN-E500 | Content | ACRCloud match found — potential rights issue |
| RAIN-E501 | Content | AudD match exceeds threshold |
| RAIN-E502 | Content | Content scan service unavailable |
| RAIN-E503 | Content | AI declaration required but not provided |
| RAIN-E600 | Distribution | DDEX validation failure |
| RAIN-E601 | Distribution | ISRC generation failure |
| RAIN-E602 | Distribution | LabelGrid API error |
| RAIN-E603 | Distribution | Metadata required field missing |
| RAIN-E700 | Billing | Stripe webhook verification failed |
| RAIN-E701 | Billing | Render quota exceeded |
| RAIN-E702 | Billing | Download quota exceeded |
| RAIN-E703 | Billing | Tier downgrade blocks active features |
| RAIN-B001 | Background | Demucs job queued |
| RAIN-B002 | Background | Demucs job failed |
| RAIN-B003 | Background | RAIN-CERT signing job failed |
| RAIN-B004 | Background | Distribution handoff job failed |

---

## Tier Feature Matrix (Enforcement Reference)

| Feature | Free | Spark | Creator | Artist | Studio Pro | Enterprise |
|---------|------|-------|---------|--------|------------|------------|
| Preview (Web Audio) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Render (RainDSP) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Download | ✗ | 50/mo | 10/mo | 25/mo | 75/mo | Unlimited |
| S3 persistence | ✗ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Simple Mode | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Advanced Mode | ✗ | ✗ | ✓ | ✓ | ✓ | ✓ |
| Stem input | ✗ | ✗ | ✓ | ✓ | ✓ | ✓ |
| Demucs separation | ✗ | ✗ | ✓ | ✓ | ✓ | ✓ |
| Claude AI assistant | ✗ | ✗ | 10/mo | 20/mo | 50/mo | Unlimited |
| AIE (Artist Identity) | ✗ | ✗ | Basic | Full | Full | Custom LoRA |
| DAW Plugin | ✗ | ✗ | ✗ | ✓ | ✓ | ✓ |
| Distribution Intelligence | ✗ | ✗ | ✗ | ✓ | ✓ | ✓ |
| Distribution delivery | ✗ | ✗ | ✗ | ✓ | ✓ | ✓ |
| Dolby Atmos | ✗ | ✗ | ✗ | ✗ | ✓ | ✓ |
| DDEX/DDP | ✗ | ✗ | ✗ | ✗ | ✓ | ✓ |
| Vinyl cut prep | ✗ | ✗ | ✗ | ✗ | ✓ | ✓ |
| Collaboration | ✗ | ✗ | ✗ | ✗ | ✓ | ✓ |
| White-label API | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ |
| Custom RainNet LoRA | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ |
| RAIN-CERT | Every tier | Every tier | Every tier | Every tier | Every tier | Every tier |
| RAIN Score | Every tier | Every tier | Every tier | Every tier | Every tier | Every tier |

---

## Platform Loudness Targets (Mastering Reference)

| Platform | LUFS Target | True Peak Max | Codec | Notes |
|----------|-------------|---------------|-------|-------|
| Spotify | −14 LUFS-I | −1.0 dBTP | OGG Vorbis q9 / AAC 256 | Normalizes all content |
| Apple Music | −16 LUFS-I | −1.0 dBTP | AAC 256 / ALAC | Atmos preferred |
| YouTube | −14 LUFS-I | −1.0 dBTP | AAC 128/256 | Loudness match on upload |
| Tidal | −14 LUFS-I | −1.0 dBTP | FLAC / MQA | HiFi tier lossless |
| Amazon Music | −14 LUFS-I | −1.0 dBTP | AAC 256 / FLAC | HD tier lossless |
| TikTok | −14 LUFS-I | −1.0 dBTP | AAC 128 | Heavy re-encoding |
| SoundCloud | −14 LUFS-I | −1.0 dBTP | OGG 128/256 | Lower-quality codec |
| Vinyl | Per cutter spec | −3.0 dBTP | N/A | RIAA eq, SAIL applied |

---

## ML Model Registry

| Model | Role | Format | Input | Output | Notes |
|-------|------|--------|-------|--------|-------|
| RainNet v2 | Core mastering intelligence | ONNX | Mel spectrogram, artist vector, genre, target | Processing parameter vector | Gate: RAIN_NORMALIZATION_VALIDATED |
| AnalogNet | Analog saturation modeling | ONNX | Frequency domain tensor | Saturation curve | Per-device (tape, transformer, tube) |
| SpectralRepairNet | Artifact removal | ONNX | Short-time Fourier domain | Mask tensor | Targets codec artifacts, clipping |
| CodecNet | Codec penalty prediction | ONNX | Spectrogram + target platform | Penalty score per band | Used by RAIN Score |
| GenreClassifier | Genre inference | ONNX | Mel spectrogram | Genre probability vector | 87 genre classes |
| ReferenceEncoder | Artist reference matching | ONNX | Reference audio spectrogram | 64-dim embedding | Used by AIE reference matching |

---

## Strategic Path → Part Mapping

| Strategic Path | Blueprint Part |
|---------------|----------------|
| Path 1: Suno Import Mode + AI Declaration | PART-10 |
| Path 2: OSMEF Specification | PART-9 |
| Path 3: Distribution API (LabelGrid) | PART-9 |
| Path 4: CLAP Plugin | PART-11 |
| Path 5: ARA2 Integration | PART-11 |
| Path 6: AIE Compound Learning | PART-7 |
| Path 7: RAIN-CERT Provenance | PART-8 |
| Path 8: Dolby Atmos Mastering | PART-6 (flag), PART-12 (full) |
| Path 9: RAIN Score | PART-10 |
| Path 10: RAIN Connect | PART-11 |
| Path 11: Content Verification | PART-8 |
| Path 12: Tauri + Offline Mode | PART-11 |

---

## Launch Readiness Criteria

Before any production deploy, all of the following must be true:

- [ ] All 12 Parts complete and reported
- [ ] All DSP unit tests passing (CLAUDE.md §DSP Unit Test Requirements)
- [ ] All API integration tests passing
- [ ] All E2E tests passing (Playwright)
- [ ] RAIN_NORMALIZATION_VALIDATED signed off by ML lead + Phil Bölke
- [ ] RLS audit: every user table confirmed protected
- [ ] Free tier isolation verified: S3 zero-write confirmed under test
- [ ] WASM hash verification confirmed working in production build
- [ ] Stripe webhooks verified in test mode with all scenarios
- [ ] DDEX ERN 4.3 XML validated against official schema
- [ ] RAIN-CERT signing key generated and secured
- [ ] LabelGrid sandbox integration tests passing
- [ ] Prometheus dashboards operational
- [ ] Error alerting configured
- [ ] Backup and recovery procedures documented and tested

---

*Begin with PART-1.md. Proceed only when explicitly instructed.*
