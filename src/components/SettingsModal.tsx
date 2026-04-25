import { useState, useEffect } from 'react';
import { useModelStore } from '../store/modelStore';
import { updateSettings, getSettings } from '../lib/api';

// Sub-components
import { ModelPanel } from './ModelPanel';
import { SystemMonitor } from './SystemMonitor';
import { FlushButton } from './FlushButton';

interface Props {
  onClose: () => void;
}

export function SettingsModal({ onClose }: Props) {
  const { assistantName, setAssistantName } = useModelStore();

  // Local pending states
  const [localName, setLocalName] = useState(assistantName);
  const [geminiKey, setGeminiKey] = useState('');
  const [hfToken, setHfToken] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Load existing settings on mount
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const settings = await getSettings();
        if (settings.assistant_name) {
          setLocalName(settings.assistant_name);
          setAssistantName(settings.assistant_name);
        }
        if (settings.gemini_api_key) setGeminiKey(settings.gemini_api_key);
        if (settings.hf_token) setHfToken(settings.hf_token);
      } catch (err) {
        console.error('Failed to load settings', err);
      }
    };
    fetchSettings();
  }, [setAssistantName]);


  const handleApplyChanges = async () => {
    setIsSaving(true);
    setError(null);
    setSuccess(false);

    try {
      await updateSettings({
        assistant_name: localName,
        gemini_api_key: geminiKey,
        hf_token: hfToken,
      });

      setAssistantName(localName);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to save changes');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fade-in"
      onClick={(e) => e.target === e.currentTarget && onClose()}>

      <div className="bg-[#0a0a0a]/90 border border-white/10 w-full max-w-4xl max-h-[90vh] rounded-none flex flex-col shadow-[0_0_100px_rgba(0,0,0,0.8)] overflow-hidden animate-scale-in relative">

        {/* Glow effects */}
        <div className="absolute -top-24 -right-24 w-64 h-64 bg-accent/20 rounded-none blur-[80px] pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-64 h-64 bg-accent/10 rounded-none blur-[80px] pointer-events-none" />

        {/* Header */}
        <div className="flex items-center justify-between p-8 border-b border-white/5 relative z-10">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-none bg-white/5 border border-white/10 text-accent shadow-inner">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            </div>
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-white">System Core</h2>
              <p className="text-xs text-gray-400 mt-0.5">Manage your AI identity and local resources</p>
            </div>
          </div>
          <button onClick={onClose} className="p-3 rounded-full hover:bg-white/5 text-gray-500 hover:text-white transition-all active:scale-90">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-8 pb-16 custom-scrollbar space-y-10 relative z-10">

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Identity */}
            <section className="space-y-4">
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-accent/60 px-1">01. Identity</span>
              <div className="bg-white/[0.03] p-6 rounded-none border border-white/5">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-gray-500 ml-1">Assistant Name</label>
                    <input
                      value={localName}
                      onChange={(e) => setLocalName(e.target.value)}
                      className="w-full bg-black/40 border border-white/5 rounded-none px-5 py-3.5 text-sm font-medium outline-none focus:border-accent/30 transition-all shadow-lg"
                      placeholder="e.g. Antigravity"
                    />
                  </div>
                </div>
              </div>
            </section>

            {/* API Config */}
            <section className="space-y-4">
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-orange-400/60 px-1">02. External Connect</span>
              <div className="bg-white/[0.03] p-6 rounded-none border border-white/5">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-gray-500 ml-1">Gemini API Key</label>
                    <input
                      type="password"
                      value={geminiKey}
                      onChange={(e) => setGeminiKey(e.target.value)}
                      className="w-full bg-black/40 border border-white/5 rounded-none px-5 py-3.5 text-sm font-mono outline-none focus:border-accent/30 transition-all shadow-lg"
                      placeholder="Paste Gemini API Key..."
                    />
                  </div>
                  {/* <div className="space-y-2">
                    <label className="text-xs font-bold text-gray-500 ml-1">
                      HuggingFace Token
                      <span className="ml-1.5 text-[9px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(139,92,246,0.15)', color: '#a78bfa' }}>For gated models (Llama Vision)</span>
                    </label>
                    <input
                      type="password"
                      value={hfToken}
                      onChange={(e) => setHfToken(e.target.value)}
                      className="w-full bg-black/40 border border-white/5 rounded-none px-5 py-3.5 text-sm font-mono outline-none focus:border-purple-500/30 transition-all shadow-lg"
                      placeholder="hf_..."
                    />
                    <p className="text-[10px] ml-1" style={{ color: '#4b5563' }}>
                      Get yours at <span style={{ color: '#a78bfa' }}>huggingface.co/settings/tokens</span> (read access)
                    </p>
                  </div> */}
                </div>
              </div>
            </section>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 items-start">
            <section className="lg:col-span-3 space-y-4">
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-accent/60 px-1">03. Inference Engine</span>
              <div className="bg-white/[0.03] rounded-none border border-white/5 overflow-hidden shadow-inner backdrop-blur-xl min-h-[100px]">
                {ModelPanel ? <ModelPanel /> : <div className="p-10 text-center text-xs text-gray-600">Initializing Engine...</div>}
              </div>
            </section>

            <section className="lg:col-span-2 space-y-4">
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-red-400/60 px-1">04. Resources</span>
              <div className="bg-white/[0.03] p-6 rounded-none border border-white/5 space-y-6 min-h-[100px]">
                {SystemMonitor ? <SystemMonitor key="modal-monitor" /> : <div className="p-4 text-xs text-gray-500">Monitor Unavailable</div>}
                <div className="pt-2 border-t border-white/5">
                  <div className="flex flex-col gap-3">
                    <span className="text-[10px] uppercase font-bold text-gray-500 block">Critical Actions</span>
                    {FlushButton ? <FlushButton /> : <div className="h-10 bg-white/5 rounded-none animate-pulse" />}
                  </div>
                </div>
              </div>
            </section>
          </div>

        </div>

        {/* Footer */}
        <div className="p-8 bg-black/40 border-t border-white/5 flex items-center justify-between relative z-10">
          <div className="flex items-center gap-3">
            {success && <div className="text-emerald-400 text-xs font-bold animate-fade-in">✓ Changes applied successfully</div>}
            {error && <div className="text-red-400 text-xs font-bold animate-fade-in">⚠ {error}</div>}
          </div>
          <div className="flex gap-3">
            <button onClick={onClose} className="px-8 py-3 bg-white/5 border border-white/10 rounded-none text-xs font-bold transition-all">Cancel</button>
            <button
              onClick={handleApplyChanges}
              disabled={isSaving}
              className={`px-10 py-3 rounded-none text-xs font-black tracking-widest uppercase transition-all shadow-xl active:scale-95 disabled:opacity-50 ${success ? 'bg-emerald-500 text-black shadow-emerald-500/20' : 'bg-[#10b981] text-black shadow-accent/20'
                }`}
            >
              {isSaving ? 'Synchronizing...' : success ? 'Applied ✓' : 'Apply Core Changes'}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
