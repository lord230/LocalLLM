mod system_monitor;

use std::sync::Mutex;
use system_monitor::{flush_gpu, get_gpu_stats, get_system_stats};
use tauri::Manager;

pub struct BackendProcess(pub Mutex<Option<std::process::Child>>);

#[tauri::command]
fn uninstall_app(app_handle: tauri::AppHandle) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use std::process::Command;
        use std::os::windows::process::CommandExt;

        if let Ok(exe_path) = std::env::current_exe() {
            if let Some(dir) = exe_path.parent() {
                if let Ok(entries) = std::fs::read_dir(dir) {
                    for entry in entries.flatten() {
                        let file_name = entry.file_name().to_string_lossy().to_lowercase();
                        if (file_name.contains("uninstall") || file_name.contains("unins")) && file_name.ends_with(".exe") {
                            let path = entry.path();
                            let _ = Command::new(path).spawn();
                            app_handle.exit(0);
                            return Ok(());
                        }
                    }
                }
            }
        }

        let _ = Command::new("cmd")
            .args(["/c", "start", "ms-settings:appsfeatures"])
            .creation_flags(0x08000000)
            .spawn();
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())

        .setup(|app| {
            let backend_exe = match app.path().resolve("../backend/dist/backend_server/backend_server.exe", tauri::path::BaseDirectory::Resource) {
                Ok(path) => path,
                Err(_) => {
                    let r_dir = app.path().resource_dir().expect("Failed to get resource dir");
                    // Try to find it in the expected production location
                    let prod_path = r_dir.join("backend_server").join("backend_server.exe");
                    if prod_path.exists() {
                        prod_path
                    } else {
                        // Fallback to the _up_ structure if that's how Tauri bundled it
                        r_dir.join("_up_").join("backend").join("dist").join("backend_server").join("backend_server.exe")
                    }
                }
            };
            
            #[cfg(target_os = "windows")]
            use std::os::windows::process::CommandExt;

            use std::process::Stdio;
            let mut cmd = std::process::Command::new(&backend_exe);
            cmd.args(["--port", "8000"]);
            if let Some(parent) = backend_exe.parent() {
                cmd.current_dir(parent);
            }
            
            cmd.stdout(Stdio::null());
            cmd.stderr(Stdio::null());
            cmd.stdin(Stdio::null());
            
            #[cfg(target_os = "windows")]
            cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW

            match cmd.spawn() {
                Ok(child) => {
                    app.manage(BackendProcess(Mutex::new(Some(child))));
                }
                Err(e) => {
                    eprintln!("Failed to spawn backend server at {:?}: {}", backend_exe, e);
                    app.manage(BackendProcess(Mutex::new(None)));
                }
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                if let Some(state) = window.app_handle().try_state::<BackendProcess>() {
                    if let Ok(mut lock) = state.0.lock() {
                        if let Some(mut child) = lock.take() {
                            let _ = child.kill();
                        }
                    }
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            get_gpu_stats,
            get_system_stats,
            flush_gpu,
            uninstall_app,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
