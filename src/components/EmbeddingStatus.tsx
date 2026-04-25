
import { useModelStore } from '../store/modelStore';

export function EmbeddingStatus() {
  const { embeddingStatus } = useModelStore();

  if (!embeddingStatus) return null;

  const { status, loaded, downloading } = embeddingStatus;

  let color = '#4b5563';
  let label = 'Memory Engine: Idle';
  let pulse = false;

  if (downloading) {
    color = '#f59e0b';
    label = 'Memory Engine: Fetching…';
    pulse = true;
  } else if (loaded) {
    color = '#10b981';
    label = 'Memory Engine: Active';
  } else if (status === 'error') {
    color = '#ef4444';
    label = 'Memory Engine: Error';
  }

  return (
    <div className="mt-4 pt-4" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#6b7280' }}>
          {label}
        </span>
        <div className="flex items-center gap-1.5">
          <span 
            className={`w-1.5 h-1.5 rounded-full ${pulse ? 'animate-pulse' : ''}`}
            style={{ background: color, boxShadow: loaded ? `0 0 8px ${color}` : 'none' }}
          />
          <span className="text-[10px] font-medium" style={{ color: color }}>
            {(status || 'idle').toUpperCase()}
          </span>
        </div>
      </div>
      
      <div className="h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
        <div 
          className={`h-full rounded-full transition-all duration-1000 ${downloading ? 'animate-shimmer' : ''}`}
          style={{ 
            width: loaded ? '100%' : downloading ? '40%' : '0%', 
            background: color,
            opacity: downloading ? 0.6 : 1
          }}
        />
      </div>
      
      <div className="mt-1.5 text-[9px] leading-tight" style={{ color: '#4b5563' }}>
        {loaded 
          ? 'Deep contextual recall is active across all conversations.' 
          : downloading 
            ? 'Downloading 25MB neural engine for persistent memory…' 
            : 'Memory engine will activate on first message.'}
      </div>
    </div>
  );
}
