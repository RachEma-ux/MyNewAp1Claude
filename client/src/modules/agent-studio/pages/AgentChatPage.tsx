/**
 * AI Agent Studio — Chat Page
 *
 * Cloned from client/src/pages/AgentChat.tsx (the platform's main
 * agent chat) and adapted to use the Agent Studio's own data layer:
 *
 *   - tRPC routes:    trpc.agents.* + trpc.conversations.*
 *                  → trpc.agentStudio.shell.getShellSummary
 *                  + trpc.agentStudio.chat.*
 *
 *   - Streaming:      EventSource SSE
 *                  → blocking trpc.agentStudio.chat.sendMessage mutation
 *                  (Agent Studio's chat backend uses runViaOpenAIDirect
 *                  which is single-response; streaming is a follow-up)
 *
 *   - agentId:        useParams() string
 *                  → prop passed from AgentStudioShell render switch
 *
 *   - Back nav:       removed (the Agent Studio sidebar handles navigation;
 *                     no /agents back link needed)
 *
 * Same visual structure as the source: header / scrollable messages /
 * composer at the bottom. Same Card components, same Lucide icons,
 * same shadcn primitives. The "no cross-module imports — clone only"
 * convention from CLAUDE.md.
 */
import { useEffect, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Send, Loader2, Wrench, Check, X, Plus, Trash2, Pencil, ChevronDown, ChevronUp, Clock } from "lucide-react";

export default function AgentChatPage({ agentId }: { agentId: number }) {
  const utils = trpc.useUtils();
  const [message, setMessage] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  // The `awaiting_approval` status is the same SSE event the FAB widget
  // (AgentStudioChatWindow.tsx) handles — emitted as `tool_end` with
  // `status:"awaiting_approval"` while the dispatcher is paused on
  // operator decision. Without this branch the chip would collapse to
  // "error" red and confuse the operator (Phase 1e M3 finding).
  const [activeTools, setActiveTools] = useState<
    Array<{
      name: string;
      status: "running" | "ok" | "error" | "awaiting_approval";
      durationMs?: number;
      approvalRequestId?: number;
      timeoutSec?: number;
    }>
  >([]);
  // Task #7 — session list state. Identical semantics to the FAB so
  // the user can switch sessions, rename, delete, and start new ones
  // without opening the floating widget.
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null);
  const [pendingNewSession, setPendingNewSession] = useState(false);
  const [renamingSessionId, setRenamingSessionId] = useState<number | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [sessionsExpanded, setSessionsExpanded] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data: shell } = trpc.agentStudio.shell.getShellSummary.useQuery({ agentId });

  // Load every session for the agent; user can jump between them
  const { data: sessions } = trpc.agentStudio.chat.listSessions.useQuery(
    { agentId },
    { enabled: !!agentId }
  );
  const sessionList = (sessions ?? []) as any[];

  // Reset session state on agent change
  useEffect(() => {
    setSelectedSessionId(null);
    setPendingNewSession(false);
  }, [agentId]);

  // Effective session id: explicit selection wins, otherwise most recent
  const sessionId = pendingNewSession
    ? null
    : selectedSessionId ?? sessionList[0]?.id ?? null;

  // Load the messages for the current session
  const { data: messages } = trpc.agentStudio.chat.listMessages.useQuery(
    { sessionId: sessionId ?? 0 },
    { enabled: sessionId !== null }
  );

  const startSessionMut = trpc.agentStudio.chat.startSession.useMutation();
  const deleteSessionMut = trpc.agentStudio.chat.deleteSession.useMutation({
    onSuccess: (_, vars) => {
      utils.agentStudio.chat.listSessions.invalidate({ agentId });
      if (vars.sessionId === sessionId) {
        setSelectedSessionId(null);
      }
    },
    onError: (e) => console.error("Delete failed:", e),
  });
  const renameSessionMut = trpc.agentStudio.chat.renameSession.useMutation({
    onSuccess: () => {
      utils.agentStudio.chat.listSessions.invalidate({ agentId });
      setRenamingSessionId(null);
      setRenameDraft("");
    },
    onError: (e) => console.error("Rename failed:", e),
  });

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

  // Auto-scroll to bottom when messages change (mirrors source line 38-40)
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingText]);

  // Clean up the EventSource on unmount
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

  // Phase 19 follow-up Task #4: EventSource-based streaming. Replaces
  // the blocking sendMessage mutation with an SSE connection to
  // /api/agent-studio/chat/stream so tokens render as they arrive.
  const handleSendMessage = async () => {
    if (!message.trim() || !agentId || isStreaming) return;

    const userMessage = message.trim();
    setMessage("");
    setIsStreaming(true);
    setStreamingText("");

    try {
      // Create session if none exists (first send or pending-new-session)
      let activeSessionId = sessionId;
      if (activeSessionId == null) {
        const newSession = await startSessionMut.mutateAsync({
          agentId,
          title: userMessage.substring(0, 50),
        });
        activeSessionId = newSession.sessionId;
        setPendingNewSession(false);
        setSelectedSessionId(activeSessionId);
        await utils.agentStudio.chat.listSessions.invalidate({ agentId });
      }

      // Phase 3.2 — generate a fresh clientMessageId per send so the
      // backend can dedup retries / EventSource auto-reconnects on the
      // user-message persistence step. Re-using an id across distinct
      // sends would suppress legitimate messages with identical text;
      // we therefore generate per send-button-press, not per message.
      const clientMessageId =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      const url =
        "/api/agent-studio/chat/stream?" +
        new URLSearchParams({
          sessionId: activeSessionId.toString(),
          message: userMessage,
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
              sessionId: activeSessionId!,
            });
            utils.agentStudio.chat.listSessions.invalidate({ agentId });
          } else if (data.type === "error") {
            setIsStreaming(false);
            setStreamingText("");
            setActiveTools([]);
            es.close();
            eventSourceRef.current = null;
            console.error("Chat stream error:", data.error);
            utils.agentStudio.chat.listMessages.invalidate({
              sessionId: activeSessionId!,
            });
          }
        } catch (err) {
          console.error("Malformed SSE event:", event.data, err);
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
    } catch (error) {
      console.error("Failed to send message:", error);
      setIsStreaming(false);
      setStreamingText("");
      setActiveTools([]);
    }
  };

  const agentName = (shell as any)?.name ?? `Agent #${agentId}`;
  const agentDescription =
    (shell as any)?.description ?? "AI Agent Conversation";

  return (
    <div className="flex flex-col h-full">
      {/* Header — mirrors source line 148-163 */}
      <div className="border-b bg-card p-4 flex items-center gap-4">
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-semibold truncate">{agentName}</h1>
          <p className="text-sm text-muted-foreground truncate">{agentDescription}</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleNewSession}
          disabled={pendingNewSession}
          title="Start a new session"
        >
          <Plus className="h-4 w-4 mr-1" />
          New
        </Button>
      </div>

      {/* Session bar — collapsible list of all sessions for this agent,
          with rename + delete affordances. Task #7 (parity with FAB). */}
      <div className="border-b bg-card px-4 py-2">
        <button
          onClick={() => setSessionsExpanded((v) => !v)}
          disabled={sessionList.length === 0 && !pendingNewSession}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors w-full"
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
          <span className="truncate opacity-80 flex-1 text-left">
            {pendingNewSession
              ? "New…"
              : sessionId != null
              ? sessionList.find((s) => s.id === sessionId)?.title ??
                `#${sessionId}`
              : "none"}
          </span>
          <span className="shrink-0 opacity-60">
            {sessionList.length} total
          </span>
        </button>
        {sessionsExpanded && sessionList.length > 0 && (
          <div className="mt-2 max-h-48 overflow-y-auto flex flex-col gap-1">
            {sessionList.map((s: any) => {
              const active = s.id === sessionId;
              const editing = renamingSessionId === s.id;
              return (
                <div
                  key={s.id}
                  className={`flex items-center gap-1 px-2 py-1 rounded text-xs border transition-all group ${
                    active
                      ? "bg-primary/10 border-primary/30 text-primary"
                      : "bg-muted/30 border-transparent text-muted-foreground hover:border-muted-foreground/30"
                  }`}
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
                        className="flex-1 min-w-0 text-xs bg-background border rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-primary"
                        maxLength={120}
                      />
                      <button
                        onClick={handleCommitRename}
                        className="shrink-0 h-5 w-5 flex items-center justify-center rounded hover:bg-primary/20"
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
                        className="shrink-0 h-5 w-5 flex items-center justify-center rounded hover:bg-muted"
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
                        title={s.title ?? `Session #${s.id}`}
                      >
                        {s.title ?? `Session #${s.id}`}
                      </button>
                      <span className="shrink-0 opacity-60">
                        {s.messageCount ?? 0} msgs
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleStartRename(s.id, s.title);
                        }}
                        className="shrink-0 h-5 w-5 flex items-center justify-center rounded opacity-0 group-hover:opacity-60 hover:!opacity-100 hover:bg-primary/20"
                        title="Rename"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteSession(s.id, s.title);
                        }}
                        className="shrink-0 h-5 w-5 flex items-center justify-center rounded opacity-0 group-hover:opacity-60 hover:!opacity-100 hover:bg-destructive/20 hover:text-destructive"
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

      {/* Messages — mirrors source line 165-224 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {(messages ?? []).map((msg: any) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            {msg.role === "tool" ? (
              <Card className="p-3 max-w-[80%] bg-accent/50">
                <div className="flex items-center gap-2 text-sm">
                  <Wrench className="w-4 h-4 text-primary" />
                  <span className="font-medium">
                    {(msg.toolPayload as any)?.name ?? "tool"}
                  </span>
                </div>
                <pre className="mt-2 text-xs text-muted-foreground whitespace-pre-wrap">
                  {msg.content}
                </pre>
              </Card>
            ) : (
              <Card
                className={`p-3 max-w-[80%] ${
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted"
                }`}
              >
                <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                <span className="text-xs opacity-70 mt-1 block">
                  {new Date(msg.createdAt).toLocaleTimeString()}
                  {msg.role === "assistant" && msg.model && (
                    <>
                      {" · "}
                      {msg.model}
                      {msg.inputTokens != null && (
                        <>
                          {" · "}
                          {msg.inputTokens}→{msg.outputTokens ?? 0} tok
                        </>
                      )}
                      {msg.durationMs != null && (
                        <>
                          {" · "}
                          {msg.durationMs < 1000
                            ? `${msg.durationMs}ms`
                            : `${(msg.durationMs / 1000).toFixed(1)}s`}
                        </>
                      )}
                    </>
                  )}
                </span>
              </Card>
            )}
          </div>
        ))}

        {/* Streaming assistant bubble — grows as SSE tokens arrive */}
        {isStreaming && streamingText.length > 0 && (
          <div className="flex justify-start">
            <Card className="p-3 max-w-[80%] bg-muted">
              <p className="text-sm whitespace-pre-wrap">{streamingText}</p>
            </Card>
          </div>
        )}

        {/* Active tool chips during the streaming tool loop */}
        {isStreaming && activeTools.length > 0 && (
          <div className="flex gap-1 flex-wrap">
            {activeTools.map((t, i) => (
              <span
                key={`${t.name}-${i}`}
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs border ${
                  t.status === "running"
                    ? "bg-muted/50 border-muted-foreground/20 text-muted-foreground"
                    : t.status === "ok"
                    ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-500"
                    : t.status === "awaiting_approval"
                    ? "bg-amber-500/10 border-amber-500/30 text-amber-500"
                    : "bg-destructive/10 border-destructive/30 text-destructive"
                }`}
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
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : t.status === "ok" ? (
                  <Check className="h-3 w-3" />
                ) : t.status === "awaiting_approval" ? (
                  <Clock className="h-3 w-3" />
                ) : (
                  <X className="h-3 w-3" />
                )}
                <Wrench className="h-3 w-3" />
                <span>{t.name}</span>
                {t.status === "awaiting_approval" && t.timeoutSec != null && (
                  <span className="opacity-70">· {t.timeoutSec}s</span>
                )}
              </span>
            ))}
          </div>
        )}

        {/* Thinking placeholder — shown until the first token arrives */}
        {isStreaming && streamingText.length === 0 && activeTools.length === 0 && (
          <div className="flex justify-start">
            <Card className="p-3 max-w-[80%] bg-muted">
              <p className="text-sm flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Thinking…</span>
              </p>
            </Card>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input — mirrors source line 226-253 */}
      <div className="border-t bg-card p-4">
        <div className="flex gap-2">
          <Input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
              }
            }}
            placeholder="Type your message..."
            disabled={isStreaming}
            className="flex-1"
          />
          <Button
            onClick={handleSendMessage}
            disabled={!message.trim() || isStreaming}
            size="icon"
          >
            {isStreaming ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
