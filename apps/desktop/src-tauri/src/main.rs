// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs::OpenOptions;
use std::io::Write;
use std::panic;

fn main() {
    // Release builds have no console, so persist startup panics for Windows
    // debugging instead of silently exiting with code 101.
    panic::set_hook(Box::new(|info| {
        let path = std::env::temp_dir().join("focuscat-startup.log");
        if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(path) {
            let _ = writeln!(file, "\n===== FocusCat panic =====");
            let _ = writeln!(file, "Time: {:?}", std::time::SystemTime::now());
            let _ = writeln!(file, "{info}");
            let _ = writeln!(file, "Backtrace: {}", std::backtrace::Backtrace::force_capture());
            let _ = file.flush();
        }
    }));

    focuscat_lib::run()
}
