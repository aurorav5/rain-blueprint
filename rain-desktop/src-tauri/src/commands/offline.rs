use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::State;
use crate::state::AppState;

#[derive(Debug, Serialize, Deserialize)]
pub struct OfflineMasterResult {
    pub integrated_lufs: f64,
    pub true_peak_dbtp: f64,
    pub output_path: String,
    pub wasm_hash: String,
}

/// Offline mastering command — no network calls.
/// 1. Load WASM binary from app resources
/// 2. Verify SHA-256 hash → RAIN-E304 if mismatch
/// 3. Run processing (WASM invocation via wasmtime — stubbed until native build)
/// 4. Return results
#[tauri::command]
pub async fn offline_master(
    audio_path: String,
    params: serde_json::Value,
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<OfflineMasterResult, String> {
    // Load expected WASM hash from resources
    let hash_resource = app
        .path()
        .resource_dir()
        .map_err(|e| format!("RAIN-E304: resource dir error: {e}"))?
        .join("resources/rain_dsp.wasm.sha256");

    let expected_hash = std::fs::read_to_string(&hash_resource)
        .map_err(|_| "RAIN-E304: WASM hash file not found in resources".to_string())?
        .trim()
        .to_string();

    // Load WASM binary and verify hash
    let wasm_resource = app
        .path()
        .resource_dir()
        .map_err(|e| format!("RAIN-E304: {e}"))?
        .join("resources/rain_dsp.wasm");

    let wasm_bytes = std::fs::read(&wasm_resource)
        .map_err(|_| "RAIN-E304: WASM binary not found in resources".to_string())?;

    let actual_hash = hex::encode(Sha256::digest(&wasm_bytes));
    if actual_hash != expected_hash {
        return Err(format!(
            "RAIN-E304: WASM hash mismatch. Expected {expected_hash}, got {actual_hash}"
        ));
    }

    // Store verified hash in state
    if let Ok(mut h) = state.wasm_hash.lock() {
        *h = Some(actual_hash.clone());
    }

    // WASM execution stub — full implementation requires wasmtime/wasmi integration
    // In production: invoke rain_process() from WASM with audio_path + params
    // This returns the processing result from RainDSP (identical to browser WASM output)
    log::info!("offline_master: WASM hash verified OK, processing {audio_path}");

    Ok(OfflineMasterResult {
        integrated_lufs: -14.0, // DEVIATION: stub — real value from WASM rain_measure_lufs()
        true_peak_dbtp: -1.1,   // DEVIATION: stub — real value from WASM
        output_path: audio_path.replace(".wav", "_mastered.wav"),
        wasm_hash: actual_hash,
    })
}
