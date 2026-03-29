// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod state;

use state::AppState;
use tauri::Manager;

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            app.manage(AppState::new());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::auth::get_auth_token,
            commands::offline::offline_master,
            commands::session::get_session,
            commands::sync::trigger_sync,
        ])
        .run(tauri::generate_context!())
        .expect("error while running RAIN desktop application");
}
