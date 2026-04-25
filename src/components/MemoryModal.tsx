

import { useState, useEffect } from 'react';
import { getSettings, updateSettings, recapMemory } from '../lib/api';
import { useChatStore } from '../store/chatStore';

interface MemoryModalProps {
  onClose: () => void;
}

export function MemoryModal({ onClose }: MemoryModalProps) {
  const [profileText, setProfileText] = useState('');
  const [vectors, setVectors] = useState<any[]>([]);
  
  const [saving, setSaving] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const chatStore = useChatStore();

  useEffect(() => {
    const fetch = async () => {
      try {
        const settings = await getSettings();
        
        if (Array.isArray(settings.profile)) {
          setProfileText(settings.profile.join('\n'));
        } else if (settings.profile) {
          const facts: string[] = [];
          Object.entries(settings.profile).forEach(([k, v]) => {
            if (typeof v === 'string') facts.push(`${k}: ${v}`);
            else if (v && typeof v === 'object') {
              Object.entries(v).forEach(([sk, sv]) => facts.push(`${sk}: ${sv}`));
            }
          });
          setProfileText(facts.join('\n'));
        }

        if (Array.isArray(settings.vectors)) {
          setVectors(settings.vectors);
        }
      } catch (e) {
        console.error('Failed to fetch memory settings', e);
      }
    };
    fetch();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const profileArray = profileText
        .split('\n')
        .map(s => s.trim())
        .filter(s => s.length > 0);

      await updateSettings({
        profile: profileArray
      });
      onClose();
    } catch (e: any) {
      setError(e.message ?? 'Failed to save memory config');
    } finally {
      setSaving(false);
    }
  };

  const handleRecap = async () => {
    const conv = chatStore.getActiveConversation();
    if (!conv || conv.messages.length === 0) return;
    
    setScanning(true);
    setError(null);
    try {
      const apiMessages = conv.messages.map(m => ({ role: m.role, content: m.content }));
      await recapMemory(apiMessages);
      
      setTimeout(async () => {
        const settings = await getSettings();
        if (Array.isArray(settings.profile)) {
          setProfileText(settings.profile.join('\n'));
        }
        if (Array.isArray(settings.vectors)) {
          setVectors(settings.vectors);
        }
        setScanning(false);
      }, 3000);
    } catch (e: any) {
      setError(e.message ?? 'Failed to trigger recap');
      setScanning(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className="w-full max-w-3xl max-h-[90vh] flex flex-col rounded-2xl overflow-hidden shadow-2xl"
        style={{ background: '#111111', border: '1px solid rgba(255,255,255,0.1)' }}
      >
        <div className="flex-shrink-0 px-6 py-4 border-b flex items-center justify-between" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
          <div className="flex items-center gap-3">
            <MemoryIcon />
            <div>
              <h2 className="text-sm font-semibold tracking-wide text-white">Hybrid Memory System</h2>
              <p className="text-[10px] text-gray-500 uppercase tracking-widest mt-0.5">Antigravity Core v2.0</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          {error && (
            <div className="text-xs p-3 rounded-lg flex items-center gap-2" style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' }}>
               {error}
            </div>
          )}

          <div className="flex items-center justify-between gap-4">
            <div className="text-xs text-gray-400 leading-relaxed max-w-md">
              Manually edit your <strong>Profile Facts</strong> or let the system extract <strong>Vector Memories</strong> from your conversations automatically.
            </div>
            <button
              onClick={handleRecap}
              disabled={scanning || saving}
              className="px-4 py-2 rounded-xl text-[11px] font-bold uppercase tracking-tight transition-all flex items-center gap-2 flex-shrink-0 shadow-lg active:scale-95"
              style={{ 
                background: scanning ? 'rgba(16,185,129,0.1)' : 'rgba(59,130,246,0.1)', 
                color: scanning ? '#10b981' : '#60a5fa',
                border: scanning ? '1px solid rgba(16,185,129,0.3)' : '1px solid rgba(59,130,246,0.3)'
              }}
            >
              <span className={scanning ? 'animate-spin' : ''}>{scanning ? '⟳' : '✧'}</span>
              {scanning ? 'Analyzing History...' : 'Full Chat Sync'}
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold uppercase tracking-wider flex items-center gap-2" style={{ color: '#10b981' }}>
                  <div className="w-1.5 h-1.5 rounded-full bg-current" />
                  Profile Facts
                </label>
                <span className="text-[10px] text-gray-500 font-mono">STABLE DATA</span>
              </div>
              <textarea
                value={profileText}
                onChange={(e) => setProfileText(e.target.value)}
                placeholder="User name is Amit&#10;User likes Python&#10;User has RTX 3060..."
                className="w-full h-80 p-4 rounded-2xl text-sm outline-none transition-all duration-200 resize-none font-mono leading-relaxed"
                style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(16,185,129,0.15)', color: '#d1d5db' }}
                onFocus={(e) => e.currentTarget.style.borderColor = 'rgba(16,185,129,0.4)'}
                onBlur={(e) => e.currentTarget.style.borderColor = 'rgba(16,185,129,0.15)'}
              />
              <p className="text-[10px] text-gray-500 italic">Enter one fact per line. These define who you are to the AI.</p>
            </div>

            <div className="space-y-3 flex flex-col">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold uppercase tracking-wider flex items-center gap-2" style={{ color: '#60a5fa' }}>
                  <div className="w-1.5 h-1.5 rounded-full bg-current" />
                  Learned Context
                </label>
                <span className="text-[10px] text-gray-500 font-mono">VECTOR MEMORY ({vectors.length})</span>
              </div>
              <div 
                className="flex-1 min-h-[320px] rounded-2xl overflow-y-auto p-2 space-y-2"
                style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(96,165,250,0.1)' }}
              >
                {vectors.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-gray-600 text-xs text-center p-8">
                    No learned memories yet. Chat with Antigravity to build this context automatically.
                  </div>
                ) : (
                  vectors.sort((a,b) => b.timestamp - a.timestamp).map((v, i) => (
                    <div key={i} className="p-3 rounded-xl border border-white/5 bg-white/[0.02] space-y-1">
                      <div className="text-[13px] leading-snug text-gray-300">{v.text}</div>
                      <div className="flex items-center justify-between mt-2">
                        <div className="flex gap-1 items-center">
                          {[...Array(5)].map((_, star) => (
                            <div 
                              key={star} 
                              className={`w-1 h-1 rounded-full ${star < (v.importance * 5) ? 'bg-blue-400' : 'bg-gray-800'}`} 
                            />
                          ))}
                          <span className="text-[8px] text-gray-500 font-mono ml-1">IMP: {(v.importance * 100).toFixed(0)}%</span>
                        </div>
                        <span className="text-[8px] text-gray-600 font-mono">
                          {new Date(v.timestamp * 1000).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
              <p className="text-[10px] text-gray-500 italic text-right">Extracted automatically using all-MiniLM-L6-v2.</p>
            </div>
          </div>
        </div>

        <div className="flex-shrink-0 p-5 px-6 border-t flex justify-end gap-3 bg-black/20" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
          <button 
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl text-xs font-semibold tracking-wide transition-colors"
            style={{ color: '#9ca3af', border: '1px solid rgba(255,255,255,0.1)' }}
            disabled={saving}
          >
            Cancel
          </button>
          <button 
            onClick={handleSave}
            disabled={saving}
            className="px-8 py-2.5 rounded-xl text-xs font-bold tracking-wide transition-all shadow-lg active:scale-95 disabled:opacity-50"
            style={{ background: '#10b981', color: '#000' }}
          >
            {saving ? 'UPDATING...' : 'SAVE CHANGES'}
          </button>
        </div>
      </div>
    </div>
  );
}

function MemoryIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 22h14a2 2 0 0 0 2-2V7l-5-5H6a2 2 0 0 0-2 2v4" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
      <path d="M3 15h6" />
      <path d="M3 18h6" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18"></line>
      <line x1="6" y1="6" x2="18" y2="18"></line>
    </svg>
  );
}
