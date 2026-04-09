/**
 * AI Agent Studio — Chat Page (Phase 19 follow-up)
 *
 * Multi-turn conversational interface for Agent Studio agents, like
 * the chat view in OpenCode but scoped to ags_* agents. Persists
 * sessions and messages in asdb, calls GPT-4 via the same
 * runViaOpenAIDirect adapter the simulation engine uses.
 *
 * Layout (2-column):
 *   ┌─────────────┬──────────────────────────┐
 *   │ Sessions    │ Messages                  │
 *   │ list        │                           │
 *   │             │ [user]     Hi, help me... │
 *   │ • New       │ [assistant] Sure...       │
 *   │ • Session 1 │ [user]     Now...         │
 *   │ • Session 2 │ [assistant] ...           │
 *   │             │                           │
 *   │             │ ─────────────────────     │
 *   │             │ [Input box        ] [Send]│
 *   └─────────────┴──────────────────────────┘
 *
 * MVP scope:
 *   - Text-only messages (no streaming, no tool calls, no markdown rendering)
 *   - One session at a time (no parallel tabs)
 *   - Messages show role + content + timestamp + token count
 *   - New session creates a row eagerly; auto-titled from first message
 *   - Delete session with confirmation
 */
import { useState, useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  MessageSquare,
  Send,
  Plus,
  Trash2,
  Loader2,
  User,
  Bot,
  AlertCircle,
} from "lucide-react";
import {
  PageHeader,
  EmptyState,
  LoadingState,
} from "@/components/agent-studio/ui";

export default function AgentChatPage({ agentId }: { agentId: number }) {
  const utils = trpc.useUtils();
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // ── Session list ──
  const sessionsQuery = trpc.agentStudio.chat.listSessions.useQuery(
    { agentId },
    { refetchInterval: 10_000 }
  );

  // ── Messages for the selected session ──
  const messagesQuery = trpc.agentStudio.chat.listMessages.useQuery(
    { sessionId: selectedSessionId ?? 0 },
    { enabled: selectedSessionId !== null }
  );

  // ── Auto-select the most recent session (or create one) ──
  useEffect(() => {
    if (selectedSessionId === null && sessionsQuery.data && sessionsQuery.data.length > 0) {
      setSelectedSessionId(sessionsQuery.data[0].id);
    }
  }, [sessionsQuery.data, selectedSessionId]);

  // ── Auto-scroll to bottom on new messages ──
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messagesQuery.data]);

  // ── Mutations ──
  const startSessionMut = trpc.agentStudio.chat.startSession.useMutation({
    onSuccess: (r) => {
      setSelectedSessionId(r.sessionId);
      utils.agentStudio.chat.listSessions.invalidate({ agentId });
      toast.success("New chat session started");
    },
    onError: (e) => toast.error(e.message),
  });

  const sendMut = trpc.agentStudio.chat.sendMessage.useMutation({
    onSuccess: (r) => {
      if (!r.ok) {
        toast.error(r.error ?? "Send failed");
        return;
      }
      setDraft("");
      utils.agentStudio.chat.listMessages.invalidate({
        sessionId: selectedSessionId!,
      });
      utils.agentStudio.chat.listSessions.invalidate({ agentId });
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteSessionMut = trpc.agentStudio.chat.deleteSession.useMutation({
    onSuccess: () => {
      setSelectedSessionId(null);
      utils.agentStudio.chat.listSessions.invalidate({ agentId });
      toast.success("Session deleted");
    },
    onError: (e) => toast.error(e.message),
  });

  const handleNewSession = () => {
    startSessionMut.mutate({ agentId });
  };

  const handleSend = async () => {
    if (!draft.trim() || !selectedSessionId) return;
    sendMut.mutate({ sessionId: selectedSessionId, userMessage: draft.trim() });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Enter to send, Shift+Enter for newline (standard chat UX)
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleDeleteSession = (sessionId: number, title: string | null) => {
    if (
      confirm(
        `Delete session "${title ?? `#${sessionId}`}"? This cannot be undone.`
      )
    ) {
      deleteSessionMut.mutate({ sessionId });
    }
  };

  if (sessionsQuery.isLoading) {
    return <LoadingState label="Loading chat sessions…" />;
  }

  const sessions = sessionsQuery.data ?? [];
  const messages = messagesQuery.data ?? [];
  const selectedSession = sessions.find((s) => s.id === selectedSessionId) ?? null;

  // Format milliseconds as a human-friendly duration
  const fmtMs = (ms: number | null | undefined) => {
    if (ms == null) return "";
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  // Format microcents as $ cost
  const fmtCost = (micro: number | null | undefined) => {
    if (micro == null || micro === 0) return "";
    return `$${(micro / 1_000_000).toFixed(4)}`;
  };

  return (
    <div className="p-4 space-y-3">
      <PageHeader
        title="Chat"
        subtitle="Multi-turn conversation with this agent — persisted across page reloads"
        icon={<MessageSquare className="h-4 w-4" />}
        badges={
          <Badge variant="outline" className="text-[9px] uppercase tracking-wider ml-2">
            {sessions.length} session{sessions.length === 1 ? "" : "s"}
          </Badge>
        }
      />

      <div className="grid grid-cols-12 gap-3 h-[calc(100vh-16rem)]">
        {/* Session list (left column) */}
        <Card className="col-span-3 overflow-hidden flex flex-col">
          <CardContent className="p-2 flex-1 flex flex-col min-h-0">
            <Button
              size="sm"
              className="w-full mb-2 h-7"
              onClick={handleNewSession}
              disabled={startSessionMut.isPending}
            >
              {startSessionMut.isPending ? (
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              ) : (
                <Plus className="h-3 w-3 mr-1" />
              )}
              New chat
            </Button>
            {sessions.length === 0 ? (
              <div className="text-[10px] text-muted-foreground text-center py-4">
                No sessions yet. Click "New chat" to start.
              </div>
            ) : (
              <ul className="flex-1 overflow-auto space-y-1">
                {sessions.map((s) => {
                  const isSelected = s.id === selectedSessionId;
                  return (
                    <li
                      key={s.id}
                      className={`text-[10px] rounded p-1.5 cursor-pointer group ${
                        isSelected
                          ? "bg-blue-500/15 border border-blue-500/30"
                          : "border border-transparent hover:bg-muted/40"
                      }`}
                      onClick={() => setSelectedSessionId(s.id)}
                    >
                      <div className="flex items-start justify-between gap-1">
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium">
                            {s.title ?? `Session #${s.id}`}
                          </div>
                          <div className="text-[9px] opacity-70 mt-0.5">
                            {s.messageCount ?? 0} msg
                            {s.totalCostMicrocents
                              ? ` · ${fmtCost(s.totalCostMicrocents)}`
                              : ""}
                          </div>
                        </div>
                        <button
                          className="opacity-0 group-hover:opacity-100 p-0.5 hover:text-red-400 transition-opacity"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteSession(s.id, s.title);
                          }}
                          title="Delete session"
                        >
                          <Trash2 className="h-2.5 w-2.5" />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Messages + composer (right column) */}
        <Card className="col-span-9 overflow-hidden flex flex-col">
          <CardContent className="p-3 flex-1 flex flex-col min-h-0">
            {selectedSessionId === null ? (
              <EmptyState
                icon={<MessageSquare className="h-7 w-7" />}
                title="Select or start a chat"
                description="Pick an existing session on the left, or click 'New chat' to start a new conversation."
              />
            ) : (
              <>
                {/* Session header */}
                <div className="flex items-center justify-between text-[10px] text-muted-foreground pb-2 border-b mb-2">
                  <div className="truncate">
                    {selectedSession?.title ?? `Session #${selectedSessionId}`}
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <span>
                      {selectedSession?.messageCount ?? 0} messages
                    </span>
                    <span>
                      {fmtCost(selectedSession?.totalCostMicrocents)}
                    </span>
                  </div>
                </div>

                {/* Message list */}
                <div className="flex-1 overflow-auto space-y-2 pr-1">
                  {messagesQuery.isLoading ? (
                    <div className="text-[10px] text-muted-foreground">
                      Loading messages…
                    </div>
                  ) : messages.length === 0 ? (
                    <div className="text-[10px] text-muted-foreground text-center py-8">
                      No messages yet. Type below to start the conversation.
                    </div>
                  ) : (
                    messages.map((m) => {
                      const isUser = m.role === "user";
                      const isAssistant = m.role === "assistant";
                      return (
                        <div
                          key={m.id}
                          className={`flex gap-2 ${isUser ? "justify-end" : "justify-start"}`}
                        >
                          {!isUser && (
                            <div className="w-5 h-5 rounded-full bg-blue-500/15 border border-blue-500/30 flex items-center justify-center shrink-0 mt-0.5">
                              <Bot className="h-2.5 w-2.5 text-blue-400" />
                            </div>
                          )}
                          <div
                            className={`max-w-[75%] rounded p-2 text-xs ${
                              isUser
                                ? "bg-blue-500/10 border border-blue-500/20"
                                : "bg-muted/40 border border-muted"
                            }`}
                          >
                            <div className="whitespace-pre-wrap break-words">
                              {m.content}
                            </div>
                            {isAssistant && m.model && (
                              <div className="text-[9px] opacity-60 mt-1 flex gap-2">
                                <span>{m.model}</span>
                                {m.inputTokens != null && (
                                  <span>
                                    {m.inputTokens}→{m.outputTokens ?? 0} tok
                                  </span>
                                )}
                                {fmtMs(m.durationMs) && (
                                  <span>{fmtMs(m.durationMs)}</span>
                                )}
                                {fmtCost(m.costMicrocents) && (
                                  <span>{fmtCost(m.costMicrocents)}</span>
                                )}
                              </div>
                            )}
                          </div>
                          {isUser && (
                            <div className="w-5 h-5 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center shrink-0 mt-0.5">
                              <User className="h-2.5 w-2.5 text-emerald-400" />
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {/* Composer */}
                <div className="pt-2 border-t mt-2">
                  <div className="flex gap-2">
                    <Textarea
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder="Type a message… (Enter to send, Shift+Enter for newline)"
                      className="text-xs min-h-[50px] max-h-[150px] resize-none"
                      disabled={sendMut.isPending}
                    />
                    <Button
                      size="sm"
                      onClick={handleSend}
                      disabled={!draft.trim() || sendMut.isPending}
                      className="h-auto px-3 self-stretch"
                    >
                      {sendMut.isPending ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Send className="h-3 w-3" />
                      )}
                    </Button>
                  </div>
                  {sendMut.isPending && (
                    <div className="text-[9px] text-muted-foreground mt-1 flex items-center gap-1">
                      <Loader2 className="h-2.5 w-2.5 animate-spin" />
                      Calling GPT-4… (typically 5-20 seconds)
                    </div>
                  )}
                  {sendMut.data && !sendMut.data.ok && (
                    <div className="text-[10px] text-red-400 mt-1 flex items-start gap-1">
                      <AlertCircle className="h-3 w-3 shrink-0 mt-0.5" />
                      <span>{sendMut.data.error}</span>
                    </div>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
