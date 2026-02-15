import { useState, useRef, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { trpc } from "@/lib/trpc";
import { Loader2, MessageSquare, Bot, User as UserIcon, Sparkles, BookOpen, Route, History, Archive, Trash2, PenLine, BarChart3, Upload, Download, Zap } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Streamdown } from "streamdown";
import { clientProviderRouter, type WorkspaceRoutingProfile } from "@/lib/provider-router";
import { ChatControlBox } from "@/components/ChatControlBox";
import { useHeaderActions } from "@/components/MainLayout";
import { ChatProvider, useChatContext, type ChatSession } from "@/contexts/ChatContext";

// =============================================================================
// CHAT HISTORY SIDEBAR
// =============================================================================

function ChatHistoryItem({
  chat,
  isActive,
  onSwitch,
  onArchive,
  onDelete,
  onRename,
}: {
  chat: ChatSession;
  isActive: boolean;
  onSwitch: () => void;
  onArchive?: () => void;
  onDelete: () => void;
  onRename: () => void;
}) {
  const msgCount = chat.messages.length;
  const lastMsg = chat.messages[chat.messages.length - 1];
  const preview = lastMsg ? lastMsg.content.slice(0, 60) : "No messages";

  return (
    <div
      className={`group flex flex-col gap-1 rounded-lg px-3 py-2 cursor-pointer transition-colors ${
        isActive ? "bg-primary/10 border border-primary/20" : "hover:bg-muted"
      }`}
      onClick={onSwitch}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium truncate flex-1">{chat.title}</span>
        {chat.isSaved && (
          <span className="text-[10px] text-green-500 font-medium shrink-0">Saved</span>
        )}
      </div>
      <p className="text-xs text-muted-foreground truncate">{preview}</p>
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground">
          {msgCount} msg{msgCount !== 1 ? "s" : ""} · {new Date(chat.updatedAt).toLocaleDateString()}
        </span>
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            className="h-6 w-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground"
            onClick={(e) => { e.stopPropagation(); onRename(); }}
            title="Rename"
          >
            <PenLine className="h-3 w-3" />
          </button>
          {onArchive && (
            <button
              className="h-6 w-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground"
              onClick={(e) => { e.stopPropagation(); onArchive(); }}
              title="Archive"
            >
              <Archive className="h-3 w-3" />
            </button>
          )}
          <button
            className="h-6 w-6 flex items-center justify-center rounded text-muted-foreground hover:text-destructive"
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            title="Delete"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  );
}

function ChatHistoryPanel({ onClose }: { onClose: () => void }) {
  const { chats, archivedChats, currentChatId, switchChat, archiveChat, unarchiveChat, deleteChat, renameChat } = useChatContext();
  const [showArchived, setShowArchived] = useState(false);

  const handleRename = (id: string, currentTitle: string) => {
    const newTitle = prompt("Rename chat:", currentTitle);
    if (newTitle && newTitle.trim()) {
      renameChat(id, newTitle.trim());
    }
  };

  const handleSwitch = (id: string) => {
    switchChat(id);
    onClose();
  };

  const displayChats = showArchived ? archivedChats : chats;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 mb-4">
        <Button
          variant={showArchived ? "outline" : "default"}
          size="sm"
          onClick={() => setShowArchived(false)}
        >
          Active ({chats.length})
        </Button>
        <Button
          variant={showArchived ? "default" : "outline"}
          size="sm"
          onClick={() => setShowArchived(true)}
        >
          Archived ({archivedChats.length})
        </Button>
      </div>

      <ScrollArea className="flex-1 -mx-2 px-2">
        {displayChats.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            {showArchived ? "No archived chats" : "No chats yet"}
          </div>
        ) : (
          <div className="space-y-1">
            {displayChats.map((chat) => (
              <ChatHistoryItem
                key={chat.id}
                chat={chat}
                isActive={chat.id === currentChatId}
                onSwitch={() => handleSwitch(chat.id)}
                onArchive={
                  showArchived
                    ? undefined
                    : () => archiveChat(chat.id)
                }
                onDelete={() => {
                  if (confirm("Delete this chat?")) deleteChat(chat.id);
                }}
                onRename={() => handleRename(chat.id, chat.title)}
              />
            ))}
          </div>
        )}
      </ScrollArea>

      {showArchived && archivedChats.length > 0 && (
        <div className="pt-2 border-t mt-2 text-xs text-muted-foreground text-center">
          Click a chat to restore it, or use the actions menu
        </div>
      )}
    </div>
  );
}

// =============================================================================
// INNER CHAT (uses ChatContext)
// =============================================================================

function ChatInner() {
  const {
    currentChat,
    currentChatId,
    createChat,
    switchChat,
    renameChat,
    deleteChat,
    archiveChat,
    addMessage,
    saveChat,
    exportChatData,
    getAnalytics,
    getRecentChats,
    settings,
  } = useChatContext();

  const [input, setInput] = useState("");
  const [selectedProvider, setSelectedProvider] = useState<number | null>(null);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [useRAG, setUseRAG] = useState(false);
  const [useUnifiedRouting, setUseUnifiedRouting] = useState(false);
  const [selectedWorkspace, setSelectedWorkspace] = useState<number | null>(null);
  const [routingInfo, setRoutingInfo] = useState<{ provider?: string; reason?: string } | null>(null);
  const [modelsEnabled, setModelsEnabled] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const messages = currentChat?.messages ?? [];

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

  // Ensure there's always a current chat
  useEffect(() => {
    if (!currentChatId) {
      createChat();
    }
  }, [currentChatId, createChat]);

  // Auto-save after messages change
  useEffect(() => {
    if (settings.autoSave && currentChatId && messages.length > 0) {
      saveChat(currentChatId);
    }
  }, [settings.autoSave, messages.length, currentChatId, saveChat]);

  const handleSend = async () => {
    if (!input.trim()) {
      toast.error("Please enter a message");
      return;
    }

    if (useUnifiedRouting && !selectedWorkspace) {
      toast.error("Please select a workspace for unified routing");
      return;
    }

    if (!useUnifiedRouting && !selectedProvider) {
      toast.error("Please select a provider");
      return;
    }

    const userContent = input.trim();

    // Add user message to context
    addMessage({ role: "user", content: userContent });

    setInput("");
    setIsStreaming(true);
    setStreamingContent("");
    setRoutingInfo(null);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      let localEndpoint: string | null = null;
      if (useUnifiedRouting && selectedWorkspace && routingProfile) {
        const canRouteLocally = clientProviderRouter.canRouteLocally({
          workspaceId: selectedWorkspace,
        });

        if (canRouteLocally && routingProfile.defaultRoute === 'LOCAL_ONLY') {
          const localProviders = clientProviderRouter.getLocalProviders();
          if (localProviders.length > 0) {
            localEndpoint = clientProviderRouter.getLocalEndpoint(localProviders[0].id);
            setRoutingInfo({ provider: localProviders[0].name, reason: 'Local-first routing' });
          }
        }
      }

      // Build message history from context messages + the new user message
      const allMessages = [
        ...messages.map(m => ({ role: m.role, content: m.content })),
        { role: "user" as const, content: userContent },
      ];

      const requestBody: Record<string, any> = {
        messages: allMessages,
        useRAG,
        workspaceId: selectedWorkspace,
      };

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
        headers: { 'Content-Type': 'application/json' },
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
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = JSON.parse(line.slice(6));

            if (data.type === 'token') {
              accumulatedContent += data.content;
              setStreamingContent(accumulatedContent);
            } else if (data.type === 'complete') {
              // Add assistant message to context
              addMessage({ role: "assistant", content: data.content });
              setStreamingContent("");
              setIsStreaming(false);
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
    createChat();
    setInput("");
    toast.success("New chat started");
  };

  const handleSaveChat = () => {
    saveChat();
    toast.success("Chat saved");
  };

  const handleExport = () => {
    exportChatData();
    toast.success("Chat data exported");
  };

  const handleRenameChat = () => {
    if (!currentChatId || !currentChat) return;
    const newTitle = prompt("Rename chat:", currentChat.title);
    if (newTitle && newTitle.trim()) {
      renameChat(currentChatId, newTitle.trim());
      toast.success("Chat renamed");
    }
  };

  const handleArchiveChat = () => {
    if (!currentChatId) return;
    archiveChat(currentChatId);
    toast.success("Chat archived");
  };

  const handleDeleteChat = () => {
    if (!currentChatId) return;
    if (confirm("Are you sure you want to delete this chat?")) {
      deleteChat(currentChatId);
      toast.success("Chat deleted");
    }
  };

  const handleAnalytics = () => {
    const stats = getAnalytics();
    toast.info(
      `Chats: ${stats.totalChats} | Messages: ${stats.totalMessages} | Saved: ${stats.savedChats} | Archived: ${stats.archivedChats} | Avg msgs/chat: ${stats.avgMessagesPerChat}`
    );
  };

  const recentChats = getRecentChats(3).map((c) => ({
    id: c.id,
    title: c.title,
    messageCount: c.messages.length,
    updatedAt: c.updatedAt,
  }));

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
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight">Chat</h1>
            {currentChat && currentChat.title !== "New Chat" && (
              <span className="text-sm text-muted-foreground truncate max-w-[300px]">
                — {currentChat.title}
              </span>
            )}
          </div>

          <Sheet open={historyOpen} onOpenChange={setHistoryOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <History className="h-4 w-4" />
                History
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[340px] sm:w-[400px]">
              <SheetHeader>
                <SheetTitle>Chat History</SheetTitle>
              </SheetHeader>
              <div className="mt-4 h-[calc(100%-3rem)]">
                <ChatHistoryPanel onClose={() => setHistoryOpen(false)} />
              </div>
            </SheetContent>
          </Sheet>
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
                <p className="text-muted-foreground max-w-md mb-6">
                  Select a provider and send a message to start chatting with AI
                </p>
                <div className="rounded-xl border bg-muted/40 p-5 max-w-lg w-full text-left">
                  <h4 className="text-sm font-semibold mb-3">Features</h4>
                  <div className="grid grid-cols-2 gap-2.5 text-xs text-muted-foreground">
                    {[
                      { icon: Zap, label: "Smart Naming" },
                      { icon: History, label: "Chat Management" },
                      { icon: MessageSquare, label: "Recent Conversations" },
                      { icon: BarChart3, label: "Analytics" },
                      { icon: Download, label: "Export / Import" },
                      { icon: Upload, label: "File Upload" },
                    ].map(({ icon: Icon, label }) => (
                      <div key={label} className="flex items-center gap-2">
                        <Icon className="h-3.5 w-3.5 text-primary/70" />
                        <span>{label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
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
                          {new Date(msg.timestamp).toLocaleTimeString()}
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
              modelsEnabled={modelsEnabled}
              onNewChat={handleNewChat}
              onStop={() => abortControllerRef.current?.abort()}
              onSaveChat={handleSaveChat}
              isSaved={currentChat?.isSaved ?? false}
              messageCount={messages.length}
              onExport={handleExport}
              onRenameChat={handleRenameChat}
              onArchiveChat={handleArchiveChat}
              onDeleteChat={handleDeleteChat}
              onAnalytics={handleAnalytics}
              onSwitchChat={(id) => switchChat(id)}
              recentChats={recentChats}
              providers={providers?.map((p) => ({ id: p.id, name: p.name, type: p.type })) ?? []}
              providerModels={providerModels?.map((m) => ({ id: m.id, name: m.name })) ?? []}
              selectedProviderId={selectedProvider}
              selectedModelId={selectedModel}
              onProviderSelect={(id) => {
                setSelectedProvider(id);
                setSelectedModel(null);
              }}
              onModelSelect={setSelectedModel}
              providersLoading={providersLoading}
              modelsLoading={modelsLoading}
              providerCount={providers?.length ?? 0}
              modelCount={providerModels?.length ?? 0}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// =============================================================================
// EXPORTED PAGE COMPONENT (wraps with ChatProvider)
// =============================================================================

export default function Chat() {
  return (
    <ChatProvider>
      <ChatInner />
    </ChatProvider>
  );
}
