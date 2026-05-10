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
  CheckCircle2,
  Plus,
  ChevronDown,
  ChevronUp,
  Trash2,
  Pencil,
  Check,
  Wrench,
  Clock,
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
  const [selectedAgentId, setSelectedAgentId] = useState<number | null>(null);
  // Session selection — null means "auto-pick most recent", otherwise the
  // user has either clicked a session in the list or created a new one.
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(
    null
  );
  // "New session" pending state: user clicked + but hasn't sent the first
  // message yet. In this state we force an empty message list and create
  // the session on first send.
  const [pendingNewSession, setPendingNewSession] = useState(false);
  const [sessionsExpanded, setSessionsExpanded] = useState(false);
  // Inline rename state: when set, that session id is in edit mode and
  // renameDraft holds the draft title. Null = no rename in progress.
  const [renamingSessionId, setRenamingSessionId] = useState<number | null>(
    null
  );
  const [renameDraft, setRenameDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const utils = trpc.useUtils();

  // List every agent in the Studio. `providerConfig` is now included on
  // each agent (sourced from its current draft) so we can mark non-openai
  // agents as incompatible. Chat only supports provider === "openai" for
  // now; everything else gets a disabled chip + tooltip.
  const { data: agents } = trpc.agentStudio.home.listAgents.useQuery({});
  const agentList = (agents ?? []) as any[];

  const isChatCompatible = (a: any): boolean => {
    const cfg = a?.providerConfig ?? null;
    return !!cfg && typeof cfg === "object" && cfg.provider === "openai";
  };

  // Default selection: Agent Studio Expert if present and compatible,
  // otherwise the first compatible agent. Falls back to any first agent
  // only if none are compatible (so the empty state still renders).
  useEffect(() => {
    if (selectedAgentId !== null) return;
    if (!agentList.length) return;
    const expert = agentList.find(
      (a) => a.internalKey === "agent-studio-expert" && isChatCompatible(a)
    );
    if (expert) {
      setSelectedAgentId(expert.id);
      return;
    }
    const firstCompatible = agentList.find(isChatCompatible);
    if (firstCompatible) {
      setSelectedAgentId(firstCompatible.id);
      return;
    }
    setSelectedAgentId(agentList[0]?.id ?? null);
  }, [agentList, selectedAgentId]);

  const activeAgent = agentList.find((a) => a.id === selectedAgentId) ?? null;
  const agentId = activeAgent?.id ?? null;
  const agentName = activeAgent?.name ?? "Studio Chat";

  // Load all sessions for the selected agent. The user can click any row
  // in the session list to jump to it, click "+ New" to clear the active
  // session (so the next send creates a fresh one), or rely on the
  // default behavior which picks the most recent.
  const { data: sessions } = trpc.agentStudio.chat.listSessions.useQuery(
    { agentId: agentId ?? 0 },
    { enabled: agentId !== null }
  );
  const sessionList = (sessions ?? []) as any[];

  // Reset session state when the user switches agents so we don't show
  // an unrelated agent's session id against the new agent's message list.
  useEffect(() => {
    setSelectedSessionId(null);
    setPendingNewSession(false);
  }, [selectedAgentId]);

  // Effective session id: explicit selection wins, otherwise most recent,
  // unless the user is in pendingNewSession state (then null = empty).
  const sessionId = pendingNewSession
    ? null
    : selectedSessionId ?? sessionList[0]?.id ?? null;

  // Load messages for the active session
  const { data: messages } = trpc.agentStudio.chat.listMessages.useQuery(
    { sessionId: sessionId ?? 0 },
    { enabled: sessionId !== null }
  );

  const startSessionMut = trpc.agentStudio.chat.startSession.useMutation();
  const deleteSessionMut = trpc.agentStudio.chat.deleteSession.useMutation({
    onSuccess: (_, vars) => {
      utils.agentStudio.chat.listSessions.invalidate({ agentId: agentId ?? 0 });
      // If the user deleted the currently-active session, clear the
      // selection so the next render falls back to the most recent
      // remaining session (or shows the empty state).
      if (vars.sessionId === sessionId) {
        setSelectedSessionId(null);
      }
    },
    onError: (e) => toast.error(`Delete failed: ${e.message}`),
  });
  const renameSessionMut = trpc.agentStudio.chat.renameSession.useMutation({
    onSuccess: () => {
      utils.agentStudio.chat.listSessions.invalidate({ agentId: agentId ?? 0 });
      setRenamingSessionId(null);
      setRenameDraft("");
    },
    onError: (e) => toast.error(`Rename failed: ${e.message}`),
  });

  // Live streaming-delta buffer. While an EventSource is open we
  // accumulate tokens here and render them as a synthetic assistant
  // bubble so the user sees the response grow token-by-token. On
  // `done` we clear this and invalidate the message list so the
  // persisted row replaces the synthetic bubble.
  const [streamingText, setStreamingText] = useState("");
  // Tool activity buffer — rendered as tiny inline chips while the
  // streaming tool loop runs, cleared on `done`.
  // H6-c7 (cycle-7 audit closure §H6-c7): chip status now includes
  // `awaiting_approval` to render a pending-approval badge instead of
  // collapsing the AwaitingApprovalEvent SSE event into a generic
  // tool error. approvalRequestId + timeoutSec carry the operator-
  // facing context (request id for click-through, countdown).
  const [activeTools, setActiveTools] = useState<
    Array<{
      name: string;
      status: "running" | "ok" | "error" | "awaiting_approval";
      durationMs?: number;
      approvalRequestId?: number;
      timeoutSec?: number;
    }>
  >([]);
  const eventSourceRef = useRef<EventSource | null>(null);

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
      // Create session if none exists (first send, or user clicked "+ New")
      let activeSessionId = sessionId;
      if (activeSessionId == null) {
        const newSession = await startSessionMut.mutateAsync({
          agentId,
          title: text.substring(0, 50),
        });
        activeSessionId = newSession.sessionId;
        // Clear the pending flag + select the new session so the UI
        // starts polling its messages immediately
        setPendingNewSession(false);
        setSelectedSessionId(activeSessionId);
        await utils.agentStudio.chat.listSessions.invalidate({ agentId });
      }

      // Open an SSE stream to /api/agent-studio/chat/stream. The
      // endpoint persists the user message, streams the assistant
      // response, and persists the final assistant row. The UI
      // renders `streamingText` as a synthetic bubble while the
      // stream is open; on `done` we clear it and refetch the
      // persisted message list.
      setStreamingText("");
      // Phase 3.2 — generate a fresh clientMessageId per send so the
      // backend can dedup retries / EventSource auto-reconnects.
      // Generated per send-button-press; distinct sends with identical
      // text get distinct ids and remain allowed.
      const clientMessageId =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      const url =
        "/api/agent-studio/chat/stream?" +
        new URLSearchParams({
          sessionId: activeSessionId.toString(),
          message: text,
          clientMessageId,
        });
      const es = new EventSource(url);
      eventSourceRef.current = es;

      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "token") {
            setStreamingText((prev) => prev + (data.content ?? ""));
          } else if (data.type === "tool_start") {
            setActiveTools((prev) => [
              ...prev,
              { name: data.toolName, status: "running" },
            ]);
          } else if (data.type === "tool_end") {
            setActiveTools((prev) => {
              // Mark the first still-running entry with this name as done.
              // H6-c7 (cycle-7 audit closure §H6-c7): also update the
              // chip when an awaiting_approval event arrives — operator
              // sees the dispatch is paused on operator decision rather
              // than failed. The status discrimination MUST happen
              // BEFORE the ok/error branch — otherwise an AwaitingApprovalEvent
              // (`{ok: false, status: "awaiting_approval"}`) would
              // collapse to "error" and confuse the operator.
              const idx = prev.findIndex(
                (t) => t.name === data.toolName && t.status === "running"
              );
              if (idx < 0) return prev;
              const next = prev.slice();
              if (data.status === "awaiting_approval") {
                next[idx] = {
                  name: data.toolName,
                  status: "awaiting_approval",
                  approvalRequestId: data.approvalRequestId,
                  timeoutSec: data.timeoutSec,
                };
              } else {
                next[idx] = {
                  name: data.toolName,
                  status: data.ok ? "ok" : "error",
                  durationMs: data.durationMs,
                };
              }
              return next;
            });
          } else if (data.type === "done") {
            setIsStreaming(false);
            setStreamingText("");
            setActiveTools([]);
            es.close();
            eventSourceRef.current = null;
            utils.agentStudio.chat.listMessages.invalidate({
              sessionId: activeSessionId,
            });
            utils.agentStudio.chat.listSessions.invalidate({ agentId });
          } else if (data.type === "error") {
            setIsStreaming(false);
            setStreamingText("");
            setActiveTools([]);
            es.close();
            eventSourceRef.current = null;
            // Phase 3.3 — discriminate on the stable `code` field so
            // `idempotency_conflict` produces a friendly "duplicate
            // request, your original is still running" message rather
            // than a generic error. Other codes fall through to the
            // generic path; Phase 3.4 will expand this lattice.
            if (data.code === "idempotency_conflict") {
              toast.info(
                "Duplicate send detected — your original request is still running. " +
                  "Refresh to see the persisted state.",
              );
            } else {
              toast.error(data.error ?? "Studio Chat error");
            }
            // Refresh the message list anyway — the user message
            // was persisted even though the stream failed.
            utils.agentStudio.chat.listMessages.invalidate({
              sessionId: activeSessionId,
            });
          }
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error("[StudioChat] malformed SSE event:", event.data, err);
        }
      };

      es.onerror = () => {
        setIsStreaming(false);
        setStreamingText("");
        setActiveTools([]);
        try {
          es.close();
        } catch {
          /* ignore */
        }
        eventSourceRef.current = null;
      };
    } catch (err: any) {
      toast.error(`Studio Chat error: ${err.message}`);
      setIsStreaming(false);
      setStreamingText("");
      setActiveTools([]);
    }
  };

  // Clean up any dangling EventSource when the component unmounts or
  // the user switches agents
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        try {
          eventSourceRef.current.close();
        } catch {
          /* ignore */
        }
        eventSourceRef.current = null;
      }
    };
  }, []);

  const handleNewSession = () => {
    setPendingNewSession(true);
    setSelectedSessionId(null);
    setSessionsExpanded(false);
  };

  const handlePickSession = (sid: number) => {
    setSelectedSessionId(sid);
    setPendingNewSession(false);
    setSessionsExpanded(false);
  };

  const handleStartRename = (sid: number, currentTitle: string | null) => {
    setRenamingSessionId(sid);
    setRenameDraft(currentTitle ?? "");
  };

  const handleCommitRename = () => {
    if (renamingSessionId == null) return;
    const title = renameDraft.trim();
    if (!title) {
      setRenamingSessionId(null);
      setRenameDraft("");
      return;
    }
    renameSessionMut.mutate({ sessionId: renamingSessionId, title });
  };

  const handleDeleteSession = (sid: number, title: string | null) => {
    const label = title ?? `Session #${sid}`;
    if (!window.confirm(`Delete "${label}" and all its messages?`)) return;
    deleteSessionMut.mutate({ sessionId: sid });
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
      {/* Header — same structure as source line 237-257 */}
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

      {/* Agent picker — adapted from source line 259-316 (participant
          selector). Clone of the chip-row pattern from PMCentralChatWindow,
          but single-select (not multi-participant). Click a chip to
          switch the active agent; the session + message queries auto-
          refetch because agentId drives them. */}
      {agentList.length > 0 && (
        <div className="border-b px-3 py-2 shrink-0">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">
              Agent
            </span>
            <span className="text-[9px] text-muted-foreground">
              {agentList.length} available
            </span>
          </div>
          <div className="flex flex-wrap gap-1">
            {agentList.map((a) => {
              const selected = a.id === selectedAgentId;
              const compatible = isChatCompatible(a);
              const provider =
                (a?.providerConfig?.provider as string | undefined) ?? "(none)";
              const tooltip = compatible
                ? `${a.name} — ${a.agentClass ?? "custom"}`
                : `${a.name} — chat not available (provider=${provider}, needs openai)`;
              return (
                <button
                  key={a.id}
                  onClick={() => {
                    if (compatible) setSelectedAgentId(a.id);
                  }}
                  disabled={!compatible}
                  className={cn(
                    "flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] border transition-all",
                    selected && compatible
                      ? "bg-primary/15 border-primary/40 text-primary font-medium"
                      : compatible
                      ? "bg-muted/50 border-transparent text-muted-foreground hover:border-muted-foreground/30"
                      : "bg-muted/20 border-transparent text-muted-foreground/40 cursor-not-allowed line-through",
                  )}
                  title={tooltip}
                >
                  <span
                    className={cn(
                      "h-4 w-4 rounded-full flex items-center justify-center text-[8px] font-bold text-white shrink-0",
                      compatible ? avatarColor(a.name) : "bg-muted-foreground/30",
                    )}
                  >
                    {initials(a.name)}
                  </span>
                  <span className="truncate max-w-[80px]">{a.name}</span>
                  {selected && compatible && <CheckCircle2 className="h-3 w-3 shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Session bar — shows the current session title + a collapsible
          list of all sessions for the active agent, plus a "+ New"
          button that clears the current session so the next send
          creates a fresh one. Task #2. */}
      {agentId !== null && (
        <div className="border-b px-3 py-1.5 shrink-0">
          <div className="flex items-center justify-between gap-2">
            <button
              onClick={() => setSessionsExpanded((v) => !v)}
              disabled={sessionList.length === 0 && !pendingNewSession}
              className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors flex-1 min-w-0 text-left"
              title="Toggle session list"
            >
              {sessionsExpanded ? (
                <ChevronUp className="h-3 w-3 shrink-0" />
              ) : (
                <ChevronDown className="h-3 w-3 shrink-0" />
              )}
              <span className="font-semibold uppercase tracking-wider shrink-0">
                Session
              </span>
              <span className="truncate opacity-80">
                {pendingNewSession
                  ? "New…"
                  : sessionId != null
                  ? sessionList.find((s) => s.id === sessionId)?.title ??
                    `#${sessionId}`
                  : "none"}
              </span>
            </button>
            <Button
              variant="ghost"
              size="sm"
              className="h-5 px-1.5 text-[10px]"
              onClick={handleNewSession}
              title="Start a new session"
              disabled={pendingNewSession}
            >
              <Plus className="h-3 w-3 mr-0.5" />
              New
            </Button>
          </div>
          {sessionsExpanded && sessionList.length > 0 && (
            <div className="mt-1.5 max-h-32 overflow-y-auto flex flex-col gap-0.5">
              {sessionList.map((s: any) => {
                const active = s.id === sessionId;
                const editing = renamingSessionId === s.id;
                return (
                  <div
                    key={s.id}
                    className={cn(
                      "flex items-center gap-1 px-2 py-1 rounded text-[10px] border transition-all group",
                      active
                        ? "bg-primary/10 border-primary/30 text-primary"
                        : "bg-muted/30 border-transparent text-muted-foreground hover:border-muted-foreground/30"
                    )}
                    title={s.title ?? `Session #${s.id}`}
                  >
                    {editing ? (
                      <>
                        <input
                          autoFocus
                          value={renameDraft}
                          onChange={(e) => setRenameDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              handleCommitRename();
                            } else if (e.key === "Escape") {
                              setRenamingSessionId(null);
                              setRenameDraft("");
                            }
                          }}
                          className="flex-1 min-w-0 text-[10px] bg-background border rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-primary"
                          maxLength={120}
                        />
                        <button
                          onClick={handleCommitRename}
                          className="shrink-0 h-4 w-4 flex items-center justify-center rounded hover:bg-primary/20"
                          title="Save"
                          disabled={renameSessionMut.isPending}
                        >
                          <Check className="h-3 w-3" />
                        </button>
                        <button
                          onClick={() => {
                            setRenamingSessionId(null);
                            setRenameDraft("");
                          }}
                          className="shrink-0 h-4 w-4 flex items-center justify-center rounded hover:bg-muted"
                          title="Cancel"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => handlePickSession(s.id)}
                          className="flex-1 min-w-0 text-left truncate"
                        >
                          {s.title ?? `Session #${s.id}`}
                        </button>
                        <span className="opacity-60 shrink-0 text-[9px]">
                          {s.messageCount ?? 0}
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleStartRename(s.id, s.title);
                          }}
                          className="shrink-0 h-4 w-4 flex items-center justify-center rounded opacity-0 group-hover:opacity-60 hover:!opacity-100 hover:bg-primary/20"
                          title="Rename"
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteSession(s.id, s.title);
                          }}
                          className="shrink-0 h-4 w-4 flex items-center justify-center rounded opacity-0 group-hover:opacity-60 hover:!opacity-100 hover:bg-destructive/20 hover:text-destructive"
                          title="Delete"
                          disabled={deleteSessionMut.isPending}
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Messages area — adapted from source line 318-403 */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3">
        {agentId === null && agentList.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <AlertTriangle className="h-8 w-8 mb-2 opacity-40" />
            <p className="text-xs text-center">
              No agents in the Studio yet.
              <br />
              Create one via the home sidebar.
            </p>
          </div>
        )}

        {agentId !== null && (messages ?? []).length === 0 && !isStreaming && (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <Brain className="h-8 w-8 mb-2 opacity-20" />
            <p className="text-xs text-center">
              Start chatting with <strong>{agentName}</strong>.
              <br />
              <span className="opacity-60">
                Pick a different agent above to switch.
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

          if (msg.role === "tool") {
            // Tool result bubble — compact format showing tool name + result
            const toolName =
              (msg.toolPayload as any)?.name ?? "tool";
            return (
              <div key={msg.id} className="flex gap-2 items-start">
                <span className="h-6 w-6 rounded-full flex items-center justify-center bg-accent shrink-0 mt-0.5">
                  <Wrench className="h-3 w-3 text-primary" />
                </span>
                <div className="max-w-[85%] rounded-2xl rounded-tl-sm px-3 py-2 bg-accent/40">
                  <p className="text-[10px] font-semibold mb-1">{toolName}</p>
                  <pre className="text-[10px] whitespace-pre-wrap text-muted-foreground max-h-32 overflow-y-auto">
                    {msg.content}
                  </pre>
                </div>
              </div>
            );
          }

          // Skip empty assistant turns (the tool-calling placeholder
          // before a tool call has content="" + toolPayload.toolCalls).
          if (
            msg.role === "assistant" &&
            (!msg.content || msg.content.length === 0)
          ) {
            const tc = (msg.toolPayload as any)?.toolCalls;
            if (Array.isArray(tc) && tc.length > 0) {
              return (
                <div key={msg.id} className="flex gap-2 items-center">
                  <span
                    className={cn(
                      "h-6 w-6 rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0",
                      avatarColor(agentName),
                    )}
                  >
                    {initials(agentName)}
                  </span>
                  <span className="text-[10px] text-muted-foreground italic">
                    calling {tc.length} tool{tc.length > 1 ? "s" : ""}…
                  </span>
                </div>
              );
            }
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

        {/* Streaming bubble — shows the delta-accumulated assistant
            response while the SSE stream is open. Once `done` arrives
            we clear streamingText and the real message list refetch
            replaces this bubble with the persisted row. */}
        {isStreaming && streamingText.length > 0 && (
          <div className="flex gap-2 items-start">
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
                <p className="text-xs whitespace-pre-wrap">{streamingText}</p>
              </div>
            </div>
          </div>
        )}

        {/* Active tool chips — shown when the streaming loop is
            dispatching MCP tool calls between model turns. Chips
            switch from spinner → check/x as tool_end events arrive. */}
        {isStreaming && activeTools.length > 0 && (
          <div className="flex gap-1 flex-wrap pl-8">
            {activeTools.map((t, i) => (
              <span
                key={`${t.name}-${i}`}
                className={cn(
                  "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] border",
                  t.status === "running"
                    ? "bg-muted/50 border-muted-foreground/20 text-muted-foreground"
                    : t.status === "ok"
                    ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-500"
                    : t.status === "awaiting_approval"
                    ? // H6-c7: amber palette signals "operator action
                      // required" without conflating with success/error.
                      "bg-amber-500/10 border-amber-500/30 text-amber-500"
                    : "bg-destructive/10 border-destructive/30 text-destructive"
                )}
                title={
                  t.status === "awaiting_approval"
                    ? `${t.name} · awaiting operator approval` +
                      (t.approvalRequestId != null
                        ? ` (#${t.approvalRequestId})`
                        : "") +
                      (t.timeoutSec != null ? ` · timeout ${t.timeoutSec}s` : "")
                    : t.durationMs != null
                    ? `${t.name} · ${t.durationMs}ms`
                    : t.name
                }
              >
                {t.status === "running" ? (
                  <Loader2 className="h-2.5 w-2.5 animate-spin" />
                ) : t.status === "ok" ? (
                  <Check className="h-2.5 w-2.5" />
                ) : t.status === "awaiting_approval" ? (
                  <Clock className="h-2.5 w-2.5" />
                ) : (
                  <X className="h-2.5 w-2.5" />
                )}
                <Wrench className="h-2.5 w-2.5" />
                <span>{t.name}</span>
                {t.status === "awaiting_approval" && t.timeoutSec != null && (
                  <span className="opacity-70">· {t.timeoutSec}s</span>
                )}
              </span>
            ))}
          </div>
        )}

        {/* Thinking indicator — shown until the first token arrives */}
        {isStreaming && streamingText.length === 0 && activeTools.length === 0 && (
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
