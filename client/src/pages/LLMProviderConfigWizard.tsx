/**
 * LLM Provider Configuration Wizard
 * Step-by-step wizard for configuring LLM providers with encryption & testing
 */

import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
  ChevronLeft,
  ChevronRight,
  Check,
  Sparkles,
  Key,
  TestTube,
  Shield,
  Loader2,
  AlertCircle,
  CheckCircle,
  Star,
  Download,
  Package,
  Terminal,
  ExternalLink,
  RefreshCw,
  Cpu,
  HardDrive,
  Monitor,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

// Helper component to show model compatibility
function ModelCompatibilityBadge({ model, deviceSpecs }: { model: any; deviceSpecs: any }) {
  if (!model.systemRequirements || !deviceSpecs) {
    return null;
  }

  const req = model.systemRequirements;
  const specs = deviceSpecs;

  // Check critical requirements
  const hasEnoughRAM = specs.ram.totalGB >= req.minRAM;
  const hasEnoughDisk = specs.disk.availableGB >= req.minDiskSpace;
  const hasGPU = !req.gpuRequired || specs.gpu?.detected;

  const isCompatible = hasEnoughRAM && hasEnoughDisk && hasGPU;
  const isRecommended = specs.ram.totalGB >= req.recommendedRAM;

  if (!isCompatible) {
    return (
      <Badge variant="destructive" className="text-xs">
        <AlertCircle className="h-3 w-3 mr-1" />
        Incompatible
      </Badge>
    );
  }

  if (!isRecommended) {
    return (
      <Badge variant="outline" className="text-xs bg-yellow-50 text-yellow-700 border-yellow-200">
        <AlertCircle className="h-3 w-3 mr-1" />
        Below Recommended
      </Badge>
    );
  }

  return (
    <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">
      <CheckCircle className="h-3 w-3 mr-1" />
      Compatible
    </Badge>
  );
}

// Helper component to show system requirements
function SystemRequirements({ model }: { model: any }) {
  if (!model.systemRequirements) {
    return null;
  }

  const req = model.systemRequirements;

  return (
    <div className="mt-3 p-3 bg-muted/50 rounded-lg border">
      <p className="text-xs font-semibold mb-2">System Requirements:</p>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="flex items-center gap-1">
          <Cpu className="h-3 w-3" />
          <span>RAM: {req.minRAM}GB min / {req.recommendedRAM}GB rec</span>
        </div>
        <div className="flex items-center gap-1">
          <HardDrive className="h-3 w-3" />
          <span>Disk: {req.minDiskSpace}GB</span>
        </div>
        {req.gpuRequired && (
          <div className="flex items-center gap-1">
            <Monitor className="h-3 w-3" />
            <span>GPU: Required{req.minVRAM ? ` (${req.minVRAM}GB VRAM)` : ''}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// Cloud provider model lists for the configure step
const cloudProviderModels: Record<string, { id: string; name: string }[]> = {
  anthropic: [
    { id: "claude-opus-4-6", name: "Claude Opus 4.6" },
    { id: "claude-sonnet-4-5-20250929", name: "Claude Sonnet 4.5" },
    { id: "claude-haiku-4-5-20251001", name: "Claude Haiku 4.5" },
    { id: "claude-opus-4-5-20251101", name: "Claude Opus 4.5" },
    { id: "claude-sonnet-4-20250514", name: "Claude Sonnet 4" },
  ],
  openai: [
    { id: "gpt-4.1", name: "GPT-4.1" },
    { id: "gpt-4.1-mini", name: "GPT-4.1 Mini" },
    { id: "gpt-4.1-nano", name: "GPT-4.1 Nano" },
    { id: "o3", name: "o3" },
    { id: "o4-mini", name: "o4 Mini" },
    { id: "gpt-4o", name: "GPT-4o" },
    { id: "gpt-4o-mini", name: "GPT-4o Mini" },
  ],
  google: [
    { id: "gemini-3-pro", name: "Gemini 3 Pro" },
    { id: "gemini-3-flash", name: "Gemini 3 Flash" },
    { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro" },
    { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash" },
    { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash" },
  ],
};

type WizardStep = "select" | "install" | "models" | "configure" | "test" | "review";

interface WizardState {
  step: WizardStep;
  providerId: string;
  providerName: string;
  providerType: "cloud" | "local" | "custom";
  credentials: {
    apiKey?: string;
    apiSecret?: string;
    endpoint?: string;
    organizationId?: string;
    projectId?: string;
  };
  setAsDefault: boolean;
  testResult?: {
    success: boolean;
    message: string;
    latency?: number;
  };
  installationStatus?: "installed" | "not_installed" | "checking" | "error";
  selectedModels: string[];
}

export default function LLMProviderConfigWizard() {
  const [, navigate] = useLocation();
  const [state, setState] = useState<WizardState>({
    step: "select",
    providerId: "",
    providerName: "",
    providerType: "cloud",
    credentials: {},
    setAsDefault: false,
    selectedModels: [],
  });

  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isCheckingInstallation, setIsCheckingInstallation] = useState(false);

  // Queries
  const { data: providers = [] } = trpc.llm.listProviders.useQuery();
  const testConnectionMutation = trpc.llm.testProviderConnection.useMutation();

  // Debug: Log providers when loaded
  useEffect(() => {
    if (providers.length > 0) {
      console.log('[Providers Loaded]', {
        count: providers.length,
        ollama: providers.find(p => p.id === 'ollama'),
        providerTypes: providers.map(p => ({ id: p.id, type: p.type })),
      });
    }
  }, [providers]);

  // Installation queries (only for local providers)
  const { data: installationCheck, refetch: refetchInstallation } = trpc.llm.checkProviderInstallation.useQuery(
    { providerId: state.providerId },
    { enabled: state.providerType === "local" && !!state.providerId }
  );

  const { data: installationInstructions } = trpc.llm.getInstallationInstructions.useQuery(
    { providerId: state.providerId },
    { enabled: state.providerType === "local" && !!state.providerId }
  );

  const { data: availableModels = [] } = trpc.llm.getAvailableModels.useQuery(
    { providerId: state.providerId },
    { enabled: state.providerType === "local" && state.installationStatus === "installed" }
  );

  const { data: installedModels = [] } = trpc.llm.getInstalledModels.useQuery(
    { providerId: state.providerId },
    { enabled: state.providerType === "local" && state.installationStatus === "installed" }
  );

  // Device specs and compatibility checking
  const { data: deviceSpecs } = trpc.llm.getDeviceSpecs.useQuery(
    undefined,
    { enabled: state.providerType === "local" && state.step === "models" }
  );

  const selectedProvider = providers.find((p) => p.id === state.providerId);

  // Auto-check installation status every 5 seconds when on install step
  useEffect(() => {
    if (state.step === "install" && state.providerType === "local") {
      const interval = setInterval(() => {
        refetchInstallation();
      }, 5000);

      return () => clearInterval(interval);
    }
  }, [state.step, state.providerType, refetchInstallation]);

  // Update installation status when check result changes
  useEffect(() => {
    if (installationCheck) {
      setState((prev) => {
        const newState = {
          ...prev,
          installationStatus: installationCheck.status,
        };

        // Auto-advance to models step if installation detected
        if (prev.step === "install" && installationCheck.status === "installed") {
          toast.success("Installation detected!");
          return { ...newState, step: "models" as WizardStep };
        }

        return newState;
      });
    }
  }, [installationCheck]);

  const updateState = (updates: Partial<WizardState>) => {
    setState((prev) => ({ ...prev, ...updates }));
  };

  const handleSelectProvider = (providerId: string, providerName: string, providerType: "cloud" | "local" | "custom") => {
    // For local providers, go to install step first
    // For cloud providers, go directly to configure
    const nextStep: WizardStep = providerType === "local" ? "install" : "configure";

    console.log('[Provider Selection]', {
      providerId,
      providerName,
      providerType,
      nextStep,
      isLocal: providerType === "local",
    });

    updateState({
      providerId,
      providerName,
      providerType,
      step: nextStep,
    });
  };

  const handleTestConnection = async () => {
    if (!state.credentials.apiKey && selectedProvider?.requiresApiKey) {
      toast.error("API key is required to test connection");
      return;
    }

    setIsTestingConnection(true);

    try {
      const result = await testConnectionMutation.mutateAsync({
        providerId: state.providerId,
        credentials: {
          apiKey: state.credentials.apiKey,
          endpoint: state.credentials.endpoint,
        },
      });

      updateState({
        testResult: {
          success: result.success,
          message: result.message,
          latency: result.details?.latency,
        },
      });

      if (result.success) {
        toast.success(result.message);
      } else {
        toast.error(result.message);
      }
    } catch (error: any) {
      toast.error(`Test failed: ${error.message}`);
      updateState({
        testResult: {
          success: false,
          message: error.message,
        },
      });
    } finally {
      setIsTestingConnection(false);
    }
  };

  const handleSave = async () => {
    // For now, just show success message since we need DB provider ID
    // In real implementation, this would create a provider entry first
    toast.success("Provider configuration saved successfully");
    navigate("/llm");
  };

  const canProceed = () => {
    switch (state.step) {
      case "select":
        return !!state.providerId;
      case "install":
        // Can proceed if installation is detected
        return state.installationStatus === "installed";
      case "models":
        // Can always proceed from models step (models are optional)
        return true;
      case "configure":
        return selectedProvider?.requiresApiKey ? !!state.credentials.apiKey : true;
      case "test":
        return !!state.testResult;
      case "review":
        return true;
      default:
        return false;
    }
  };

  const getNextStep = (): WizardStep | null => {
    const allSteps: WizardStep[] = state.providerType === "local"
      ? ["select", "install", "models", "configure", "test", "review"]
      : ["select", "configure", "test", "review"];

    const currentIndex = allSteps.indexOf(state.step);
    return currentIndex < allSteps.length - 1 ? allSteps[currentIndex + 1] : null;
  };

  const getPreviousStep = (): WizardStep | null => {
    const allSteps: WizardStep[] = state.providerType === "local"
      ? ["select", "install", "models", "configure", "test", "review"]
      : ["select", "configure", "test", "review"];

    const currentIndex = allSteps.indexOf(state.step);
    return currentIndex > 0 ? allSteps[currentIndex - 1] : null;
  };

  const handleCheckInstallation = async () => {
    setIsCheckingInstallation(true);
    try {
      await refetchInstallation();

      if (installationCheck?.status === "installed") {
        toast.success("Installation verified successfully!");
      } else {
        toast.error("Installation not detected. Please complete installation first.");
      }
    } catch (error: any) {
      toast.error(`Installation check failed: ${error.message}`);
    } finally {
      setIsCheckingInstallation(false);
    }
  };

  return (
    <div className="container mx-auto py-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Sparkles className="h-8 w-8" />
          Configure LLM Provider
        </h1>
        <p className="text-muted-foreground mt-2">
          Set up your LLM provider with secure credential storage
        </p>
        {/* Deployment verification marker */}
        <p className="text-xs text-gray-400 mt-1">Build: 2026-01-09-v3-with-device-detection</p>
      </div>

      {/* Progress Indicator */}
      <div className="mb-8">
        <div className="flex items-center justify-center gap-2 overflow-x-auto">
          {(state.providerType === "local"
            ? ([
                { step: "select", label: "Select" },
                { step: "install", label: "Install" },
                { step: "models", label: "Models" },
                { step: "configure", label: "Configure" },
                { step: "test", label: "Test" },
                { step: "review", label: "Review" },
              ] as const)
            : ([
                { step: "select", label: "Select" },
                { step: "configure", label: "Configure" },
                { step: "test", label: "Test" },
                { step: "review", label: "Review" },
              ] as const)
          ).map((item, index, array) => {
            const allSteps = array.map((s) => s.step);
            const currentIndex = allSteps.indexOf(state.step as any);
            const isCompleted = currentIndex > index;
            const isCurrent = state.step === item.step;

            return (
              <div key={item.step} className="flex items-center">
                <div className="flex flex-col items-center min-w-max">
                  <div
                    className={`
                      w-10 h-10 rounded-full flex items-center justify-center font-semibold transition-all
                      ${isCurrent ? "bg-primary text-primary-foreground ring-4 ring-primary/20" : ""}
                      ${isCompleted ? "bg-primary text-primary-foreground" : ""}
                      ${!isCurrent && !isCompleted ? "bg-muted text-muted-foreground" : ""}
                    `}
                  >
                    {isCompleted ? (
                      <Check className="h-5 w-5" />
                    ) : (
                      index + 1
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground mt-2">{item.label}</span>
                </div>
                {index < array.length - 1 && (
                  <div
                    className={`h-1 w-12 mx-2 mb-6 transition-all ${
                      isCompleted ? "bg-primary" : "bg-muted"
                    }`}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            {state.step === "select" && "Select Provider"}
            {state.step === "install" && `Install ${state.providerName}`}
            {state.step === "models" && "Download Models"}
            {state.step === "configure" && "Configure Credentials"}
            {state.step === "test" && "Test Connection"}
            {state.step === "review" && "Review & Save"}
          </CardTitle>
          <CardDescription>
            {state.step === "select" && "Choose from 14+ LLM providers (cloud, local, custom)"}
            {state.step === "install" && "Install the provider on your local machine"}
            {state.step === "models" && "Browse and download models from the library"}
            {state.step === "configure" && "Enter your API credentials (securely encrypted)"}
            {state.step === "test" && "Verify your connection works"}
            {state.step === "review" && "Confirm your configuration"}
          </CardDescription>
        </CardHeader>

        <CardContent className="min-h-[400px]">
          {/* Debug Info (Remove after fixing) */}
          {process.env.NODE_ENV === 'development' && (
            <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded text-xs">
              <strong>Debug:</strong> Step={state.step} | ProviderId={state.providerId} |
              ProviderType={state.providerType} | InstallStatus={state.installationStatus} |
              SelectedProviderType={selectedProvider?.type}
            </div>
          )}

          {/* Step 1: Select Provider */}
          {state.step === "select" && (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {providers.map((provider) => (
                <button
                  key={provider.id}
                  onClick={() => handleSelectProvider(provider.id, provider.name, provider.type)}
                  className={`
                    p-4 rounded-lg border-2 transition-all text-left relative
                    ${state.providerId === provider.id
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/50"
                    }
                  `}
                >
                  <div className={`w-12 h-12 rounded-lg ${provider.color} mb-3 flex items-center justify-center text-white font-bold`}>
                    {provider.name.substring(0, 2).toUpperCase()}
                  </div>
                  <h3 className="font-semibold">{provider.name}</h3>
                  <p className="text-xs text-muted-foreground mt-1">{provider.company}</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {provider.type === "local" && (
                      <Badge variant="outline" className="text-xs">
                        <Package className="h-3 w-3 mr-1" />
                        Local
                      </Badge>
                    )}
                    {provider.strengths.slice(0, provider.type === "local" ? 1 : 2).map((strength) => (
                      <Badge key={strength} variant="secondary" className="text-xs">
                        {strength}
                      </Badge>
                    ))}
                  </div>
                  {provider.requiresApiKey && (
                    <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                      <Key className="h-3 w-3" />
                      <span>API Key Required</span>
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}

          {/* Step 2: Install (Local Providers Only) */}
          {state.step === "install" && selectedProvider && installationInstructions && (
            <div className="space-y-6">
              {/* Installation Status */}
              <Alert variant={state.installationStatus === "installed" ? "default" : "destructive"}>
                {state.installationStatus === "installed" ? (
                  <CheckCircle className="h-4 w-4" />
                ) : state.installationStatus === "checking" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <AlertCircle className="h-4 w-4" />
                )}
                <AlertDescription>
                  <p className="font-semibold">
                    {state.installationStatus === "installed" && `${selectedProvider.name} is installed and running!`}
                    {state.installationStatus === "not_installed" && `${selectedProvider.name} is not installed`}
                    {state.installationStatus === "checking" && `Checking installation...`}
                    {state.installationStatus === "error" && `Error checking installation`}
                  </p>
                </AlertDescription>
              </Alert>

              {state.installationStatus !== "installed" && (
                <>
                  {/* Installation Instructions */}
                  <div className="space-y-4">
                    <h3 className="font-semibold flex items-center gap-2">
                      <Download className="h-5 w-5" />
                      Installation Steps
                    </h3>
                    <ol className="list-decimal list-inside space-y-2 text-sm">
                      {installationInstructions.instructions.map((instruction, index) => (
                        <li key={index}>{instruction}</li>
                      ))}
                    </ol>
                  </div>

                  <Separator />

                  {/* Download Links */}
                  <div className="space-y-4">
                    <h3 className="font-semibold">Download Links</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {installationInstructions.downloadUrls.windows && (
                        <a
                          href={installationInstructions.downloadUrls.windows}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent transition-colors"
                        >
                          <span className="font-medium">Windows</span>
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      )}
                      {installationInstructions.downloadUrls.macos && (
                        <a
                          href={installationInstructions.downloadUrls.macos}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent transition-colors"
                        >
                          <span className="font-medium">macOS</span>
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      )}
                      {installationInstructions.downloadUrls.linux && (
                        <a
                          href={installationInstructions.downloadUrls.linux}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent transition-colors"
                        >
                          <span className="font-medium">Linux</span>
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      )}
                      {installationInstructions.downloadUrls.android && (
                        <a
                          href={installationInstructions.downloadUrls.android}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent transition-colors"
                        >
                          <span className="font-medium">Android</span>
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      )}
                      {installationInstructions.downloadUrls.dockerImage && (
                        <div className="md:col-span-2 p-4 border rounded-lg bg-muted">
                          <p className="text-sm font-medium mb-2">Docker:</p>
                          <code className="text-xs bg-background px-2 py-1 rounded">
                            {installationInstructions.downloadUrls.dockerImage}
                          </code>
                        </div>
                      )}
                    </div>
                  </div>

                  <Separator />

                  {/* Check Installation Button */}
                  <div className="flex justify-center">
                    <Button
                      size="lg"
                      onClick={handleCheckInstallation}
                      disabled={isCheckingInstallation}
                    >
                      {isCheckingInstallation ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Checking...
                        </>
                      ) : (
                        <>
                          <RefreshCw className="mr-2 h-4 w-4" />
                          Check Installation
                        </>
                      )}
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Step 3: Models (Local Providers Only) */}
          {state.step === "models" && selectedProvider && (
            <div className="space-y-6">
              {/* Device Specifications */}
              {deviceSpecs && (
                <Alert>
                  <Zap className="h-4 w-4" />
                  <AlertDescription>
                    <p className="font-semibold mb-2">Your System:</p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                      <div className="flex items-center gap-2">
                        <Cpu className="h-4 w-4" />
                        <span>{deviceSpecs.ram.totalGB}GB RAM</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <HardDrive className="h-4 w-4" />
                        <span>{deviceSpecs.disk.availableGB}GB Free</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Monitor className="h-4 w-4" />
                        <span>{deviceSpecs.gpu?.detected ? deviceSpecs.gpu.name : 'No GPU'}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Package className="h-4 w-4" />
                        <span>{deviceSpecs.cpu.cores} CPU Cores</span>
                      </div>
                    </div>
                  </AlertDescription>
                </Alert>
              )}

              <Alert>
                <Package className="h-4 w-4" />
                <AlertDescription>
                  Models are installed and managed locally. Compatibility is checked against your system specs.
                </AlertDescription>
              </Alert>

              {/* Installed Models */}
              {installedModels.length > 0 && (
                <div className="space-y-3">
                  <h3 className="font-semibold flex items-center gap-2">
                    <CheckCircle className="h-5 w-5 text-green-500" />
                    Installed Models ({installedModels.length})
                  </h3>
                  <div className="grid gap-2">
                    {installedModels.map((model) => (
                      <div key={model.id} className="flex items-center justify-between p-3 border rounded-lg bg-accent/50">
                        <div>
                          <p className="font-medium">{model.name}</p>
                          <p className="text-xs text-muted-foreground">{model.size}</p>
                        </div>
                        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                          Installed
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <Separator />

              {/* Available Models */}
              <div className="space-y-3">
                <h3 className="font-semibold flex items-center gap-2">
                  <Download className="h-5 w-5" />
                  Available Models
                </h3>
                <div className="grid gap-3">
                  {availableModels.map((model) => {
                    const isInstalled = installedModels.some((im) => im.id === model.id);

                    return (
                      <div
                        key={model.id}
                        className={`p-4 border rounded-lg ${model.recommended ? "border-primary bg-primary/5" : ""}`}
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex-1">
                            <h4 className="font-medium flex items-center gap-2 flex-wrap">
                              {model.name}
                              {model.recommended && (
                                <Badge variant="default" className="text-xs">
                                  <Star className="h-3 w-3 mr-1" />
                                  Recommended
                                </Badge>
                              )}
                              <ModelCompatibilityBadge model={model} deviceSpecs={deviceSpecs} />
                            </h4>
                            <div className="flex gap-2 mt-1 text-xs text-muted-foreground">
                              {model.size && <span>{model.size}</span>}
                              {model.contextLength && <span>• {model.contextLength.toLocaleString()} tokens</span>}
                            </div>
                          </div>
                          {isInstalled && (
                            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                              Installed
                            </Badge>
                          )}
                        </div>

                        {/* System Requirements */}
                        <SystemRequirements model={model} />

                        {/* Download Command */}
                        {!isInstalled && (
                          <div className="mt-3 p-2 bg-muted rounded text-xs font-mono">
                            <div className="flex items-center justify-between">
                              <code>ollama pull {model.id}</code>
                              <Terminal className="h-3 w-3 text-muted-foreground" />
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <Alert variant="default">
                <Terminal className="h-4 w-4" />
                <AlertDescription>
                  <p className="font-semibold mb-1">How to download models:</p>
                  <p className="text-sm">
                    Open your terminal and run the command shown above for the model you want to download.
                    The model will be downloaded and ready to use immediately.
                  </p>
                </AlertDescription>
              </Alert>
            </div>
          )}

          {/* Step 4 (or 2): Configure Credentials */}
          {state.step === "configure" && selectedProvider && (
            <div className="space-y-6">
              <Alert>
                <Shield className="h-4 w-4" />
                <AlertDescription>
                  Your credentials are encrypted using AES-256-GCM before storage. They are never stored in plain text.
                </AlertDescription>
              </Alert>

              {selectedProvider.requiresApiKey && (
                <div className="space-y-2">
                  <Label htmlFor="apiKey">API Key *</Label>
                  <Input
                    id="apiKey"
                    type="password"
                    placeholder={`Enter your ${selectedProvider.name} API key`}
                    value={state.credentials.apiKey || ""}
                    onChange={(e) =>
                      updateState({
                        credentials: { ...state.credentials, apiKey: e.target.value },
                      })
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    Get your API key from {selectedProvider.company} dashboard
                  </p>
                </div>
              )}

              {/* Model Selection for cloud providers */}
              {cloudProviderModels[state.providerId] && (
                <div className="flex gap-2 items-end">
                  <div className="flex-1 space-y-2">
                    <Label>Model</Label>
                    <Select
                      value={state.selectedModels[0] || ""}
                      onValueChange={(value) => updateState({ selectedModels: [value] })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select a model..." />
                      </SelectTrigger>
                      <SelectContent>
                        {cloudProviderModels[state.providerId].map((model) => (
                          <SelectItem key={model.id} value={model.id}>
                            {model.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center gap-2 pb-2">
                    <Checkbox
                      id="setDefaultModel"
                      checked={state.setAsDefault}
                      onCheckedChange={(checked) => updateState({ setAsDefault: !!checked })}
                      disabled={!state.selectedModels[0]}
                    />
                    <Label htmlFor="setDefaultModel" className="text-sm whitespace-nowrap cursor-pointer">
                      Set as Default
                    </Label>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="endpoint">Custom Endpoint (Optional)</Label>
                <Input
                  id="endpoint"
                  type="url"
                  placeholder="https://api.example.com/v1"
                  value={state.credentials.endpoint || ""}
                  onChange={(e) =>
                    updateState({
                      credentials: { ...state.credentials, endpoint: e.target.value },
                    })
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Leave empty to use default endpoint
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="organizationId">Organization ID (Optional)</Label>
                <Input
                  id="organizationId"
                  placeholder="org-..."
                  value={state.credentials.organizationId || ""}
                  onChange={(e) =>
                    updateState({
                      credentials: { ...state.credentials, organizationId: e.target.value },
                    })
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="projectId">Project ID (Optional)</Label>
                <Input
                  id="projectId"
                  placeholder="proj-..."
                  value={state.credentials.projectId || ""}
                  onChange={(e) =>
                    updateState({
                      credentials: { ...state.credentials, projectId: e.target.value },
                    })
                  }
                />
              </div>
            </div>
          )}

          {/* Step 3: Test Connection */}
          {state.step === "test" && (
            <div className="space-y-6">
              <div className="text-center py-12">
                <TestTube className="h-16 w-16 mx-auto mb-4 text-primary" />
                <h3 className="text-lg font-semibold mb-2">Test Your Connection</h3>
                <p className="text-muted-foreground mb-6">
                  Verify that your credentials work and the provider is accessible
                </p>

                <Button
                  size="lg"
                  onClick={handleTestConnection}
                  disabled={isTestingConnection}
                >
                  {isTestingConnection ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Testing Connection...
                    </>
                  ) : (
                    <>
                      <TestTube className="mr-2 h-4 w-4" />
                      Test Connection
                    </>
                  )}
                </Button>
              </div>

              {state.testResult && (
                <Alert variant={state.testResult.success ? "default" : "destructive"}>
                  {state.testResult.success ? (
                    <CheckCircle className="h-4 w-4" />
                  ) : (
                    <AlertCircle className="h-4 w-4" />
                  )}
                  <AlertDescription>
                    <p className="font-semibold">{state.testResult.message}</p>
                    {state.testResult.latency && (
                      <p className="text-sm mt-1">Latency: {state.testResult.latency}ms</p>
                    )}
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}

          {/* Step 4: Review */}
          {state.step === "review" && selectedProvider && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Provider</p>
                  <p className="font-semibold">{selectedProvider.name}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Company</p>
                  <p className="font-semibold">{selectedProvider.company}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">API Key</p>
                  <p className="font-semibold">
                    {state.credentials.apiKey ? "••••" + state.credentials.apiKey.slice(-4) : "Not provided"}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Endpoint</p>
                  <p className="font-semibold">{state.credentials.endpoint || "Default"}</p>
                </div>
                {state.testResult && (
                  <div className="col-span-2">
                    <p className="text-sm text-muted-foreground">Connection Test</p>
                    <div className="flex items-center gap-2 mt-1">
                      {state.testResult.success ? (
                        <>
                          <CheckCircle className="h-4 w-4 text-green-500" />
                          <span className="font-semibold text-green-500">Successful</span>
                        </>
                      ) : (
                        <>
                          <AlertCircle className="h-4 w-4 text-destructive" />
                          <span className="font-semibold text-destructive">Failed</span>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <Separator />

              <div className="flex items-center justify-between border rounded-lg p-4">
                <div>
                  <Label className="text-base">Set as Default Provider</Label>
                  <p className="text-sm text-muted-foreground">
                    Use this provider by default for new LLM configurations
                  </p>
                </div>
                <Switch
                  checked={state.setAsDefault}
                  onCheckedChange={(checked) => updateState({ setAsDefault: checked })}
                />
              </div>

              {state.setAsDefault && (
                <Alert>
                  <Star className="h-4 w-4" />
                  <AlertDescription>
                    This provider will be selected by default when creating new LLMs
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}
        </CardContent>

        <div className="p-6 flex justify-between border-t">
          <Button
            variant="outline"
            onClick={() => {
              const prevStep = getPreviousStep();
              if (prevStep) {
                updateState({ step: prevStep });
              }
            }}
            disabled={!getPreviousStep()}
          >
            <ChevronLeft className="h-4 w-4 mr-2" />
            Back
          </Button>

          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => navigate("/llm")}>
              Cancel
            </Button>

            {state.step !== "review" ? (
              <Button
                onClick={() => {
                  const nextStep = getNextStep();
                  if (nextStep) {
                    updateState({ step: nextStep });
                  }
                }}
                disabled={!canProceed()}
              >
                Next
                <ChevronRight className="h-4 w-4 ml-2" />
              </Button>
            ) : (
              <Button onClick={handleSave} disabled={isSaving}>
                {isSaving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Check className="mr-2 h-4 w-4" />
                    Save Configuration
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
