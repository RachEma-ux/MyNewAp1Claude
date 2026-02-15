import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";

// =============================================================================
// TYPES
// =============================================================================

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: string; // ISO string for serialization
}

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
  isSaved: boolean;
}

export interface ChatAnalytics {
  totalChats: number;
  totalMessages: number;
  savedChats: number;
  archivedChats: number;
  avgMessagesPerChat: number;
}

export interface ChatSettings {
  autoSave: boolean;
}

interface ChatContextValue {
  // State
  chats: ChatSession[];
  archivedChats: ChatSession[];
  currentChatId: string | null;
  currentChat: ChatSession | null;

  // Chat CRUD
  createChat: () => string;
  switchChat: (id: string) => void;
  renameChat: (id: string, title: string) => void;
  deleteChat: (id: string) => void;
  clearChat: (id: string) => void;

  // Messages
  addMessage: (message: Omit<ChatMessage, "id" | "timestamp">) => void;

  // Archive
  archiveChat: (id: string) => void;
  unarchiveChat: (id: string) => void;

  // Save
  saveChat: (id?: string) => void;

  // Import/Export
  exportChatData: () => void;
  importChatData: (file: File) => void;

  // Analytics
  getAnalytics: () => ChatAnalytics;

  // Filtered views
  getRecentChats: (limit?: number) => ChatSession[];
  getSavedChats: () => ChatSession[];

  // Settings
  settings: ChatSettings;
  updateSettings: (patch: Partial<ChatSettings>) => void;
}

// =============================================================================
// STORAGE KEYS
// =============================================================================

const STORAGE_KEYS = {
  CHATS: "mynewapp_chats",
  ARCHIVED: "mynewapp_archived_chats",
  CURRENT_ID: "mynewapp_current_chat_id",
  SETTINGS: "mynewapp_chat_settings",
} as const;

const DEFAULT_SETTINGS: ChatSettings = { autoSave: false };

// =============================================================================
// HELPERS
// =============================================================================

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw) as T;
  } catch {
    // corrupted data — reset
  }
  return fallback;
}

function saveToStorage(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage full or unavailable
  }
}

function createNewChat(): ChatSession {
  const now = new Date().toISOString();
  return {
    id: generateId(),
    title: "New Chat",
    messages: [],
    createdAt: now,
    updatedAt: now,
    isSaved: false,
  };
}

function autoNameChat(firstUserMessage: string): string {
  const cleaned = firstUserMessage.replace(/\n/g, " ").trim();
  return cleaned.length > 50 ? cleaned.slice(0, 47) + "..." : cleaned;
}

// =============================================================================
// CONTEXT
// =============================================================================

const ChatContext = createContext<ChatContextValue | null>(null);

export function useChatContext(): ChatContextValue {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useChatContext must be used within a ChatProvider");
  return ctx;
}

// =============================================================================
// PROVIDER
// =============================================================================

export function ChatProvider({ children }: { children: ReactNode }) {
  const [chats, setChats] = useState<ChatSession[]>(() =>
    loadFromStorage<ChatSession[]>(STORAGE_KEYS.CHATS, [])
  );
  const [archivedChats, setArchivedChats] = useState<ChatSession[]>(() =>
    loadFromStorage<ChatSession[]>(STORAGE_KEYS.ARCHIVED, [])
  );
  const [currentChatId, setCurrentChatId] = useState<string | null>(() =>
    loadFromStorage<string | null>(STORAGE_KEYS.CURRENT_ID, null)
  );
  const [settings, setSettings] = useState<ChatSettings>(() =>
    loadFromStorage<ChatSettings>(STORAGE_KEYS.SETTINGS, DEFAULT_SETTINGS)
  );

  // Persist to localStorage on change
  useEffect(() => {
    saveToStorage(STORAGE_KEYS.CHATS, chats);
  }, [chats]);

  useEffect(() => {
    saveToStorage(STORAGE_KEYS.ARCHIVED, archivedChats);
  }, [archivedChats]);

  useEffect(() => {
    saveToStorage(STORAGE_KEYS.CURRENT_ID, currentChatId);
  }, [currentChatId]);

  useEffect(() => {
    saveToStorage(STORAGE_KEYS.SETTINGS, settings);
  }, [settings]);

  // Derive current chat
  const currentChat = chats.find((c) => c.id === currentChatId) ?? null;

  // -------------------------------------------------------------------------
  // Chat CRUD
  // -------------------------------------------------------------------------

  const createChat = useCallback((): string => {
    const chat = createNewChat();
    setChats((prev) => [chat, ...prev]);
    setCurrentChatId(chat.id);
    return chat.id;
  }, []);

  const switchChat = useCallback((id: string) => {
    setCurrentChatId(id);
  }, []);

  const renameChat = useCallback((id: string, title: string) => {
    setChats((prev) =>
      prev.map((c) =>
        c.id === id ? { ...c, title, updatedAt: new Date().toISOString() } : c
      )
    );
  }, []);

  const deleteChat = useCallback(
    (id: string) => {
      setChats((prev) => prev.filter((c) => c.id !== id));
      setArchivedChats((prev) => prev.filter((c) => c.id !== id));
      if (currentChatId === id) {
        setCurrentChatId((prev) => {
          const remaining = chats.filter((c) => c.id !== id);
          return remaining.length > 0 ? remaining[0].id : null;
        });
      }
    },
    [currentChatId, chats]
  );

  const clearChat = useCallback((id: string) => {
    setChats((prev) =>
      prev.map((c) =>
        c.id === id
          ? { ...c, messages: [], title: "New Chat", updatedAt: new Date().toISOString() }
          : c
      )
    );
  }, []);

  // -------------------------------------------------------------------------
  // Messages
  // -------------------------------------------------------------------------

  const addMessage = useCallback(
    (message: Omit<ChatMessage, "id" | "timestamp">) => {
      const newMsg: ChatMessage = {
        ...message,
        id: generateId(),
        timestamp: new Date().toISOString(),
      };

      setChats((prev) =>
        prev.map((c) => {
          if (c.id !== currentChatId) return c;

          const updated = {
            ...c,
            messages: [...c.messages, newMsg],
            updatedAt: new Date().toISOString(),
          };

          // Auto-name on first user message
          if (
            message.role === "user" &&
            c.messages.filter((m) => m.role === "user").length === 0
          ) {
            updated.title = autoNameChat(message.content);
          }

          return updated;
        })
      );
    },
    [currentChatId]
  );

  // -------------------------------------------------------------------------
  // Archive
  // -------------------------------------------------------------------------

  const archiveChat = useCallback(
    (id: string) => {
      const chat = chats.find((c) => c.id === id);
      if (!chat) return;
      setChats((prev) => prev.filter((c) => c.id !== id));
      setArchivedChats((prev) => [chat, ...prev]);
      if (currentChatId === id) {
        const remaining = chats.filter((c) => c.id !== id);
        setCurrentChatId(remaining.length > 0 ? remaining[0].id : null);
      }
    },
    [chats, currentChatId]
  );

  const unarchiveChat = useCallback((id: string) => {
    setArchivedChats((prev) => {
      const chat = prev.find((c) => c.id === id);
      if (chat) {
        setChats((chats) => [chat, ...chats]);
      }
      return prev.filter((c) => c.id !== id);
    });
  }, []);

  // -------------------------------------------------------------------------
  // Save
  // -------------------------------------------------------------------------

  const saveChat = useCallback(
    (id?: string) => {
      const targetId = id ?? currentChatId;
      if (!targetId) return;
      setChats((prev) =>
        prev.map((c) =>
          c.id === targetId
            ? { ...c, isSaved: true, updatedAt: new Date().toISOString() }
            : c
        )
      );
    },
    [currentChatId]
  );

  // -------------------------------------------------------------------------
  // Import / Export
  // -------------------------------------------------------------------------

  const exportChatData = useCallback(() => {
    const data = {
      version: 1,
      exportedAt: new Date().toISOString(),
      chats,
      archivedChats,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `chat-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [chats, archivedChats]);

  const importChatData = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result as string);
        if (data.chats && Array.isArray(data.chats)) {
          setChats((prev) => [...data.chats, ...prev]);
        }
        if (data.archivedChats && Array.isArray(data.archivedChats)) {
          setArchivedChats((prev) => [...data.archivedChats, ...prev]);
        }
      } catch {
        // invalid JSON
      }
    };
    reader.readAsText(file);
  }, []);

  // -------------------------------------------------------------------------
  // Analytics
  // -------------------------------------------------------------------------

  const getAnalytics = useCallback((): ChatAnalytics => {
    const allChats = [...chats, ...archivedChats];
    const totalMessages = allChats.reduce((sum, c) => sum + c.messages.length, 0);
    return {
      totalChats: allChats.length,
      totalMessages,
      savedChats: allChats.filter((c) => c.isSaved).length,
      archivedChats: archivedChats.length,
      avgMessagesPerChat: allChats.length > 0 ? Math.round(totalMessages / allChats.length) : 0,
    };
  }, [chats, archivedChats]);

  // -------------------------------------------------------------------------
  // Filtered views
  // -------------------------------------------------------------------------

  const getRecentChats = useCallback(
    (limit = 5): ChatSession[] =>
      [...chats]
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        .slice(0, limit),
    [chats]
  );

  const getSavedChats = useCallback(
    (): ChatSession[] => chats.filter((c) => c.isSaved),
    [chats]
  );

  // -------------------------------------------------------------------------
  // Settings
  // -------------------------------------------------------------------------

  const updateSettings = useCallback((patch: Partial<ChatSettings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
  }, []);

  // -------------------------------------------------------------------------
  // Context value
  // -------------------------------------------------------------------------

  const value: ChatContextValue = {
    chats,
    archivedChats,
    currentChatId,
    currentChat,
    createChat,
    switchChat,
    renameChat,
    deleteChat,
    clearChat,
    addMessage,
    archiveChat,
    unarchiveChat,
    saveChat,
    exportChatData,
    importChatData,
    getAnalytics,
    getRecentChats,
    getSavedChats,
    settings,
    updateSettings,
  };

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}
