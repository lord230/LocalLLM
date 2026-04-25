

import { create } from 'zustand';
import { ModelInfo } from '../lib/api';

interface DownloadState {
  percent: number;
  speed_mbps: number;
  downloaded: number;
  total: number;
}

interface ModelState {
  models: ModelInfo[];
  loading: boolean;
  activeModelId: string | null;
  isModelLoading: boolean;
  downloadingId: string | null;
  downloadProgress: DownloadState | null;
  error: string | null;
  backendOnline: boolean;
  modelsDir: string | null;
  embeddingStatus: { status: string; loaded: boolean; downloading: boolean } | null;
  isMemorySaving: boolean;
  
  showSettings: boolean;
  assistantName: string;

  setModels: (models: ModelInfo[]) => void;
  setLoading: (v: boolean) => void;
  setActiveModel: (id: string | null) => void;
  setModelLoading: (v: boolean) => void;
  setDownloading: (id: string | null) => void;
  setDownloadProgress: (p: DownloadState | null) => void;
  setError: (e: string | null) => void;
  setBackendOnline: (v: boolean) => void;
  markDownloaded: (id: string) => void;
  setModelsDir: (path: string) => void;
  setEmbeddingStatus: (status: any) => void;
  setShowSettings: (v: boolean) => void;
  setAssistantName: (name: string) => void;
  setIsMemorySaving: (v: boolean) => void;
}


export const useModelStore = create<ModelState>((set) => ({
  models: [],
  loading: false,
  activeModelId: null,
  isModelLoading: false,
  downloadingId: null,
  downloadProgress: null,
  error: null,
  backendOnline: false,
  modelsDir: null,
  embeddingStatus: null,
  showSettings: false,
  assistantName: 'Antigravity',
  isMemorySaving: false,

  setModels: (models) => set({ models }),
  setLoading: (v) => set({ loading: v }),
  setActiveModel: (id) => set({ activeModelId: id }),
  setModelLoading: (v) => set({ isModelLoading: v }),
  setDownloading: (id) => set({ downloadingId: id }),
  setDownloadProgress: (p) => set({ downloadProgress: p }),
  setError: (e) => set({ error: e }),
  setBackendOnline: (v) => set({ backendOnline: v }),
  setModelsDir: (path) => set({ modelsDir: path }),
  setEmbeddingStatus: (status) => set({ embeddingStatus: status }),
  setShowSettings: (v) => set({ showSettings: v }),
  setAssistantName: (name) => set({ assistantName: name }),
  setIsMemorySaving: (v) => set({ isMemorySaving: v }),
  markDownloaded: (id) =>
    set(s => ({
      models: s.models.map(m =>
        m.id === id ? { ...m, downloaded: true } : m
      ),
    })),
}));
