

import { useEffect, useState, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getSystemStats } from '../lib/api';

interface GpuStats {
  vram_used_mb: number;
  vram_total_mb: number;
  vram_percent: number;
  gpu_util: number;
  temperature: number;
  available: boolean;
}

interface SysStats {
  cpu_percent: number;
  ram_used_gb: number;
  ram_total_gb: number;
  ram_percent: number;
}

function StatBar({ label, value, max, unit, color }: {
  label: string;
  value: number;
  max?: number;
  unit: string;
  color: string;
}) {
  const pct = max ? Math.min((value / max) * 100, 100) : Math.min(value, 100);
  return (
    <div className="space-y-1">
      <div className="flex justify-between items-center text-xs">
        <span style={{ color: '#6b7280' }}>{label}</span>
        <span style={{ color: '#d1d5db' }} className="font-mono text-[10px]">
          {max 
            ? `${(value || 0).toFixed(1)} / ${(max || 0).toFixed(0)}${unit}` 
            : `${Math.round(value || 0)}${unit}`}
        </span>
      </div>
      <div className="monitor-bar">
        <div
          className="monitor-fill"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
    </div>
  );
}

export function SystemMonitor({ landscape = false }: { landscape?: boolean }) {
  const [gpu, setGpu] = useState<GpuStats | null>(null);
  const [sys, setSys] = useState<SysStats | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    const poll = async () => {
      try {
        const g = await invoke<GpuStats>('get_gpu_stats');
        if (isMounted.current) setGpu(g);
      } catch { /* NVML unavailable */ }

      try {
        const s = await getSystemStats();
        if (isMounted.current) setSys(s);
      } catch { /* backend offline */ }
    };

    poll();
    const id = setInterval(poll, 2000);
    return () => {
      isMounted.current = false;
      clearInterval(id);
    };
  }, []);

  const vramGB = gpu ? (gpu.vram_used_mb / 1024) : 0;
  const vramTotalGB = (gpu && gpu.vram_total_mb > 0) ? (gpu.vram_total_mb / 1024) : 12;

  if (landscape) {
    return (
      <div className="flex items-center gap-5 px-3 py-1 rounded-lg bg-white/[0.02] border border-white/[0.05]">
        {gpu?.available && (
          <StatBox 
            label="VRAM" 
            value={vramGB} 
            max={vramTotalGB} 
            unit="GB" 
            color={vramGB / vramTotalGB > 0.85 ? '#ef4444' : vramGB / vramTotalGB > 0.65 ? '#f59e0b' : '#10b981'} 
          />
        )}
        <StatBox 
          label="CPU" 
          value={sys?.cpu_percent ?? 0} 
          unit="%" 
          color="#3b82f6" 
        />
        <StatBox 
          label="RAM" 
          value={sys?.ram_used_gb ?? 0} 
          max={sys?.ram_total_gb} 
          unit="GB" 
          color="#8b5cf6" 
        />
      </div>
    );
  }

  return (
    <div
      className="glass rounded-xl p-3 w-52 select-none shadow-card animate-fade-in"
      style={{ fontSize: '11px' }}
    >
      <button
        onClick={() => setCollapsed(v => !v)}
        className="flex items-center justify-between w-full mb-2"
      >
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
          <span className="text-xs font-semibold" style={{ color: '#f9fafb' }}>System Monitor</span>
        </div>
        <span style={{ color: '#6b7280' }}>{collapsed ? '▶' : '▼'}</span>
      </button>

      {!collapsed && (
        <div className="space-y-2.5 animate-fade-in">
          {gpu?.available ? (
            <StatBar
              label={`GPU VRAM · ${gpu.temperature}°C`}
              value={vramGB}
              max={vramTotalGB}
              unit="GB"
              color={vramGB / vramTotalGB > 0.85 ? '#ef4444' : vramGB / vramTotalGB > 0.65 ? '#f59e0b' : '#10b981'}
            />
          ) : (
            <div className="text-[10px]" style={{ color: '#6b7280' }}>GPU: Not detected</div>
          )}

          {gpu?.available && (
            <StatBar
              label="GPU Utilization"
              value={gpu.gpu_util}
              unit="%"
              color="#6366f1"
            />
          )}

          <StatBar
            label="CPU"
            value={sys?.cpu_percent ?? 0}
            unit="%"
            color="#3b82f6"
          />

          <StatBar
            label="RAM"
            value={sys?.ram_used_gb ?? 0}
            max={sys?.ram_total_gb}
            unit="GB"
            color="#8b5cf6"
          />
        </div>
      )}
    </div>
  );
}

function StatBox({ label, value, max, unit, color }: {
  label: string;
  value: number;
  max?: number;
  unit: string;
  color: string;
}) {
  const pct = max ? Math.min((value / max) * 100, 100) : Math.min(value, 100);
  return (
    <div className="flex flex-col gap-1 min-w-[70px]">
      <div className="flex justify-between items-center text-[9px] uppercase tracking-tighter">
        <span style={{ color: '#4b5563' }} className="font-bold">{label}</span>
        <span style={{ color: '#9ca3af' }} className="font-mono">
          {max ? `${(value || 0).toFixed(1)}${unit}` : `${Math.round(value || 0)}${unit}`}
        </span>
      </div>
      <div className="h-1 rounded-full bg-white/5 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
    </div>
  );
}
