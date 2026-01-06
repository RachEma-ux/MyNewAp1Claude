import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { ArrowLeft, Save, Trash2, CheckCircle, XCircle, Cloud, Server, Loader2, RefreshCw, Zap } from "lucide-react";

// Model options for each provider type
const providerModels: Record<string, { value: string; label: string; description: string }[]> = {
  openai: [
    { value: "gpt-4o", label: "GPT-4o", description: "Most capable, multimodal flagship model" },
    { value: "gpt-4o-mini", label: "GPT-4o Mini", description: "Affordable and intelligent small model" },
    { value: "gpt-4-turbo", label: "GPT-4 Turbo", description: "Previous generation flagship" },
    { value: "gpt-4", label: "GPT-4", description: "Original GPT-4 model" },
    { value: "gpt-3.5-turbo", label: "GPT-3.5 Turbo", description: "Fast and affordable" },
  ],
  anthropic: [
    { value: "claude-3-5-sonnet-20241022", label: "Claude 3.5 Sonnet", description: "Most intelligent model" },
    { value: "claude-3-5-haiku-20241022", label: "Claude 3.5 Haiku", description: "Fastest model" },
    { value: "claude-3-opus-20240229", label: "Claude 3 Opus", description: "Powerful model for complex tasks" },
    { value: "claude-3-sonnet-20240229", label: "Claude 3 Sonnet", description: "Balanced performance" },
    { value: "claude-3-haiku-20240307", label: "Claude 3 Haiku", description: "Fast and compact" },
  ],
  google: [
    { value: "gemini-2.0-flash-exp", label: "Gemini 2.0 Flash", description: "Experimental next-gen model" },
    { value: "gemini-1.5-pro", label: "Gemini 1.5 Pro", description: "Most capable model" },
    { value: "gemini-1.5-flash", label: "Gemini 1.5 Flash", description: "Fast and versatile" },
    { value: "gemini-1.5-flash-8b", label: "Gemini 1.5 Flash-8B", description: "High volume, lower intelligence" },
  ],
  "local-llamacpp": [
    { value: "custom", label: "Custom Model", description: "Specify GGUF model path" },
  ],
  "local-ollama": [
    { value: "llama3.2", label: "Llama 3.2", description: "Meta's latest model" },
    { value: "mistral", label: "Mistral", description: "Mistral AI model" },
    { value: "codellama", label: "Code Llama", description: "Specialized for code" },
  ],
};

export default function ProviderDetail() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const providerId = params?.id ? parseInt(params.id) : null;

  const [formData, setFormData] = useState({
    name: "",
    enabled: true,
    priority: 50,
    apiKey: "",
    baseUrl: "",
    defaultModel: "",
    maxTokens: 4096,
    temperature: 0.7,
  });

  const { data: providers } = trpc.providers.list.useQuery();
  const provider = providers?.find(p => p.id === providerId);

  const updateProvider = trpc.providers.update.useMutation({
    onSuccess: () => {
      toast.success("Provider updated successfully");
      navigate("/providers");
    },
    onError: (error) => {
      toast.error(`Failed to update provider: ${error.message}`);
    },
  });

  const deleteProvider = trpc.providers.delete.useMutation({
    onSuccess: () => {
      toast.success("Provider deleted");
      navigate("/providers");
    },
    onError: (error) => {
      toast.error(`Failed to delete provider: ${error.message}`);
    },
  });

  const testProvider = trpc.chat.testProvider.useMutation({
    onSuccess: (result) => {
      if (result.success) {
        toast.success(result.message);
      } else {
        toast.error(result.message);
      }
    },
    onError: (error) => {
      toast.error(`Test failed: ${error.message}`);
    },
  });

  useEffect(() => {
    if (provider) {
      const config = provider.config as Record<string, unknown>;
      setFormData({
        name: provider.name,
        enabled: provider.enabled ?? true,
        priority: provider.priority ?? 50,
        apiKey: (config.apiKey as string) || "",
        baseUrl: (config.baseURL as string) || "",
        defaultModel: (config.defaultModel as string) || "",
        maxTokens: (config.maxTokens as number) || 4096,
        temperature: (config.temperature as number) || 0.7,
      });
    }
  }, [provider]);

  if (!providerId || !provider) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-2">Provider Not Found</h2>
          <p className="text-muted-foreground mb-4">The requested provider does not exist</p>
          <Button onClick={() => navigate("/providers")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Providers
          </Button>
        </div>
      </div>
    );
  }

  const handleSave = () => {
    const config: Record<string, unknown> = {
      apiKey: formData.apiKey,
      defaultModel: formData.defaultModel,
      maxTokens: formData.maxTokens,
      temperature: formData.temperature,
    };

    if (formData.baseUrl) {
      config.baseURL = formData.baseUrl;
    }

    updateProvider.mutate({
      id: providerId,
      name: formData.name,
      enabled: formData.enabled,
      priority: formData.priority,
      config,
    });
  };

  const handleDelete = () => {
    if (confirm("Are you sure you want to delete this provider? This action cannot be undone.")) {
      deleteProvider.mutate({ id: providerId });
    }
  };

  const availableModels = providerModels[provider.type] || [];
  const providerTypeLabels: Record<string, string> = {
    openai: "OpenAI",
    anthropic: "Anthropic",
    google: "Google AI",
    "local-llamacpp": "llama.cpp",
    "local-ollama": "Ollama",
    custom: "Custom",
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/providers")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{provider.name}</h1>
            <p className="text-muted-foreground mt-1">
              {providerTypeLabels[provider.type]} Provider Configuration
            </p>
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

      <Tabs defaultValue="general" className="space-y-4">
        <TabsList>
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="models">Models</TabsTrigger>
          <TabsTrigger value="advanced">Advanced</TabsTrigger>
        </TabsList>

        {/* General Settings */}
        <TabsContent value="general" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Basic Configuration</CardTitle>
              <CardDescription>Configure provider name, status, and priority</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Display Name</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>

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
                  Higher priority providers are preferred when routing requests
                </p>
              </div>

              <div className="flex items-center justify-between py-2">
                <div>
                  <Label htmlFor="enabled">Enable Provider</Label>
                  <p className="text-xs text-muted-foreground">
                    Disabled providers will not be used for inference
                  </p>
                </div>
                <Switch
                  id="enabled"
                  checked={formData.enabled}
                  onCheckedChange={(checked) => setFormData({ ...formData, enabled: checked })}
                />
              </div>

              <div className="pt-4 border-t">
                <Button
                  variant="outline"
                  onClick={() => testProvider.mutate({ providerId })}
                  disabled={testProvider.isPending}
                  className="w-full"
                >
                  {testProvider.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Zap className="h-4 w-4 mr-2" />
                  )}
                  Test Connection
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* API Configuration */}
          {["openai", "anthropic", "google", "custom"].includes(provider.type) && (
            <Card>
              <CardHeader>
                <CardTitle>API Configuration</CardTitle>
                <CardDescription>Configure API credentials and endpoints</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="apiKey">API Key</Label>
                  <Input
                    id="apiKey"
                    type="password"
                    value={formData.apiKey}
                    onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })}
                    placeholder="sk-..."
                  />
                </div>

                {provider.type === "custom" && (
                  <div className="space-y-2">
                    <Label htmlFor="baseUrl">Base URL</Label>
                    <Input
                      id="baseUrl"
                      value={formData.baseUrl}
                      onChange={(e) => setFormData({ ...formData, baseUrl: e.target.value })}
                      placeholder="https://api.example.com/v1"
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Model Configuration */}
        <TabsContent value="models" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Model Selection</CardTitle>
              <CardDescription>Choose the default model for this provider</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="defaultModel">Default Model</Label>
                <Select
                  value={formData.defaultModel}
                  onValueChange={(value) => setFormData({ ...formData, defaultModel: value })}
                >
                  <SelectTrigger id="defaultModel">
                    <SelectValue placeholder="Select a model" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableModels.map((model) => (
                      <SelectItem key={model.value} value={model.value}>
                        <div className="flex flex-col">
                          <span className="font-medium">{model.label}</span>
                          <span className="text-xs text-muted-foreground">{model.description}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {formData.defaultModel && (
                <div className="p-4 bg-muted rounded-lg">
                  <h4 className="font-medium mb-2">Selected Model</h4>
                  <p className="text-sm text-muted-foreground">
                    {availableModels.find(m => m.value === formData.defaultModel)?.description}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Model Parameters</CardTitle>
              <CardDescription>Configure default generation parameters</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="maxTokens">Max Tokens</Label>
                <Input
                  id="maxTokens"
                  type="number"
                  min={1}
                  max={128000}
                  value={formData.maxTokens}
                  onChange={(e) => setFormData({ ...formData, maxTokens: parseInt(e.target.value) || 4096 })}
                />
                <p className="text-xs text-muted-foreground">
                  Maximum number of tokens to generate
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="temperature">Temperature: {formData.temperature}</Label>
                <input
                  id="temperature"
                  type="range"
                  min="0"
                  max="2"
                  step="0.1"
                  value={formData.temperature}
                  onChange={(e) => setFormData({ ...formData, temperature: parseFloat(e.target.value) })}
                  className="w-full"
                />
                <p className="text-xs text-muted-foreground">
                  Controls randomness: 0 is focused, 2 is very creative
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Advanced Settings */}
        <TabsContent value="advanced" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Provider Information</CardTitle>
              <CardDescription>Read-only provider details</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between py-2 border-b">
                <span className="text-sm font-medium">Provider ID</span>
                <span className="text-sm text-muted-foreground">{provider.id}</span>
              </div>
              <div className="flex justify-between py-2 border-b">
                <span className="text-sm font-medium">Provider Type</span>
                <span className="text-sm text-muted-foreground">{providerTypeLabels[provider.type]}</span>
              </div>
              <div className="flex justify-between py-2 border-b">
                <span className="text-sm font-medium">Created At</span>
                <span className="text-sm text-muted-foreground">
                  {new Date(provider.createdAt).toLocaleDateString()}
                </span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-sm font-medium">Last Updated</span>
                <span className="text-sm text-muted-foreground">
                  {new Date(provider.updatedAt).toLocaleDateString()}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card className="border-destructive">
            <CardHeader>
              <CardTitle className="text-destructive">Danger Zone</CardTitle>
              <CardDescription>Irreversible actions</CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                variant="destructive"
                onClick={handleDelete}
                disabled={deleteProvider.isPending}
              >
                {deleteProvider.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                <Trash2 className="h-4 w-4 mr-2" />
                Delete Provider
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Action Buttons */}
      <div className="flex items-center justify-between pt-4 border-t">
        <Button variant="outline" onClick={() => navigate("/providers")}>
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={updateProvider.isPending}>
          {updateProvider.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          <Save className="h-4 w-4 mr-2" />
          Save Changes
        </Button>
      </div>
    </div>
  );
}
