pub mod commands;
#[cfg(not(target_os = "windows"))]
mod monitor;
#[cfg(target_os = "windows")]
mod monitor_windows;
pub mod repository;
pub mod types;

use tauri::{App, Manager};

pub fn setup(app: &App) {
    #[cfg(target_os = "windows")]
    {
        app.manage(monitor_windows::WindowsActivityState::default());
        monitor_windows::start_monitoring(app.handle().clone());
    }
    #[cfg(not(target_os = "windows"))]
    monitor::start_monitoring(app.handle().clone());
}
