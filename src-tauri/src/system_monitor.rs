// system_monitor.rs — Tauri commands for GPU/CPU/RAM stats and process management
use nvml_wrapper::Nvml;
use serde::Serialize;
use std::sync::OnceLock;
use sysinfo::System;

#[derive(Serialize, Clone, Debug)]
pub struct GpuStats {
    pub vram_used_mb: u64,
    pub vram_total_mb: u64,
    pub vram_percent: f32,
    pub gpu_util: u32,
    pub temperature: u32,
    pub available: bool,
}

#[derive(Serialize, Clone, Debug)]
pub struct SystemStats {
    pub cpu_percent: f32,
    pub ram_used_gb: f32,
    pub ram_total_gb: f32,
    pub ram_percent: f32,
}

// Lazy-init NVML — only initializes GPU once
static NVML: OnceLock<Option<Nvml>> = OnceLock::new();

fn get_nvml() -> &'static Option<Nvml> {
    NVML.get_or_init(|| match Nvml::init() {
        Ok(n) => Some(n),
        Err(e) => {
            eprintln!("NVML init failed (GPU monitoring unavailable): {e}");
            None
        }
    })
}

#[tauri::command]
pub fn get_gpu_stats() -> GpuStats {
    match get_nvml() {
        Some(nvml) => {
            match nvml.device_by_index(0) {
                Ok(device) => {
                    let (vram_used, vram_total) = match device.memory_info() {
                        Ok(mem) => (mem.used / 1024 / 1024, mem.total / 1024 / 1024),
                        Err(_) => (0, 0),
                    };
                    let util = device.utilization_rates().map(|u| u.gpu).unwrap_or(0);
                    let temp = device
                        .temperature(nvml_wrapper::enum_wrappers::device::TemperatureSensor::Gpu)
                        .unwrap_or(0);
                    let vram_pct = if vram_total > 0 {
                        (vram_used as f32 / vram_total as f32) * 100.0
                    } else {
                        0.0
                    };
                    GpuStats {
                        vram_used_mb: vram_used,
                        vram_total_mb: vram_total,
                        vram_percent: vram_pct,
                        gpu_util: util,
                        temperature: temp,
                        available: true,
                    }
                }
                Err(_) => default_gpu_stats(),
            }
        }
        None => default_gpu_stats(),
    }
}

fn default_gpu_stats() -> GpuStats {
    GpuStats {
        vram_used_mb: 0,
        vram_total_mb: 0,
        vram_percent: 0.0,
        gpu_util: 0,
        temperature: 0,
        available: false,
    }
}

#[tauri::command]
pub fn get_system_stats() -> SystemStats {
    let mut sys = System::new_all();
    sys.refresh_all();

    let cpu = sys.global_cpu_usage();
    let ram_used = sys.used_memory(); // bytes
    let ram_total = sys.total_memory(); // bytes

    SystemStats {
        cpu_percent: cpu,
        ram_used_gb: ram_used as f32 / 1e9,
        ram_total_gb: ram_total as f32 / 1e9,
        ram_percent: if ram_total > 0 {
            (ram_used as f32 / ram_total as f32) * 100.0
        } else {
            0.0
        },
    }
}

#[tauri::command]
pub async fn flush_gpu() -> Result<String, String> {
    // Call the Python backend's flush endpoint
    let client = reqwest::Client::new();
    match client
        .post("http://127.0.0.1:8000/flush")
        .send()
        .await
    {
        Ok(_) => Ok("GPU flushed".to_string()),
        Err(e) => Err(format!("Failed to flush: {e}")),
    }
}
