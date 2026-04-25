

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useChatStore } from '../store/chatStore';
import { useModelStore } from '../store/modelStore';
import { generateStream, sendFeedback, getMemoryStatus, uploadFile, UploadResult } from '../lib/api';
import { MessageBubble } from './MessageBubble';

interface Props {
  conversationId: string | null;
}

const FILE_META: Record<string, { icon: string; color: string; label: string }> = {
  pdf: { icon: '📄', color: '#ef4444', label: 'PDF' },
  image: { icon: '🖼️', color: '#8b5cf6', label: 'Image' },
  text: { icon: '📝', color: '#3b82f6', label: 'Text' },
};

export function ChatWindow({ conversationId }: Props) {
  const [input, setInput] = useState('');
  const [attachment, setAttachment] = useState<UploadResult | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cancelStreamRef = useRef<(() => void) | null>(null);

  const {
    addMessage,
    appendToMessage,
    finalizeMessage,
    setStreaming,
    isStreaming,
    createConversation,
    setActiveConversation,
    setTokenUsage,
  } = useChatStore();

  const { activeModelId, backendOnline, isMemorySaving, setIsMemorySaving } = useModelStore();

  const conversation = conversationId
    ? useChatStore.getState().conversations.find(c => c.id === conversationId)
    : undefined;

  const messages = conversation?.messages ?? [];

  useEffect(() => {
    if (!backendOnline) return;
    let intervalId: any = null;
    const checkStatus = async () => {
      try {
        const { is_extracting } = await getMemoryStatus();
        setIsMemorySaving(is_extracting);
      } catch {
        setIsMemorySaving(false);
      }
    };
    intervalId = setInterval(checkStatus, isMemorySaving ? 1000 : 3000);
    return () => clearInterval(intervalId);
  }, [backendOnline, isMemorySaving, setIsMemorySaving]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, messages[messages.length - 1]?.content]);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    const newHeight = Math.min(ta.scrollHeight, 200);
    ta.style.height = `${newHeight}px`;
  }, [input]);

  // ── File handling ──────────────────────────────────────────────────────────

  const processFile = useCallback(async (file: File) => {
    if (!backendOnline) {
      setUploadError('Backend offline — cannot upload files');
      return;
    }
    setUploading(true);
    setUploadError(null);
    try {
      const result = await uploadFile(file);
      setAttachment(result);
    } catch (e: any) {
      setUploadError(e.message ?? 'Upload failed');
    } finally {
      setUploading(false);
    }
  }, [backendOnline]);

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    e.target.value = '';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  const removeAttachment = () => {
    setAttachment(null);
    setUploadError(null);
  };

  // ── Send ───────────────────────────────────────────────────────────────────

  const handleSend = useCallback(async () => {
    if (!input.trim() || isStreaming || !activeModelId || !backendOnline) return;

    let convId = conversationId;
    if (!convId) {
      convId = createConversation();
      setActiveConversation(convId);
    }

    const userText = input.trim();
    setInput('');
    const currentAttachment = attachment;
    setAttachment(null);
    setUploadError(null);

    // Build display label for attachment
    const displayText = currentAttachment
      ? `${userText}\n\n[📎 ${currentAttachment.filename}]`
      : userText;

    addMessage(convId, { role: 'user', content: displayText });

    const assistantMsgId = addMessage(convId, {
      role: 'assistant',
      content: '',
      isStreaming: true,
    });

    setStreaming(true);

    const conv = useChatStore.getState().conversations.find(c => c.id === convId);
    const apiMessages = (conv?.messages ?? [])
      .filter(m => m.id !== assistantMsgId && m.content.trim())
      .map(m => ({
        role: m.role as 'user' | 'assistant',
        // Strip the attachment label from API messages, keep clean text
        content: m.content.replace(/\n\n\[📎[^\]]+\]$/, ''),
      }));

    // Pass file context — text for docs, base64 URI for images
    const fileContext = currentAttachment ? currentAttachment.text : undefined;
    const fileName = currentAttachment?.filename;
    const isImage = currentAttachment?.is_image ?? false;

    cancelStreamRef.current = generateStream(
      apiMessages,
      2048,
      (token) => appendToMessage(convId!, assistantMsgId, token),
      () => {
        finalizeMessage(convId!, assistantMsgId);
        setStreaming(false);
        cancelStreamRef.current = null;
      },
      (err) => {
        finalizeMessage(convId!, assistantMsgId, err);
        setStreaming(false);
        cancelStreamRef.current = null;
      },
      (count) => {
        setTokenUsage(convId!, count);
      },
      fileContext,
      fileName,
      isImage
    );
  }, [input, isStreaming, activeModelId, backendOnline, conversationId, attachment, setTokenUsage]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleStop = () => {
    cancelStreamRef.current?.();
    cancelStreamRef.current = null;
    if (conversationId) {
      const conv = useChatStore.getState().conversations.find(c => c.id === conversationId);
      const lastMsg = conv?.messages[conv.messages.length - 1];
      if (lastMsg?.isStreaming) {
        finalizeMessage(conversationId, lastMsg.id);
      }
    }
    setStreaming(false);
  };

  const canSend = input.trim().length > 0 && !isStreaming && !!activeModelId && backendOnline;

  const inputDisabledReason = !backendOnline
    ? 'Backend offline — start the Python server'
    : !activeModelId
      ? 'Select and load a model to start chatting'
      : undefined;

  const attachMeta = attachment ? (FILE_META[attachment.type] ?? FILE_META.text) : null;

  return (
    <div
      className="flex flex-col h-full relative"
      onDragOver={handleDragOver}
    onDragLeave={handleDragLeave}
    onDrop={handleDrop}
  >
    {isDragging && (
      <div
        className="absolute inset-0 z-50 flex flex-col items-center justify-center pointer-events-none"
        style={{
          background: 'rgba(16,185,129,0.07)',
          border: '2px dashed rgba(16,185,129,0.5)',
          backdropFilter: 'blur(2px)',
        }}
      >
        <div className="text-5xl mb-3">📎</div>
        <p className="text-sm font-semibold" style={{ color: '#10b981' }}>Drop file to attach</p>
        <p className="text-xs mt-1" style={{ color: '#6b7280' }}>PDF · Image · TXT · MD · CSV · JSON</p>
      </div>
    )}

    <div className="flex-1 overflow-y-auto px-4 py-6 space-y-6">
      {messages.length === 0 ? (
        <EmptyState backendOnline={backendOnline} activeModel={activeModelId} />
      ) : (
        messages.map((msg, idx) => {
          const queryMsg = msg.role === 'assistant'
            ? [...messages.slice(0, idx)].reverse().find(m => m.role === 'user')
            : undefined;
          return (
            <MessageBubble
              key={msg.id}
              role={msg.role}
              content={msg.content}
              isStreaming={msg.isStreaming}
              error={msg.error}
              timestamp={msg.timestamp}
              onFeedback={(rating) => {
                if (queryMsg) {
                  sendFeedback(queryMsg.content, msg.content, rating)
                    .catch((err: any) => console.error('Failed to send feedback:', err));
                }
              }}
            />
          );
        })
      )}
      <div ref={messagesEndRef} />
    </div>

    <div className="px-4 pb-6 pt-2">
      {inputDisabledReason && (
        <div className="text-center text-xs mb-3 animate-fade-in" style={{ color: '#6b7280' }}>
          {inputDisabledReason}
        </div>
      )}

      {(attachment || uploading || uploadError) && (
        <div className="mb-2 flex items-center gap-2 flex-wrap">
          {uploading && (
            <div
              className="flex items-center gap-2 px-3 py-1.5 text-xs rounded-full"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#9ca3af' }}
            >
              <span className="animate-spin">⏳</span>
              <span>Processing file…</span>
            </div>
          )}
          {uploadError && (
            <div
              className="flex items-center gap-2 px-3 py-1.5 text-xs rounded-full"
              style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171' }}
            >
              <span>⚠️</span>
              <span>{uploadError}</span>
              <button onClick={removeAttachment} className="ml-1 opacity-70 hover:opacity-100">✕</button>
            </div>
          )}
          {attachment && attachMeta && (
            <div
              className="flex items-center gap-2 px-3 py-1.5 text-xs rounded-full transition-all group"
              style={{
                background: `rgba(${attachment.type === 'pdf' ? '239,68,68' : attachment.type === 'image' ? '139,92,246' : '59,130,246'},0.1)`,
                border: `1px solid ${attachMeta.color}40`,
                color: '#e5e7eb',
              }}
            >
              {attachment.is_image ? (
                <img
                  src={attachment.text}
                  alt={attachment.filename}
                  className="w-5 h-5 rounded object-cover"
                />
              ) : (
                <span>{attachMeta.icon}</span>
              )}
              <span className="font-medium" style={{ color: attachMeta.color }}>{attachMeta.label}</span>
              <span className="opacity-70 max-w-[160px] truncate">{attachment.filename}</span>
              {!attachment.is_image && (
                <span className="opacity-50">{attachment.char_count.toLocaleString()} chars</span>
              )}
              <button
                onClick={removeAttachment}
                className="ml-1 opacity-50 hover:opacity-100 transition-opacity"
                title="Remove attachment"
              >
                ✕
              </button>
            </div>
          )}
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,.pdf,.txt,.md,.csv,.json"
        className="hidden"
        id="file-upload-input"
        onChange={handleFileInputChange}
      />

      <div
        className="flex items-end gap-3 p-3 transition-all duration-200"
        style={{
          background: 'rgba(255,255,255,0.04)',
          border: `1px solid ${canSend || isStreaming ? 'rgba(16,185,129,0.3)' : isDragging ? 'rgba(16,185,129,0.5)' : 'rgba(255,255,255,0.08)'}`,
          boxShadow: canSend ? '0 0 20px rgba(16,185,129,0.08)' : 'none',
        }}
      >
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={!backendOnline || uploading}
          className="flex-shrink-0 w-9 h-9 flex items-center justify-center transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed"
          style={{
            background: attachment ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.06)',
            border: attachment ? '1px solid rgba(16,185,129,0.4)' : '1px solid rgba(255,255,255,0.1)',
            color: attachment ? '#10b981' : '#6b7280',
            borderRadius: '8px',
          }}
          title="Attach file (PDF, image, text…)"
          id="attach-btn"
        >
          <PaperclipIcon />
        </button>

        <textarea
          ref={textareaRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={!backendOnline || !activeModelId || isStreaming}
          placeholder={
            !backendOnline
              ? 'Waiting for backend…'
              : !activeModelId
                ? 'Load a model first…'
                : attachment
                  ? `Ask about ${attachment.filename}…`
                  : 'Message LocalLLM…'
          }
          rows={1}
          className="llm-input flex-1"
          style={{ minHeight: '24px', maxHeight: '200px' }}
          id="chat-input"
        />

        {isStreaming ? (
          <button
            onClick={handleStop}
            className="flex-shrink-0 w-9 h-9 flex items-center justify-center transition-all"
            style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171' }}
            title="Stop generation"
            id="stop-btn"
          >
            <StopIcon />
          </button>
        ) : (
          <button
            onClick={handleSend}
            disabled={!canSend}
            className="flex-shrink-0 w-9 h-9 flex items-center justify-center transition-all duration-200
                         disabled:opacity-30 disabled:cursor-not-allowed"
            style={{
              background: canSend ? '#10b981' : 'rgba(255,255,255,0.06)',
              boxShadow: canSend ? '0 0 16px rgba(16,185,129,0.4)' : 'none',
              color: canSend ? '#000' : '#6b7280',
            }}
            title="Send (Enter)"
            id="send-btn"
          >
            <SendIcon />
          </button>
        )}
      </div>

      <div className="text-center text-[10px] mt-2" style={{ color: '#374151' }}>
        Enter to send · Shift+Enter for new line · Drop files or click 📎
      </div>
    </div>
  </div>
  );
}

// ── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({ backendOnline, activeModel }: { backendOnline: boolean; activeModel: string | null }) {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[400px] select-none p-8">
      <div className="relative mb-10 group">
        <div className="absolute inset-0 bg-accent/20 blur-[50px] rounded-full group-hover:bg-accent/30 transition-all duration-700" />
        <div className="relative w-24 h-24 rounded-[2rem] flex items-center justify-center text-4xl shadow-2xl transition-transform duration-500 group-hover:scale-105"
          style={{
            background: 'linear-gradient(135deg, rgba(16,185,129,0.1) 0%, rgba(16,185,129,0.02) 100%)',
            border: '1px solid rgba(16,185,129,0.2)',
            backdropFilter: 'blur(10px)'
          }}>
          <span className="drop-shadow-[0_0_15px_rgba(16,185,129,0.4)]">⚡</span>
        </div>
      </div>

      <h2 className="text-3xl font-black text-white mb-3 tracking-tighter bg-clip-text text-transparent bg-gradient-to-b from-white to-white/40">
        AI CORE
      </h2>

      <p className="text-sm text-center max-w-sm leading-relaxed" style={{ color: '#6b7280' }}>
        {!backendOnline
          ? 'Neural backend disconnected. Re-establish connection to begin sequence.'
          : !activeModel
            ? 'Initialize a model from the intelligence grid to activate core processing.'
            : 'Ready for interaction. Drop files or click 📎 to attach PDFs, images, and more.'}
      </p>

      {!backendOnline && (
        <div className="mt-8 group relative">
          <div className="absolute inset-0 bg-red-500/10 blur-xl rounded-xl opacity-0 group-hover:opacity-100 transition-opacity" />
          <div className="relative text-[10px] font-mono px-4 py-2 rounded-xl border border-white/5 bg-white/[0.02] text-white/40 tracking-widest uppercase">
            Execute: start.bat
          </div>
        </div>
      )}
    </div>
  );
}

// ── Icons ────────────────────────────────────────────────────────────────────

function PaperclipIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
  );
}
