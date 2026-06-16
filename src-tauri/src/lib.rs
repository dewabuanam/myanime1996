use tauri::Manager;
use std::sync::{Arc, atomic::{AtomicBool, Ordering}};

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
            complete_startup_handoff
        ])
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .run(tauri::generate_context!())
        .expect("error while running MyAnime1996");
}
