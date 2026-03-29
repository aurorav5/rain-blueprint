#[tauri::command]
pub async fn trigger_sync(
    state: tauri::State<'_, crate::state::AppState>,
) -> Result<serde_json::Value, String> {
    // Stub: sync local session metadata to server when network is available
    // Full implementation in PART-11 follow-up: SQLite → server sync
    log::info!("sync: triggered (stub)");
    Ok(serde_json::json!({"status": "stub", "message": "Sync not yet implemented"}))
}
