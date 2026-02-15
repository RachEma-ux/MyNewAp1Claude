import { useState, useRef, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { Loader2, MessageSquare, Bot, User as UserIcon, Sparkles, BookOpen, Route } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Streamdown } from "streamdown";
import { clientProviderRouter, type WorkspaceRoutingProfile } from "@/lib/provider-router";
import { ChatControlBox } from "@/components/ChatControlBox";
import { useHeaderActions } from "@/components/MainLayout";

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp?: Date;
}

export default function Chat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [selectedProvider, setSelectedProvider] = useState<number | null>(null);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [useRAG, setUseRAG] = useState(false);
  const [useUnifiedRouting, setUseUnifiedRouting] = useState(false);
  const [selectedWorkspace, setSelectedWorkspace] = useState<number | null>(null);
  const [routingInfo, setRoutingInfo] = useState<{ provider?: string; reason?: string } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const { data: providers, isLoading: providersLoading } = trpc.chat.getAvailableProviders.useQuery();
  const { data: workspaces } = trpc.workspaces.list.useQuery();
  const { data: allProviders } = trpc.providers.list.useQuery();

  // Fetch models for the selected provider
  const { data: providerModels, isLoading: modelsLoading } = trpc.providers.getModels.useQuery(
    { id: selectedProvider! },
    { enabled: !useUnifiedRouting && !!selectedProvider }
  );

  // Fetch routing profile when unified routing is enabled and workspace is selected
  const { data: routingProfile } = trpc.workspaces.getRoutingProfile.useQuery(
    { id: selectedWorkspace! },
    { enabled: useUnifiedRouting && !!selectedWorkspace }
  );

  // Update client-side router with providers and workspace profile
  useEffect(() => {
    if (allProviders) {
      clientProviderRouter.updateLocalProviders(
        allProviders.map(p => ({
          id: p.id,
          name: p.name,
          type: p.type,
          kind: (p as any).kind || 'cloud',
          enabled: p.enabled ?? true,
          baseUrl: (p.config as any)?.baseURL,
          capabilities: (p as any).capabilities || [],
        }))
      );
    }
  }, [allProviders]);

  useEffect(() => {
    if (selectedWorkspace && routingProfile) {
      clientProviderRouter.setWorkspaceProfile(selectedWorkspace, routingProfile as WorkspaceRoutingProfile);
    }
  }, [selectedWorkspace, routingProfile]);
  
  const sendMessage = trpc.chat.sendMessage.useMutation({
    onSuccess: (response) => {
      setMessages(prev => [...prev, {
        role: "assistant",
        content: response.content,
        timestamp: new Date(),
      }]);
      setInput("");
    },
    onError: (error) => {
      toast.error(`Failed to send message: ${error.message}`);
    },
  });

  // Auto-select first provider
  useEffect(() => {
    if (providers && providers.length > 0 && !selectedProvider) {
      setSelectedProvider(providers[0]!.id);
    }
  }, [providers, selectedProvider]);

  // Auto-select first workspace
  useEffect(() => {
    if (workspaces && workspaces.length > 0 && !selectedWorkspace) {
      setSelectedWorkspace(workspaces[0]!.id);
    }
  }, [workspaces, selectedWorkspace]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streamingContent]);

  const handleSend = async () => {
    if (!input.trim()) {
      toast.error("Please enter a message");
      return;
    }

    // When unified routing is enabled, we need a workspace selected
    if (useUnifiedRouting && !selectedWorkspace) {
      toast.error("Please select a workspace for unified routing");
      return;
    }

    // When not using unified routing, we need a provider selected
    if (!useUnifiedRouting && !selectedProvider) {
      toast.error("Please select a provider");
      return;
    }

    const userMessage: ChatMessage = {
      role: "user",
      content: input.trim(),
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput("");
    setIsStreaming(true);
    setStreamingContent("");
    setRoutingInfo(null);

    // Create abort controller for cancellation
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      // Check client-side routing when unified routing is enabled
      let localEndpoint: string | null = null;
      if (useUnifiedRouting && selectedWorkspace && routingProfile) {
        const canRouteLocally = clientProviderRouter.canRouteLocally({
          workspaceId: selectedWorkspace,
        });

        if (canRouteLocally && routingProfile.defaultRoute === 'LOCAL_ONLY') {
          // Try to get local endpoint for direct routing
          const localProviders = clientProviderRouter.getLocalProviders();
          if (localProviders.length > 0) {
            localEndpoint = clientProviderRouter.getLocalEndpoint(localProviders[0].id);
            setRoutingInfo({ provider: localProviders[0].name, reason: 'Local-first routing' });
          }
        }
      }

      // Build request body
      const requestBody: Record<string, any> = {
        messages: [...messages, userMessage].map(m => ({
          role: m.role,
          content: m.content,
        })),
        useRAG,
        workspaceId: selectedWorkspace,
      };

      // Add routing parameters
      if (useUnifiedRouting) {
        requestBody.useUnifiedRouting = true;
        requestBody.taskHints = {
          qualityTier: routingProfile?.qualityTier || 'BALANCED',
        };
      } else {
        requestBody.providerId = selectedProvider;
        if (selectedModel) {
          requestBody.model = selectedModel;
        }
      }

      const response = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
        signal: abortController.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let accumulatedContent = "";

      if (!reader) {
        throw new Error('No response body');
      }

      while (true) {
        const { done, value } = await reader.read();
        
        if (done) {
          break;
        }

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = JSON.parse(line.slice(6));
            
            if (data.type === 'token') {
              accumulatedContent += data.content;
              setStreamingContent(accumulatedContent);
            } else if (data.type === 'complete') {
              setMessages(prev => [...prev, {
                role: "assistant",
                content: data.content,
                timestamp: new Date(),
              }]);
              setStreamingContent("");
              setIsStreaming(false);
              // Capture routing info if unified routing was used
              if (data.routing) {
                setRoutingInfo({
                  provider: data.routing.providerName,
                  reason: data.routing.auditReasons?.join(', ') || 'Unified routing',
                });
              }
            } else if (data.type === 'error') {
              toast.error(`Streaming error: ${data.error}`);
              setIsStreaming(false);
              setStreamingContent("");
            }
          }
        }
      }
    } catch (error: any) {
      if (error.name === 'AbortError') {
        toast.info('Message cancelled');
      } else {
        toast.error(`Failed to send message: ${error.message}`);
      }
      setIsStreaming(false);
      setStreamingContent("");
    } finally {
      abortControllerRef.current = null;
    }
  };

  const handleNewChat = () => {
    setMessages([]);
    setInput("");
    toast.success("New chat started");
  };

  useHeaderActions(
    useMemo(() => (
      <>
        <div className="flex items-center gap-2 px-2 py-1 rounded-lg border bg-card">
          <Route className="h-3.5 w-3.5 text-muted-foreground" />
          <Label htmlFor="routing-toggle" className="text-xs cursor-pointer whitespace-nowrap">
            Smart Routing
          </Label>
          <Switch
            id="routing-toggle"
            checked={useUnifiedRouting}
            onCheckedChange={setUseUnifiedRouting}
          />
        </div>
        <div className="flex items-center gap-2 px-2 py-1 rounded-lg border bg-card">
          <BookOpen className="h-3.5 w-3.5 text-muted-foreground" />
          <Label htmlFor="rag-toggle" className="text-xs cursor-pointer">
            RAG
          </Label>
          <Switch
            id="rag-toggle"
            checked={useRAG}
            onCheckedChange={setUseRAG}
          />
        </div>
      </>
    ), [useUnifiedRouting, useRAG])
  );

  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Chat</h1>
        </div>

        {/* Controls Row */}
        <div className="flex flex-wrap items-center gap-3">

          {/* Workspace Selection (shown when RAG or unified routing is enabled) */}
          {(useRAG || useUnifiedRouting) && (
            <Select
              value={selectedWorkspace?.toString()}
              onValueChange={(value) => setSelectedWorkspace(parseInt(value))}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Select workspace" />
              </SelectTrigger>
              <SelectContent>
                {workspaces && workspaces.length > 0 ? (
                  workspaces.map((workspace) => (
                    <SelectItem key={workspace.id} value={workspace.id.toString()}>
                      {workspace.name}
                    </SelectItem>
                  ))
                ) : (
                  <div className="p-4 text-sm text-muted-foreground">
                    No workspaces found
                  </div>
                )}
              </SelectContent>
            </Select>
          )}

          {/* Provider Selection (hidden when unified routing is enabled) */}
          {!useUnifiedRouting && (
            <Select
              value={selectedProvider?.toString()}
              onValueChange={(value) => {
                setSelectedProvider(parseInt(value));
                setSelectedModel(null);
              }}
            >
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Select provider" />
              </SelectTrigger>
              <SelectContent>
                {providersLoading ? (
                  <div className="flex items-center justify-center p-4">
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </div>
                ) : providers && providers.length > 0 ? (
                  providers.map((provider) => (
                    <SelectItem key={provider.id} value={provider.id.toString()}>
                      <div className="flex items-center gap-2">
                        <Sparkles className="h-4 w-4" />
                        <span>{provider.name}</span>
                      </div>
                    </SelectItem>
                  ))
                ) : (
                  <div className="p-4 text-sm text-muted-foreground">
                    No providers configured
                  </div>
                )}
              </SelectContent>
            </Select>
          )}

          {/* Model Selection (shown when a provider is selected and not using unified routing) */}
          {!useUnifiedRouting && selectedProvider && (
            <Select
              value={selectedModel ?? ""}
              onValueChange={(value) => setSelectedModel(value || null)}
            >
              <SelectTrigger className="w-[240px]">
                <SelectValue placeholder="Default model" />
              </SelectTrigger>
              <SelectContent>
                {modelsLoading ? (
                  <div className="flex items-center justify-center p-4">
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </div>
                ) : providerModels && providerModels.length > 0 ? (
                  providerModels.map((model) => (
                    <SelectItem key={model.id} value={model.id}>
                      {model.name}
                    </SelectItem>
                  ))
                ) : (
                  <div className="p-4 text-sm text-muted-foreground">
                    No models available
                  </div>
                )}
              </SelectContent>
            </Select>
          )}

          {/* Routing Info Badge */}
          {routingInfo && (
            <div className="flex items-center gap-1 px-2 py-1 text-xs rounded-md bg-primary/10 text-primary">
              <Route className="h-3 w-3" />
              <span>{routingInfo.provider}</span>
            </div>
          )}
        </div>
      </div>

      {/* Chat Area */}
      <Card className="flex-1 flex flex-col">
        <CardContent className="flex-1 flex flex-col p-0">
          {/* Messages */}
          <ScrollArea className="flex-1 p-6" ref={scrollRef}>
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <MessageSquare className="h-16 w-16 text-muted-foreground mb-4" />
                <h3 className="text-xl font-semibold mb-2">Start a Conversation</h3>
                <p className="text-muted-foreground max-w-md">
                  Select a provider and send a message to start chatting with AI
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {messages.map((msg, idx) => (
                  <div
                    key={idx}
                    className={`flex gap-4 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    {msg.role === "assistant" && (
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                        <Bot className="h-5 w-5 text-primary" />
                      </div>
                    )}
                    <div
                      className={`max-w-[80%] rounded-lg p-4 ${
                        msg.role === "user"
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted"
                      }`}
                    >
                      {msg.role === "assistant" ? (
                        <Streamdown>{msg.content}</Streamdown>
                      ) : (
                        <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                      )}
                      {msg.timestamp && (
                        <p className={`text-xs mt-2 ${msg.role === "user" ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                          {msg.timestamp.toLocaleTimeString()}
                        </p>
                      )}
                    </div>
                    {msg.role === "user" && (
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary flex items-center justify-center">
                        <UserIcon className="h-5 w-5 text-primary-foreground" />
                      </div>
                    )}
                  </div>
                ))}
                {isStreaming && streamingContent && (
                  <div className="flex gap-4 justify-start">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                      <Bot className="h-5 w-5 text-primary" />
                    </div>
                    <div className="bg-muted rounded-lg p-4 max-w-[80%]">
                      <Streamdown>{streamingContent}</Streamdown>
                      <div className="inline-block w-2 h-4 bg-primary/50 ml-1" />
                    </div>
                  </div>
                )}
                {isStreaming && !streamingContent && (
                  <div className="flex gap-4 justify-start">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                      <Bot className="h-5 w-5 text-primary" />
                    </div>
                    <div className="bg-muted rounded-lg p-4">
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                  </div>
                )}
              </div>
            )}
          </ScrollArea>

          {/* Input Area — ChatControlBox */}
          <div className="border-t p-4">
            <ChatControlBox
              value={input}
              onChange={setInput}
              onSend={handleSend}
              isStreaming={isStreaming}
              disabled={!useUnifiedRouting && !selectedProvider}
              providerCount={providers?.length ?? 0}
              providerName={
                providers?.find((p) => p.id === selectedProvider)?.name
              }
              onNewChat={handleNewChat}
              onStop={() => abortControllerRef.current?.abort()}
              noProviderMessage={
                !selectedProvider && providers && providers.length === 0
                  ? "No providers configured. Please add a provider in the Providers page."
                  : undefined
              }
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
