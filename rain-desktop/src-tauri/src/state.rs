use std::sync::Mutex;

pub struct AppState {
    pub auth_token: Mutex<Option<String>>,
    pub wasm_hash: Mutex<Option<String>>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            auth_token: Mutex::new(None),
            wasm_hash: Mutex::new(None),
        }
    }
}

impl Default for AppState {
    fn default() -> Self {
        Self::new()
    }
}
