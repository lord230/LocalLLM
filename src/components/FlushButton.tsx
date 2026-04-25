

import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useModelStore } from '../store/modelStore';

export function FlushButton() {
  const [flushing, setFlushing] = useState(false);
  const [done, setDone] = useState(false);
  const store = useModelStore();

  const handleFlush = async () => {
    if (flushing) return;
    setFlushing(true);
    setDone(false);

    try {
      await invoke('flush_gpu');
      store.setActiveModel(null);
      store.setModelLoading(false);
      setDone(true);
      setTimeout(() => setDone(false), 3000);
    } catch (e: any) {
      try {
        await fetch('http://127.0.0.1:8000/flush', { method: 'POST' });
        store.setActiveModel(null);
        setDone(true);
        setTimeout(() => setDone(false), 3000);
      } catch {
        store.setError('Failed to flush GPU');
      }
    } finally {
      setFlushing(false);
    }
  };

  return (
    <button
      onClick={handleFlush}
      disabled={flushing}
      className="flex items-center gap-2 w-full px-3 py-2.5 rounded-xl text-xs font-medium
                 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
      style={{
        background: done
          ? 'rgba(16,185,129,0.12)'
          : 'rgba(239,68,68,0.08)',
        color: done ? '#10b981' : '#f87171',
        border: done
          ? '1px solid rgba(16,185,129,0.25)'
          : '1px solid rgba(239,68,68,0.2)',
      }}
      id="flush-gpu-btn"
    >
      {flushing ? (
        <>
          <span className="animate-spin-slow text-base">⟳</span>
          Flushing…
        </>
      ) : done ? (
        <>
          <span>✓</span>
          VRAM Cleared
        </>
      ) : (
        <>
          <GpuIcon />
          Flush GPU
        </>
      )}
    </button>
  );
}

function GpuIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <path d="M6 6V4M10 6V4M14 6V4M18 6V4M6 18v2M10 18v2M14 18v2M18 18v2" />
    </svg>
  );
}
