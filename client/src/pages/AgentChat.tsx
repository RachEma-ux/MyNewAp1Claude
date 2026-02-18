import { useEffect, useRef, useState } from "react";
import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { ArrowLeft, Send, Loader2, Wrench } from "lucide-react";
import type { Agent, AgentMode, GovernanceStatus, AgentRoleClass } from "@shared/types";

export default function AgentChat() {
  const { agentId } = useParams<{ agentId: string }>();
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
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data: agent } = trpc.agents.get.useQuery(
    { id: parseInt(agentId!) },
    { enabled: !!agentId }
  );

  const { data: conversations } = trpc.conversations.listConversations.useQuery(
    { agentId: parseInt(agentId!) },
    { enabled: !!agentId && !!agent }
  );

  const createConversationMutation = trpc.conversations.createConversation.useMutation();

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, currentStreamingMessage]);

  const handleSendMessage = async () => {
    if (!message.trim() || !agentId || !agent || isStreaming) return;

    const userMessage = message.trim();
    setMessage("");
    
    // Add user message to UI
    setMessages(prev => [...prev, {
      role: "user",
      content: userMessage,
      timestamp: new Date()
    }]);

    setIsStreaming(true);
    setCurrentStreamingMessage("");
    setCurrentToolExecution(null);

    try {
      // Create conversation if none exists
      let conversationId = conversations?.[0]?.id;
      if (!conversationId) {
        const newConv = await createConversationMutation.mutateAsync({
          agentId: parseInt(agentId),
          title: userMessage.substring(0, 50)
        });
        conversationId = newConv.id;
      }

      // Stream response from agent
      const eventSource = new EventSource(
        `/api/agents/${agentId}/chat/stream?` + 
        new URLSearchParams({
          conversationId: conversationId.toString(),
          message: userMessage
        })
      );

      eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);
        
        if (data.type === "token") {
          setCurrentStreamingMessage(prev => prev + data.content);
        } else if (data.type === "tool_start") {
          setCurrentToolExecution(data.toolName);
        } else if (data.type === "tool_end") {
          // Show tool result as a message
          setMessages(prev => [...prev, {
            role: "tool",
            content: data.result,
            toolName: data.toolName,
            timestamp: new Date()
          }]);
          setCurrentToolExecution(null);
        } else if (data.type === "done") {
          // Add final assistant message
          setMessages(prev => [...prev, {
            role: "assistant",
            content: currentStreamingMessage,
            timestamp: new Date()
          }]);
          setCurrentStreamingMessage("");
          setIsStreaming(false);
          eventSource.close();
        } else if (data.type === "error") {
          console.error("Streaming error:", data.error);
          setMessages(prev => [...prev, {
            role: "assistant",
            content: `Error: ${data.error}`,
            timestamp: new Date()
          }]);
          setIsStreaming(false);
          eventSource.close();
        }
      };

      eventSource.onerror = () => {
        console.error("EventSource error");
        setIsStreaming(false);
        eventSource.close();
      };
    } catch (error) {
      console.error("Failed to send message:", error);
      setMessages(prev => [...prev, {
        role: "assistant",
        content: "Failed to send message. Please try again.",
        timestamp: new Date()
      }]);
      setIsStreaming(false);
    }
  };

  if (!agent) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b bg-card p-4 flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setLocation("/agents")}
        >
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div>
          <h1 className="text-xl font-semibold">{agent.name}</h1>
          <p className="text-sm text-muted-foreground">
            {agent.description || "AI Agent Conversation"}
          </p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            {msg.role === "tool" ? (
              <Card className="p-3 max-w-[80%] bg-accent/50">
                <div className="flex items-center gap-2 text-sm">
                  <Wrench className="w-4 h-4 text-primary" />
                  <span className="font-medium">{msg.toolName}</span>
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
                  {msg.timestamp.toLocaleTimeString()}
                </span>
              </Card>
            )}
          </div>
        ))}

        {/* Streaming message */}
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

        {/* Tool execution indicator */}
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

      {/* Input */}
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
