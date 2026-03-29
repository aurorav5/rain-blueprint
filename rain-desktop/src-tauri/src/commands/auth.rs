use tauri::State;
use crate::state::AppState;

#[tauri::command]
pub async fn get_auth_token(state: State<'_, AppState>) -> Result<Option<String>, String> {
    let token = state.auth_token.lock().map_err(|e| e.to_string())?;
    Ok(token.clone())
}
