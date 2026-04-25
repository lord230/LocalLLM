

import { useEffect, useRef } from 'react';
import { useModelStore } from '../store/modelStore';
import { downloadModel, getModels, loadModel, unloadModel, getConfig, updateConfig, getEmbeddingStatus } from '../lib/api';
import { open } from '@tauri-apps/plugin-dialog';
import { EmbeddingStatus } from './EmbeddingStatus';

export function ModelPanel() {
  const store = useModelStore();
  const cancelDownloadRef = useRef<(() => void) | null>(null);

  const fetchModels = async () => {
    try {
      const data = await getModels();
      if (!data || !data.models) return;
      const { models } = data;
      store.setModels(models);
      const active = (models || []).find(m => m.active);
      if (active) store.setActiveModel(active.id);
      
      const embeddingStatus = await getEmbeddingStatus();
      store.setEmbeddingStatus(embeddingStatus);
    } catch (e) {
       console.error("ModelPanel fetch error:", e);
    }
  };

  const fetchConfig = async () => {
    try {
      const { models_dir } = await getConfig();
      store.setModelsDir(models_dir);
    } catch { /* ignore */ }
  };

  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    fetchModels();
    fetchConfig();
    const id = setInterval(() => {
      if (isMounted.current) fetchModels();
    }, 5000);
    return () => {
      isMounted.current = false;
      clearInterval(id);
    };
  }, []);

  const handleDownload = (modelId: string) => {
    store.setDownloading(modelId);
    store.setError(null);

    cancelDownloadRef.current = downloadModel(
      modelId,
      (progress) => store.setDownloadProgress(progress),
      (id) => {
        store.markDownloaded(id);
        store.setDownloading(null);
        store.setDownloadProgress(null);
        fetchModels();
      },
      (err) => {
        store.setError(`Download failed: ${err}`);
        store.setDownloading(null);
        store.setDownloadProgress(null);
      }
    );
  };

  const handleLoad = async (modelId: string) => {
    store.setModelLoading(true);
    store.setError(null);
    try {
      await loadModel(modelId);
      store.setActiveModel(modelId);
      await fetchModels();
    } catch (e: any) {
      store.setError(e.message ?? 'Failed to load model');
    } finally {
      store.setModelLoading(false);
    }
  };

  const handleUnload = async () => {
    try {
      await unloadModel();
      store.setActiveModel(null);
      await fetchModels();
    } catch (e: any) {
      store.setError(e.message ?? 'Failed to unload');
    }
  };

  const handleChangeDir = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        defaultPath: store.modelsDir || undefined,
      });
      if (selected && typeof selected === 'string') {
        await updateConfig(selected);
        store.setModelsDir(selected);
        await fetchModels();
      }
    } catch (e: any) {
      store.setError(e.message ?? 'Failed to change directory');
    }
  };

  const dp = store.downloadProgress;

  return (
    <div className="space-y-4 p-6 pt-8">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#6b7280' }}>
          Models
        </span>
        {store.activeModelId && (
          <button
            onClick={handleUnload}
            className="text-[10px] px-2 py-1 rounded-none transition-all"
            style={{ color: '#f87171', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}
          >
            Unload
          </button>
        )}
      </div>

      {/* Error */}
      {store.error && (
        <div className="text-xs p-2 rounded-none" style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' }}>
          {store.error}
        </div>
      )}

      <div className="p-2 rounded-none mb-2 flex items-center justify-between gap-2" 
           style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] uppercase font-bold tracking-tighter" style={{ color: '#4b5563' }}>Storage Location</div>
          <div className="text-[10px] truncate" style={{ color: '#6b7280' }}>
            {store.modelsDir || 'Loading path...'}
          </div>
        </div>
        <button 
          onClick={handleChangeDir}
          className="p-1.5 rounded-md hover:bg-white/5 transition-colors"
          style={{ color: '#10b981' }}
          title="Change models directory"
        >
          <FolderIcon />
        </button>
      </div>

      {/* Loading indicator */}
      {store.isModelLoading && (
        <div className="flex items-center gap-2 text-xs p-2 rounded-lg animate-pulse"
             style={{ background: 'rgba(16,185,129,0.1)', color: '#10b981' }}>
          <span className="animate-spin-slow">⟳</span>
          Loading into GPU…
        </div>
      )}

      {(store.models || []).map(model => {
        if (!model) return null;
        const isActive = model.id === store.activeModelId;
        const isDownloading = store.downloadingId === model.id;

        return (
          <div
            key={model.id}
            className="p-4 transition-all duration-200 rounded-none mb-3"
            style={{
              background: isActive ? 'rgba(16,185,129,0.08)' : 'rgba(255,255,255,0.03)',
              border: isActive ? '1px solid rgba(16,185,129,0.3)' : '1px solid rgba(255,255,255,0.06)',
            }}
          >
            <div className="flex items-start justify-between mb-2">
              <div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {isActive && <span className="w-1.5 h-1.5 rounded-full bg-accent" />}
                  <span className="text-xs font-medium text-white">{model.name}</span>
                  {model.vision && (
                    <span
                      className="text-[9px] px-1.5 py-0.5 rounded-full font-bold"
                      style={{ background: 'rgba(139,92,246,0.2)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.3)' }}
                    >
                      👁 VISION
                    </span>
                  )}
                </div>
                <div className="text-[10px] mt-0.5" style={{ color: '#6b7280' }}>
                  {(model.vramGB || 0)} GB VRAM
                  {model.downloaded && (model.size_bytes || 0) > 0 && (
                    <> · {((model.size_bytes || 0) / 1e9).toFixed(1)} GB</>
                  )}
                  {model.vision && model.mmproj_filename && (
                    <span className="ml-1.5" style={{ color: model.mmproj_ready ? '#10b981' : '#f59e0b' }}>
                      · Encoder: {model.mmproj_ready ? '✓ Ready' : '⚠ Needed'}
                    </span>
                  )}
                </div>
              </div>
              <StatusBadge active={isActive} downloaded={model.downloaded} provider={model.provider} vision={model.vision} />
            </div>

            {isDownloading && dp && (
              <div className="mb-2 space-y-1 animate-fade-in">
                {(dp as any).label && (
                  <div className="text-[10px] font-medium" style={{ color: (dp as any).label === 'Vision encoder' ? '#a78bfa' : '#10b981' }}>
                    {(dp as any).label === 'Vision encoder' ? '👁 ' : '⬇ '}{(dp as any).label}
                  </div>
                )}
                <div className="flex justify-between text-[10px]" style={{ color: '#6b7280' }}>
                  <span>{(dp.speed_mbps || 0)} MB/s</span>
                  <span>{(dp.percent || 0).toFixed(1)}%</span>
                </div>
                <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${(dp.percent || 0)}%`,
                      background: (dp as any).label === 'Vision encoder'
                        ? 'linear-gradient(90deg, #8b5cf6, #7c3aed)'
                        : 'linear-gradient(90deg, #10b981, #059669)',
                    }}
                  />
                </div>
                <div className="text-[10px]" style={{ color: '#6b7280' }}>
                  {((dp.downloaded || 0) / 1e6).toFixed(0)} MB / {((dp.total || 0) / 1e6).toFixed(0)} MB
                </div>
              </div>
            )}

            <div className="flex gap-1.5">
              {model.provider === 'google' ? (
                !isActive ? (
                    <button
                      onClick={() => !store.isModelLoading && handleLoad(model.id)}
                      disabled={store.isModelLoading}
                      className="flex-1 text-[11px] py-1.5 rounded-none font-medium transition-all disabled:opacity-50"
                      style={{ background: 'rgba(99,102,241,0.15)', color: '#818cf8', border: '1px solid rgba(99,102,241,0.3)' }}
                    >
                      Select Cloud Model
                    </button>
                ) : (
                  <div className="flex-1 text-center text-[11px] py-1" style={{ color: '#10b981' }}>
                    ✓ Active (Cloud)
                  </div>
                )
              ) : !model.downloaded ? (
                <button
                  onClick={() => !isDownloading && handleDownload(model.id)}
                  disabled={isDownloading || store.downloadingId !== null}
                  className="flex-1 text-[11px] py-1.5 rounded-none font-medium transition-all disabled:opacity-50"
                  style={{ background: 'rgba(16,185,129,0.15)', color: '#10b981', border: '1px solid rgba(16,185,129,0.3)' }}
                  id={`download-${model.id}`}
                >
                  {isDownloading ? '↓ Downloading…' : '↓ Download'}
                </button>
              ) : !isActive ? (
                <button
                  onClick={() => !store.isModelLoading && handleLoad(model.id)}
                  disabled={store.isModelLoading}
                  className="flex-1 text-[11px] py-1.5 rounded-none font-medium transition-all disabled:opacity-50"
                  style={{ background: 'rgba(99,102,241,0.15)', color: '#818cf8', border: '1px solid rgba(99,102,241,0.3)' }}
                  id={`load-${model.id}`}
                >
                  ▶ Load onto GPU
                </button>
              ) : (
                <div className="flex-1 text-center text-[11px] py-1" style={{ color: '#10b981' }}>
                  ✓ Active
                </div>
              )}
            </div>
          </div>
        );
      })}

      {store.models.length === 0 && (
        <div className="text-xs text-center py-4" style={{ color: '#4b5563' }}>
          Waiting for backend…
        </div>
      )}

      <EmbeddingStatus />
    </div>
  );
}

function StatusBadge({ active, downloaded, provider }: { active: boolean; downloaded: boolean; provider?: string; vision?: boolean }) {
  if (provider === 'google') return (
    <span className="text-[9px] px-1.5 py-0.5 rounded-full font-medium"
          style={{ background: 'rgba(99,102,241,0.15)', color: '#818cf8', border: '1px solid rgba(99,102,241,0.2)' }}>
      CLOUD
    </span>
  );
  if (active) return (
    <span className="text-[9px] px-1.5 py-0.5 rounded-full font-medium"
          style={{ background: 'rgba(16,185,129,0.2)', color: '#10b981' }}>
      ACTIVE
    </span>
  );
  if (downloaded) return (
    <span className="text-[9px] px-1.5 py-0.5 rounded-full"
          style={{ background: 'rgba(255,255,255,0.06)', color: '#6b7280' }}>
      READY
    </span>
  );
  return (
    <span className="text-[9px] px-1.5 py-0.5 rounded-full"
          style={{ background: 'rgba(255,255,255,0.04)', color: '#4b5563' }}>
      NOT DL
    </span>
  );
}

function FolderIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>
    </svg>
  );
}

