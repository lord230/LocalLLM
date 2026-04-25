

import { useState, useCallback } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

interface CodeBlockProps {
  language?: string;
  code: string;
}

export function CodeBlock({ language = 'text', code }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = code;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [code]);

  const displayLang = language === 'text' ? 'plain text' : language;

  return (
    <div className="code-block my-3 animate-fade-in">
      <div className="code-block-header">
        <span className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-accent opacity-70" />
          <span>{displayLang}</span>
        </span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs transition-all duration-150
                     hover:bg-white/10 hover:text-white"
          style={{ color: copied ? '#10b981' : '#6b7280' }}
          id={`copy-btn-${Math.random().toString(36).slice(2)}`}
        >
          {copied ? (
            <>
              <CheckIcon />
              Copied ✓
            </>
          ) : (
            <>
              <CopyIcon />
              Copy
            </>
          )}
        </button>
      </div>

      <SyntaxHighlighter
        language={language}
        style={vscDarkPlus}
        customStyle={{
          margin: 0,
          padding: '1rem 1.25rem',
          background: '#141414',
          fontSize: '0.8rem',
          lineHeight: '1.6',
          borderRadius: 0,
          fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
        }}
        showLineNumbers={code.split('\n').length > 5}
        lineNumberStyle={{ color: '#444', fontSize: '0.7rem', paddingRight: '1rem', userSelect: 'none' }}
        wrapLines
        wrapLongLines
      >
        {code}
      </SyntaxHighlighter>
    </div>
  );
}

function CopyIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
