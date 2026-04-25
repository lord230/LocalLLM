

const BASE = 'http://127.0.0.1:8000';

export interface ModelInfo {
  id: string;
  name: string;
  provider?: string;
  filename: string | null;
  vramGB: number;
  downloaded: boolean;
  size_bytes: number;
  active: boolean;
  type?: string;
  vision?: boolean;
  mmproj_filename?: string | null;
  mmproj_ready?: boolean | null;
}

export interface StatusResponse {
  status: string;
  active_model: string | null;
  is_loading: boolean;
  is_loaded: boolean;
}

export interface EmbeddingStatus {
  status: string;
  loaded: boolean;
  downloading: boolean;
}

export interface SystemStats {
  cpu_percent: number;
  ram_used_gb: number;
  ram_total_gb: number;
  ram_percent: number;
}

export interface GenerateMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface UploadResult {
  filename: string;
  type: 'pdf' | 'image' | 'text';
  content_type: string;
  text: string;
  char_count: number;
  is_image: boolean;
}

export interface MemorySnapshot {
  session_metadata: {
    time: string;
    date: string;
    session_age_min: number;
    session_age_sec: number;
  };
  user_memory: {
    user_name: string;
    assistant_name: string;
    facts: string[];
    fact_count: number;
    is_extracting: boolean;
    recent_store_events: Array<{ fact: string; ts: number }>;
  };
  recent_summary: {
    text: string;
    active_topics: string[];
  };
  current_session: {
    message_count: number;
    token_count: number;
    session_age_min: number;
  };
}

// ─── Basic REST calls ────────────────────────────────────────────────────────

export async function getStatus(): Promise<StatusResponse> {
  const res = await fetch(`${BASE}/status`);
  return res.json();
}

export async function getEmbeddingStatus(): Promise<EmbeddingStatus> {
  const res = await fetch(`${BASE}/embedding_status`);
  return res.json();
}

export async function getModels(): Promise<{ models: ModelInfo[] }> {
  const res = await fetch(`${BASE}/models`);
  return res.json();
}

export async function loadModel(modelId: string): Promise<void> {
  const res = await fetch(`${BASE}/load_model`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model_id: modelId }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail ?? 'Failed to load model');
  }
}

export async function unloadModel(): Promise<void> {
  await fetch(`${BASE}/unload_model`, { method: 'POST' });
}

export async function flushGpu(): Promise<void> {
  await fetch(`${BASE}/flush`, { method: 'POST' });
}

export async function getSystemStats(): Promise<SystemStats> {
  const res = await fetch(`${BASE}/system_stats`);
  return res.json();
}

export async function getConfig(): Promise<{ models_dir: string }> {
  const res = await fetch(`${BASE}/config`);
  return res.json();
}

export async function updateConfig(modelsDir: string): Promise<void> {
  const res = await fetch(`${BASE}/config`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ models_dir: modelsDir }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail ?? 'Failed to update config');
  }
}

export async function getSettings(): Promise<any> {
  const res = await fetch(`${BASE}/settings`);
  return res.json();
}

export async function updateSettings(settings: { memory?: any; profile?: any; gemini_api_key?: string; assistant_name?: string; hf_token?: string }): Promise<void> {
  const res = await fetch(`${BASE}/settings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail ?? 'Failed to update settings');
  }
}

export async function recapMemory(messages: GenerateMessage[]): Promise<void> {
  await fetch(`${BASE}/recap_memory`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages }),
  });
}

export async function sendFeedback(query: string, response: string, rating: number): Promise<void> {
  await fetch(`${BASE}/feedback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, response, rating }),
  });
}

export async function getMemoryStatus(): Promise<{ is_extracting: boolean }> {
  const res = await fetch(`${BASE}/memory_status`);
  return res.json();
}

export async function getMemorySnapshot(): Promise<MemorySnapshot> {
  const res = await fetch(`${BASE}/memory_snapshot`);
  return res.json();
}

export async function uploadFile(file: File): Promise<UploadResult> {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch(`${BASE}/upload`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Upload failed' }));
    throw new Error(err.detail ?? 'Upload failed');
  }
  return res.json();
}


// ─── SSE: Download progress ──────────────────────────────────────────────────

export interface DownloadProgress {
  downloaded: number;
  total: number;
  percent: number;
  speed_mbps: number;
  filename: string;
}

export function downloadModel(
  modelId: string,
  onProgress: (p: DownloadProgress) => void,
  onDone: (modelId: string) => void,
  onError: (err: string) => void
): () => void {
  let aborted = false;
  const controller = new AbortController();

  (async () => {
    try {
      const res = await fetch(`${BASE}/download_model`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model_id: modelId }),
        signal: controller.signal,
      });

      if (res.headers.get('content-type')?.includes('application/json')) {
        const json = await res.json();
        if (json.status === 'already_downloaded') {
          onDone(modelId);
        }
        return;
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (!aborted) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (line.startsWith('data:')) {
            const data = line.slice(5).trim();
            try {
              const parsed = JSON.parse(data);
              if (parsed.percent !== undefined) onProgress(parsed as DownloadProgress);
              if (parsed.status === 'downloaded') onDone(parsed.model_id);
              if (parsed.error) onError(parsed.error);
            } catch { /* ignore parse errors */ }
          }
        }
      }
    } catch (e: any) {
      if (!aborted) onError(e.message ?? 'Download failed');
    }
  })();

  return () => {
    aborted = true;
    controller.abort();
  };
}

// ─── SSE: Streaming generation ───────────────────────────────────────────────

export function generateStream(
  messages: GenerateMessage[],
  maxTokens: number = 2048,
  onToken: (token: string) => void,
  onDone: () => void,
  onError: (err: string) => void,
  onTokenUsage?: (count: number) => void,
  fileContext?: string,
  fileName?: string,
  isImage?: boolean
): () => void {
  let aborted = false;
  const controller = new AbortController();

  (async () => {
    try {
      const res = await fetch(`${BASE}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages,
          max_tokens: maxTokens,
          file_context: fileContext ?? null,
          file_name: fileName ?? null,
          is_image: isImage ?? false,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const err = await res.json();
        onError(err.detail ?? 'Generation failed');
        return;
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let eventName = '';

      while (!aborted) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (line.startsWith('event:')) {
            eventName = line.slice(6).trim();
          } else if (line.startsWith('data:')) {
            const data = line.slice(5).trim();
            try {
              const parsed = JSON.parse(data);
              if (eventName === 'token' && parsed.token) onToken(parsed.token);
              if (eventName === 'token_usage' && parsed.token_count !== undefined) onTokenUsage?.(parsed.token_count);
              if (eventName === 'done') onDone();
              if (eventName === 'error') onError(parsed.error ?? 'Unknown error');
              eventName = '';
            } catch { /* ignore */ }
          }
        }
      }
    } catch (e: any) {
      if (!aborted) onError(e.message ?? 'Stream failed');
    }
  })();

  return () => {
    aborted = true;
    controller.abort();
  };
}
