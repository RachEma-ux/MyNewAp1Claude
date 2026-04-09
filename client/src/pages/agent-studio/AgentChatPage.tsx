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
import { Send, Loader2, Wrench } from "lucide-react";

export default function AgentChatPage({ agentId }: { agentId: number }) {
  const utils = trpc.useUtils();
  const [message, setMessage] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const eventSourceRef = useRef<EventSource | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data: shell } = trpc.agentStudio.shell.getShellSummary.useQuery({ agentId });

  // Load the agent's chat sessions; pick the most recent (or auto-create
  // one on first send). Mirrors the source's "use first conversation"
  // pattern (line 30-33 of AgentChat.tsx).
  const { data: sessions } = trpc.agentStudio.chat.listSessions.useQuery(
    { agentId },
    { enabled: !!agentId }
  );

  const sessionId = sessions?.[0]?.id ?? null;

  // Load the messages for the current session
  const { data: messages } = trpc.agentStudio.chat.listMessages.useQuery(
    { sessionId: sessionId ?? 0 },
    { enabled: sessionId !== null }
  );

  const startSessionMut = trpc.agentStudio.chat.startSession.useMutation();

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
      // Create session if none exists (mirrors source line 60-68).
      let activeSessionId = sessionId;
      if (activeSessionId == null) {
        const newSession = await startSessionMut.mutateAsync({
          agentId,
          title: userMessage.substring(0, 50),
        });
        activeSessionId = newSession.sessionId;
        await utils.agentStudio.chat.listSessions.invalidate({ agentId });
      }

      const url =
        "/api/agent-studio/chat/stream?" +
        new URLSearchParams({
          sessionId: activeSessionId.toString(),
          message: userMessage,
        });
      const es = new EventSource(url);
      eventSourceRef.current = es;

      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "token") {
            setStreamingText((prev) => prev + (data.content ?? ""));
          } else if (data.type === "done") {
            setIsStreaming(false);
            setStreamingText("");
            es.close();
            eventSourceRef.current = null;
            utils.agentStudio.chat.listMessages.invalidate({
              sessionId: activeSessionId!,
            });
            utils.agentStudio.chat.listSessions.invalidate({ agentId });
          } else if (data.type === "error") {
            setIsStreaming(false);
            setStreamingText("");
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
    }
  };

  const agentName = (shell as any)?.name ?? `Agent #${agentId}`;
  const agentDescription =
    (shell as any)?.description ?? "AI Agent Conversation";

  return (
    <div className="flex flex-col h-full">
      {/* Header — mirrors source line 148-163 */}
      <div className="border-b bg-card p-4 flex items-center gap-4">
        <div>
          <h1 className="text-xl font-semibold">{agentName}</h1>
          <p className="text-sm text-muted-foreground">{agentDescription}</p>
        </div>
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

        {/* Thinking placeholder — shown until the first token arrives */}
        {isStreaming && streamingText.length === 0 && (
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
