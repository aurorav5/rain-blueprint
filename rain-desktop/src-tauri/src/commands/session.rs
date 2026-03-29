#[tauri::command]
pub async fn get_session(
    session_id: String,
    state: tauri::State<'_, crate::state::AppState>,
) -> Result<serde_json::Value, String> {
    let token = state
        .auth_token
        .lock()
        .map_err(|e| e.to_string())?
        .clone()
        .ok_or_else(|| "RAIN-E100: Not authenticated".to_string())?;

    let client = reqwest::Client::new();
    let resp = client
        .get(format!("http://localhost:8000/api/v1/sessions/{session_id}"))
        .bearer_auth(token)
        .send()
        .await
        .map_err(|e| format!("RAIN-E300: {e}"))?;

    resp.json::<serde_json::Value>()
        .await
        .map_err(|e| format!("RAIN-E300: {e}"))
}
