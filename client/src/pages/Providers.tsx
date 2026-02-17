import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { Plus, Settings, Trash2, CheckCircle, XCircle, Loader2, Cloud, Server, Zap, DollarSign, Activity, RefreshCw, Route, ClipboardList, ChevronDown } from "lucide-react";
import { TestProviderButton } from "@/components/TestProviderButton";
import { RoutingAuditViewer } from "@/components/RoutingAuditViewer";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

type ProviderType = "openai" | "anthropic" | "google" | "local-llamacpp" | "local-ollama" | "custom";

interface ProviderFormData {
  name: string;
  type: ProviderType;
  enabled: boolean;
  priority: number;
  apiKey: string;
  baseUrl?: string;
  defaultModel?: string;
  selectedModels: string[];
}

const providerTypeInfo: Record<ProviderType, { label: string; icon: React.ReactNode; color: string; description: string }> = {
  openai: {
    label: "OpenAI",
    icon: <Cloud className="h-5 w-5" />,
    color: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
    description: "cloud",
  },
  anthropic: {
    label: "Anthropic",
    icon: <Cloud className="h-5 w-5" />,
    color: "bg-orange-500/10 text-orange-500 border-orange-500/20",
    description: "cloud",
  },
  google: {
    label: "Google AI",
    icon: <Cloud className="h-5 w-5" />,
    color: "bg-blue-500/10 text-blue-500 border-blue-500/20",
    description: "cloud",
  },
  "local-llamacpp": {
    label: "llama.cpp",
    icon: <Server className="h-5 w-5" />,
    color: "bg-purple-500/10 text-purple-500 border-purple-500/20",
    description: "local",
  },
  "local-ollama": {
    label: "Ollama",
    icon: <Server className="h-5 w-5" />,
    color: "bg-cyan-500/10 text-cyan-500 border-cyan-500/20",
    description: "local",
  },
  custom: {
    label: "Custom",
    icon: <Settings className="h-5 w-5" />,
    color: "bg-gray-500/10 text-gray-400 border-gray-500/20",
    description: "custom",
  },
};

export default function Providers() {
  const [, navigate] = useLocation();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedType, setSelectedType] = useState<ProviderType>("openai");
  const [selectedMultiChatProvider, setSelectedMultiChatProvider] = useState<string>("");
  const [formData, setFormData] = useState<ProviderFormData>({
    name: "",
    type: "openai",
    enabled: true,
    priority: 50,
    apiKey: "",
    baseUrl: "",
    defaultModel: "",
    selectedModels: [],
  });
  const [isModelsOpen, setIsModelsOpen] = useState(false);

  const { data: providers, isLoading, refetch } = trpc.providers.list.useQuery();
  const { data: multiChatProviders = [] } = trpc.llm.listProviders.useQuery();
  const { data: catalogModels = [] } = trpc.modelDownloads.getUnifiedCatalog.useQuery({});
  const createProvider = trpc.providers.create.useMutation({
    onSuccess: () => {
      toast.success("Provider created successfully");
      setIsCreateOpen(false);
      resetForm();
      refetch();
    },
    onError: (error) => {
      toast.error(`Failed to create provider: ${error.message}`);
    },
  });
  const deleteProvider = trpc.providers.delete.useMutation({
    onSuccess: () => {
      toast.success("Provider deleted");
      refetch();
    },
    onError: (error) => {
      toast.error(`Failed to delete provider: ${error.message}`);
    },
  });
  const updateProvider = trpc.providers.update.useMutation({
    onSuccess: () => {
      toast.success("Provider updated");
      refetch();
    },
    onError: (error) => {
      toast.error(`Failed to update provider: ${error.message}`);
    },
  });

  const resetForm = () => {
    setFormData({
      name: "",
      type: "openai",
      enabled: true,
      priority: 50,
      apiKey: "",
      baseUrl: "",
      defaultModel: "",
      selectedModels: [],
    });
    setSelectedType("openai");
    setSelectedMultiChatProvider("");
    setIsModelsOpen(false);
  };

  const handleCreateProvider = () => {
    const config: Record<string, unknown> = {
      apiKey: formData.apiKey,
    };
    if (formData.baseUrl) {
      config.baseURL = formData.baseUrl;
    }
    if (formData.defaultModel) {
      config.defaultModel = formData.defaultModel;
    }
    if (formData.selectedModels.length > 0) {
      config.models = formData.selectedModels;
      // Set first selected model as default if no default specified
      if (!formData.defaultModel) {
        config.defaultModel = formData.selectedModels[0];
      }
    }

    createProvider.mutate({
      name: formData.name || providerTypeInfo[selectedType].label,
      type: selectedType,
      enabled: formData.enabled,
      priority: formData.priority,
      config,
    });
  };

  const handleModelToggle = (modelId: string) => {
    setFormData(prev => ({
      ...prev,
      selectedModels: prev.selectedModels.includes(modelId)
        ? prev.selectedModels.filter(id => id !== modelId)
        : [...prev.selectedModels, modelId]
    }));
  };

  const getAvailableModels = () => {
    // Use unified catalog as source of truth
    return catalogModels
      .filter((m) => (m.name || "").trim() !== "")
      .map((m) => ({
        id: m.name,
        name: m.displayName,
        description: m.description,
      }));
  };

  const handleToggleEnabled = (id: number, currentEnabled: boolean | null) => {
    updateProvider.mutate({
      id,
      enabled: !(currentEnabled ?? true),
    });
  };

  const handleDelete = (id: number) => {
    if (confirm("Are you sure you want to delete this provider?")) {
      deleteProvider.mutate({ id });
    }
  };

  const cloudProviders = providers?.filter(p => ["openai", "anthropic", "google", "custom"].includes(p.type)) || [];
  const localProviders = providers?.filter(p => ["local-llamacpp", "local-ollama"].includes(p.type)) || [];

  return (
    <div className="space-y-6 overflow-x-hidden">
      {/* Header */}
      <div className="flex flex-wrap items-start sm:items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Providers</h1>
          <p className="text-muted-foreground mt-1 text-sm sm:text-base">
            Manage Providers
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-1" />
                Add
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px] max-h-[85vh] overflow-y-auto">
              <DialogHeader className="flex flex-row items-start justify-between space-y-0">
                <div>
                  <DialogTitle>Add New Provider</DialogTitle>
                  <DialogDescription>
                    Configure a new LLM provider for inference
                  </DialogDescription>
                </div>
                <Button onClick={handleCreateProvider} disabled={createProvider.isPending} className="shrink-0">
                  {createProvider.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Create Provider
                </Button>
              </DialogHeader>
              <div className="space-y-4 py-4">
                {/* Provider Selection Row */}
                <div className="flex gap-2">
                <div className="flex-1 space-y-2">
                  <Label htmlFor="multichat-provider">Select Provider</Label>
                  <Select value={selectedMultiChatProvider} onValueChange={(value) => {
                    setSelectedMultiChatProvider(value);
                    // Handle custom provider
                    if (value === 'custom') {
                      setFormData({ ...formData, name: 'Custom Provider', baseUrl: '' });
                      setSelectedType('custom');
                      return;
                    }

                    const provider = multiChatProviders.find(p => p.id === value);

                    if (provider) {
                      // Update form with provider name
                      setFormData({ ...formData, name: provider.name });

                      // Auto-select type based on provider ID
                      if (provider.type === 'local' || value === 'ollama') {
                        setSelectedType('local-ollama');
                      } else if (value === 'openai') {
                        setSelectedType('openai');
                      } else if (value === 'anthropic') {
                        setSelectedType('anthropic');
                      } else if (value === 'google') {
                        setSelectedType('google');
                      } else {
                        // All other cloud providers use custom type
                        setSelectedType('custom');
                      }
                    }
                  }}>
                    <SelectTrigger id="multichat-provider">
                      <SelectValue placeholder="Select a provider..." />
                    </SelectTrigger>
                    <SelectContent>
                      {multiChatProviders.map((provider) => (
                        <SelectItem key={provider.id} value={provider.id}>
                          {provider.name}
                        </SelectItem>
                      ))}
                      <SelectItem key="custom" value="custom">
                        Custom (OpenAI-compatible endpoint)
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Default Provider Type */}
                <div className="flex-1 space-y-2">
                  <Label>Default Providers</Label>
                  <Select value={selectedType} onValueChange={(value) => setSelectedType(value as ProviderType)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select default..." />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(providerTypeInfo) as ProviderType[]).map((type) => {
                        const info = providerTypeInfo[type];
                        return (
                          <SelectItem key={type} value={type}>
                            {info.label}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
                </div>

                {/* Selected Provider Indicator */}
                {selectedMultiChatProvider && (
                  <div className="p-3 rounded-lg border border-primary/50 bg-primary/5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <CheckCircle className="h-4 w-4 text-primary" />
                        <span className="font-medium text-sm">
                          {formData.name || selectedMultiChatProvider} selected
                        </span>
                      </div>
                      <Badge variant="outline" className="text-xs">
                        {selectedType === 'local-ollama' ? 'Local' : 'Cloud'}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {selectedType === 'local-ollama'
                        ? 'Ollama runs locally - no API key required. Make sure Ollama is installed.'
                        : 'Enter your API key below to connect to this provider.'}
                    </p>
                  </div>
                )}

                {/* Available Models Multi-Select */}
                {getAvailableModels().length > 0 && (
                  <div className="space-y-2">
                    <Label>Select Available Models</Label>
                    <Collapsible open={isModelsOpen} onOpenChange={setIsModelsOpen}>
                      <CollapsibleTrigger asChild>
                        <Button variant="outline" className="w-full justify-between">
                          <span className="text-sm">
                            {formData.selectedModels.length === 0
                              ? "Select models..."
                              : `${formData.selectedModels.length} model(s) selected`}
                          </span>
                          <ChevronDown className={`h-4 w-4 transition-transform ${isModelsOpen ? "rotate-180" : ""}`} />
                        </Button>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="mt-2">
                        <div className="border rounded-lg p-2">
                          <ScrollArea className="h-[200px]">
                            <div className="space-y-2">
                              {getAvailableModels().map((model) => (
                                <div
                                  key={model.id}
                                  className="flex items-start space-x-3 p-2 rounded-md hover:bg-accent cursor-pointer"
                                  onClick={() => handleModelToggle(model.id)}
                                >
                                  <Checkbox
                                    checked={formData.selectedModels.includes(model.id)}
                                    onCheckedChange={() => handleModelToggle(model.id)}
                                  />
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium">{model.name}</p>
                                    <p className="text-xs text-muted-foreground">{model.description}</p>
                                    <code className="text-xs text-muted-foreground">{model.id}</code>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </ScrollArea>
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                    {formData.selectedModels.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {formData.selectedModels.map(modelId => {
                          const model = getAvailableModels().find(m => m.id === modelId);
                          return (
                            <Badge key={modelId} variant="secondary" className="text-xs">
                              {model?.name || modelId}
                              <button
                                className="ml-1 hover:text-destructive"
                                onClick={(e) => { e.stopPropagation(); handleModelToggle(modelId); }}
                              >
                                ×
                              </button>
                            </Badge>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* Name */}
                <div className="space-y-2">
                  <Label htmlFor="name">Display Name (Optional)</Label>
                  <Input
                    id="name"
                    placeholder={providerTypeInfo[selectedType].label}
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>

                {/* API Key */}
                {["openai", "anthropic", "google", "custom"].includes(selectedType) && (
                  <div className="space-y-2">
                    <Label htmlFor="apiKey">API Key</Label>
                    <Input
                      id="apiKey"
                      type="password"
                      placeholder="sk-..."
                      value={formData.apiKey}
                      onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })}
                    />
                  </div>
                )}

                {/* Base URL for custom */}
                {selectedType === "custom" && (
                  <div className="space-y-2">
                    <Label htmlFor="baseUrl">Base URL</Label>
                    <Input
                      id="baseUrl"
                      placeholder="https://api.example.com/v1"
                      value={formData.baseUrl}
                      onChange={(e) => setFormData({ ...formData, baseUrl: e.target.value })}
                    />
                  </div>
                )}

                {/* Priority */}
                <div className="space-y-2">
                  <Label htmlFor="priority">Priority (0-100)</Label>
                  <Input
                    id="priority"
                    type="number"
                    min={0}
                    max={100}
                    value={formData.priority}
                    onChange={(e) => setFormData({ ...formData, priority: parseInt(e.target.value) || 50 })}
                  />
                  <p className="text-xs text-muted-foreground">
                    Higher priority providers are preferred for routing
                  </p>
                </div>

                {/* Enabled */}
                <div className="flex items-center justify-between">
                  <Label htmlFor="enabled">Enable Provider</Label>
                  <Switch
                    id="enabled"
                    checked={formData.enabled}
                    onCheckedChange={(checked) => setFormData({ ...formData, enabled: checked })}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
                  Cancel
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Providers</CardTitle>
            <Settings className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{providers?.length || 0}</div>
            <p className="text-xs text-muted-foreground">
              {providers?.filter(p => p.enabled).length || 0} active
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Cloud Providers</CardTitle>
            <Cloud className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{cloudProviders.length}</div>
            <p className="text-xs text-muted-foreground">
              OpenAI, Anthropic, Google
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Local Providers</CardTitle>
            <Server className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{localProviders.length}</div>
            <p className="text-xs text-muted-foreground">
              llama.cpp, Ollama
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Status</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-500">Healthy</div>
            <p className="text-xs text-muted-foreground">
              All systems operational
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Provider Tabs */}
      <Tabs defaultValue="all" className="space-y-4">
        <TabsList>
          <TabsTrigger value="all">All Providers</TabsTrigger>
          <TabsTrigger value="cloud">Cloud</TabsTrigger>
          <TabsTrigger value="local">Local</TabsTrigger>
          <TabsTrigger value="routing">
            <Route className="h-4 w-4 mr-1" />
            Routing
          </TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="space-y-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : providers?.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Settings className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No Providers Configured</h3>
                <p className="text-muted-foreground text-center mb-4">
                  Add your first LLM provider to start using inference
                </p>
                <Button onClick={() => setIsCreateOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Provider
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {providers?.map((provider) => {
                const typeInfo = providerTypeInfo[provider.type as ProviderType] || providerTypeInfo.custom;
                return (
                  <Card key={provider.id} className="relative">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`p-2 rounded-lg ${typeInfo.color}`}>
                            {typeInfo.icon}
                          </div>
                          <div>
                            <CardTitle className="text-base">{provider.name}</CardTitle>
                            <CardDescription>{typeInfo.label}</CardDescription>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {provider.enabled ? (
                            <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/20">
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Active
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-gray-500/10 text-gray-400 border-gray-500/20">
                              <XCircle className="h-3 w-3 mr-1" />
                              Disabled
                            </Badge>
                          )}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Priority</span>
                        <span className="font-medium">{provider.priority ?? 50}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Cost/1k tokens</span>
                        <span className="font-medium">
                          {provider.costPer1kTokens ? `$${provider.costPer1kTokens}` : "N/A"}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 pt-2 border-t">
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1"
                          onClick={() => handleToggleEnabled(provider.id, provider.enabled)}
                        >
                          {provider.enabled ? "Disable" : "Enable"}
                        </Button>
                        <TestProviderButton
                          providerId={provider.id}
                          providerName={provider.name}
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => navigate(`/providers/${provider.id}`)}
                        >
                          <Settings className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => handleDelete(provider.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="cloud" className="space-y-4">
          {cloudProviders.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Cloud className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No Cloud Providers</h3>
                <p className="text-muted-foreground text-center mb-4">
                  Add OpenAI, Anthropic, or Google AI providers
                </p>
                <Button onClick={() => setIsCreateOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Cloud Provider
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {cloudProviders.map((provider) => {
                const typeInfo = providerTypeInfo[provider.type as ProviderType] || providerTypeInfo.custom;
                return (
                  <Card key={provider.id}>
                    <CardHeader className="pb-3">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${typeInfo.color}`}>
                          {typeInfo.icon}
                        </div>
                        <div>
                          <CardTitle className="text-base">{provider.name}</CardTitle>
                          <CardDescription>{typeInfo.description}</CardDescription>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1"
                          onClick={() => handleToggleEnabled(provider.id, provider.enabled)}
                        >
                          {provider.enabled ? "Disable" : "Enable"}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => navigate(`/providers/${provider.id}`)}
                        >
                          <Settings className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => handleDelete(provider.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="local" className="space-y-4">
          {localProviders.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Server className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No Local Providers</h3>
                <p className="text-muted-foreground text-center mb-4">
                  Add a local provider to run models with Ollama or llama.cpp
                </p>
                <Button onClick={() => setIsCreateOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Local Provider
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {localProviders.map((provider) => {
                const typeInfo = providerTypeInfo[provider.type as ProviderType] || providerTypeInfo.custom;
                return (
                  <Card key={provider.id}>
                    <CardHeader className="pb-3">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${typeInfo.color}`}>
                          {typeInfo.icon}
                        </div>
                        <div>
                          <CardTitle className="text-base">{provider.name}</CardTitle>
                          <CardDescription>{typeInfo.description}</CardDescription>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1"
                          onClick={() => handleToggleEnabled(provider.id, provider.enabled)}
                        >
                          {provider.enabled ? "Disable" : "Enable"}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => navigate(`/providers/${provider.id}`)}
                        >
                          <Settings className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => handleDelete(provider.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="routing" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ClipboardList className="h-5 w-5" />
                Routing Audit Log
              </CardTitle>
              <CardDescription>
                Monitor provider routing decisions and fallback events
              </CardDescription>
            </CardHeader>
            <CardContent>
              <RoutingAuditViewer workspaceId={1} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
