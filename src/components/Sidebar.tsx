

import { useState, useRef, useEffect } from 'react';
import { useChatStore } from '../store/chatStore';
import { useModelStore } from '../store/modelStore';

interface Props {
  onNewChat: () => void;
  onMemoryLayers: () => void;
  memoryFactCount: number;
  showMemoryLayers: boolean;
}

export function Sidebar({ onNewChat, onMemoryLayers, memoryFactCount, showMemoryLayers }: Props) {
  const { conversations, activeConversationId, setActiveConversation, deleteConversation, renameConversation } = useChatStore();
  const { showSettings, setShowSettings } = useModelStore();
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const renameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (renamingId && renameRef.current) {
      renameRef.current.focus();
      renameRef.current.select();
    }
  }, [renamingId]);

  const startRename = (id: string, currentTitle: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setRenamingId(id);
    setRenameValue(currentTitle);
  };

  const commitRename = () => {
    if (renamingId && renameValue.trim()) {
      renameConversation(renamingId, renameValue.trim());
    }
    setRenamingId(null);
  };

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    deleteConversation(id);
  };

  const sorted = [...conversations].sort((a, b) => b.updatedAt - a.updatedAt);

  return (
    <div className="flex flex-col h-full" style={{ borderRight: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="p-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-none flex items-center justify-center text-sm font-bold"
               style={{ background: 'rgba(16,185,129,0.15)', color: '#10b981', border: '1px solid rgba(16,185,129,0.3)' }}>
            L
          </div>
          <span className="text-sm font-semibold text-white">LocalLLM</span>
        </div>
      </div>

      <div className="px-3 mb-2">
        <button
          onClick={onNewChat}
          className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-none text-sm
                     transition-all duration-150 font-medium group"
          style={{ background: 'rgba(16,185,129,0.1)', color: '#10b981', border: '1px solid rgba(16,185,129,0.2)' }}
          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(16,185,129,0.18)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'rgba(16,185,129,0.1)')}
          id="new-chat-btn"
        >
          <PlusIcon />
          New Chat
        </button>
      </div>

      {sorted.length > 0 && (
        <div className="px-4 mb-1.5">
          <span className="text-[10px] font-medium uppercase tracking-widest" style={{ color: '#4b5563' }}>
            Recent
          </span>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-2 space-y-0.5 pb-4">
        {sorted.length === 0 && (
          <div className="text-center mt-8 text-xs" style={{ color: '#4b5563' }}>
            No conversations yet
          </div>
        )}

        {sorted.map(conv => (
          <div
            key={conv.id}
            onClick={() => setActiveConversation(conv.id)}
            className={`sidebar-item group relative ${conv.id === activeConversationId ? 'active' : ''}`}
            id={`conv-${conv.id}`}
          >
            <ChatIcon />

            {renamingId === conv.id ? (
              <input
                ref={renameRef}
                value={renameValue}
                onChange={e => setRenameValue(e.target.value)}
                onBlur={commitRename}
                onKeyDown={e => {
                  if (e.key === 'Enter') commitRename();
                  if (e.key === 'Escape') setRenamingId(null);
                }}
                onClick={e => e.stopPropagation()}
                className="flex-1 bg-transparent outline-none text-sm text-white border-b border-accent"
              />
            ) : (
              <span className="flex-1 truncate text-sm">{conv.title}</span>
            )}

            {renamingId !== conv.id && (
              <div className="hidden group-hover:flex items-center gap-0.5 absolute right-1">
                <button
                  onClick={e => startRename(conv.id, conv.title, e)}
                  className="p-1 rounded hover:bg-white/10 transition-all"
                  style={{ color: '#6b7280' }}
                  title="Rename"
                >
                  <PencilIcon />
                </button>
                <button
                  onClick={e => handleDelete(conv.id, e)}
                  className="p-1 rounded hover:bg-red-500/20 transition-all"
                  style={{ color: '#6b7280' }}
                  title="Delete"
                >
                  <TrashIcon />
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="p-3 mt-auto space-y-2" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <button
          onClick={() => setShowSettings(!showSettings)}
          className={`w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs
                     transition-all duration-200 font-semibold group`}
          style={{ 
            background: showSettings ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.04)', 
            color: showSettings ? '#10b981' : '#9ca3af',
            border: showSettings ? '1px solid rgba(16,185,129,0.3)' : '1px solid rgba(255,255,255,0.08)' 
          }}
          onMouseEnter={e => {
            if(!showSettings) e.currentTarget.style.background = 'rgba(255,255,255,0.08)';
          }}
          onMouseLeave={e => {
            if(!showSettings) e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
          }}
        >
          <SettingsIcon />
          Settings & Models
        </button>

        <button
          onClick={onMemoryLayers}
          className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs
                     transition-all duration-200 font-semibold relative"
          style={{
            background: showMemoryLayers ? 'rgba(167,139,250,0.15)' : 'rgba(255,255,255,0.04)',
            color: showMemoryLayers ? '#a78bfa' : '#9ca3af',
            border: showMemoryLayers ? '1px solid rgba(167,139,250,0.3)' : '1px solid rgba(255,255,255,0.08)'
          }}
          onMouseEnter={e => {
            if (!showMemoryLayers) e.currentTarget.style.background = 'rgba(255,255,255,0.08)';
          }}
          onMouseLeave={e => {
            if (!showMemoryLayers) e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
          }}
          id="memory-layers-btn"
        >
          <BrainIcon />
          Memory Layers
          {memoryFactCount > 0 && (
            <span
              className="absolute right-3 px-1.5 py-0.5 rounded-full text-[9px] font-bold"
              style={{ background: 'rgba(167,139,250,0.25)', color: '#a78bfa' }}
            >
              {memoryFactCount}
            </span>
          )}
        </button>

        <button
          onClick={async () => {
            if (confirm('Are you sure you want to uninstall LocalLLM? This will completely remove the application.')) {
              try {
                const { invoke } = await import('@tauri-apps/api/core');
                await invoke('uninstall_app');
              } catch (e) {
                console.error(e);
                alert('Failed to trigger native uninstall. Please remove from Windows Settings.');
              }
            }
          }}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs
                     transition-all duration-150 font-medium group text-red-500/80 hover:text-red-500"
          style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.1)' }}
          onMouseEnter={e => {
            e.currentTarget.style.background = 'rgba(239,68,68,0.15)';
            e.currentTarget.style.borderColor = 'rgba(239,68,68,0.3)';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'rgba(239,68,68,0.05)';
            e.currentTarget.style.borderColor = 'rgba(239,68,68,0.1)';
          }}
        >
          <TrashIcon />
          Uninstall LocalLLM
        </button>
      </div>
    </div>
  );
}

// ── Icons ───────────────────────────────────────────────────────────────────

function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}
function ChatIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.5">
      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
    </svg>
  );
}
function PencilIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}
function TrashIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2" />
    </svg>
  );
}
function SettingsIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function BrainIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2Z" />
      <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2Z" />
    </svg>
  );
}
