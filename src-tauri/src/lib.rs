use tauri::Manager;
use std::sync::{Arc, atomic::{AtomicBool, Ordering}};

#[derive(serde::Deserialize)]
struct SessionValue {
    id: Option<String>,
}

fn normalize_theme(value: &str) -> String {
    if value == "myanime2077" {
        "myanime2077".to_string()
    } else {
        "myanime1996".to_string()
    }
}

fn resolve_theme_from_store_map(store_map: &serde_json::Map<String, serde_json::Value>) -> String {
    if let Some(session_value) = store_map.get("session") {
        let parsed_session = serde_json::from_value::<SessionValue>(session_value.clone()).ok();
        if let Some(session) = parsed_session {
            if let Some(raw_id) = session.id {
                let profile_id = raw_id.trim();
                if !profile_id.is_empty() {
                    let profile_theme_key = format!("profile:{profile_id}:appTheme");
                    if let Some(theme_value) = store_map.get(&profile_theme_key).and_then(|value| value.as_str()) {
                        return normalize_theme(theme_value.trim());
                    }
                }
            }
        }
    }

    if let Some(theme_value) = store_map.get("appTheme").and_then(|value| value.as_str()) {
        return normalize_theme(theme_value.trim());
    }

    if let Some(theme_value) = store_map.get("lastAppTheme").and_then(|value| value.as_str()) {
        return normalize_theme(theme_value.trim());
    }

    "myanime1996".to_string()
}

#[derive(Clone)]
struct StartupHandoffState {
    complete: Arc<AtomicBool>,
}

#[tauri::command]
fn navigate_external_playback_window(app: tauri::AppHandle, url: String) -> Result<(), String> {
    let window = app
        .get_webview_window("external-playback")
        .ok_or_else(|| "external playback window not found".to_string())?;

    let payload = serde_json::to_string(&url).map_err(|error| error.to_string())?;
    let script = format!("window.location.replace({payload});");
    window.eval(&script).map_err(|error| error.to_string())
}

#[tauri::command]
fn complete_startup_handoff(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(state) = app.try_state::<StartupHandoffState>() {
        state.complete.store(true, Ordering::SeqCst);
    }

    let main_window = app
        .get_webview_window("main")
        .ok_or_else(|| "main window not found".to_string())?;

    main_window.show().map_err(|error| error.to_string())?;
    let _ = main_window.set_focus();

    if let Some(splash_window) = app.get_webview_window("splashscreen") {
        let _ = splash_window.close();
    }

    Ok(())
}

#[tauri::command]
fn resolve_startup_theme(app: tauri::AppHandle) -> Result<String, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    let store_path = app_data_dir.join("myanime1996.store.json");

    let file_text = std::fs::read_to_string(store_path).unwrap_or_else(|_| "{}".to_string());
    let parsed_json = serde_json::from_str::<serde_json::Value>(&file_text).unwrap_or(serde_json::Value::Object(serde_json::Map::new()));

    let Some(store_map) = parsed_json.as_object() else {
        return Ok("myanime1996".to_string());
    };

    Ok(resolve_theme_from_store_map(store_map))
}

pub fn run() {
    let startup_handoff_state = StartupHandoffState {
        complete: Arc::new(AtomicBool::new(false)),
    };

    tauri::Builder::default()
        .manage(startup_handoff_state.clone())
        .setup(move |app| {
            if let Some(main_window) = app.get_webview_window("main") {
                let _ = main_window.hide();
            }

            let app_handle = app.handle().clone();
            let state = startup_handoff_state.clone();
            std::thread::spawn(move || {
                // Guard against startup restores briefly showing the main window before handoff.
                for _ in 0..120 {
                    if state.complete.load(Ordering::SeqCst) {
                        break;
                    }

                    if let Some(main_window) = app_handle.get_webview_window("main") {
                        let _ = main_window.hide();
                    }

                    std::thread::sleep(std::time::Duration::from_millis(100));
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            navigate_external_playback_window,
            complete_startup_handoff,
            resolve_startup_theme
        ])
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .run(tauri::generate_context!())
        .expect("error while running MyAnime1996");
}
