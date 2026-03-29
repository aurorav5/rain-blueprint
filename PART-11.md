# RAIN — PART-11: Tauri Desktop + RAIN Connect Plugin
## Offline Mode, CLAP/VST3, ARA2, OSC Bridge

**Blueprint ref:** RAIN-BLUEPRINT-v1.0 / PART-11  
**Depends on:** PART-6 (full web platform working)

---

## Entry Checklist (confirm before starting)
- [ ] Tauri desktop: Rust + WebView — WASM + ONNX models cached locally for offline mode
- [ ] Offline mastering: full render without network — RainDSP WASM + heuristic params
- [ ] RAIN Connect plugin: JUCE 8 — builds as CLAP + VST3 + AU + AAX
- [ ] OSC namespace: `/rain/connect/headroom`, `/rain/connect/penalty/*`, `/rain/connect/score`
- [ ] RainDSP WASM is still the ONLY render engine — desktop and plugin use the same binary
- [ ] WASM hash verified on app launch — RAIN-E304 on mismatch
- [ ] Sub-Phase Protocol: HALT → BUILD → TEST → REPORT → WAIT after each task

---

## Objective

Build the Tauri 2.0 desktop application with full offline mastering mode, and the RAIN
Connect JUCE plugin (CLAP + VST3/AU/AAX) with ARA2 integration and OSC bridge. These are
the two major Platform Path 12 and Path 4/5/10 deliverables from the strategic analysis.

---

## Task 11.1 — Tauri Desktop App Structure

### `rain-desktop/` (new directory at repo root)
```
rain-desktop/
├── src-tauri/
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   ├── src/
│   │   ├── main.rs
│   │   ├── commands/
│   │   │   ├── auth.rs
│   │   │   ├── session.rs
│   │   │   ├── offline.rs
│   │   │   └── sync.rs
│   │   └── state.rs
│   └── icons/
├── src/           ← shared with web frontend (symlink or copy)
└── package.json
```

### `rain-desktop/src-tauri/Cargo.toml`
```toml
[package]
name = "rain-desktop"
version = "6.0.0"
edition = "2021"

[dependencies]
tauri = { version = "2.0", features = ["api-all"] }
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
tokio = { version = "1.0", features = ["full"] }
reqwest = { version = "0.11", features = ["json", "rustls-tls"] }

[lib]
name = "rain_desktop_lib"
crate-type = ["staticlib", "cdylib"]
```

### Offline Mastering Flow (Tauri Command)
```rust
#[tauri::command]
async fn offline_master(
    audio_path: String,
    params: serde_json::Value,
    app: tauri::AppHandle,
) -> Result<serde_json::Value, String> {
    // 1. Load WASM binary from app resources (cached locally)
    // 2. Verify SHA-256 hash against cached hash → RAIN-E304 if mismatch
    // 3. Run WASM via wasmi or wasmtime (Rust WASM runtime)
    // 4. Return LufsResult + output file path
    // No network calls in this path. Fully offline.
}
```

### Air-gapped Capability
- WASM binary + ONNX models bundled as Tauri resources
- JWT stored in OS keychain (tauri-plugin-store)
- Session metadata stored locally (SQLite via sqlx)
- Sync to server only when explicitly triggered by user

---

## Task 11.2 — RAIN Connect JUCE Plugin

### `rain-plugin/` (new directory at repo root)
JUCE 8 plugin project targeting CLAP + VST3 + AU + AAX.

### Key components:

**`rain-plugin/Source/RainConnectProcessor.cpp`**
```cpp
class RainConnectProcessor : public AudioProcessor, public ARADocumentControllerSpecialisation {
    // OSC sender on localhost:9000 by default
    // Sends: /rain/connect/headroom, /rain/connect/score
    // Receives: /rain/connect/suggestion/*
};
```

**OSC Namespace (canonical):**
```
/rain/connect/headroom        → float: dB headroom before true peak limiting
/rain/connect/penalty/spotify → float: estimated Spotify codec penalty (dB)
/rain/connect/penalty/apple   → float: estimated Apple Music codec penalty
/rain/connect/score           → int: current RAIN Score 0-100
/rain/connect/suggestion/eq   → string: "Cut 2dB at 380Hz on guitar bus"
/rain/connect/suggestion/lufs → string: "Reduce output gain by 1.5dB"
/rain/connect/suggestion/tp   → string: "True peak 0.3dB over ceiling"
```

**CLAP-specific features:**
- Expose full parameter set via CLAP parameter metadata before instantiation
- CLAP thread pool: RainNet inference on non-audio thread (never block audio thread)
- CLAP state save/load: persist artist_vector and session preferences

**ARA2 integration:**
- Access full audio document via ARA2 document controller
- Analyze entire audio file on ARA2 binding (not just real-time stream)
- Report analysis results back via OSC

**JUCE CMakeLists.txt:**
```cmake
juce_add_plugin(RainConnect
    COMPANY_NAME "ARCOVEL Technologies International"
    PLUGIN_MANUFACTURER_CODE Arco
    PLUGIN_CODE Rain
    FORMATS CLAP VST3 AU AAX
    PRODUCT_NAME "RAIN Connect"
    NEEDS_MIDI_INPUT FALSE
    NEEDS_MIDI_OUTPUT FALSE
    IS_SYNTH FALSE
    COPY_PLUGIN_AFTER_BUILD FALSE
)
```

---

## Task 11.3 — Mix Bus Transparency Engine

Runs inside the CLAP plugin, sends feedback to the RAIN web app via OSC.

```cpp
class MixBusAnalyzer {
    void analyzeFrame(const AudioBuffer<float>& buffer, double sampleRate) {
        // Measure instantaneous LUFS (momentary)
        // Measure true peak headroom
        // Estimate frequency competition in key bands
        // Send via OSC at 10 Hz update rate (not every sample)
    }
};
```

---

## Tests to Pass Before Reporting

```
✓ Tauri build: cargo tauri build completes without errors
✓ Offline mastering: file in → file out without network (verified with network disabled)
✓ WASM hash check: corrupted WASM binary → RAIN-E304 thrown
✓ CLAP plugin: loads in Bitwig or Reaper without crash
✓ OSC: /rain/connect/headroom message fires when plugin is active
✓ VST3: validates with Steinberg VST3 validator
```

**HALT. Wait for instruction.**

---
---

