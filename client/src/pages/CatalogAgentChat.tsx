import { useEffect, useRef, useState } from "react";
import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { getAppBlocker } from "@/lib/appBlockers";
import { AppBlockerAlert } from "@/components/errors/AppBlockerAlert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { ArrowLeft, Send, Loader2, Wrench, ShieldCheck } from "lucide-react";
import type { AppBlockerPayload } from "@shared/blockers";

export default function CatalogAgentChat() {
  const { catalogEntryId } = useParams<{ catalogEntryId: string }>();
  const [, setLocation] = useLocation();
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<Array<{
    role: "user" | "assistant" | "tool";
    content: string;
    toolName?: string;
    timestamp: Date;
  }>>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentStreamingMessage, setCurrentStreamingMessage] = useState("");
  const [currentToolExecution, setCurrentToolExecution] = useState<string | null>(null);
  const [executionBlocker, setExecutionBlocker] = useState<AppBlockerPayload | null>(null);
  const [conversationId, setConversationId] = useState<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const entryId = Number(catalogEntryId);
  const executionTargetQuery = trpc.catalogRegistry.getAgentExecutionTarget.useQuery(
    { catalogEntryId: entryId },
    { enabled: Number.isFinite(entryId) }
  );
  const createConversationMutation = trpc.conversations.createConversation.useMutation();

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, currentStreamingMessage]);

  useEffect(() => {
    if (executionTargetQuery.error) {
      setExecutionBlocker(getAppBlocker(executionTargetQuery.error));
    }
  }, [executionTargetQuery.error]);

  const handleSendMessage = async () => {
    if (!message.trim() || !catalogEntryId || !executionTargetQuery.data || isStreaming) return;

    const userMessage = message.trim();
    setMessage("");
    setExecutionBlocker(null);
    setMessages((prev) => [...prev, {
      role: "user",
      content: userMessage,
      timestamp: new Date(),
    }]);

    setIsStreaming(true);
    setCurrentStreamingMessage("");
    setCurrentToolExecution(null);

    try {
      const resolvedConversationId = conversationId ?? (await createConversationMutation.mutateAsync({
        catalogEntryId: Number(catalogEntryId),
        workspaceId: undefined,
        title: userMessage.substring(0, 50),
      })).id;
      if (!conversationId) {
        setConversationId(resolvedConversationId);
      }

      const eventSource = new EventSource(
        `/api/catalog/agents/${catalogEntryId}/chat/stream?` +
        new URLSearchParams({
          conversationId: String(resolvedConversationId),
          message: userMessage,
        })
      );

      let assistantMessage = "";

      eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);

        if (data.type === "token") {
          assistantMessage += data.content;
          setCurrentStreamingMessage(assistantMessage);
        } else if (data.type === "tool_start") {
          setCurrentToolExecution(data.toolName);
        } else if (data.type === "tool_end") {
          setMessages((prev) => [...prev, {
            role: "tool",
            content: data.result,
            toolName: data.toolName,
            timestamp: new Date(),
          }]);
          setCurrentToolExecution(null);
        } else if (data.type === "done") {
          setMessages((prev) => [...prev, {
            role: "assistant",
            content: assistantMessage,
            timestamp: new Date(),
          }]);
          setCurrentStreamingMessage("");
          setIsStreaming(false);
          eventSource.close();
        } else if (data.type === "error") {
          if (data.blocker) {
            setExecutionBlocker(data.blocker);
          }
          setMessages((prev) => prev.slice(0, -1));
          setCurrentStreamingMessage("");
          setIsStreaming(false);
          eventSource.close();
        }
      };

      eventSource.onerror = () => {
        setExecutionBlocker({
          code: "catalog_stream_failed",
          category: "technical_error",
          title: "Run failed",
          summary: "The Catalog run could not complete because the live connection failed.",
          details: [],
          missingRequirements: [],
          fieldIssues: [],
          recommendedActions: ["Try the same run again in a moment."],
          retryable: true,
          context: { catalogEntryId },
        });
        setCurrentStreamingMessage("");
        setIsStreaming(false);
        eventSource.close();
      };
    } catch (error) {
      setExecutionBlocker(getAppBlocker(error));
      setMessages((prev) => prev.slice(0, -1));
      setCurrentStreamingMessage("");
      setIsStreaming(false);
    }
  };

  if (executionTargetQuery.isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!executionTargetQuery.data) {
    return (
      <div className="mx-auto max-w-3xl p-6 space-y-4">
        <Button variant="ghost" size="sm" onClick={() => setLocation("/llm/catalogue/manage")}>
          <ArrowLeft className="w-4 h-4 mr-2" />Back to Catalog
        </Button>
        {executionBlocker && <AppBlockerAlert blocker={executionBlocker} />}
      </div>
    );
  }

  const target = executionTargetQuery.data;

  return (
    <div className="flex flex-col h-full">
      <div className="border-b bg-card p-4 flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => setLocation("/llm/catalogue/manage")}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="min-w-0">
          <h1 className="text-xl font-semibold truncate">{target.name}</h1>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <ShieldCheck className="w-4 h-4 text-emerald-500" />
            <span>Catalog run via entry #{target.catalogEntryId}</span>
            <span>•</span>
            <span>{target.bundleVersionLabel}</span>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {executionBlocker && <AppBlockerAlert blocker={executionBlocker} />}

        {messages.map((msg, idx) => (
          <div key={idx} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            {msg.role === "tool" ? (
              <Card className="p-3 max-w-[80%] bg-accent/50">
                <div className="flex items-center gap-2 text-sm">
                  <Wrench className="w-4 h-4 text-primary" />
                  <span className="font-medium">{msg.toolName}</span>
                </div>
                <pre className="mt-2 text-xs text-muted-foreground whitespace-pre-wrap">{msg.content}</pre>
              </Card>
            ) : (
              <Card className={`p-3 max-w-[80%] ${msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                <span className="text-xs opacity-70 mt-1 block">{msg.timestamp.toLocaleTimeString()}</span>
              </Card>
            )}
          </div>
        ))}

        {currentStreamingMessage && (
          <div className="flex justify-start">
            <Card className="p-3 max-w-[80%] bg-muted">
              <p className="text-sm whitespace-pre-wrap">
                {currentStreamingMessage}
                <span className="inline-block w-2 h-4 ml-1 bg-primary" />
              </p>
            </Card>
          </div>
        )}

        {currentToolExecution && (
          <div className="flex justify-start">
            <Card className="p-3 bg-accent/50">
              <div className="flex items-center gap-2 text-sm">
                <Wrench className="w-4 h-4 text-primary" />
                <span>Using {currentToolExecution}...</span>
              </div>
            </Card>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

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
            disabled={isStreaming || !!executionBlocker}
            className="flex-1"
          />
          <Button onClick={handleSendMessage} disabled={!message.trim() || isStreaming || !!executionBlocker} size="icon">
            {isStreaming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
