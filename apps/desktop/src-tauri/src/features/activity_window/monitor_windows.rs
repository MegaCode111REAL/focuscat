use super::repository::{
    AppActivityRepository, InsertAppActivityInput, InsertWindowActivityInput,
    WindowActivityRepository,
};
use crate::environment::db::DatabaseState;
use crate::features::app::repository::{AppRepository, UpsertAppInput};
use crate::features::blocking::types::BlockerState;
use crate::features::settings::types::AppSettingsState;
use active_win_pos_rs::get_active_window;
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
                let signature = format!("{}|{}|{}", snapshot.pid, snapshot.app_key, snapshot.title);
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
    let process_path = window.process_path.trim().to_string();
    if process_path.is_empty() {
        return None;
    }
    let app_key = normalize_app_key(&process_path);
    let window_id = window.window_id
        .trim_start_matches("HWND(")
        .trim_end_matches(')')
        .parse::<u32>()
        .ok();

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
    })
}

fn normalize_app_key(path: &str) -> String {
    path.trim().trim_matches('"').replace('/', "\\").to_lowercase()
}

async fn record_change(app: AppHandle, snapshot: ForegroundSnapshot) {
    let now = Utc::now().timestamp_millis();

    if let Some(blocker) = app.try_state::<BlockerState>() {
        let mut blocker = blocker.lock().unwrap();
        blocker.handle_app_activated(snapshot.pid, Some(&snapshot.app_key));
        blocker.handle_window_changed(
            snapshot.pid,
            Some(&snapshot.app_key),
            None,
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
                    category: None,
                },
            ).await;
        }

        if settings.activity.track_windows {
            let _ = WindowActivityRepository::insert(
                &db.pool,
                &InsertWindowActivityInput {
                    app_id: previous_window.app_id,
                    website_id: None,
                    window_title: Some(previous_window.title),
                    window_id: previous_window.window_id,
                    window_x: Some(previous_window.x),
                    window_y: Some(previous_window.y),
                    window_width: Some(previous_window.width),
                    window_height: Some(previous_window.height),
                    browser_url: None,
                    browser_is_private: None,
                    started_at: previous_window.started_at,
                    ended_at: now,
                    category: None,
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
            window_id: snapshot.window_id,
            x: snapshot.x,
            y: snapshot.y,
            width: snapshot.width,
            height: snapshot.height,
            started_at: now,
        },
    );
}
