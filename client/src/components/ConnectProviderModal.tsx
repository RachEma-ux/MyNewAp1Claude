/**
 * ConnectProviderModal — Governed PAT-based provider authentication
 *
 * UX Flow:
 *   1. Select Provider → auto-fills Base URL
 *   2. Enter Base URL (editable)
 *   3. Enter PAT (password field with reveal toggle)
 *   4. Test Connection → shows capabilities
 *   5. Save & Activate → encrypted storage
 *
 * PAT is never stored before successful validation.
 * PAT is never displayed after save.
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { CatalogSelect } from "@/components/CatalogSelect";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Loader2,
  Eye,
  EyeOff,
  CheckCircle2,
  XCircle,
  Shield,
  Plug,
  Activity,
  Lock,
} from "lucide-react";

interface ConnectProviderModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete?: (connectionId: number) => void;
  workspaceId?: number;
}

type ModalStep = "form" | "testing" | "tested" | "saving" | "done";

interface TestResult {
  status: "ok" | "error";
  capabilities: string[];
  modelCount: number;
  error?: string;
  latencyMs: number;
}

// Well-known base URLs for auto-fill
const PROVIDER_BASE_URLS: Record<string, string> = {
  openai: "https://api.openai.com",
  anthropic: "https://api.anthropic.com",
  google: "https://generativelanguage.googleapis.com",
  meta: "https://api.llama.com",
  mistral: "https://api.mistral.ai",
  microsoft: "https://models.inference.ai.azure.com",
  qwen: "https://dashscope-intl.aliyuncs.com",
  xai: "https://api.x.ai",
  cohere: "https://api.cohere.com",
  deepseek: "https://api.deepseek.com",
  perplexity: "https://api.perplexity.ai",
  ollama: "http://localhost:11434",
  llamacpp: "http://localhost:8080",
};

export function ConnectProviderModal({
  open,
  onOpenChange,
  onComplete,
  workspaceId = 1,
}: ConnectProviderModalProps) {
  // Form state
  const [selectedProviderId, setSelectedProviderId] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [pat, setPat] = useState("");
  const [showPat, setShowPat] = useState(false);

  // Flow state
  const [step, setStep] = useState<ModalStep>("form");
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [connectionId, setConnectionId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const trpcUtils = trpc.useUtils();
  const testMutation = trpc.providerConnections.test.useMutation();
  const createMutation = trpc.providerConnections.create.useMutation();
  const validateMutation = trpc.providerConnections.validateAndStore.useMutation();
  const activateMutation = trpc.providerConnections.activate.useMutation();

  // Reset on close
  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      setSelectedProviderId("");
      setBaseUrl("");
      setPat("");
      setShowPat(false);
      setStep("form");
      setTestResult(null);
      setConnectionId(null);
      setError(null);
    }
    onOpenChange(isOpen);
  };

  // Auto-fill URL and API key when provider is selected
  const handleProviderSelect = async (value: string) => {
    setSelectedProviderId(value);
    if (!value) return;
    try {
      const entry = await trpcUtils.catalogManage.getById.fetch({
        id: Number(value),
      });
      const config = entry.config as Record<string, any> | null;
      const rawRegistryId = (config?.registryId ||
        config?.providerId ||
        entry.name) as string | undefined;
      const registryId = rawRegistryId?.toLowerCase();

      // 1. Auto-fill base URL
      const url =
        config?.baseUrl ||
        config?.apiUrl ||
        config?.endpoint ||
        (registryId && PROVIDER_BASE_URLS[registryId]) ||
        undefined;
      if (url) setBaseUrl(url);

      // 2. Auto-fill API key from multiple sources
      let foundKey: string | undefined;

      // Source A: catalog entry config
      if (config?.apiKey) {
        foundKey = config.apiKey as string;
      }

      // Source B: provider registry by type
      if (!foundKey && registryId) {
        try {
          const providers = await trpcUtils.providers.list.fetch({ type: registryId as any });
          const provConfig = providers?.[0]?.config as Record<string, any> | null;
          if (provConfig?.apiKey) foundKey = provConfig.apiKey as string;
        } catch { /* ignore */ }
      }

      // Source C: provider registry by name match
      if (!foundKey) {
        try {
          const allProviders = await trpcUtils.providers.list.fetch({});
          const match = allProviders.find((p: any) =>
            p.type?.toLowerCase() === registryId || p.name.toLowerCase() === entry.name.toLowerCase()
          );
          const matchConfig = match?.config as Record<string, any> | null;
          if (matchConfig?.apiKey) foundKey = matchConfig.apiKey as string;
        } catch { /* ignore */ }
      }

      if (foundKey) setPat(foundKey);
    } catch {
      // Ignore — user can type manually
    }
  };

  // Step 1: Test Connection (in-memory only — no persistence)
  const handleTestConnection = async () => {
    setError(null);
    setStep("testing");

    try {
      const result = await testMutation.mutateAsync({
        baseUrl,
        pat: pat || undefined,
      });
      setTestResult(result);
      setStep(result.status === "ok" ? "tested" : "form");
      if (result.status !== "ok") {
        setError(result.error || "Connection test failed");
      }
    } catch (e: any) {
      setError(e.message);
      setStep("form");
    }
  };

  // Step 2: Save & Activate (create → validate+encrypt → activate)
  const handleSaveAndActivate = async () => {
    setError(null);
    setStep("saving");

    try {
      // 1. Create DRAFT connection
      const { id } = await createMutation.mutateAsync({
        providerId: Number(selectedProviderId),
        workspaceId,
        baseUrl,
      });
      setConnectionId(id);

      // 2. Validate & store encrypted PAT (DRAFT → VALIDATED)
      const valResult = await validateMutation.mutateAsync({
        connectionId: id,
        pat,
      });

      if (valResult.status !== "ok") {
        setError(valResult.error || "Validation failed");
        setStep("form");
        return;
      }

      // 3. Activate (VALIDATED → ACTIVE)
      await activateMutation.mutateAsync({ connectionId: id });

      // Clear PAT from memory
      setPat("");
      setStep("done");
      onComplete?.(id);
    } catch (e: any) {
      setError(e.message);
      setStep("tested"); // Stay on tested step so user can retry
    }
  };

  const isTestReady = baseUrl.length > 0;
  const isSaveReady = step === "tested" && testResult?.status === "ok";

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plug className="h-5 w-5" />
            Connect Provider
          </DialogTitle>
          <DialogDescription>
            Authenticate using a Personal Access Token (PAT)
          </DialogDescription>
        </DialogHeader>

        {/* Form Fields */}
        {step !== "done" && (
          <div className="space-y-4 py-2">
            {/* Provider Selector */}
            <div className="space-y-2">
              <Label>Provider</Label>
              <CatalogSelect
                entryType="provider"
                value={selectedProviderId}
                onValueChange={handleProviderSelect}
                placeholder="Select a provider..."
              />
            </div>

            {/* Base URL */}
            <div className="space-y-2">
              <Label htmlFor="conn-url">Base URL</Label>
              <Input
                id="conn-url"
                type="url"
                placeholder="https://api.provider.com"
                value={baseUrl}
                onChange={(e) => {
                  setBaseUrl(e.target.value);
                  // Reset test result when URL changes
                  if (step === "tested") {
                    setStep("form");
                    setTestResult(null);
                  }
                }}
              />
            </div>

            {/* PAT Input */}
            <div className="space-y-2">
              <Label htmlFor="conn-pat" className="flex items-center gap-1.5">
                <Lock className="h-3.5 w-3.5" />
                Personal Access Token (PAT)
              </Label>
              <div className="relative">
                <Input
                  id="conn-pat"
                  type={showPat ? "text" : "password"}
                  placeholder="sk-..."
                  value={pat}
                  onChange={(e) => {
                    setPat(e.target.value);
                    if (step === "tested") {
                      setStep("form");
                      setTestResult(null);
                    }
                  }}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPat(!showPat)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1"
                >
                  {showPat ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Shield className="h-3 w-3" />
                Encrypted with AES-256-GCM before storage. Never logged or
                returned.
              </p>
            </div>

            {/* Test Result */}
            {testResult && testResult.status === "ok" && step === "tested" && (
              <Alert className="border-green-600/30 bg-green-950/20">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <AlertTitle className="text-green-400">
                  Connection Successful
                </AlertTitle>
                <AlertDescription>
                  <div className="flex flex-wrap gap-2 mt-2">
                    <Badge
                      variant="outline"
                      className="border-green-600/30 text-green-400"
                    >
                      {testResult.modelCount} models
                    </Badge>
                    {testResult.capabilities.map((cap) => (
                      <Badge
                        key={cap}
                        variant="outline"
                        className="border-blue-600/30 text-blue-400"
                      >
                        {cap}
                      </Badge>
                    ))}
                    <Badge
                      variant="outline"
                      className="border-gray-600/30 text-gray-400"
                    >
                      {testResult.latencyMs}ms
                    </Badge>
                  </div>
                </AlertDescription>
              </Alert>
            )}

            {/* Error */}
            {error && (
              <Alert variant="destructive">
                <XCircle className="h-4 w-4" />
                <AlertTitle>Error</AlertTitle>
                <AlertDescription className="text-sm">
                  {error}
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}

        {/* Done State */}
        {step === "done" && (
          <div className="py-6 text-center space-y-3">
            <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto" />
            <div>
              <h3 className="font-medium text-lg">Provider Connected</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Connection #{connectionId} is now active. PAT has been encrypted
                and stored securely.
              </p>
            </div>
            <div className="flex justify-center gap-2 mt-2">
              {testResult?.capabilities.map((cap) => (
                <Badge
                  key={cap}
                  variant="outline"
                  className="border-green-600/30 text-green-400"
                >
                  {cap}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Footer Buttons */}
        <DialogFooter className="flex justify-between sm:justify-between">
          <div>
            {step !== "done" && (
              <Button
                variant="ghost"
                onClick={() => handleOpenChange(false)}
              >
                Cancel
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            {step !== "done" && (
              <>
                {/* Test Connection */}
                <Button
                  variant="outline"
                  onClick={handleTestConnection}
                  disabled={!isTestReady || step === "testing" || step === "saving"}
                >
                  {step === "testing" ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Testing...
                    </>
                  ) : (
                    <>
                      <Activity className="h-4 w-4 mr-2" />
                      Test Connection
                    </>
                  )}
                </Button>

                {/* Save & Activate */}
                <Button
                  onClick={handleSaveAndActivate}
                  disabled={!isSaveReady || step === "saving"}
                >
                  {step === "saving" ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Shield className="h-4 w-4 mr-2" />
                      Save & Activate
                    </>
                  )}
                </Button>
              </>
            )}

            {step === "done" && (
              <Button onClick={() => handleOpenChange(false)}>
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Done
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
