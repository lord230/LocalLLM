

import { useEffect, useState, useCallback } from 'react';
import { getMemorySnapshot, MemorySnapshot } from '../lib/api';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  backendOnline: boolean;
}

const LAYERS = [
  {
    key: 'session_metadata',
    label: 'Session Metadata',
    sublabel: 'Temporary • Not stored',
    emoji: '',
    color: '#a78bfa',
    bg: 'rgba(167,139,250,0.07)',
    border: 'rgba(167,139,250,0.2)',
  },
  {
    key: 'user_memory',
    label: 'User Memory',
    sublabel: 'Persistent • Profile facts',
    emoji: '',
    color: '#10b981',
    bg: 'rgba(16,185,129,0.07)',
    border: 'rgba(16,185,129,0.2)',
  },
  {
    key: 'recent_summary',
    label: 'Recent Summary',
    sublabel: 'Last ~10 interactions compressed',
    emoji: '',
    color: '#60a5fa',
    bg: 'rgba(96,165,250,0.07)',
    border: 'rgba(96,165,250,0.2)',
  },
  {
    key: 'current_session',
    label: 'Current Session',
    sublabel: 'Live session context',
    emoji: '',
    color: '#fbbf24',
    bg: 'rgba(251,191,36,0.07)',
    border: 'rgba(251,191,36,0.2)',
  },
] as const;

function formatDuration(minutes: number): string {
  if (minutes < 1) return 'Just started';
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

// ─── Layer body components ────────────────────────────────────────────────────

function SessionMetadataBody({ data }: { data: MemorySnapshot['session_metadata'] }) {
  return (
    <div className="space-y-2">
      <Row label="Local time" value={data.time} />
      <Row label="Date" value={data.date} />
      <Row label="Session age" value={formatDuration(data.session_age_min)} />
      <div className="mt-2 text-[10px] px-2 py-1 rounded" style={{ background: 'rgba(167,139,250,0.1)', color: '#c4b5fd' }}>
        Temporary — used for tone &amp; situational awareness only
      </div>
    </div>
  );
}

function UserMemoryBody({ data }: { data: MemorySnapshot['user_memory'] }) {
  const recentFacts = data.recent_store_events ?? [];

  return (
    <div className="space-y-2">
      {data.user_name && <Row label="Name" value={data.user_name} accent="#10b981" />}
      <Row label="Assistant" value={data.assistant_name} />
      <Row label="Stored facts" value={String(data.fact_count)} />

      {data.is_extracting && (
        <div
          className="flex items-center gap-2 text-[10px] px-2 py-1 rounded animate-pulse"
          style={{ background: 'rgba(16,185,129,0.12)', color: '#34d399' }}
        >
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-400 animate-ping" />
          Extracting memory…
        </div>
      )}

      {recentFacts.length > 0 && (
        <div className="mt-2 space-y-1">
          {recentFacts.map((ev, i) => (
            <div
              key={i}
              className="flex items-start gap-2 px-2 py-1.5 rounded text-[10px]"
              style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)' }}
            >
              <span
                className="flex-shrink-0 px-1 rounded text-[9px] font-bold"
                style={{ background: '#10b981', color: '#000' }}
              >
                STORED
              </span>
              <span style={{ color: '#a7f3d0' }}>{ev.fact}</span>
            </div>
          ))}
        </div>
      )}

      {data.facts.length > 0 && (
        <div className="mt-3 space-y-1 max-h-40 overflow-y-auto pr-1" style={{ scrollbarWidth: 'thin' }}>
          {data.facts.map((fact, i) => (
            <div
              key={i}
              className="text-[11px] px-2 py-1 rounded"
              style={{ background: 'rgba(255,255,255,0.03)', color: '#9ca3af', borderLeft: '2px solid rgba(16,185,129,0.3)' }}
            >
              {fact}
            </div>
          ))}
        </div>
      )}

      {data.fact_count === 0 && !data.is_extracting && (
        <div className="text-[10px] italic" style={{ color: '#4b5563' }}>
          No facts stored yet. Chat to build your profile.
        </div>
      )}
    </div>
  );
}

function RecentSummaryBody({ data }: { data: MemorySnapshot['recent_summary'] }) {
  return (
    <div className="space-y-3">
      <p
        className="text-[11px] leading-relaxed px-2 py-2 rounded"
        style={{ background: 'rgba(96,165,250,0.06)', color: '#bfdbfe', borderLeft: '2px solid rgba(96,165,250,0.3)' }}
      >
        {data.text}
      </p>

      {data.active_topics.length > 0 && (
        <div>
          <p className="text-[10px] mb-1.5" style={{ color: '#6b7280' }}>Active topics</p>
          <div className="flex flex-wrap gap-1">
            {data.active_topics.map((t, i) => (
              <span
                key={i}
                className="px-2 py-0.5 rounded-full text-[10px]"
                style={{ background: 'rgba(96,165,250,0.12)', border: '1px solid rgba(96,165,250,0.25)', color: '#93c5fd' }}
              >
                {t}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function CurrentSessionBody({ data }: { data: MemorySnapshot['current_session'] }) {
  return (
    <div className="space-y-2">
      <Row label="Messages sent" value={String(data.message_count)} accent="#fbbf24" />
      <Row label="Tokens used" value={data.token_count > 0 ? data.token_count.toLocaleString() : '—'} />
      <Row label="Duration" value={formatDuration(data.session_age_min)} />

      {data.token_count > 0 && (
        <div className="mt-2">
          <div className="flex justify-between text-[10px] mb-1" style={{ color: '#6b7280' }}>
            <span>Context used</span>
            <span>{Math.min(100, Math.round((data.token_count / 2048) * 100))}%</span>
          </div>
          <div className="h-1 rounded-full" style={{ background: 'rgba(255,255,255,0.08)' }}>
            <div
              className="h-1 rounded-full transition-all duration-500"
              style={{
                width: `${Math.min(100, (data.token_count / 2048) * 100)}%`,
                background: 'linear-gradient(90deg, #fbbf24, #f59e0b)',
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Shared row component ─────────────────────────────────────────────────────

function Row({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-[10px]" style={{ color: '#6b7280' }}>{label}</span>
      <span className="text-[11px] font-medium" style={{ color: accent ?? '#e5e7eb' }}>{value}</span>
    </div>
  );
}

// ─── Collapsible layer card ───────────────────────────────────────────────────

function LayerCard({
  config,
  snapshot,
  defaultOpen = false,
}: {
  config: typeof LAYERS[number];
  snapshot: MemorySnapshot;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  const renderBody = () => {
    switch (config.key) {
      case 'session_metadata': return <SessionMetadataBody data={snapshot.session_metadata} />;
      case 'user_memory': return <UserMemoryBody data={snapshot.user_memory} />;
      case 'recent_summary': return <RecentSummaryBody data={snapshot.recent_summary} />;
      case 'current_session': return <CurrentSessionBody data={snapshot.current_session} />;
    }
  };

  const badge = config.key === 'user_memory'
    ? snapshot.user_memory.fact_count > 0 ? snapshot.user_memory.fact_count : null
    : config.key === 'current_session'
      ? snapshot.current_session.message_count > 0 ? snapshot.current_session.message_count : null
      : null;

  return (
    <div
      className="rounded-xl overflow-hidden transition-all duration-200"
      style={{ background: config.bg, border: `1px solid ${config.border}` }}
    >
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left transition-all duration-150 hover:brightness-125"
      >
        <span className="text-base flex-shrink-0">{config.emoji}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[12px] font-semibold" style={{ color: config.color }}>{config.label}</span>
            {badge !== null && (
              <span
                className="px-1.5 py-0.5 rounded-full text-[9px] font-bold"
                style={{ background: `${config.color}25`, color: config.color }}
              >
                {badge}
              </span>
            )}
          </div>
          <p className="text-[10px] mt-0.5 truncate" style={{ color: '#4b5563' }}>{config.sublabel}</p>
        </div>
        <span
          className="flex-shrink-0 text-xs transition-transform duration-200"
          style={{ color: '#4b5563', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
        >
          ▾
        </span>
      </button>

      {open && (
        <div className="px-4 pb-4">
          <div className="h-px mb-3" style={{ background: config.border }} />
          {renderBody()}
        </div>
      )}
    </div>
  );
}

// ─── Main panel ──────────────────────────────────────────────────────────────

export function MemoryLayerPanel({ isOpen, onClose, backendOnline }: Props) {
  const [snapshot, setSnapshot] = useState<MemorySnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchSnapshot = useCallback(async () => {
    if (!backendOnline) return;
    try {
      const data = await getMemorySnapshot();
      setSnapshot(data);
      setLastUpdated(new Date());
      setError(null);
    } catch (e: any) {
      setError('Could not load memory snapshot');
    }
  }, [backendOnline]);

  useEffect(() => {
    if (!isOpen) return;
    fetchSnapshot();
    const id = setInterval(fetchSnapshot, 5000);
    return () => clearInterval(id);
  }, [isOpen, fetchSnapshot]);

  if (!isOpen) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-40"
        style={{ background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(2px)' }}
        onClick={onClose}
      />

      <div
        className="fixed top-0 right-0 h-full z-50 flex flex-col"
        style={{
          width: '340px',
          background: 'rgba(9,11,14,0.97)',
          borderLeft: '1px solid rgba(255,255,255,0.07)',
          boxShadow: '-20px 0 60px rgba(0,0,0,0.5)',
          backdropFilter: 'blur(20px)',
        }}
      >
        <div
          className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
        >
          <div>
            <h2 className="text-sm font-bold text-white tracking-tight">Memory Layers</h2>
            <p className="text-[10px] mt-0.5" style={{ color: '#4b5563' }}>
              4-layer architecture · {lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString()}` : 'Loading…'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchSnapshot}
              className="text-[11px] px-2 py-1 rounded transition-all hover:brightness-125"
              style={{ background: 'rgba(255,255,255,0.06)', color: '#6b7280', border: '1px solid rgba(255,255,255,0.08)' }}
              title="Refresh"
            >
              ↻
            </button>
            <button
              onClick={onClose}
              className="w-7 h-7 flex items-center justify-center rounded transition-all hover:brightness-125"
              style={{ background: 'rgba(255,255,255,0.06)', color: '#6b7280', border: '1px solid rgba(255,255,255,0.08)' }}
              id="memory-panel-close"
            >
              ✕
            </button>
          </div>
        </div>

        <div
          className="mx-4 mt-3 mb-1 px-3 py-2 rounded-lg text-[10px] leading-relaxed"
          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', color: '#4b5563' }}
        >
          <span style={{ color: '#6b7280' }}>Response</span> → Updated Summary → Memory Update<br />
          Layers combine before every response for full context.
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3" style={{ scrollbarWidth: 'thin' }}>
          {!backendOnline && (
            <div
              className="text-center py-8 text-xs rounded-xl"
              style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.15)', color: '#f87171' }}
            >
              ⚠️ Backend offline<br />
              <span style={{ color: '#6b7280' }}>Start the Python server to view memory</span>
            </div>
          )}

          {backendOnline && error && (
            <div
              className="text-center py-4 text-xs rounded-xl"
              style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.12)', color: '#f87171' }}
            >
              {error}
            </div>
          )}

          {backendOnline && !snapshot && !error && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <div className="w-6 h-6 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: 'rgba(16,185,129,0.4)', borderTopColor: 'transparent' }} />
              <span className="text-xs" style={{ color: '#4b5563' }}>Loading memory layers…</span>
            </div>
          )}

          {snapshot && LAYERS.map((layer, i) => (
            <LayerCard
              key={layer.key}
              config={layer}
              snapshot={snapshot}
              defaultOpen={i < 2}
            />
          ))}
        </div>

        <div
          className="px-5 py-3 text-[10px] text-center"
          style={{ borderTop: '1px solid rgba(255,255,255,0.06)', color: '#374151' }}
        >
          Auto-refreshes every 5s · Persistent facts survive restarts
        </div>
      </div>
    </>
  );
}
