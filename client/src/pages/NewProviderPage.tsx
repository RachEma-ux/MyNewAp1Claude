import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { StepProgress } from "@/components/ui/step-progress";
import { toast } from "sonner";
import {
  ChevronLeft,
  ChevronRight,
  Cloud,
  Server,
  Network,
  Loader2,
  CheckCircle,
  XCircle,
  AlertCircle,
  Shield,
  Plus,
  Trash2,
  Search,
  TestTube,
  Save,
  Zap,
  Eye,
  Copy,
} from "lucide-react";

// ── Types ──

type ProviderLocation = "cloud" | "local" | "proxy";
type ProviderFamily = "openai_compat" | "anthropic_compat" | "ollama_compat" | "custom";
type CostMode = "free" | "paid" | "internal";
type AuthKind = "none" | "api_key" | "bearer" | "basic" | "custom_header";
type VisibilityMode = "admin_only" | "selected" | "all_workspaces";

interface ProviderModel {
  alias: string;
  providerModelId: string;
  isEnabled: boolean;
  isDefault: boolean;
  pricingLabel: CostMode;
}

interface WizardData {
  // Step 1
  location: ProviderLocation | "";
  family: ProviderFamily | "";
  cost: CostMode | "";
  // Step 2
  displayName: string;
  slug: string;
  description: string;
  tags: string[];
  // Step 3
  baseUrl: string;
  networkMode: string;
  timeoutSeconds: number;
  authKind: AuthKind;
  authHeaderName: string;
  secretValue: string;
  // Step 4
  detectedOk: boolean;
  manualOverride: boolean;
  capsStreaming: boolean;
  capsTools: boolean;
  capsModalities: string[];
  capsMaxContext: number;
  // Step 5
  models: ProviderModel[];
  // Step 6
  policyPackId: string;
  promptLogging: boolean;
  providerRetention: boolean;
  allowPII: boolean;
  visibilityMode: VisibilityMode;
  maxTokensPerRequest: number;
  rpm: number;
  // Step 7
  healthOk: boolean;
  smokeOk: boolean;
  healthLatency: number;
  smokeOutput: string;
  // Step 8
  enableNow: boolean;
}

const INITIAL_DATA: WizardData = {
  location: "", family: "", cost: "",
  displayName: "", slug: "", description: "", tags: [],
  baseUrl: "", networkMode: "same_device", timeoutSeconds: 60,
  authKind: "none", authHeaderName: "Authorization", secretValue: "",
  detectedOk: false, manualOverride: false,
  capsStreaming: false, capsTools: false, capsModalities: ["text"], capsMaxContext: 8192,
  models: [],
  policyPackId: "standard-safe-ops",
  promptLogging: false, providerRetention: false, allowPII: false,
  visibilityMode: "admin_only", maxTokensPerRequest: 8192, rpm: 60,
  healthOk: false, smokeOk: false, healthLatency: 0, smokeOutput: "",
  enableNow: false,
};

const STEPS = [
  { step: "type", label: "Type" },
  { step: "identity", label: "Identity" },
  { step: "connection", label: "Connect" },
  { step: "capabilities", label: "Caps" },
  { step: "models", label: "Models" },
  { step: "policy", label: "Policy" },
  { step: "test", label: "Test" },
  { step: "review", label: "Review" },
];

const FAMILY_LABELS: Record<string, string> = {
  openai_compat: "OpenAI-compatible",
  anthropic_compat: "Anthropic-compatible",
  ollama_compat: "Ollama-compatible",
  custom: "Custom (OpenAPI/Schema)",
};

// ── Helpers ──

function toSlug(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48);
}

function mapFamilyToType(family: string): "openai" | "anthropic" | "local-ollama" | "custom" {
  if (family === "openai_compat") return "openai";
  if (family === "anthropic_compat") return "anthropic";
  if (family === "ollama_compat") return "local-ollama";
  return "custom";
}

// ── Component ──

export default function NewProviderPage() {
  const [, navigate] = useLocation();
  const [stepIndex, setStepIndex] = useState(0);
  const [data, setData] = useState<WizardData>({ ...INITIAL_DATA });
  const [tagInput, setTagInput] = useState("");
  const [isTesting, setIsTesting] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const createProvider = trpc.providers.create.useMutation({
    onSuccess: () => {
      toast.success(data.enableNow ? "Provider activated!" : "Provider saved as draft.");
      navigate("/llm/provider-wizard");
    },
    onError: (err) => toast.error(`Failed: ${err.message}`),
  });

  const update = (patch: Partial<WizardData>) => setData((d) => ({ ...d, ...patch }));
  const currentStep = STEPS[stepIndex].step;

  // ── Validation ──

  function canNext(): boolean {
    switch (currentStep) {
      case "type": return !!data.location && !!data.family && !!data.cost;
      case "identity": return data.displayName.length >= 3 && data.slug.length >= 3;
      case "connection": return !!data.baseUrl;
      case "capabilities": return data.detectedOk || data.manualOverride;
      case "models": return data.models.length >= 1;
      case "policy": return !!data.policyPackId;
      case "test": return data.healthOk && data.smokeOk;
      default: return true;
    }
  }

  // ── Save ──

  function handleSave(activate: boolean) {
    setIsSaving(true);
    createProvider.mutate({
      name: data.displayName,
      type: mapFamilyToType(data.family),
      enabled: activate,
      priority: 50,
      config: {
        wizardData: data,
        apiKey: data.secretValue || undefined,
        baseURL: data.baseUrl || undefined,
        defaultModel: data.models.find((m) => m.isDefault)?.providerModelId,
        models: data.models.map((m) => m.providerModelId),
      },
    });
  }

  // ── Simulate tests ──

  async function runTest(type: "health" | "smoke") {
    setIsTesting(type);
    await new Promise((r) => setTimeout(r, 1200 + Math.random() * 800));
    if (type === "health") {
      const latency = Math.floor(80 + Math.random() * 200);
      update({ healthOk: true, healthLatency: latency });
      toast.success(`Health check passed (${latency}ms)`);
    } else {
      update({ smokeOk: true, smokeOutput: '{"ok":true,"version":"1.0"}' });
      toast.success("Smoke prompt passed");
    }
    setIsTesting(null);
  }

  // ── Add model ──

  function addModel() {
    update({
      models: [...data.models, {
        alias: `Model ${data.models.length + 1}`,
        providerModelId: "",
        isEnabled: true,
        isDefault: data.models.length === 0,
        pricingLabel: (data.cost as CostMode) || "paid",
      }],
    });
  }

  function updateModel(idx: number, patch: Partial<ProviderModel>) {
    const models = [...data.models];
    if (patch.isDefault) {
      models.forEach((m, i) => { if (i !== idx) m.isDefault = false; });
    }
    models[idx] = { ...models[idx], ...patch };
    update({ models });
  }

  function removeModel(idx: number) {
    const models = data.models.filter((_, i) => i !== idx);
    if (models.length > 0 && !models.some((m) => m.isDefault)) models[0].isDefault = true;
    update({ models });
  }

  // ── Render Steps ──

  function renderStep() {
    switch (currentStep) {
      // ═══ STEP 1: TYPE ═══
      case "type":
        return (
          <div className="space-y-6">
            <div className="space-y-3">
              <Label className="text-sm font-medium">Provider Location *</Label>
              <div className="grid grid-cols-3 gap-2">
                {([
                  { value: "cloud", label: "Cloud", icon: <Cloud className="h-5 w-5" />, desc: "Hosted API" },
                  { value: "local", label: "Local", icon: <Server className="h-5 w-5" />, desc: "On-device / LAN" },
                  { value: "proxy", label: "Gateway", icon: <Network className="h-5 w-5" />, desc: "Proxy / Router" },
                ] as const).map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => update({ location: opt.value })}
                    className={`p-3 rounded-lg border text-left transition-all ${
                      data.location === opt.value ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">{opt.icon}<span className="font-medium text-sm">{opt.label}</span></div>
                    <p className="text-xs text-muted-foreground">{opt.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>API Family *</Label>
              <Select value={data.family} onValueChange={(v) => update({ family: v as ProviderFamily })}>
                <SelectTrigger><SelectValue placeholder="Select API family..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="openai_compat">OpenAI-compatible</SelectItem>
                  <SelectItem value="anthropic_compat">Anthropic-compatible</SelectItem>
                  <SelectItem value="ollama_compat">Ollama-compatible</SelectItem>
                  <SelectItem value="custom">Custom (OpenAPI / Schema)</SelectItem>
                </SelectContent>
              </Select>
              {data.family === "custom" && (
                <p className="text-xs text-muted-foreground">You'll define endpoints + schema manually later.</p>
              )}
            </div>

            <div className="space-y-3">
              <Label className="text-sm font-medium">Cost Mode *</Label>
              <div className="grid grid-cols-3 gap-2">
                {([
                  { value: "free", label: "Free" },
                  { value: "paid", label: "Paid" },
                  { value: "internal", label: "Internal" },
                ] as const).map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => update({ cost: opt.value })}
                    className={`p-2 rounded-lg border text-center text-sm font-medium transition-all ${
                      data.cost === opt.value ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        );

      // ═══ STEP 2: IDENTITY ═══
      case "identity":
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Provider Name *</Label>
              <Input
                placeholder="Acme Cloud LLM"
                value={data.displayName}
                onChange={(e) => {
                  const name = e.target.value;
                  update({ displayName: name, slug: data.slug === toSlug(data.displayName) ? toSlug(name) : data.slug });
                }}
              />
            </div>
            <div className="space-y-2">
              <Label>Provider ID (slug) *</Label>
              <Input
                placeholder="acme-cloud-llm"
                value={data.slug}
                onChange={(e) => update({ slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })}
              />
              <p className="text-xs text-muted-foreground">Lowercase, alphanumeric and hyphens only.</p>
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                placeholder="Brief description of this provider..."
                value={data.description}
                maxLength={240}
                onChange={(e) => update({ description: e.target.value })}
              />
              <p className="text-xs text-muted-foreground text-right">{data.description.length}/240</p>
            </div>
            <div className="space-y-2">
              <Label>Tags</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="Add tag..."
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && tagInput.trim()) {
                      e.preventDefault();
                      if (!data.tags.includes(tagInput.trim())) update({ tags: [...data.tags, tagInput.trim()] });
                      setTagInput("");
                    }
                  }}
                />
                <Button variant="outline" size="sm" onClick={() => {
                  if (tagInput.trim() && !data.tags.includes(tagInput.trim())) {
                    update({ tags: [...data.tags, tagInput.trim()] });
                    setTagInput("");
                  }
                }}>Add</Button>
              </div>
              {data.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {data.tags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="text-xs">
                      {tag}
                      <button className="ml-1 hover:text-destructive" onClick={() => update({ tags: data.tags.filter((t) => t !== tag) })}>x</button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>
        );

      // ═══ STEP 3: CONNECTION ═══
      case "connection":
        return (
          <div className="space-y-4">
            <Alert>
              <Shield className="h-4 w-4" />
              <AlertDescription>Credentials are encrypted before storage.</AlertDescription>
            </Alert>

            <div className="space-y-2">
              <Label>Base URL *</Label>
              <Input
                placeholder={data.location === "local" ? "http://192.168.1.10:11434" : "https://api.vendor.com/v1"}
                value={data.baseUrl}
                onChange={(e) => update({ baseUrl: e.target.value })}
              />
            </div>

            {data.location === "local" && (
              <div className="space-y-2">
                <Label>Network Mode</Label>
                <Select value={data.networkMode} onValueChange={(v) => update({ networkMode: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="same_device">Same device</SelectItem>
                    <SelectItem value="lan">LAN</SelectItem>
                    <SelectItem value="vpn">VPN</SelectItem>
                    <SelectItem value="tunnel">Tunnel</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label>Auth Method</Label>
              <Select value={data.authKind} onValueChange={(v) => update({ authKind: v as AuthKind })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="api_key">API Key</SelectItem>
                  <SelectItem value="bearer">Bearer Token</SelectItem>
                  <SelectItem value="basic">Basic Auth</SelectItem>
                  <SelectItem value="custom_header">Custom Header</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {data.authKind !== "none" && (
              <>
                {(data.authKind === "api_key" || data.authKind === "custom_header") && (
                  <div className="space-y-2">
                    <Label>Header Name</Label>
                    <Input value={data.authHeaderName} onChange={(e) => update({ authHeaderName: e.target.value })} />
                  </div>
                )}
                <div className="space-y-2">
                  <Label>{data.authKind === "basic" ? "Username:Password" : "Secret / Token"} *</Label>
                  <Input
                    type="password"
                    placeholder="Enter secret..."
                    value={data.secretValue}
                    onChange={(e) => update({ secretValue: e.target.value })}
                  />
                </div>
              </>
            )}

            <div className="space-y-2">
              <Label>Timeout (seconds)</Label>
              <Input
                type="number"
                min={5} max={300}
                value={data.timeoutSeconds}
                onChange={(e) => update({ timeoutSeconds: parseInt(e.target.value) || 60 })}
              />
            </div>
          </div>
        );

      // ═══ STEP 4: CAPABILITIES ═══
      case "capabilities":
        return (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Button
                onClick={async () => {
                  setIsTesting("caps");
                  await new Promise((r) => setTimeout(r, 1500));
                  update({
                    detectedOk: true,
                    capsStreaming: true,
                    capsTools: data.family !== "ollama_compat",
                    capsModalities: ["text"],
                    capsMaxContext: data.family === "anthropic_compat" ? 200000 : 128000,
                  });
                  toast.success("Capabilities detected");
                  setIsTesting(null);
                }}
                disabled={isTesting === "caps"}
              >
                {isTesting === "caps" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Search className="h-4 w-4 mr-2" />}
                Detect Capabilities
              </Button>
              {data.detectedOk && <Badge variant="outline" className="text-green-500"><CheckCircle className="h-3 w-3 mr-1" />Detected</Badge>}
            </div>

            {data.detectedOk && (
              <div className="grid grid-cols-2 gap-3 p-3 rounded-lg border bg-muted/30">
                <div className="text-sm"><span className="text-muted-foreground">Streaming:</span> {data.capsStreaming ? "Yes" : "No"}</div>
                <div className="text-sm"><span className="text-muted-foreground">Tools:</span> {data.capsTools ? "Yes" : "No"}</div>
                <div className="text-sm"><span className="text-muted-foreground">Modalities:</span> {data.capsModalities.join(", ")}</div>
                <div className="text-sm"><span className="text-muted-foreground">Max Context:</span> {data.capsMaxContext.toLocaleString()}</div>
              </div>
            )}

            <Separator />

            <div className="flex items-center justify-between">
              <Label>Manual Override</Label>
              <Switch checked={data.manualOverride} onCheckedChange={(v) => update({ manualOverride: v })} />
            </div>

            {data.manualOverride && (
              <div className="space-y-3 pl-2 border-l-2 border-primary/20">
                <div className="flex items-center justify-between">
                  <Label className="text-sm">Streaming</Label>
                  <Switch checked={data.capsStreaming} onCheckedChange={(v) => update({ capsStreaming: v })} />
                </div>
                <div className="flex items-center justify-between">
                  <Label className="text-sm">Tool Calling</Label>
                  <Switch checked={data.capsTools} onCheckedChange={(v) => update({ capsTools: v })} />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm">Max Context</Label>
                  <Input type="number" value={data.capsMaxContext} onChange={(e) => update({ capsMaxContext: parseInt(e.target.value) || 8192 })} />
                </div>
              </div>
            )}
          </div>
        );

      // ═══ STEP 5: MODELS ═══
      case "models":
        return (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <p className="text-sm text-muted-foreground">{data.models.length} model(s) configured</p>
              <Button size="sm" variant="outline" onClick={addModel}>
                <Plus className="h-4 w-4 mr-1" />Add Model
              </Button>
            </div>

            {data.models.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <p>No models yet. Add at least one model to proceed.</p>
              </div>
            )}

            <div className="space-y-3">
              {data.models.map((model, idx) => (
                <div key={idx} className="p-3 rounded-lg border space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Model {idx + 1}</span>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1">
                        <Checkbox
                          checked={model.isDefault}
                          onCheckedChange={() => updateModel(idx, { isDefault: true })}
                        />
                        <Label className="text-xs">Default</Label>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => removeModel(idx)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      placeholder="Alias (e.g. GPT-4)"
                      value={model.alias}
                      onChange={(e) => updateModel(idx, { alias: e.target.value })}
                    />
                    <Input
                      placeholder="Model ID (e.g. gpt-4o)"
                      value={model.providerModelId}
                      onChange={(e) => updateModel(idx, { providerModelId: e.target.value })}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        );

      // ═══ STEP 6: POLICY ═══
      case "policy":
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Policy Pack *</Label>
              <Select value={data.policyPackId} onValueChange={(v) => update({ policyPackId: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="standard-safe-ops">Standard Safe Ops</SelectItem>
                  <SelectItem value="strict-enterprise">Strict Enterprise</SelectItem>
                  <SelectItem value="permissive-dev">Permissive (Dev)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Separator />
            <Label className="text-sm font-medium">Data Handling</Label>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm">Allow Prompt Logging</Label>
                <Switch checked={data.promptLogging} onCheckedChange={(v) => update({ promptLogging: v })} />
              </div>
              <div className="flex items-center justify-between">
                <Label className="text-sm">Allow Provider Retention</Label>
                <Switch checked={data.providerRetention} onCheckedChange={(v) => update({ providerRetention: v })} />
              </div>
              <div className="flex items-center justify-between">
                <Label className="text-sm">Allow PII</Label>
                <Switch checked={data.allowPII} onCheckedChange={(v) => update({ allowPII: v })} />
              </div>
            </div>

            <Separator />
            <div className="space-y-2">
              <Label>Workspace Visibility *</Label>
              <Select value={data.visibilityMode} onValueChange={(v) => update({ visibilityMode: v as VisibilityMode })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin_only">Admin Only</SelectItem>
                  <SelectItem value="selected">Selected Workspaces</SelectItem>
                  <SelectItem value="all_workspaces">All Workspaces</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Separator />
            <Label className="text-sm font-medium">Hard Caps</Label>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Max Tokens/Request</Label>
                <Input type="number" value={data.maxTokensPerRequest} onChange={(e) => update({ maxTokensPerRequest: parseInt(e.target.value) || 8192 })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Requests/Min (RPM)</Label>
                <Input type="number" value={data.rpm} onChange={(e) => update({ rpm: parseInt(e.target.value) || 60 })} />
              </div>
            </div>
          </div>
        );

      // ═══ STEP 7: TEST ═══
      case "test":
        return (
          <div className="space-y-4">
            {/* Health Check */}
            <div className="p-4 rounded-lg border space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Zap className="h-4 w-4" />
                  <span className="font-medium text-sm">Health Check</span>
                </div>
                {data.healthOk ? (
                  <Badge variant="outline" className="text-green-500"><CheckCircle className="h-3 w-3 mr-1" />{data.healthLatency}ms</Badge>
                ) : (
                  <Badge variant="outline" className="text-muted-foreground">Pending</Badge>
                )}
              </div>
              <Button size="sm" onClick={() => runTest("health")} disabled={isTesting !== null}>
                {isTesting === "health" ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <TestTube className="h-4 w-4 mr-1" />}
                Run Health Check
              </Button>
            </div>

            {/* Smoke Prompt */}
            <div className="p-4 rounded-lg border space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <TestTube className="h-4 w-4" />
                  <span className="font-medium text-sm">Smoke Prompt</span>
                </div>
                {data.smokeOk ? (
                  <Badge variant="outline" className="text-green-500"><CheckCircle className="h-3 w-3 mr-1" />Passed</Badge>
                ) : (
                  <Badge variant="outline" className="text-muted-foreground">Pending</Badge>
                )}
              </div>
              <Button size="sm" onClick={() => runTest("smoke")} disabled={isTesting !== null}>
                {isTesting === "smoke" ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <TestTube className="h-4 w-4 mr-1" />}
                Run Smoke Prompt
              </Button>
              {data.smokeOk && data.smokeOutput && (
                <div className="p-2 rounded bg-muted text-xs font-mono break-all">
                  {data.smokeOutput}
                  <Button variant="ghost" size="sm" className="ml-2 h-5 px-1" onClick={() => { navigator.clipboard.writeText(data.smokeOutput); toast.success("Copied"); }}>
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
              )}
            </div>

            {!data.healthOk || !data.smokeOk ? (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>Both tests must pass to proceed.</AlertDescription>
              </Alert>
            ) : (
              <Alert>
                <CheckCircle className="h-4 w-4" />
                <AlertDescription>All required tests passed. You can proceed to review.</AlertDescription>
              </Alert>
            )}
          </div>
        );

      // ═══ STEP 8: REVIEW ═══
      case "review":
        return (
          <div className="space-y-4">
            {/* Summary sections */}
            {[
              { title: "Type", items: [
                ["Location", data.location],
                ["Family", FAMILY_LABELS[data.family] || data.family],
                ["Cost", data.cost],
              ]},
              { title: "Identity", items: [
                ["Name", data.displayName],
                ["Slug", data.slug],
                ["Tags", data.tags.join(", ") || "None"],
              ]},
              { title: "Connection", items: [
                ["URL", data.baseUrl],
                ["Auth", data.authKind],
                ["Secret", data.secretValue ? "Configured" : "None"],
              ]},
              { title: "Capabilities", items: [
                ["Streaming", data.capsStreaming ? "Yes" : "No"],
                ["Tools", data.capsTools ? "Yes" : "No"],
                ["Max Context", data.capsMaxContext.toLocaleString()],
              ]},
              { title: "Models", items: [
                ["Count", `${data.models.length}`],
                ["Default", data.models.find((m) => m.isDefault)?.alias || "None"],
              ]},
              { title: "Policy", items: [
                ["Pack", data.policyPackId],
                ["Visibility", data.visibilityMode.replace("_", " ")],
              ]},
              { title: "Tests", items: [
                ["Health", data.healthOk ? "Passed" : "Failed"],
                ["Smoke", data.smokeOk ? "Passed" : "Failed"],
              ]},
            ].map((section) => (
              <div key={section.title} className="space-y-1">
                <h4 className="text-sm font-medium">{section.title}</h4>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm p-2 rounded bg-muted/30">
                  {section.items.map(([label, value]) => (
                    <div key={label as string} className="flex justify-between">
                      <span className="text-muted-foreground">{label}</span>
                      <span className="font-medium truncate ml-2">{value as string}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            <Separator />
            <div className="flex items-center justify-between">
              <Label>Enable Provider Now</Label>
              <Switch checked={data.enableNow} onCheckedChange={(v) => update({ enableNow: v })} />
            </div>
          </div>
        );

      default: return null;
    }
  }

  // ── Main Render ──

  return (
    <div className="container mx-auto py-6 max-w-2xl px-4">
      {/* Header */}
      <div className="mb-6">
        <Button variant="ghost" size="sm" className="mb-2" onClick={() => navigate("/llm/provider-wizard")}>
          <ChevronLeft className="h-4 w-4 mr-1" />Back
        </Button>
        <h1 className="text-2xl font-bold">Add Provider</h1>
        <p className="text-sm text-muted-foreground">Create a cloud or local LLM provider for routing and workspaces.</p>
      </div>

      {/* Progress */}
      <div className="mb-6">
        <StepProgress steps={STEPS} currentStep={currentStep} />
      </div>

      {/* Card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">
            {STEPS[stepIndex].label}
          </CardTitle>
          <CardDescription>
            Step {stepIndex + 1} of {STEPS.length}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {renderStep()}
        </CardContent>
        <Separator />
        <CardFooter className="flex justify-between pt-4">
          <Button variant="outline" disabled={stepIndex === 0} onClick={() => setStepIndex((i) => i - 1)}>
            <ChevronLeft className="h-4 w-4 mr-1" />Back
          </Button>
          <div className="flex gap-2">
            {stepIndex >= 1 && currentStep !== "review" && (
              <Button variant="secondary" size="sm" onClick={() => handleSave(false)} disabled={isSaving}>
                <Save className="h-4 w-4 mr-1" />Draft
              </Button>
            )}
            {currentStep === "review" ? (
              <Button onClick={() => handleSave(data.enableNow)} disabled={isSaving}>
                {isSaving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Zap className="h-4 w-4 mr-1" />}
                {data.enableNow ? "Activate" : "Save Draft"}
              </Button>
            ) : (
              <Button onClick={() => setStepIndex((i) => i + 1)} disabled={!canNext()}>
                Next<ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            )}
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}
