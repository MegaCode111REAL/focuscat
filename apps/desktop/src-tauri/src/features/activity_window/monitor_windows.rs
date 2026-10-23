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
    sync::{Arc, Mutex},
    thread,
    time::Duration,
};
use tauri::{AppHandle, Manager};

#[derive(Clone)]
struct ForegroundSnapshot {
    pid: i32,
    app_id: String,
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

pub fn start_monitoring(app: AppHandle) {
    thread::spawn(move || {
        let previous: Arc<Mutex<Option<ForegroundSnapshot>>> = Arc::new(Mutex::new(None));
        loop {
            if let Some(snapshot) = read_foreground() {
                let changed = {
                    let mut last = previous.lock().unwrap();
                    let changed = last.as_ref().map(|old| {
                        old.pid != snapshot.pid
                            || old.title != snapshot.title
                            || old.window_id != snapshot.window_id
                    }).unwrap_or(true);
                    if changed {
                        *last = Some(snapshot.clone());
                    }
                    changed
                };

                if changed {
                    let app_handle = app.clone();
                    let snapshot_for_task = snapshot.clone();
                    tauri::async_runtime::spawn(async move {
                        record_change(app_handle, snapshot_for_task).await;
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
        app_id: app_key,
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
        blocker.handle_app_activated(snapshot.pid, Some(&snapshot.app_id));
        blocker.handle_window_changed(
            snapshot.pid,
            Some(&snapshot.app_id),
            None,
            Some((snapshot.x, snapshot.y, snapshot.width, snapshot.height)),
        );
    }

    let settings = app.try_state::<AppSettingsState>().map(|s| s.lock().unwrap().clone());
    let Some(settings) = settings else { return };
    if !settings.features.activity || !settings.activity.track_apps {
        return;
    }
    let Some(db) = app.try_state::<DatabaseState>() else { return };

    let app_id = match AppRepository::upsert(
        &db.pool,
        &UpsertAppInput {
            bundle_id: Some(snapshot.app_id.clone()),
            name: Some(snapshot.app_name.clone()),
            process_path: Some(snapshot.process_path.clone()),
            icon: None,
            color: None,
        },
    ).await {
        Ok(id) => id,
        Err(_) => return,
    };

    // The database stores completed activity intervals. This Windows monitor
    // records the prior interval on the next foreground-window change.
    let active_key = format!("focuscat_windows_active_{}", std::process::id());
    let old = app.state::<WindowsActivityState>().take();
    if let Some(previous) = old {
        if previous.app_key != snapshot.app_id {
            let _ = AppActivityRepository::insert(
                &db.pool,
                &InsertAppActivityInput {
                    app_id: previous.app_id,
                    started_at: previous.started_at,
                    ended_at: now,
                    category: None,
                },
            ).await;
        }

        if settings.activity.track_windows {
            let _ = WindowActivityRepository::insert(
                &db.pool,
                &InsertWindowActivityInput {
                    app_id: previous.app_id,
                    website_id: None,
                    window_title: Some(previous.title),
                    window_id: previous.window_id,
                    window_x: Some(previous.x),
                    window_y: Some(previous.y),
                    window_width: Some(previous.width),
                    window_height: Some(previous.height),
                    browser_url: None,
                    browser_is_private: None,
                    started_at: previous.started_at,
                    ended_at: now,
                    category: None,
                },
            ).await;
        }
    }

    app.state::<WindowsActivityState>().set(
        ActiveRecord {
            app_id,
            app_key: snapshot.app_id.clone(),
            started_at: now,
        },
        ActiveWindowRecord {
            app_id,
            app_key: snapshot.app_id,
            title: snapshot.title,
            window_id: snapshot.window_id,
            x: snapshot.x,
            y: snapshot.y,
            width: snapshot.width,
            height: snapshot.height,
            started_at: now,
        },
    );
    let _ = active_key; // Retained as a stable diagnostic identifier.
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
