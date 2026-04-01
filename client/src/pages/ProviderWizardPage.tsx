import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  Cloud,
  Server,
  Brain,
  Key,
  Plug,
  CheckCircle2,
  XCircle,
  ArrowLeft,
  ArrowRight,
  Loader2,
  Shield,
  Zap,
  Eye,
  EyeOff,
  Sparkles,
} from "lucide-react";

const PROVIDER_TYPES = [
  { value: "openai" as const, label: "OpenAI", icon: Brain, description: "GPT-4, GPT-3.5, DALL-E, Whisper", kind: "cloud" },
  { value: "anthropic" as const, label: "Anthropic", icon: Brain, description: "Claude 3.5, Claude 3, Claude 2", kind: "cloud" },
  { value: "google" as const, label: "Google", icon: Cloud, description: "Gemini Pro, Gemini Ultra, PaLM", kind: "cloud" },
  { value: "groq" as const, label: "Groq", icon: Zap, description: "LLaMA, Mixtral — ultra-fast inference", kind: "cloud" },
  { value: "local-ollama" as const, label: "Ollama", icon: Server, description: "Local models via Ollama runtime", kind: "local" },
  { value: "local-llamacpp" as const, label: "llama.cpp", icon: Server, description: "Local GGUF model inference", kind: "local" },
  { value: "custom" as const, label: "Custom", icon: Plug, description: "OpenAI-compatible endpoint", kind: "cloud" },
] as const;

type ProviderTypeValue = typeof PROVIDER_TYPES[number]["value"];

const STEPS = [
  { id: 1, label: "Provider Type" },
  { id: 2, label: "Identity" },
  { id: 3, label: "Endpoint" },
  { id: 4, label: "Authentication" },
  { id: 5, label: "Connection Test" },
  { id: 6, label: "Review & Create" },
];

const DEFAULT_URLS: Record<string, string> = {
  openai: "https://api.openai.com/v1",
  anthropic: "https://api.anthropic.com",
  google: "https://generativelanguage.googleapis.com",
  groq: "https://api.groq.com/openai/v1",
  "local-ollama": "http://localhost:11434",
  "local-llamacpp": "http://localhost:8080",
  custom: "",
};

export default function ProviderWizardPage() {
  const [, navigate] = useLocation();
  const [step, setStep] = useState(1);

  // Form state
  const [providerType, setProviderType] = useState<ProviderTypeValue | "">("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);

  // Test state
  const [testResult, setTestResult] = useState<{
    success: boolean;
    error?: string;
    results?: {
      health: { passed: boolean; message: string; latencyMs: number };
      capabilities: { passed: boolean; data: any; message: string };
      models: { passed: boolean; models: string[]; message: string };
    };
    errors?: string[];
  } | null>(null);
  const [testing, setTesting] = useState(false);

  const createMutation = trpc.providers.create.useMutation({
    onSuccess: (provider) => {
      toast.success(`Provider "${provider.name}" created successfully`);
      navigate("/providers");
    },
    onError: (err) => toast.error(`Failed to create provider: ${err.message}`),
  });

  const isLocalProvider = providerType === "local-ollama" || providerType === "local-llamacpp";

  const handleTypeSelect = (type: ProviderTypeValue) => {
    setProviderType(type);
    setBaseUrl(DEFAULT_URLS[type] || "");
    const meta = PROVIDER_TYPES.find((t) => t.value === type);
    if (meta && !name) {
      setName(meta.label);
    }
  };

  const validateMutation = trpc.providers.validateConfig.useMutation({
    onSuccess: (data) => {
      setTestResult(data);
      if (data.success) {
        toast.success("Provider validated — all checks passed");
      } else {
        toast.error("Validation failed — see details below");
      }
    },
    onError: (err) => {
      setTestResult({ success: false, error: err.message });
      toast.error(`Validation error: ${err.message}`);
    },
    onSettled: () => setTesting(false),
  });

  const handleTest = () => {
    if (!providerType || !baseUrl.trim()) return;
    setTesting(true);
    setTestResult(null);
    validateMutation.mutate({
      type: providerType,
      baseUrl: baseUrl.trim(),
      ...(apiKey && !isLocalProvider ? { apiKey } : {}),
    });
  };

  const handleCreate = () => {
    if (!providerType || !name) return;
    const config: Record<string, unknown> = { baseUrl };
    if (apiKey) config.apiKey = apiKey;
    if (description) config.description = description;

    createMutation.mutate({
      name,
      type: providerType,
      enabled: true,
      priority: 50,
      config,
    });
  };

  const canNext = () => {
    switch (step) {
      case 1: return !!providerType;
      case 2: return name.trim().length > 0;
      case 3: return baseUrl.trim().length > 0;
      case 4: return isLocalProvider || apiKey.trim().length > 0;
      case 5: return testResult?.success === true;
      default: return true;
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate("/providers")}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Register Provider</h1>
          <p className="text-muted-foreground text-sm">Configure a new LLM provider connection</p>
        </div>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-1 overflow-x-auto pb-2">
        {STEPS.map((s) => (
          <div key={s.id} className="flex items-center gap-1 shrink-0">
            <Badge
              variant={step === s.id ? "default" : step > s.id ? "secondary" : "outline"}
              className={`text-xs cursor-pointer ${step > s.id ? "bg-green-500/10 text-green-500 border-green-500/20" : ""}`}
              onClick={() => { if (s.id < step) setStep(s.id); }}
            >
              {step > s.id ? <CheckCircle2 className="h-3 w-3 mr-1" /> : null}
              {s.id}. {s.label}
            </Badge>
            {s.id < STEPS.length && <span className="text-muted-foreground text-xs">/</span>}
          </div>
        ))}
      </div>

      {/* Step content */}
      <Card>
        <CardContent className="pt-6 space-y-4">

          {/* Step 1: Provider Type */}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold">Select Provider Type</h2>
                <p className="text-muted-foreground text-sm">Choose the LLM provider you want to connect</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {PROVIDER_TYPES.map((pt) => (
                  <Card
                    key={pt.value}
                    className={`cursor-pointer transition-all ${providerType === pt.value ? "border-primary ring-1 ring-primary" : "hover:border-muted-foreground/30"}`}
                    onClick={() => handleTypeSelect(pt.value)}
                  >
                    <CardHeader className="p-4 space-y-1">
                      <div className="flex items-center gap-2">
                        <pt.icon className="h-5 w-5 text-primary" />
                        <CardTitle className="text-sm">{pt.label}</CardTitle>
                        <Badge variant="outline" className="text-xs ml-auto">{pt.kind}</Badge>
                      </div>
                      <CardDescription className="text-xs">{pt.description}</CardDescription>
                    </CardHeader>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Step 2: Identity */}
          {step === 2 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold">Provider Identity</h2>
                <p className="text-muted-foreground text-sm">Give this provider a name and optional description</p>
              </div>
              <div className="space-y-3">
                <div>
                  <Label htmlFor="name">Provider Name</Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. My OpenAI Production"
                  />
                </div>
                <div>
                  <Label htmlFor="desc">Description (optional)</Label>
                  <Textarea
                    id="desc"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="What this provider is used for..."
                    rows={3}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Endpoint */}
          {step === 3 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold">Endpoint Configuration</h2>
                <p className="text-muted-foreground text-sm">Set the base URL for this provider's API</p>
              </div>
              <div>
                <Label htmlFor="url">Base URL</Label>
                <Input
                  id="url"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="https://api.example.com/v1"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {isLocalProvider ? "Local provider — ensure the server is running" : "Cloud API endpoint"}
                </p>
              </div>
            </div>
          )}

          {/* Step 4: Authentication */}
          {step === 4 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold">Authentication</h2>
                <p className="text-muted-foreground text-sm">
                  {isLocalProvider ? "Local providers typically don't require an API key" : "Enter your API key for this provider"}
                </p>
              </div>
              {isLocalProvider ? (
                <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg">
                  <Shield className="h-5 w-5 text-green-500" />
                  <span className="text-sm">No API key required for local providers. You can skip this step.</span>
                </div>
              ) : (
                <div>
                  <Label htmlFor="apikey">API Key</Label>
                  <div className="relative">
                    <Input
                      id="apikey"
                      type={showKey ? "text" : "password"}
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder="sk-..."
                      className="pr-10"
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
                      onClick={() => setShowKey(!showKey)}
                    >
                      {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    <Key className="h-3 w-3 inline mr-1" />
                    Keys are encrypted at rest and never exposed after save
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Step 5: Connection Test */}
          {step === 5 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold">Server Validation</h2>
                <p className="text-muted-foreground text-sm">Backend validates health, capabilities, and model discovery</p>
              </div>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <span className="text-muted-foreground">Type:</span>{" "}
                    <span className="font-medium">{PROVIDER_TYPES.find((t) => t.value === providerType)?.label}</span>
                  </div>
                  <div className="p-3 bg-muted/50 rounded-lg truncate">
                    <span className="text-muted-foreground">URL:</span>{" "}
                    <span className="font-medium">{baseUrl}</span>
                  </div>
                </div>
                <Button onClick={handleTest} disabled={testing} className="w-full">
                  {testing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Shield className="h-4 w-4 mr-2" />}
                  {testing ? "Validating..." : "Run Server Validation"}
                </Button>

                {/* Structured results */}
                {testResult?.results && (
                  <div className="space-y-2">
                    {/* Health */}
                    <div className={`flex items-start gap-2 p-3 rounded-lg text-sm ${testResult.results.health.passed ? "bg-green-500/10" : "bg-red-500/10"}`}>
                      {testResult.results.health.passed ? <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 shrink-0" /> : <XCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />}
                      <div>
                        <span className="font-medium">Health Check</span>
                        <span className="text-muted-foreground ml-2">({testResult.results.health.latencyMs}ms)</span>
                        <p className="text-xs text-muted-foreground mt-0.5">{testResult.results.health.message}</p>
                      </div>
                    </div>
                    {/* Capabilities */}
                    <div className={`flex items-start gap-2 p-3 rounded-lg text-sm ${testResult.results.capabilities.passed ? "bg-green-500/10" : "bg-red-500/10"}`}>
                      {testResult.results.capabilities.passed ? <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 shrink-0" /> : <XCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />}
                      <div>
                        <span className="font-medium">Capabilities</span>
                        <p className="text-xs text-muted-foreground mt-0.5">{testResult.results.capabilities.message}</p>
                      </div>
                    </div>
                    {/* Models */}
                    <div className={`flex items-start gap-2 p-3 rounded-lg text-sm ${testResult.results.models.passed ? "bg-green-500/10" : "bg-amber-500/10"}`}>
                      {testResult.results.models.passed ? <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 shrink-0" /> : <XCircle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />}
                      <div>
                        <span className="font-medium">Models</span>
                        <p className="text-xs text-muted-foreground mt-0.5">{testResult.results.models.message}</p>
                        {testResult.results.models.models.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {testResult.results.models.models.slice(0, 8).map((m) => (
                              <Badge key={m} variant="outline" className="text-xs">{m}</Badge>
                            ))}
                            {testResult.results.models.models.length > 8 && (
                              <Badge variant="outline" className="text-xs">+{testResult.results.models.models.length - 8} more</Badge>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Overall result */}
                {testResult && !testResult.results && (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 text-red-500">
                    <XCircle className="h-5 w-5 shrink-0" />
                    <span className="text-sm font-medium">{testResult.error || "Validation failed"}</span>
                  </div>
                )}

                {/* Error details */}
                {testResult?.errors && testResult.errors.length > 0 && !testResult.success && (
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <p className="text-xs font-medium text-muted-foreground mb-1">Issues found:</p>
                    <ul className="text-xs text-muted-foreground space-y-0.5">
                      {testResult.errors.map((e, i) => (
                        <li key={i}>- {e}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Step 6: Review & Create */}
          {step === 6 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold">Review & Create</h2>
                <p className="text-muted-foreground text-sm">Confirm your provider configuration</p>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between py-2 border-b">
                  <span className="text-muted-foreground text-sm">Provider Type</span>
                  <Badge variant="secondary">{PROVIDER_TYPES.find((t) => t.value === providerType)?.label}</Badge>
                </div>
                <div className="flex justify-between py-2 border-b">
                  <span className="text-muted-foreground text-sm">Name</span>
                  <span className="text-sm font-medium">{name}</span>
                </div>
                <div className="flex justify-between py-2 border-b">
                  <span className="text-muted-foreground text-sm">Base URL</span>
                  <span className="text-sm font-mono truncate max-w-[200px]">{baseUrl}</span>
                </div>
                <div className="flex justify-between py-2 border-b">
                  <span className="text-muted-foreground text-sm">API Key</span>
                  <span className="text-sm">{isLocalProvider ? "N/A" : apiKey ? "••••" + apiKey.slice(-4) : "Not set"}</span>
                </div>
                <div className="flex justify-between py-2 border-b">
                  <span className="text-muted-foreground text-sm">Kind</span>
                  <Badge variant="outline">{isLocalProvider ? "local" : "cloud"}</Badge>
                </div>
                {description && (
                  <div className="flex justify-between py-2 border-b">
                    <span className="text-muted-foreground text-sm">Description</span>
                    <span className="text-sm max-w-[200px] truncate">{description}</span>
                  </div>
                )}
              </div>
              <Button onClick={handleCreate} disabled={createMutation.isPending} className="w-full">
                {createMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Sparkles className="h-4 w-4 mr-2" />
                )}
                {createMutation.isPending ? "Creating..." : "Create Provider"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Navigation */}
      <div className="flex justify-between">
        <Button
          variant="outline"
          onClick={() => setStep(Math.max(1, step - 1))}
          disabled={step === 1}
        >
          <ArrowLeft className="h-4 w-4 mr-1" /> Previous
        </Button>
        {step < STEPS.length ? (
          <Button
            onClick={() => setStep(Math.min(STEPS.length, step + 1))}
            disabled={!canNext()}
          >
            Next <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
        ) : null}
      </div>
    </div>
  );
}
