/**
 * AgentStudioChatWindow — "Studio Chat" floating chat window
 *
 * Module-level chat for Agent Studio. Mounted at the App root via
 * <AgentStudioChatFAB /> so it stays visible across all
 * /agent-studio/* routes (same pattern as PMCentralChatWindow,
 * MaestroChatWindow, PSIdeationChatWindow).
 *
 * Cloned from client/src/components/pm/PMCentralChatWindow.tsx —
 * same FAB, same expanded panel, same className structure, same
 * createPortal escape, same Brain icon. The body has been adapted
 * to single-agent chat (Agent Studio Expert) using the
 * agentStudio.chat.* tRPC routes instead of the multi-participant
 * round-table sandboxWf.maestro path.
 *
 * This is a standalone clone — no cross-module imports.
 */
import { useState, useRef, useEffect, useCallback } from "react";
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
  AlertTriangle,
} from "lucide-react";

// ── Avatar colors (deterministic by name) — copied from source ────────────

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

export function AgentStudioChatWindow() {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const utils = trpc.useUtils();

  // Resolve the Agent Studio Expert id by listing agents and picking
  // the one with internal_key === 'agent-studio-expert'. The boot seed
  // creates this on every install so the resolution is reliable.
  const { data: agents } = trpc.agentStudio.home.listAgents.useQuery({});
  const expert = (agents ?? []).find(
    (a: any) => a.internalKey === "agent-studio-expert"
  );
  const agentId = expert?.id ?? null;
  const agentName = expert?.name ?? "Agent Studio Expert";

  // Load sessions for the expert; pick the most recent or auto-create
  // on first send (mirrors AgentChat.tsx pattern, lines 60-68 of source).
  const { data: sessions } = trpc.agentStudio.chat.listSessions.useQuery(
    { agentId: agentId ?? 0 },
    { enabled: agentId !== null }
  );
  const sessionId = sessions?.[0]?.id ?? null;

  // Load messages for the active session
  const { data: messages } = trpc.agentStudio.chat.listMessages.useQuery(
    { sessionId: sessionId ?? 0 },
    { enabled: sessionId !== null }
  );

  const startSessionMut = trpc.agentStudio.chat.startSession.useMutation();
  const sendMessageMut = trpc.agentStudio.chat.sendMessage.useMutation({
    onSuccess: (r) => {
      setIsStreaming(false);
      if (!r.ok && r.error) {
        toast.error(r.error);
      }
      utils.agentStudio.chat.listMessages.invalidate({
        sessionId: sessionId ?? 0,
      });
      utils.agentStudio.chat.listSessions.invalidate({
        agentId: agentId ?? 0,
      });
    },
    onError: (e) => {
      setIsStreaming(false);
      toast.error(`Studio Chat error: ${e.message}`);
    },
  });

  // Auto-scroll on new messages — mirrors source line 99-103
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isStreaming]);

  // Textarea auto-grow — copied from source line 106-115
  const adjustTextarea = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 100)}px`;
  }, []);

  useEffect(() => {
    adjustTextarea();
  }, [input, adjustTextarea]);

  // Send message — adapted from source handleSend at line 142-203.
  // Difference: no participant validation (always 1-on-1 with Expert).
  const handleSend = async () => {
    const text = input.trim();
    if (!text) return;
    if (agentId === null) {
      toast.error("Agent Studio Expert not found — boot seed may have failed");
      return;
    }
    if (isStreaming) return;

    setInput("");
    setIsStreaming(true);

    try {
      // Create session if none exists
      let activeSessionId = sessionId;
      if (activeSessionId == null) {
        const newSession = await startSessionMut.mutateAsync({
          agentId,
          title: text.substring(0, 50),
        });
        activeSessionId = newSession.sessionId;
        await utils.agentStudio.chat.listSessions.invalidate({ agentId });
      }

      sendMessageMut.mutate({
        sessionId: activeSessionId,
        userMessage: text,
      });
    } catch (err: any) {
      toast.error(`Studio Chat error: ${err.message}`);
      setIsStreaming(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Unread count — copied from source line 213
  const unreadCount = isOpen
    ? 0
    : (messages ?? []).filter((m: any) => m.role === "assistant").length;

  // ── Render via portal — copied verbatim from source line 215+ ────────

  if (!isOpen) {
    return createPortal(
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 right-4 z-50 h-12 w-12 rounded-full bg-primary text-primary-foreground shadow-xl hover:bg-primary/90 transition-all flex items-center justify-center group"
        title="Studio Chat"
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
      {/* Header — same structure as source line 237-257, single agent */}
      <div className="flex items-center justify-between px-3 py-2 border-b bg-card shrink-0">
        <div className="flex items-center gap-2">
          <Brain className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">Studio Chat</span>
          {agentId !== null && (
            <Badge variant="secondary" className="text-[9px] px-1.5">
              {agentName}
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

      {/* Messages area — adapted from source line 318-403 */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3">
        {agentId === null && (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <AlertTriangle className="h-8 w-8 mb-2 opacity-40" />
            <p className="text-xs text-center">
              Agent Studio Expert not found.
              <br />
              The boot seed should create it automatically on dev server start.
            </p>
          </div>
        )}

        {agentId !== null && (messages ?? []).length === 0 && !isStreaming && (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <Brain className="h-8 w-8 mb-2 opacity-20" />
            <p className="text-xs text-center">
              Ask the Agent Studio Expert to design a new agent.
              <br />
              <span className="opacity-60">
                e.g. "I need an agent that monitors Postgres slow queries"
              </span>
            </p>
          </div>
        )}

        {(messages ?? []).map((msg: any) => {
          if (msg.role === "user") {
            // User bubble — copied verbatim from source line 332-343
            return (
              <div key={msg.id} className="flex justify-end">
                <div className="max-w-[85%] bg-primary text-primary-foreground rounded-2xl rounded-br-sm px-3 py-2">
                  <p className="text-xs whitespace-pre-wrap">{msg.content}</p>
                  <p className="text-[9px] opacity-60 mt-1 text-right">
                    {new Date(msg.createdAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
              </div>
            );
          }

          // Assistant message — copied from source line 346-383
          return (
            <div key={msg.id} className="flex gap-2 items-start">
              <span
                className={cn(
                  "h-6 w-6 rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0 mt-0.5",
                  avatarColor(agentName),
                )}
              >
                {initials(agentName)}
              </span>
              <div className="max-w-[85%]">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="text-[10px] font-semibold">{agentName}</span>
                </div>
                <div className="rounded-2xl rounded-tl-sm px-3 py-2 bg-muted">
                  <p className="text-xs whitespace-pre-wrap">{msg.content}</p>
                  <p className="text-[9px] text-muted-foreground mt-1">
                    {new Date(msg.createdAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                    {msg.model && (
                      <>
                        {" · "}
                        {msg.model}
                      </>
                    )}
                  </p>
                </div>
              </div>
            </div>
          );
        })}

        {/* Streaming indicator — adapted from source line 387-402 */}
        {isStreaming && (
          <div className="flex gap-2 items-center">
            <span
              className={cn(
                "h-6 w-6 rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0",
                avatarColor(agentName),
              )}
            >
              {initials(agentName)}
            </span>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>{agentName} is thinking…</span>
            </div>
          </div>
        )}
      </div>

      {/* Input area — copied verbatim from source line 406-437 */}
      <div className="border-t px-3 py-2 shrink-0">
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              agentId === null ? "Expert not found..." : "Type your message..."
            }
            disabled={isStreaming || agentId === null}
            rows={1}
            className="flex-1 resize-none rounded-lg border bg-muted/50 px-3 py-2 text-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
            style={{ minHeight: "36px", maxHeight: "100px" }}
          />
          <Button
            size="sm"
            className="h-9 w-9 p-0 shrink-0"
            onClick={handleSend}
            disabled={!input.trim() || isStreaming || agentId === null}
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
