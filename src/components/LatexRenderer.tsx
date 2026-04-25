

import { useState } from 'react';
import 'katex/dist/katex.min.css';
import katex from 'katex';

interface InlineLatexProps {
  source: string;
}

export function InlineLatex({ source }: InlineLatexProps) {
  const [showRaw, setShowRaw] = useState(false);

  let rendered = '';
  let error = false;
  try {
    rendered = katex.renderToString(source, {
      throwOnError: false,
      displayMode: false,
      strict: false,
    });
  } catch {
    error = true;
  }

  if (error || showRaw) {
    return (
      <span
        className="font-mono text-xs px-1 py-0.5 rounded cursor-pointer"
        style={{ background: 'rgba(16,185,129,0.1)', color: '#10b981', border: '1px solid rgba(16,185,129,0.3)' }}
        onClick={() => !error && setShowRaw(false)}
        title={error ? 'LaTeX error' : 'Click to render'}
      >
        ${source}$
      </span>
    );
  }

  return (
    <span
      className="cursor-pointer"
      dangerouslySetInnerHTML={{ __html: rendered }}
      onClick={() => setShowRaw(true)}
      title="Click to view raw LaTeX"
    />
  );
}

interface BlockLatexProps {
  source: string;
}

export function BlockLatex({ source }: BlockLatexProps) {
  const [showRaw, setShowRaw] = useState(false);

  let rendered = '';
  let error = false;
  try {
    rendered = katex.renderToString(source, {
      throwOnError: false,
      displayMode: true,
      strict: false,
    });
  } catch {
    error = true;
  }

  return (
    <div className="my-4 animate-fade-in">
      <div className="flex justify-end mb-1">
        <button
          onClick={() => !error && setShowRaw(v => !v)}
          className="text-xs px-2 py-0.5 rounded-lg transition-all"
          style={{ color: '#6b7280', background: 'rgba(255,255,255,0.05)' }}
        >
          {showRaw ? '▶ Render' : '〈 Raw'}
        </button>
      </div>

      {showRaw || error ? (
        <div
          className="font-mono text-xs p-4 rounded-xl overflow-x-auto"
          style={{
            background: 'rgba(16,185,129,0.05)',
            border: '1px solid rgba(16,185,129,0.2)',
            color: '#86efac',
          }}
        >
          {error && <div style={{ color: '#f87171', marginBottom: '4px' }}>LaTeX error — showing source:</div>}
          $${'{'}${source}${'}'}$$
        </div>
      ) : (
        <div
          className="overflow-x-auto rounded-xl p-4"
          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
          dangerouslySetInnerHTML={{ __html: rendered }}
        />
      )}
    </div>
  );
}
