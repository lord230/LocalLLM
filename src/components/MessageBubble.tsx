

import React, { useMemo } from 'react';
import { CodeBlock } from './CodeBlock';
import { InlineLatex, BlockLatex } from './LatexRenderer';

interface MessageBubbleProps {
  role: 'user' | 'assistant' | 'system';
  content: string;
  isStreaming?: boolean;
  error?: string;
  timestamp?: number;
}

// ── Token types ─────────────────────────────────────────────────────────────

type Token =
  | { type: 'code'; lang: string; code: string }
  | { type: 'block-latex'; source: string }
  | { type: 'text'; content: string };

function tokenize(content: string): Token[] {
  const tokens: Token[] = [];

  const pattern = /```(\w*)\n?([\s\S]*?)```|\$\$([\s\S]*?)\$\$/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(content)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({ type: 'text', content: content.slice(lastIndex, match.index) });
    }

    if (match[0].startsWith('```')) {
      tokens.push({ type: 'code', lang: match[1] || 'text', code: match[2].trimEnd() });
    } else {
      tokens.push({ type: 'block-latex', source: match[3] });
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < content.length) {
    tokens.push({ type: 'text', content: content.slice(lastIndex) });
  }

  return tokens;
}

function TextRenderer({ text }: { text: string }) {
  const parts = useMemo(() => {
    const result: Array<{ type: 'text' | 'latex'; value: string }> = [];
    const inlineLatex = /\$([^$\n]+?)\$/g;
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = inlineLatex.exec(text)) !== null) {
      if (m.index > last) result.push({ type: 'text', value: text.slice(last, m.index) });
      result.push({ type: 'latex', value: m[1] });
      last = m.index + m[0].length;
    }
    if (last < text.length) result.push({ type: 'text', value: text.slice(last) });
    return result;
  }, [text]);

  return (
    <span>
      {parts.map((p, i) =>
        p.type === 'latex' ? (
          <InlineLatex key={i} source={p.value} />
        ) : (
          <MarkdownText key={i} text={p.value} />
        )
      )}
    </span>
  );
}

function MarkdownText({ text }: { text: string }) {
  const lines = text.split('\n');
  const elements: React.ReactElement[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (/^[\*\-]\s/.test(line)) {
      const items: React.ReactElement[] = [];
      while (i < lines.length) {
        if (/^[\*\-]\s/.test(lines[i])) {
          items.push(
            <li key={`li-${i}`} className="text-sm text-gray-300">
              <InlineMarkdown text={lines[i].replace(/^[\*\-]\s/, '')} />
            </li>
          );
        } else if (lines[i].trim() === '') {
          let next = i + 1;
          while (next < lines.length && lines[next].trim() === '') next++;
          if (next === lines.length || !/^[\*\-]\s/.test(lines[next])) {
            break;
          }
          items.push(<li key={`space-${i}`} className="h-1.5 list-none" />);
        } else {
          break;
        }
        i++;
      }
      elements.push(
        <ul key={`ul-${i}`} className="list-disc pl-5 my-2 space-y-1">
          {items}
        </ul>
      );
      continue;
    }

    if (/^\d+\.\s/.test(line)) {
      const items: React.ReactElement[] = [];
      while (i < lines.length) {
        if (/^\d+\.\s/.test(lines[i])) {
          items.push(
            <li key={`li-${i}`} className="text-sm text-gray-300">
              <InlineMarkdown text={lines[i].replace(/^\d+\.\s/, '')} />
            </li>
          );
        } else if (lines[i].trim() === '') {
          let next = i + 1;
          while (next < lines.length && lines[next].trim() === '') next++;
          if (next === lines.length || !/^\d+\.\s/.test(lines[next])) {
            break;
          }
          items.push(<li key={`space-${i}`} className="h-1.5 list-none" />);
        } else {
          break;
        }
        i++;
      }
      elements.push(
        <ol key={`ol-${i}`} className="list-decimal pl-5 my-2 space-y-1">
          {items}
        </ol>
      );
      continue;
    }

    if (line.startsWith('###### ')) {
      elements.push(<h6 key={i} className="text-xs font-semibold text-gray-300 mt-2 mb-1 uppercase tracking-wider"><InlineMarkdown text={line.slice(7)} /></h6>);
      i++; continue;
    }
    if (line.startsWith('##### ')) {
      elements.push(<h5 key={i} className="text-sm font-semibold text-gray-200 mt-2 mb-1"><InlineMarkdown text={line.slice(6)} /></h5>);
      i++; continue;
    }
    if (line.startsWith('#### ')) {
      elements.push(<h4 key={i} className="text-sm font-bold text-white mt-3 mb-1"><InlineMarkdown text={line.slice(5)} /></h4>);
      i++; continue;
    }
    if (line.startsWith('### ')) {
      elements.push(<h3 key={i} className="text-base font-semibold text-white mt-3 mb-1"><InlineMarkdown text={line.slice(4)} /></h3>);
      i++; continue;
    }
    if (line.startsWith('## ')) {
      elements.push(<h2 key={i} className="text-lg font-semibold text-white mt-4 mb-1"><InlineMarkdown text={line.slice(3)} /></h2>);
      i++; continue;
    }
    if (line.startsWith('# ')) {
      elements.push(<h1 key={i} className="text-xl font-bold text-white mt-4 mb-2"><InlineMarkdown text={line.slice(2)} /></h1>);
      i++; continue;
    }

    if (line.startsWith('> ')) {
      elements.push(
        <blockquote key={i} className="pl-4 border-l-2 border-accent my-2 italic text-gray-400 text-sm">
          <InlineMarkdown text={line.slice(2)} />
        </blockquote>
      );
      i++; continue;
    }

    if (line.trim() === '') {
      i++; continue;
    }

    elements.push(
      <p key={i} className="my-1 text-sm leading-7 text-gray-200">
        <InlineMarkdown text={line} />
      </p>
    );
    i++;
  }

  return <>{elements}</>;
}

function InlineMarkdown({ text }: { text: string }) {
  const parts: React.ReactElement[] = [];
  const pattern = /\*\*(.+?)\*\*|\*(.+?)\*|`([^`]+)`/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let idx = 0;

  while ((m = pattern.exec(text)) !== null) {
    if (m.index > last) parts.push(<span key={idx++}>{text.slice(last, m.index)}</span>);
    if (m[1]) parts.push(<strong key={idx++} className="font-semibold text-white">{m[1]}</strong>);
    else if (m[2]) parts.push(<em key={idx++} className="italic">{m[2]}</em>);
    else if (m[3]) parts.push(
      <code key={idx++} className="px-1.5 py-0.5 rounded text-xs font-mono"
        style={{ background: 'rgba(255,255,255,0.08)', color: '#86efac' }}>
        {m[3]}
      </code>
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(<span key={idx}>{text.slice(last)}</span>);
  return <>{parts}</>;
}

// ── Main component ────────────────────────────────────────────────────────────

interface MessageBubbleProps {
  role: 'user' | 'assistant' | 'system';
  content: string;
  isStreaming?: boolean;
  error?: string;
  timestamp?: number;
  onFeedback?: (rating: number) => void;
}

// ... Tokenization and Renderer functions remain the same ...

// ── Main component ────────────────────────────────────────────────────────────

export function MessageBubble({ role, content, isStreaming, error, timestamp, onFeedback }: MessageBubbleProps) {
  const [rating, setRating] = React.useState<number | null>(null);
  const [isHovered, setIsHovered] = React.useState(false);
  const tokens = useMemo(() => tokenize(content), [content]);
  const isUser = role === 'user';
  const isAssistant = role === 'assistant';

  const time = timestamp
    ? new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '';

  const handleFeedback = (val: number) => {
    if (rating === val) return;
    setRating(val);
    onFeedback?.(val);
  };

  return (
    <div 
      className={`flex gap-3 animate-slide-up group ${isUser ? 'flex-row-reverse' : 'flex-row'}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className={`flex-shrink-0 w-8 h-8 rounded-none flex items-center justify-center text-xs font-bold select-none
                       ${isUser ? 'bg-accent text-black' : 'border border-white/10'}`}
           style={!isUser ? { background: 'rgba(255,255,255,0.06)' } : {}}>
        {isUser ? 'U' : '🤖'}
      </div>

      <div className="flex flex-col gap-1.5 max-w-[80%]">
        <div className={`rounded-none px-4 py-3 ${isUser ? 'msg-user' : 'msg-assistant'}`}>
          {error ? (
            <div className="text-sm text-red-400 flex items-center gap-2">
              <span>⚠</span>
              <span>{error}</span>
            </div>
          ) : (
            <div className={`prose-dark break-words [overflow-wrap:anywhere] ${isStreaming && !content ? 'min-h-[1.5rem]' : ''}`}>
              {tokens.map((tok, i) => {
                if (tok.type === 'code') return <CodeBlock key={i} language={tok.lang} code={tok.code} />;
                if (tok.type === 'block-latex') return <BlockLatex key={i} source={tok.source} />;
                return <TextRenderer key={i} text={tok.content} />;
              })}
              {isStreaming && <span className="typing-cursor" />}
            </div>
          )}

          {time && !isStreaming && (
            <div className="mt-1.5 text-right text-[10px]" style={{ color: '#4b5563' }}>{time}</div>
          )}
        </div>

        {isAssistant && !isStreaming && content && (
          <div className={`flex items-center gap-2 px-1 transition-opacity duration-300 ${isHovered || rating !== null ? 'opacity-100' : 'opacity-0'}`}>
            <button
              onClick={() => handleFeedback(1)}
              className={`p-1 rounded-md transition-all hover:bg-white/5 ${rating === 1 ? 'text-accent scale-110' : 'text-gray-500'}`}
              title="Like response"
            >
              <ThumbsUpIcon size={14} fill={rating === 1} />
            </button>
            <button
              onClick={() => handleFeedback(-1)}
              className={`p-1 rounded-md transition-all hover:bg-white/5 ${rating === -1 ? 'text-red-400 scale-110' : 'text-gray-500'}`}
              title="Dislike response"
            >
              <ThumbsDownIcon size={14} fill={rating === -1} />
            </button>
            {rating !== null && (
              <span className="text-[10px] text-gray-600 animate-fade-in font-medium ml-1 flex items-center gap-1">
                <span className="w-1 h-1 rounded-full bg-gray-600" />
                Reinforcing behavior...
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Icons ────────────────────────────────────────────────────────────────────

function ThumbsUpIcon({ size = 16, fill = false }: { size?: number; fill?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fill ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 10v12" />
      <path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.53l-2.27 7A2 2 0 0 1 17.56 21H7" />
      <path d="M5 21a2 2 0 0 1-2-2V12a2 2 0 0 1 2-2h2v11z" />
    </svg>
  );
}

function ThumbsDownIcon({ size = 16, fill = false }: { size?: number; fill?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fill ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 14V2" />
      <path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.53l2.27-7A2 2 0 0 1 6.44 3H17" />
      <path d="M19 3a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-2V3z" />
    </svg>
  );
}
