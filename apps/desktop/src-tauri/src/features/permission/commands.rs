/// Check if accessibility permission is granted.
#[tauri::command]
#[specta::specta]
pub fn is_accessibility_granted() -> bool {
    #[cfg(target_os = "windows")]
    {
        // Windows does not require macOS-style Accessibility permission.
        return true;
    }
    #[cfg(not(target_os = "windows"))]
    {
        mado::is_accessibility_trusted()
    }
}

/// Open System Settings to Accessibility pane.
#[tauri::command]
#[specta::specta]
pub fn open_accessibility_settings() {
    #[cfg(target_os = "macos")]
    {
        use std::process::Command;
        let _ = Command::new("open")
            .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility")
            .spawn();
    }
}

/// Check if input monitoring permission is granted.
#[tauri::command]
#[specta::specta]
pub fn is_input_monitoring_granted() -> bool {
    focuscat_macos::is_input_monitoring_enabled()
}

/// Open System Settings to Input Monitoring pane.
#[tauri::command]
#[specta::specta]
pub fn open_input_monitoring_settings() {
    #[cfg(target_os = "macos")]
    {
        use std::process::Command;
        let _ = Command::new("open")
            .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_ListenEvent")
            .spawn();
    }
}
