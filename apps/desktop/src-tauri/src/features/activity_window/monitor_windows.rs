use super::repository::{
    AppActivityRepository, InsertAppActivityInput, InsertWindowActivityInput,
    WindowActivityRepository,
};
use crate::environment::db::DatabaseState;
use crate::common::url::extract_domain;
use crate::features::app::repository::{AppRepository, UpsertAppInput, UpsertWebsiteInput, WebsiteRepository};
use crate::features::blocking::types::BlockerState;
use crate::features::focus_profile::{
    resolution::{resolve_category_for_app, resolve_category_for_website},
    types::FocusProfileState,
};
use crate::features::settings::types::AppSettingsState;
use active_win_pos_rs::get_active_window;
use uiautomation::{types::{ControlType, UIProperty}, UIAutomation};
use chrono::Utc;
use std::{
    sync::Mutex,
    thread,
    time::Duration,
};
use tauri::{AppHandle, Manager};

#[derive(Clone)]
struct ForegroundSnapshot {
    pid: i32,
    app_key: String,
    app_name: String,
    process_path: String,
    title: String,
    window_id: Option<u32>,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    browser_url: Option<String>,
}

struct ActiveRecord {
    app_id: i64,
    app_key: String,
    started_at: i64,
}

struct ActiveWindowRecord {
    app_id: i64,
    app_key: String,
    title: String,
    browser_url: Option<String>,
    website_id: Option<i64>,
    window_id: Option<u32>,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    started_at: i64,
}

#[derive(Default)]
pub struct WindowsActivityState(Mutex<Option<(ActiveRecord, ActiveWindowRecord)>>);

impl WindowsActivityState {
    fn take(&self) -> Option<(ActiveRecord, ActiveWindowRecord)> {
        self.0.lock().unwrap().take()
    }

    fn set(&self, app: ActiveRecord, window: ActiveWindowRecord) {
        *self.0.lock().unwrap() = Some((app, window));
    }
}

pub fn start_monitoring(app: AppHandle) {
    thread::spawn(move || {
        let mut last_signature = String::new();
        loop {
            if let Some(snapshot) = read_foreground() {
                let signature = format!("{}|{}|{}|{}", snapshot.pid, snapshot.app_key, snapshot.title, snapshot.browser_url.as_deref().unwrap_or(""));
                if signature != last_signature {
                    last_signature = signature;
                    let app_handle = app.clone();
                    tauri::async_runtime::spawn(async move {
                        record_change(app_handle, snapshot).await;
                    });
                }
            }
            thread::sleep(Duration::from_millis(500));
        }
    });
}

fn read_foreground() -> Option<ForegroundSnapshot> {
    let window = get_active_window().ok()?;
    let process_path = window.process_path.to_string_lossy().trim().to_string();
    if process_path.is_empty() {
        return None;
    }
    let app_key = normalize_app_key(&process_path);
    let window_id = window.window_id
        .trim_start_matches("HWND(")
        .trim_end_matches(')')
        .parse::<u32>()
        .ok();

    let browser_url = browser_url::get_active_browser_url()
        .ok()
        .map(|info| info.url)
        .or_else(|| read_browser_url_fallback(&window.title));

    Some(ForegroundSnapshot {
        pid: window.process_id as i32,
        app_key,
        app_name: window.app_name,
        process_path,
        title: window.title,
        window_id,
        x: window.position.x,
        y: window.position.y,
        width: window.position.width,
        height: window.position.height,
        browser_url,
    })
}

fn normalize_app_key(path: &str) -> String {
    path.trim().trim_matches('"').replace('/', "\\").to_lowercase()
}

async fn record_change(app: AppHandle, snapshot: ForegroundSnapshot) {
    let now = Utc::now().timestamp_millis();

    if let Some(blocker) = app.try_state::<BlockerState>() {
        let mut blocker = blocker.lock().unwrap();
        blocker.handle_window_changed(
            snapshot.pid,
            Some(&snapshot.app_key),
            snapshot.browser_url.as_deref(),
            Some((snapshot.x, snapshot.y, snapshot.width, snapshot.height)),
        );
    }

    let Some(settings_state) = app.try_state::<AppSettingsState>() else { return };
    let settings = settings_state.lock().unwrap().clone();
    if !settings.features.activity || !settings.activity.track_apps {
        return;
    }
    let Some(db) = app.try_state::<DatabaseState>() else { return };

    let app_id = match AppRepository::upsert(
        &db.pool,
        &UpsertAppInput {
            bundle_id: Some(snapshot.app_key.clone()),
            name: Some(snapshot.app_name.clone()),
            process_path: Some(snapshot.process_path.clone()),
            icon: None,
            color: None,
        },
    ).await {
        Ok(id) => id,
        Err(_) => return,
    };

    let website_id = if let Some(domain) = snapshot.browser_url.as_deref().and_then(extract_domain) {
        WebsiteRepository::upsert(
            &db.pool,
            &UpsertWebsiteInput { domain, name: None, icon: None, color: None },
        ).await.ok()
    } else {
        None
    };

    let profiles = app.try_state::<FocusProfileState>()
        .map(|state| state.lock().unwrap().active_profiles.clone())
        .unwrap_or_default();
    let old = app.state::<WindowsActivityState>().take();
    let mut app_started_at = now;

    if let Some((previous_app, previous_window)) = old {
        if previous_app.app_key == snapshot.app_key {
            app_started_at = previous_app.started_at;
        } else {
            let _ = AppActivityRepository::insert(
                &db.pool,
                &InsertAppActivityInput {
                    app_id: previous_app.app_id,
                    started_at: previous_app.started_at,
                    ended_at: now,
                    category: Some(
                        resolve_category_for_app(&previous_app.app_key, &profiles).0.as_str().to_string()
                    ),
                },
            ).await;
        }

        if settings.activity.track_windows {
            let _ = WindowActivityRepository::insert(
                &db.pool,
                &InsertWindowActivityInput {
                    app_id: previous_window.app_id,
                    website_id: previous_window.website_id,
                    window_title: Some(previous_window.title),
                    window_id: previous_window.window_id,
                    window_x: Some(previous_window.x),
                    window_y: Some(previous_window.y),
                    window_width: Some(previous_window.width),
                    window_height: Some(previous_window.height),
                    browser_url: previous_window.browser_url.clone(),
                    browser_is_private: None,
                    started_at: previous_window.started_at,
                    ended_at: now,
                    category: Some(
                        previous_window.browser_url.as_deref()
                            .and_then(extract_domain)
                            .map(|domain| resolve_category_for_website(&domain, &profiles).0.as_str().to_string())
                            .unwrap_or_else(|| resolve_category_for_app(&previous_window.app_key, &profiles).0.as_str().to_string())
                    ),
                },
            ).await;
        }
    }

    app.state::<WindowsActivityState>().set(
        ActiveRecord {
            app_id,
            app_key: snapshot.app_key.clone(),
            started_at: app_started_at,
        },
        ActiveWindowRecord {
            app_id,
            app_key: snapshot.app_key,
            title: snapshot.title,
            browser_url: snapshot.browser_url,
            website_id,
            window_id: snapshot.window_id,
            x: snapshot.x,
            y: snapshot.y,
            width: snapshot.width,
            height: snapshot.height,
            started_at: now,
        },
    );
}


fn read_browser_url_fallback(window_title: &str) -> Option<String> {
    if window_title.trim().is_empty() {
        return None;
    }

    let automation = UIAutomation::new().ok()?;
    let root = automation.get_root_element().ok()?;
    let browser = automation
        .create_matcher()
        .from(root)
        .timeout(700)
        .name(window_title)
        .find_first()
        .ok()?;

    // Chromium-derived browsers expose the address bar as an Edit control.
    // Prefer its accessible name, then fall back to the first Edit control.
    let address = automation
        .create_matcher()
        .from(browser.clone())
        .timeout(700)
        .name("Address and search bar")
        .find_first()
        .or_else(|_| {
            automation
                .create_matcher()
                .from(browser)
                .timeout(700)
                .control_type(ControlType::Edit)
                .find_first()
        })
        .ok()?;

    let value = address
        .get_property_value(UIProperty::ValueValue)
        .ok()?
        .get_string()
        .ok()?;
    let value = value.trim();
    if value.is_empty() || !value.contains('.') {
        return None;
    }

    if value.starts_with("http://") || value.starts_with("https://") {
        Some(value.to_string())
    } else {
        Some(format!("https://{value}"))
    }
}
