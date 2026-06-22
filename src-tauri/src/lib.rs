use tauri::Manager;
use std::sync::{Arc, atomic::{AtomicBool, Ordering}};
use base64::Engine as _;
use reqwest::header::{ACCEPT, ACCEPT_LANGUAGE, AUTHORIZATION, CACHE_CONTROL, ORIGIN, REFERER, USER_AGENT};

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct AnimeonsenRelayVideoRequest {
    content_id: String,
    episode_number: u32,
}

#[derive(serde::Serialize)]
struct AnimeonsenRelayVideoResponse {
    status: u16,
    data: serde_json::Value,
}

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

fn decode_ao_session_to_bearer(raw_cookie_value: &str) -> Option<String> {
    let decoded = urlencoding::decode(raw_cookie_value).ok()?.into_owned();
    if decoded.is_empty() {
        return None;
    }

    // ao.session uses URL-safe base64.
    let normalized = decoded.replace('-', "+").replace('_', "/");
    let pad = (4 - (normalized.len() % 4)) % 4;
    let padded = format!("{}{}", normalized, "=".repeat(pad));
    let bytes = base64::engine::general_purpose::STANDARD.decode(padded).ok()?;
    let text = String::from_utf8(bytes).ok()?;
    if text.is_empty() {
        return None;
    }

    let shifted: String = text
        .chars()
        .map(|ch| char::from_u32((ch as u32) + 1).unwrap_or(ch))
        .collect();

    if shifted.is_empty() {
        None
    } else {
        Some(shifted)
    }
}

fn extract_ao_session_cookie(set_cookie_values: &reqwest::header::HeaderMap) -> Option<String> {
    let all = set_cookie_values.get_all(reqwest::header::SET_COOKIE);
    for header_value in all.iter() {
        let raw = header_value.to_str().ok()?;
        for part in raw.split(';') {
            let segment = part.trim();
            if let Some(value) = segment.strip_prefix("ao.session=") {
                let trimmed = value.trim();
                if !trimmed.is_empty() {
                    return Some(trimmed.to_string());
                }
            }
        }
    }
    None
}

#[tauri::command]
async fn animeonsen_relay_video(payload: AnimeonsenRelayVideoRequest) -> Result<AnimeonsenRelayVideoResponse, String> {
    let content_id = payload.content_id.trim().to_string();
    let episode_number = payload.episode_number.max(1);

    if content_id.is_empty() {
        return Ok(AnimeonsenRelayVideoResponse {
            status: 400,
            data: serde_json::json!({ "message": "Missing content id." }),
        });
    }

    let client = reqwest::Client::builder()
        .cookie_store(true)
        .redirect(reqwest::redirect::Policy::limited(10))
        .build()
        .map_err(|error| error.to_string())?;

    let watch_url = format!(
        "https://www.animeonsen.xyz/watch/{}?episode={}",
        urlencoding::encode(&content_id),
        episode_number
    );

    let watch_response = client
        .get(&watch_url)
        .header(ACCEPT, "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
        .header(ACCEPT_LANGUAGE, "en-US,en;q=0.9")
        .header(CACHE_CONTROL, "no-cache")
        .header(ORIGIN, "https://www.animeonsen.xyz")
        .header(REFERER, "https://www.animeonsen.xyz/")
        .header(USER_AGENT, "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36")
        .send()
        .await
        .map_err(|error| error.to_string())?;

    if !watch_response.status().is_success() {
        return Ok(AnimeonsenRelayVideoResponse {
            status: watch_response.status().as_u16(),
            data: serde_json::json!({
                "message": "Failed to load AnimeOnsen watch page for relay auth."
            }),
        });
    }

    let headers = watch_response.headers().clone();
    let ao_session = extract_ao_session_cookie(&headers);
    let relay_bearer = ao_session
        .as_deref()
        .and_then(decode_ao_session_to_bearer);

    if relay_bearer.as_deref().unwrap_or("").is_empty() {
        let has_set_cookie_header = headers
            .get_all(reqwest::header::SET_COOKIE)
            .iter()
            .next()
            .is_some();
        return Ok(AnimeonsenRelayVideoResponse {
            status: 401,
            data: serde_json::json!({
                "message": "Failed to derive AnimeOnsen relay bearer from ao.session cookie.",
                "detail": {
                    "hasSetCookieHeader": has_set_cookie_header,
                    "hasAoSessionCookie": ao_session.is_some(),
                }
            }),
        });
    }

    let relay_bearer = relay_bearer.unwrap_or_default();
    let video_url = format!(
        "https://api.animeonsen.xyz/v4/content/{}/video/{}",
        urlencoding::encode(&content_id),
        episode_number
    );

    let video_response = client
        .get(&video_url)
        .header(ACCEPT, "application/json, text/plain, */*")
        .header(AUTHORIZATION, format!("Bearer {}", relay_bearer))
        .header(ORIGIN, "https://www.animeonsen.xyz")
        .header(REFERER, "https://www.animeonsen.xyz/")
        .header(USER_AGENT, "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36")
        .send()
        .await
        .map_err(|error| error.to_string())?;

    let status = video_response.status().as_u16();
    let text_body = video_response
        .text()
        .await
        .unwrap_or_else(|_| String::new());

    let payload = serde_json::from_str::<serde_json::Value>(&text_body)
        .unwrap_or_else(|_| serde_json::json!({
            "message": if text_body.trim().is_empty() {
                "AnimeOnsen video relay returned empty/non-JSON payload."
            } else {
                text_body.trim()
            }
        }));

    if (200..300).contains(&status) {
        let enriched = match payload {
            serde_json::Value::Object(mut map) => {
                let mut meta_obj = match map.remove("meta") {
                    Some(serde_json::Value::Object(existing)) => existing,
                    _ => serde_json::Map::new(),
                };
                meta_obj.insert("relayBearer".to_string(), serde_json::Value::String(relay_bearer));
                map.insert("meta".to_string(), serde_json::Value::Object(meta_obj));
                serde_json::Value::Object(map)
            }
            other => other,
        };

        return Ok(AnimeonsenRelayVideoResponse {
            status,
            data: enriched,
        });
    }

    Ok(AnimeonsenRelayVideoResponse {
        status,
        data: payload,
    })
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
            resolve_startup_theme,
            animeonsen_relay_video
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
