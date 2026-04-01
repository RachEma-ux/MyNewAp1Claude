/**
 * PSIdeationChatWindow — Floating multi-AI chat window for PS Ideation
 *
 * Cloned from MaestroChatWindow (automation module).
 * Intercom-style FAB at bottom-right; expands into a chat panel.
 * Users pick participants from available catalog agents,
 * then all selected participants respond in round-table sequence.
 *
 * This is a standalone clone — no cross-module imports.
 */
import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Brain,
  X,
  Send,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Users,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────

interface CatalogImport {
  id: number;
  catalogEntryId: number;
  entryType: string;
  name: string;
  description: string;
  category: string;
  tags: string[] | unknown;
  config: unknown;
  status: string;
  importedAt: Date;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  sender: string;
  catalogEntryId?: number;
  content: string;
  status?: "completed" | "failed";
  timestamp: Date;
}

interface PSIdeationChatWindowProps {
  catalogImports: CatalogImport[];
}

// ── Avatar colors (deterministic by name) ────────────────

const AVATAR_COLORS = [
  "bg-blue-600",
  "bg-emerald-600",
  "bg-purple-600",
  "bg-orange-600",
  "bg-pink-600",
  "bg-cyan-600",
  "bg-yellow-600",
  "bg-red-600",
];

function avatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function initials(name: string): string {
  return name
    .split(/[\s_-]+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || "")
    .join("");
}

// ── Component ────────────────────────────────────────────

export function PSIdeationChatWindow({ catalogImports }: PSIdeationChatWindowProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set());
  const [isStreaming, setIsStreaming] = useState(false);
  const [input, setInput] = useState("");
  const [currentSpeaker, setCurrentSpeaker] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const roundTableMutation = trpc.sandboxWf.maestro.roundTable.useMutation();

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, currentSpeaker]);

  // Textarea auto-grow
  const adjustTextarea = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 100)}px`;
  }, []);

  useEffect(() => {
    adjustTextarea();
  }, [input, adjustTextarea]);

  // Active imports only
  const activeImports = useMemo(
    () => catalogImports.filter((i) => i.status === "active" || !i.status),
    [catalogImports],
  );

  // Toggle participant
  const toggleParticipant = (catalogEntryId: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(catalogEntryId)) next.delete(catalogEntryId);
      else next.add(catalogEntryId);
      return next;
    });
  };

  const selectAll = () => {
    setSelectedIds(new Set(activeImports.map((i) => i.catalogEntryId)));
  };

  const clearAll = () => {
    setSelectedIds(new Set());
  };

  // Send message
  const handleSend = async () => {
    const text = input.trim();
    if (!text) return;
    if (selectedIds.size === 0) {
      toast.error("Select at least one participant");
      return;
    }
    if (isStreaming) return;

    // Add user message
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      sender: "You",
      content: text,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsStreaming(true);

    // Build participants list
    const participants = activeImports
      .filter((i) => selectedIds.has(i.catalogEntryId))
      .map((i) => ({ catalogEntryId: i.catalogEntryId, name: i.name }));

    // Build conversation history for context
    const conversationHistory = messages.map((m) => ({
      role: m.role,
      sender: m.sender,
      content: m.content,
    }));

    try {
      setCurrentSpeaker(participants[0]?.name || null);

      const result = await roundTableMutation.mutateAsync({
        message: text,
        participants,
        conversationHistory,
      });

      // Add each participant's response
      for (const r of result.results) {
        const assistantMsg: ChatMessage = {
          id: `assistant-${r.catalogEntryId}-${Date.now()}`,
          role: "assistant",
          sender: r.name,
          catalogEntryId: r.catalogEntryId,
          content: r.response,
          status: r.status as "completed" | "failed",
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, assistantMsg]);
      }
    } catch (err: any) {
      toast.error(`Ideation chat error: ${err.message}`);
    } finally {
      setIsStreaming(false);
      setCurrentSpeaker(null);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Unread count (messages since last close — simplified: 0 when open)
  const unreadCount = isOpen ? 0 : messages.filter((m) => m.role === "assistant").length;

  // ── Render via portal (escapes overflow-hidden shell wrapper) ────────

  if (!isOpen) {
    return createPortal(
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 right-4 z-50 h-12 w-12 rounded-full bg-primary text-primary-foreground shadow-xl hover:bg-primary/90 transition-all flex items-center justify-center group"
        title="Ideation AI Chat"
      >
        <Brain className="h-6 w-6 group-hover:scale-110 transition-transform" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>,
      document.body,
    );
  }

  return createPortal(
    <div className="fixed bottom-4 right-4 z-50 w-[380px] h-[520px] flex flex-col rounded-xl border bg-card shadow-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b bg-card shrink-0">
        <div className="flex items-center gap-2">
          <Brain className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">Ideation Chat</span>
          {selectedIds.size > 0 && (
            <Badge variant="secondary" className="text-[9px] px-1.5">
              {selectedIds.size} active
            </Badge>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0"
          onClick={() => setIsOpen(false)}
          title="Minimize"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Participant selector */}
      <div className="border-b px-3 py-2 shrink-0">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider flex items-center gap-1">
            <Users className="h-3 w-3" /> Participants
          </span>
          <div className="flex gap-1">
            <button
              onClick={selectAll}
              className="text-[9px] text-primary hover:underline"
            >
              All
            </button>
            <span className="text-[9px] text-muted-foreground">/</span>
            <button
              onClick={clearAll}
              className="text-[9px] text-muted-foreground hover:underline"
            >
              None
            </button>
          </div>
        </div>
        <div className="flex flex-wrap gap-1">
          {activeImports.length === 0 ? (
            <span className="text-[10px] text-muted-foreground italic">
              No AI agents available — add agents in the Catalog
            </span>
          ) : (
            activeImports.map((imp) => {
              const selected = selectedIds.has(imp.catalogEntryId);
              return (
                <button
                  key={imp.catalogEntryId}
                  onClick={() => toggleParticipant(imp.catalogEntryId)}
                  className={cn(
                    "flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] border transition-all",
                    selected
                      ? "bg-primary/15 border-primary/40 text-primary font-medium"
                      : "bg-muted/50 border-transparent text-muted-foreground hover:border-muted-foreground/30",
                  )}
                  title={imp.description || imp.name}
                >
                  <span
                    className={cn(
                      "h-4 w-4 rounded-full flex items-center justify-center text-[8px] font-bold text-white shrink-0",
                      avatarColor(imp.name),
                    )}
                  >
                    {initials(imp.name)}
                  </span>
                  <span className="truncate max-w-[80px]">{imp.name}</span>
                  {selected && <CheckCircle2 className="h-3 w-3 shrink-0" />}
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Messages area */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <Brain className="h-8 w-8 mb-2 opacity-20" />
            <p className="text-xs text-center">
              Select participants above and start a round-table conversation
            </p>
          </div>
        )}

        {messages.map((msg) => {
          if (msg.role === "user") {
            return (
              <div key={msg.id} className="flex justify-end">
                <div className="max-w-[85%] bg-primary text-primary-foreground rounded-2xl rounded-br-sm px-3 py-2">
                  <p className="text-xs whitespace-pre-wrap">{msg.content}</p>
                  <p className="text-[9px] opacity-60 mt-1 text-right">
                    {msg.timestamp.toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
              </div>
            );
          }

          // Assistant message
          const isFailed = msg.status === "failed";
          return (
            <div key={msg.id} className="flex gap-2 items-start">
              <span
                className={cn(
                  "h-6 w-6 rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0 mt-0.5",
                  avatarColor(msg.sender),
                )}
              >
                {initials(msg.sender)}
              </span>
              <div className="max-w-[85%]">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="text-[10px] font-semibold">{msg.sender}</span>
                  {isFailed && (
                    <AlertTriangle className="h-3 w-3 text-destructive" />
                  )}
                </div>
                <div
                  className={cn(
                    "rounded-2xl rounded-tl-sm px-3 py-2",
                    isFailed
                      ? "bg-destructive/10 border border-destructive/20"
                      : "bg-muted",
                  )}
                >
                  <p className="text-xs whitespace-pre-wrap">{msg.content}</p>
                  <p className="text-[9px] text-muted-foreground mt-1">
                    {msg.timestamp.toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
              </div>
            </div>
          );
        })}

        {/* Streaming indicator */}
        {isStreaming && currentSpeaker && (
          <div className="flex gap-2 items-center">
            <span
              className={cn(
                "h-6 w-6 rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0",
                avatarColor(currentSpeaker),
              )}
            >
              {initials(currentSpeaker)}
            </span>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>{currentSpeaker} is thinking...</span>
            </div>
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="border-t px-3 py-2 shrink-0">
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              selectedIds.size === 0
                ? "Select participants first..."
                : "Type your message..."
            }
            disabled={isStreaming}
            rows={1}
            className="flex-1 resize-none rounded-lg border bg-muted/50 px-3 py-2 text-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
            style={{ minHeight: "36px", maxHeight: "100px" }}
          />
          <Button
            size="sm"
            className="h-9 w-9 p-0 shrink-0"
            onClick={handleSend}
            disabled={!input.trim() || isStreaming || selectedIds.size === 0}
            title="Send"
          >
            {isStreaming ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
