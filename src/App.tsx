
import { useState, useEffect, useCallback } from 'react';
import { useChatStore } from './store/chatStore';
import { useModelStore } from './store/modelStore';
import { getStatus, getEmbeddingStatus, getSettings, getMemorySnapshot } from './lib/api';
import { Sidebar } from './components/Sidebar';
import { ChatWindow } from './components/ChatWindow';
import { SystemMonitor } from './components/SystemMonitor';
import { SettingsModal } from './components/SettingsModal';
import { MemoryModal } from './components/MemoryModal';
import { MemoryLayerPanel } from './components/MemoryLayerPanel';

export default function App() {
  const [showMemory, setShowMemory] = useState(false);
  const [showMemoryLayers, setShowMemoryLayers] = useState(false);
  const [memoryFactCount, setMemoryFactCount] = useState(0);
  const { activeConversationId, createConversation, setActiveConversation } = useChatStore();
  const {
    setBackendOnline,
    setActiveModel,
    backendOnline,
    activeModelId,
    setEmbeddingStatus,
    showSettings,
    setShowSettings,
    setAssistantName
  } = useModelStore();

  // Initial settings fetch
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const settings = await getSettings();
        if (settings.assistant_name) setAssistantName(settings.assistant_name);
      } catch (err) {
        console.error("Failed to load settings:", err);
      }
    };
    fetchSettings();
  }, [setAssistantName]);

  useEffect(() => {
    const check = async () => {
      try {
        const status = await getStatus();
        setBackendOnline(true);
        if (status.active_model) setActiveModel(status.active_model);
        else if (!status.is_loaded) setActiveModel(null);

        const embStatus = await getEmbeddingStatus();
        setEmbeddingStatus(embStatus);
      } catch {
        setBackendOnline(false);
      }
    };
    check();
    const id = setInterval(check, 3000);
    return () => clearInterval(id);
  }, [setBackendOnline, setActiveModel, setEmbeddingStatus]);

  useEffect(() => {
    if (!backendOnline) return;
    const fetchCount = async () => {
      try {
        const snap = await getMemorySnapshot();
        setMemoryFactCount(snap.user_memory.fact_count);
      } catch { /* silent */ }
    };
    fetchCount();
    const id = setInterval(fetchCount, 10000);
    return () => clearInterval(id);
  }, [backendOnline]);

  const handleNewChat = useCallback(() => {
    const id = createConversation();
    setActiveConversation(id);
  }, [createConversation, setActiveConversation]);

  return (
    <div className="flex h-screen w-screen overflow-hidden" style={{ background: '#0a0a0a' }}>
      {showMemory && <MemoryModal onClose={() => setShowMemory(false)} />}

      <MemoryLayerPanel
        isOpen={showMemoryLayers}
        onClose={() => setShowMemoryLayers(false)}
        backendOnline={backendOnline}
      />

      {/* Settings Hub Modal */}
      {showSettings && (
        <SettingsModal onClose={() => setShowSettings(false)} />
      )}

      {/* ── Sidebar ─────────────────────────────────────── */}
      <aside
        className="flex-shrink-0 w-64 h-full flex flex-col"
        style={{ background: '#111111' }}
      >
        <Sidebar
          onNewChat={handleNewChat}
          onMemoryLayers={() => setShowMemoryLayers(o => !o)}
          memoryFactCount={memoryFactCount}
          showMemoryLayers={showMemoryLayers}
        />
      </aside>

      {/* ── Main chat area ───────────────────────────────── */}
      <main className="flex-1 flex flex-col overflow-hidden relative">

        {/* Chat header */}
        <header
          className="flex-shrink-0 flex items-center justify-center h-14 relative"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
        >
          <div className="text-sm font-medium" style={{ color: '#9ca3af' }}>
            {activeModelId ? (
              <span className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                {activeModelId}
              </span>
            ) : (
              <span style={{ color: '#4b5563' }}>No model loaded</span>
            )}
          </div>

          <div className="absolute right-4 flex items-center gap-6">
            <SystemMonitor landscape />
            
            <div className="flex items-center gap-1.5">
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ background: backendOnline ? '#10b981' : '#ef4444' }}
              />
              <span className="text-[10px]" style={{ color: '#6b7280' }}>
                {backendOnline ? 'Backend online' : 'Backend offline'}
              </span>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-hidden">
          <ChatWindow conversationId={activeConversationId} />
        </div>
      </main>
    </div>
  );
}
