

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { GenerateMessage } from '../lib/api';

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  isStreaming?: boolean;
  error?: string;
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: Message[];
  tokenUsage?: number;
}

interface ChatState {
  conversations: Conversation[];
  activeConversationId: string | null;
  isStreaming: boolean;

  createConversation: () => string;
  setActiveConversation: (id: string) => void;
  deleteConversation: (id: string) => void;
  renameConversation: (id: string, title: string) => void;
  addMessage: (conversationId: string, message: Omit<Message, 'id' | 'timestamp'>) => string;
  appendToMessage: (conversationId: string, messageId: string, token: string) => void;
  finalizeMessage: (conversationId: string, messageId: string, error?: string) => void;
  setStreaming: (v: boolean) => void;
  getActiveConversation: () => Conversation | undefined;
  getApiMessages: (conversationId: string) => GenerateMessage[];
  setTokenUsage: (conversationId: string, count: number) => void;
  clearAllConversations: () => void;
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function generateTitle(firstMessage: string): string {
  const clean = firstMessage.slice(0, 40).trim();
  return clean.length < firstMessage.length ? `${clean}…` : clean;
}

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      conversations: [],
      activeConversationId: null,
      isStreaming: false,

      createConversation: () => {
        const id = generateId();
        const conv: Conversation = {
          id,
          title: 'New Chat',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          messages: [],
        };
        set(s => ({
          conversations: [conv, ...s.conversations],
          activeConversationId: id,
        }));
        return id;
      },

      setActiveConversation: (id) => set({ activeConversationId: id }),

      deleteConversation: (id) =>
        set(s => {
          const remaining = s.conversations.filter(c => c.id !== id);
          const newActive =
            s.activeConversationId === id
              ? remaining[0]?.id ?? null
              : s.activeConversationId;
          return { conversations: remaining, activeConversationId: newActive };
        }),

      renameConversation: (id, title) =>
        set(s => ({
          conversations: s.conversations.map(c =>
            c.id === id ? { ...c, title, updatedAt: Date.now() } : c
          ),
        })),

      addMessage: (conversationId, msg) => {
        const id = generateId();
        const message: Message = { ...msg, id, timestamp: Date.now() };
        set(s => ({
          conversations: s.conversations.map(c => {
            if (c.id !== conversationId) return c;
            const updated: Conversation = {
              ...c,
              messages: [...c.messages, message],
              updatedAt: Date.now(),
              title:
                c.messages.length === 0 && msg.role === 'user'
                  ? generateTitle(msg.content)
                  : c.title,
            };
            return updated;
          }),
        }));
        return id;
      },

      appendToMessage: (conversationId, messageId, token) =>
        set(s => ({
          conversations: s.conversations.map(c => {
            if (c.id !== conversationId) return c;
            return {
              ...c,
              messages: c.messages.map(m =>
                m.id === messageId
                  ? { ...m, content: m.content + token }
                  : m
              ),
            };
          }),
        })),

      finalizeMessage: (conversationId, messageId, error) =>
        set(s => ({
          conversations: s.conversations.map(c => {
            if (c.id !== conversationId) return c;
            return {
              ...c,
              messages: c.messages.map(m =>
                m.id === messageId
                  ? { ...m, isStreaming: false, error }
                  : m
              ),
            };
          }),
        })),

      setStreaming: (v) => set({ isStreaming: v }),

      getActiveConversation: () => {
        const { conversations, activeConversationId } = get();
        return conversations.find(c => c.id === activeConversationId);
      },

      getApiMessages: (conversationId: string) => {
        const conv = get().conversations.find(c => c.id === conversationId);
        if (!conv) return [];
        return conv.messages
          .filter(m => !m.error && m.content.trim())
          .map(m => ({ role: m.role as 'user' | 'assistant' | 'system', content: m.content }));
      },

      setTokenUsage: (conversationId, count) =>
        set(s => ({
          conversations: s.conversations.map(c =>
            c.id === conversationId ? { ...c, tokenUsage: count } : c
          ),
        })),

      clearAllConversations: () =>
        set({ conversations: [], activeConversationId: null }),
    }),
    {
      name: 'localllm-chats',
    }
  )
);
