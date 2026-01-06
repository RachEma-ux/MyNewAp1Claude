import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Key, CheckCircle, XCircle, Loader2, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";

interface ProviderConfig {
  id: string;
  name: string;
  apiKeyLabel: string;
  placeholder: string;
  description: string;
}

const providerConfigs: ProviderConfig[] = [
  {
    id: "openai",
    name: "OpenAI",
    apiKeyLabel: "OpenAI API Key",
    placeholder: "sk-...",
    description: "Used for GPT-4, GPT-3.5, and embeddings",
  },
  {
    id: "anthropic",
    name: "Anthropic",
    apiKeyLabel: "Anthropic API Key",
    placeholder: "sk-ant-...",
    description: "Used for Claude models",
  },
  {
    id: "google",
    name: "Google AI",
    apiKeyLabel: "Google AI API Key",
    placeholder: "AIza...",
    description: "Used for Gemini models",
  },
];

export default function Settings() {
  const { user } = useAuth();
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({});
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [testingProvider, setTestingProvider] = useState<string | null>(null);

  const { data: providers } = trpc.providers.list.useQuery();
  const updateProviderMutation = trpc.providers.update.useMutation();
  const testConnectionMutation = trpc.providers.testConnection.useMutation();

  const handleApiKeyChange = (providerId: string, value: string) => {
    setApiKeys((prev) => ({ ...prev, [providerId]: value }));
  };

  const toggleShowKey = (providerId: string) => {
    setShowKeys((prev) => ({ ...prev, [providerId]: !prev[providerId] }));
  };

  const handleSaveApiKey = async (providerId: string) => {
    const apiKey = apiKeys[providerId];
    if (!apiKey || apiKey.trim() === "") {
      toast.error("Please enter an API key");
      return;
    }

    try {
      // Find provider in database
      const provider = providers?.find((p) => p.type === providerId);
      if (!provider) {
        toast.error("Provider not found");
        return;
      }

      // Update provider configuration
      await updateProviderMutation.mutateAsync({
        id: provider.id,
        config: {
          apiKey,
        },
      });

      toast.success(`${providerConfigs.find((c) => c.id === providerId)?.name} API key saved`);
      
      // Clear the input field
      setApiKeys((prev) => ({ ...prev, [providerId]: "" }));
    } catch (error: any) {
      toast.error(`Failed to save API key: ${error.message}`);
    }
  };

  const handleTestConnection = async (providerId: string) => {
    try {
      setTestingProvider(providerId);
      
      // Find provider in database
      const provider = providers?.find((p) => p.type === providerId);
      if (!provider) {
        toast.error("Provider not found. Please save API key first.");
        return;
      }

      const result = await testConnectionMutation.mutateAsync({
        providerId: provider.id,
      });

      if (result.success) {
        toast.success(`✅ ${providerConfigs.find((c) => c.id === providerId)?.name} connection successful`);
      } else {
        toast.error(`❌ Connection failed: ${result.error}`);
      }
    } catch (error: any) {
      toast.error(`Connection test failed: ${error.message}`);
    } finally {
      setTestingProvider(null);
    }
  };

  const getProviderStatus = (providerId: string) => {
    const provider = providers?.find((p) => p.type === providerId);
    if (!provider) return null;

    const hasApiKey = provider.config && (provider.config as any).apiKey;
    return hasApiKey ? "configured" : "not_configured";
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-2">
          Manage your account and application preferences
        </p>
      </div>

      <Tabs defaultValue="api-keys" className="space-y-4">
        <TabsList>
          <TabsTrigger value="api-keys">API Keys</TabsTrigger>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="system">System</TabsTrigger>
        </TabsList>

        <TabsContent value="api-keys" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Key className="h-5 w-5" />
                Provider API Keys
              </CardTitle>
              <CardDescription>
                Configure API keys for AI providers. Keys are encrypted and stored securely.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {providerConfigs.map((config) => {
                const status = getProviderStatus(config.id);
                const isTesting = testingProvider === config.id;

                return (
                  <div key={config.id} className="space-y-3 pb-6 border-b last:border-b-0 last:pb-0">
                    <div className="flex items-center justify-between">
                      <div>
                        <Label htmlFor={`${config.id}-key`} className="text-base font-semibold">
                          {config.name}
                        </Label>
                        <p className="text-sm text-muted-foreground">{config.description}</p>
                      </div>
                      {status === "configured" ? (
                        <Badge variant="default" className="gap-1">
                          <CheckCircle className="h-3 w-3" />
                          Configured
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="gap-1">
                          <XCircle className="h-3 w-3" />
                          Not Configured
                        </Badge>
                      )}
                    </div>

                    <div className="flex gap-2">
                      <div className="flex-1 relative">
                        <Input
                          id={`${config.id}-key`}
                          type={showKeys[config.id] ? "text" : "password"}
                          placeholder={config.placeholder}
                          value={apiKeys[config.id] || ""}
                          onChange={(e) => handleApiKeyChange(config.id, e.target.value)}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="absolute right-0 top-0 h-full px-3"
                          onClick={() => toggleShowKey(config.id)}
                        >
                          {showKeys[config.id] ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                      <Button
                        onClick={() => handleSaveApiKey(config.id)}
                        disabled={updateProviderMutation.isPending}
                      >
                        {updateProviderMutation.isPending ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Saving...
                          </>
                        ) : (
                          "Save"
                        )}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => handleTestConnection(config.id)}
                        disabled={isTesting || status !== "configured"}
                      >
                        {isTesting ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Testing...
                          </>
                        ) : (
                          "Test"
                        )}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="profile" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Profile Information</CardTitle>
              <CardDescription>
                Update your account details and preferences
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input id="name" defaultValue={user?.name || ""} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" defaultValue={user?.email || ""} disabled />
              </div>
              <Button>Save Changes</Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="system" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>System Configuration</CardTitle>
              <CardDescription>
                Configure inference engines and hardware acceleration
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Inference Backend</Label>
                <p className="text-sm text-muted-foreground">
                  Backend selection will be available in the next phase
                </p>
              </div>
              <div className="space-y-2">
                <Label>GPU Acceleration</Label>
                <p className="text-sm text-muted-foreground">
                  Automatic detection and configuration coming soon
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>


      </Tabs>
    </div>
  );
}
