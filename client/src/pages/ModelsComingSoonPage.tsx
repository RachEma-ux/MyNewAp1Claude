import { useState } from "react";
import { useRoute, useLocation } from "wouter";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Brain,
  BarChart3,
  Layers,
  Plus,
  CheckCircle,
  Shield,
  ChevronRight,
  ChevronLeft,
  Package,
  Settings,
  FileText,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import { trpc } from "@/lib/trpc";

// ============================================================================
// Dashboard Section
// ============================================================================

function ModelsDashboard() {
  const [, navigate] = useLocation();
  const statsQuery = trpc.models.getStats.useQuery();
  const modelsQuery = trpc.models.list.useQuery();

  const stats = statsQuery.data;
  const isLoading = statsQuery.isLoading;

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="p-4 pb-2">
            <CardDescription className="text-xs">Total Models</CardDescription>
            <CardTitle className="text-2xl">
              {stats?.total ?? 0}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="p-4 pb-2">
            <CardDescription className="text-xs">Active</CardDescription>
            <CardTitle className="text-2xl text-green-500">
              {stats?.byStatus.active ?? 0}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="p-4 pb-2">
            <CardDescription className="text-xs">Draft</CardDescription>
            <CardTitle className="text-2xl text-yellow-500">
              {stats?.byStatus.draft ?? 0}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="p-4 pb-2">
            <CardDescription className="text-xs">Deprecated</CardDescription>
            <CardTitle className="text-2xl text-muted-foreground">
              {stats?.byStatus.deprecated ?? 0}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* By Type */}
      {stats?.byType && Object.keys(stats.byType).length > 0 && (
        <Card>
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm font-semibold">Models by Type</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="flex flex-wrap gap-2">
              {Object.entries(stats.byType).map(([t, count]) => (
                <Badge key={t} variant="secondary" className="text-xs capitalize">
                  {t}: {count}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quick Actions */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card
          className="cursor-pointer hover:border-primary/50 transition-colors"
          onClick={() => navigate("/models")}
        >
          <CardHeader className="p-4 space-y-2">
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="bg-blue-500/10 text-blue-500 px-2 py-1">
                <Package className="w-3.5 h-3.5" />
              </Badge>
              <CardTitle className="text-sm font-semibold">Browse Models</CardTitle>
            </div>
            <CardDescription className="text-xs">View all registered models in catalog</CardDescription>
          </CardHeader>
        </Card>
        <Card
          className="cursor-pointer hover:border-primary/50 transition-colors"
          onClick={() => navigate("/models/wizard")}
        >
          <CardHeader className="p-4 space-y-2">
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="bg-green-500/10 text-green-500 px-2 py-1">
                <Plus className="w-3.5 h-3.5" />
              </Badge>
              <CardTitle className="text-sm font-semibold">Register Model</CardTitle>
            </div>
            <CardDescription className="text-xs">Register a new model into the catalog</CardDescription>
          </CardHeader>
        </Card>
        <Card
          className="cursor-pointer hover:border-primary/50 transition-colors"
          onClick={() => navigate("/models/control-panel")}
        >
          <CardHeader className="p-4 space-y-2">
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="bg-purple-500/10 text-purple-500 px-2 py-1">
                <Settings className="w-3.5 h-3.5" />
              </Badge>
              <CardTitle className="text-sm font-semibold">Control Panel</CardTitle>
            </div>
            <CardDescription className="text-xs">Manage governance & lifecycle</CardDescription>
          </CardHeader>
        </Card>
      </div>

      {/* Recent Registrations */}
      <Card>
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-sm font-semibold">Recent Registrations</CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          {stats?.recentRegistrations && stats.recentRegistrations.length > 0 ? (
            <div className="space-y-2">
              {stats.recentRegistrations.map((m: any) => (
                <div
                  key={m.id}
                  className="flex items-center justify-between p-2 rounded border border-border/50"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Brain className="w-4 h-4 text-muted-foreground shrink-0" />
                    <span className="text-sm truncate">{m.displayName || m.name}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <StatusBadge status={m.status} />
                    {m.createdAt && (
                      <span className="text-xs text-muted-foreground">
                        {new Date(m.createdAt).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No models registered yet. Use the wizard to register your first model.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================================
// Control Panel Section
// ============================================================================

function ModelsControlPanel() {
  const modelsQuery = trpc.models.list.useQuery();
  const updateStatus = trpc.models.updateStatus.useMutation();
  const utils = trpc.useUtils();
  const models = modelsQuery.data ?? [];
  const isLoading = modelsQuery.isLoading;

  const handleStatusChange = async (id: number, status: "draft" | "ready" | "active" | "deprecated" | "disabled") => {
    try {
      await updateStatus.mutateAsync({ id, status });
      utils.models.list.invalidate();
      utils.models.getStats.invalidate();
    } catch {
      // toast error handled by trpc
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-sm font-semibold">Model Governance Table</CardTitle>
          <CardDescription className="text-xs">
            All registered models with lifecycle status, validation, and catalog eligibility.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 pt-2">
          {models.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No models in the catalog yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/50">
                    <th className="text-left py-2 px-2 font-medium text-muted-foreground">Model</th>
                    <th className="text-left py-2 px-2 font-medium text-muted-foreground">Type</th>
                    <th className="text-left py-2 px-2 font-medium text-muted-foreground">Status</th>
                    <th className="text-left py-2 px-2 font-medium text-muted-foreground">Params</th>
                    <th className="text-left py-2 px-2 font-medium text-muted-foreground">Context</th>
                    <th className="text-right py-2 px-2 font-medium text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {models.map((m: any) => {
                    return (
                      <tr key={m.id} className="border-b border-border/30 hover:bg-muted/20">
                        <td className="py-2 px-2">
                          <div className="flex flex-col">
                            <span className="font-medium">{m.displayName || m.name}</span>
                            <span className="text-xs text-muted-foreground truncate max-w-[200px]">{m.name}</span>
                          </div>
                        </td>
                        <td className="py-2 px-2">
                          <Badge variant="outline" className="text-xs capitalize">
                            {m.modelType || "uncategorized"}
                          </Badge>
                        </td>
                        <td className="py-2 px-2">
                          <StatusBadge status={m.status} />
                        </td>
                        <td className="py-2 px-2 text-xs text-muted-foreground">
                          {m.parameterCount || "—"}
                        </td>
                        <td className="py-2 px-2 text-xs text-muted-foreground">
                          {m.contextLength ? m.contextLength.toLocaleString() : "—"}
                        </td>
                        <td className="py-2 px-2 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {m.status === "draft" && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs"
                                onClick={() => handleStatusChange(m.id, "ready")}
                                disabled={updateStatus.isPending}
                              >
                                Mark Ready
                              </Button>
                            )}
                            {m.status === "ready" && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs"
                                onClick={() => handleStatusChange(m.id, "active")}
                                disabled={updateStatus.isPending}
                              >
                                Activate
                              </Button>
                            )}
                            {m.status === "active" && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs"
                                onClick={() => handleStatusChange(m.id, "deprecated")}
                                disabled={updateStatus.isPending}
                              >
                                Deprecate
                              </Button>
                            )}
                            {m.status === "deprecated" && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs"
                                onClick={() => handleStatusChange(m.id, "active")}
                                disabled={updateStatus.isPending}
                              >
                                Reactivate
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================================
// Model Registration Wizard
// ============================================================================

const WIZARD_STEPS = [
  { label: "Identity", icon: FileText },
  { label: "Provider", icon: Layers },
  { label: "Details", icon: BarChart3 },
  { label: "Provenance", icon: Shield },
  { label: "Review", icon: CheckCircle },
] as const;

function ModelWizard() {
  const [, navigate] = useLocation();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    name: "",
    displayName: "",
    description: "",
    providerId: undefined as number | undefined,
    providerName: "",
    contextLength: "",
    size: "",
    license: "",
    source: "" as "" | "huggingface" | "ollama" | "direct" | "custom",
    checksum: "",
    capabilities: [] as string[],
    category: "base_llm",
  });
  const [capInput, setCapInput] = useState("");

  const providersQuery = trpc.catalogManage.list.useQuery({ entryType: "provider" });
  const registerMutation = trpc.models.register.useMutation();
  const utils = trpc.useUtils();

  const providers = providersQuery.data ?? [];

  const handleRegister = async () => {
    try {
      await registerMutation.mutateAsync({
        name: form.name,
        displayName: form.displayName || undefined,
        description: form.description || undefined,
        providerId: form.providerId,
        providerName: form.providerName || undefined,
        contextLength: form.contextLength ? Number(form.contextLength) : undefined,
        size: form.size || undefined,
        license: form.license || undefined,
        source: form.source || undefined,
        checksum: form.checksum || undefined,
        capabilities: form.capabilities.length > 0 ? form.capabilities : undefined,
        category: form.category,
      });
      utils.models.invalidate();
      navigate("/list/models");
    } catch {
      // trpc error toast
    }
  };

  const addCapability = () => {
    const cap = capInput.trim();
    if (cap && !form.capabilities.includes(cap)) {
      setForm((prev) => ({ ...prev, capabilities: [...prev.capabilities, cap] }));
      setCapInput("");
    }
  };

  const removeCapability = (cap: string) => {
    setForm((prev) => ({
      ...prev,
      capabilities: prev.capabilities.filter((c) => c !== cap),
    }));
  };

  const canProceed = () => {
    if (step === 0) return form.name.trim().length > 0;
    return true;
  };

  return (
    <div className="space-y-6">
      {/* Step Indicator */}
      <div className="flex items-center gap-1 overflow-x-auto pb-2">
        {WIZARD_STEPS.map((s, i) => (
          <div key={s.label} className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => i <= step && setStep(i)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                i === step
                  ? "bg-primary text-primary-foreground"
                  : i < step
                    ? "bg-primary/20 text-primary cursor-pointer"
                    : "bg-muted text-muted-foreground"
              }`}
            >
              <s.icon className="w-3.5 h-3.5" />
              {s.label}
            </button>
            {i < WIZARD_STEPS.length - 1 && (
              <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
            )}
          </div>
        ))}
      </div>

      {/* Step Content */}
      <Card>
        <CardContent className="p-6 space-y-4">
          {step === 0 && (
            <>
              <h3 className="font-semibold">Model Identity</h3>
              <div className="space-y-3">
                <div>
                  <label className="text-sm text-muted-foreground">Model Name *</label>
                  <Input
                    placeholder="e.g. llama-3.2-8b"
                    value={form.name}
                    onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-sm text-muted-foreground">Display Name</label>
                  <Input
                    placeholder="e.g. Llama 3.2 8B"
                    value={form.displayName}
                    onChange={(e) => setForm((p) => ({ ...p, displayName: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-sm text-muted-foreground">Description</label>
                  <Textarea
                    placeholder="Brief description of the model"
                    value={form.description}
                    onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                    rows={3}
                  />
                </div>
                <div>
                  <label className="text-sm text-muted-foreground">Category</label>
                  <Select value={form.category} onValueChange={(v) => setForm((p) => ({ ...p, category: v }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="base_llm">Base LLM</SelectItem>
                      <SelectItem value="fine_tuned">Fine-Tuned</SelectItem>
                      <SelectItem value="quantized">Quantized</SelectItem>
                      <SelectItem value="embedding">Embedding</SelectItem>
                      <SelectItem value="multimodal">Multimodal</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <h3 className="font-semibold">Provider Selection</h3>
              <p className="text-sm text-muted-foreground">
                Select the provider this model runs on, or leave blank to assign later.
              </p>
              <div className="space-y-3">
                {providers.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4">
                    No providers registered yet. You can assign a provider later.
                  </p>
                ) : (
                  <div className="space-y-2 max-h-[300px] overflow-y-auto">
                    <div
                      className={`p-3 rounded border cursor-pointer transition-colors ${
                        !form.providerId ? "border-primary bg-primary/5" : "border-border/50 hover:border-primary/50"
                      }`}
                      onClick={() => setForm((p) => ({ ...p, providerId: undefined, providerName: "" }))}
                    >
                      <span className="text-sm">None (assign later)</span>
                    </div>
                    {providers.map((prov: any) => (
                      <div
                        key={prov.id}
                        className={`p-3 rounded border cursor-pointer transition-colors ${
                          form.providerId === prov.id
                            ? "border-primary bg-primary/5"
                            : "border-border/50 hover:border-primary/50"
                        }`}
                        onClick={() =>
                          setForm((p) => ({
                            ...p,
                            providerId: prov.id,
                            providerName: prov.displayName || prov.name,
                          }))
                        }
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">{prov.displayName || prov.name}</span>
                          <StatusBadge status={prov.status} />
                        </div>
                        {prov.description && (
                          <p className="text-xs text-muted-foreground mt-1 truncate">{prov.description}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <h3 className="font-semibold">Model Details</h3>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm text-muted-foreground">Context Length</label>
                    <Input
                      type="number"
                      placeholder="e.g. 128000"
                      value={form.contextLength}
                      onChange={(e) => setForm((p) => ({ ...p, contextLength: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground">Size</label>
                    <Input
                      placeholder="e.g. 8B, 70B"
                      value={form.size}
                      onChange={(e) => setForm((p) => ({ ...p, size: e.target.value }))}
                    />
                  </div>
                </div>
                <div>
                  <label className="text-sm text-muted-foreground">License</label>
                  <Input
                    placeholder="e.g. Apache 2.0, MIT, Llama 3.2 Community"
                    value={form.license}
                    onChange={(e) => setForm((p) => ({ ...p, license: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-sm text-muted-foreground">Capabilities</label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="e.g. code_generation"
                      value={capInput}
                      onChange={(e) => setCapInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addCapability())}
                    />
                    <Button size="sm" variant="outline" onClick={addCapability}>
                      Add
                    </Button>
                  </div>
                  {form.capabilities.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {form.capabilities.map((cap) => (
                        <Badge
                          key={cap}
                          variant="secondary"
                          className="text-xs cursor-pointer"
                          onClick={() => removeCapability(cap)}
                        >
                          {cap} &times;
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <h3 className="font-semibold">Provenance</h3>
              <p className="text-sm text-muted-foreground">
                Track model origin for audit and compliance.
              </p>
              <div className="space-y-3">
                <div>
                  <label className="text-sm text-muted-foreground">Source</label>
                  <Select
                    value={form.source || "none"}
                    onValueChange={(v) => setForm((p) => ({ ...p, source: v === "none" ? "" : v as any }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select source" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Not specified</SelectItem>
                      <SelectItem value="huggingface">HuggingFace</SelectItem>
                      <SelectItem value="ollama">Ollama</SelectItem>
                      <SelectItem value="direct">Direct Download</SelectItem>
                      <SelectItem value="custom">Custom</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm text-muted-foreground">Artifact Checksum (SHA-256)</label>
                  <Input
                    placeholder="e.g. sha256:abc123..."
                    value={form.checksum}
                    onChange={(e) => setForm((p) => ({ ...p, checksum: e.target.value }))}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Optional. Used for integrity verification.
                  </p>
                </div>
              </div>
            </>
          )}

          {step === 4 && (
            <>
              <h3 className="font-semibold">Review & Register</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Review your model registration before submitting.
              </p>
              <div className="space-y-2 text-sm">
                <Row label="Name" value={form.name} />
                <Row label="Display Name" value={form.displayName || form.name} />
                <Row label="Category" value={form.category} />
                {form.description && <Row label="Description" value={form.description} />}
                <Row label="Provider" value={form.providerName || "None (assign later)"} />
                {form.contextLength && <Row label="Context Length" value={form.contextLength} />}
                {form.size && <Row label="Size" value={form.size} />}
                {form.license && <Row label="License" value={form.license} />}
                {form.source && <Row label="Source" value={form.source} />}
                {form.checksum && <Row label="Checksum" value={form.checksum} />}
                {form.capabilities.length > 0 && (
                  <Row label="Capabilities" value={form.capabilities.join(", ")} />
                )}
              </div>
              <div className="mt-4 p-3 rounded bg-yellow-500/10 border border-yellow-500/20 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-yellow-500 mt-0.5 shrink-0" />
                <p className="text-xs text-yellow-500">
                  The model will be created in <strong>draft</strong> status.
                  Set it to <strong>ready</strong> or <strong>active</strong> to make it eligible for Catalog import.
                </p>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setStep((s) => s - 1)}
          disabled={step === 0}
        >
          <ChevronLeft className="w-4 h-4 mr-1" /> Back
        </Button>
        {step < WIZARD_STEPS.length - 1 ? (
          <Button size="sm" onClick={() => setStep((s) => s + 1)} disabled={!canProceed()}>
            Next <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        ) : (
          <Button
            size="sm"
            onClick={handleRegister}
            disabled={registerMutation.isPending || !form.name.trim()}
          >
            {registerMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin mr-1" />
            ) : (
              <CheckCircle className="w-4 h-4 mr-1" />
            )}
            Register Model
          </Button>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Shared Components
// ============================================================================

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    active: "bg-green-500/10 text-green-500 border-green-500/20",
    ready: "bg-blue-500/10 text-blue-500 border-blue-500/20",
    draft: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
    deprecated: "bg-gray-500/10 text-gray-400 border-gray-500/20",
    disabled: "bg-red-500/10 text-red-500 border-red-500/20",
  };
  return (
    <Badge variant="outline" className={`text-xs ${colors[status] || ""}`}>
      {status}
    </Badge>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-muted-foreground w-28 shrink-0">{label}:</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

// ============================================================================
// Main Page (route dispatcher)
// ============================================================================

const sectionTitles: Record<string, string> = {
  dashboard: "Models Dashboard",
  "control-panel": "Models Control Panel",
  wizard: "Register Model",
};

const sectionDescriptions: Record<string, string> = {
  dashboard: "Overview of all governed models, statistics, and quick actions.",
  "control-panel": "Manage model lifecycle, governance status, and catalog eligibility.",
  wizard: "Register a new model into the governed catalog.",
};

export default function ModelsComingSoonPage() {
  const [, params] = useRoute("/models/:section");
  const section = params?.section ?? "dashboard";
  const title = sectionTitles[section] ?? "Models";
  const description = sectionDescriptions[section] ?? "";

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold">{title}</h1>
        {description && <p className="text-muted-foreground mt-1 text-sm">{description}</p>}
      </div>

      {section === "dashboard" && <ModelsDashboard />}
      {section === "control-panel" && <ModelsControlPanel />}
      {section === "wizard" && <ModelWizard />}
    </div>
  );
}
