/**
 * CatalogImportWizard — 4-step modal for importing catalog entries via API discovery
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * Import Catalog → Candidate Registration Pipeline
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * 1. Discovery (Import Catalog Wizard)
 *    - Open LLM Catalogue → Candidate page, click Import Catalog Entries
 *    - Select API Discovery, type a provider website (e.g. ai21.com) and press Enter
 *    - The system calls catalogManage.discoverProvider — scrapes the website,
 *      detects the provider name, API base URL, auth type, model count, and description
 *    - On success, a green "Found: AI21" status appears with the detected API URL
 *    - No authentication (PAT) required at any step of the workflow — discovery,
 *      submission, and approval all operate without API keys or personal access tokens
 *
 * 2. Submit to Candidate Register
 *    - The Submit button activates once discovery succeeds
 *    - Clicking Submit calls catalogManage.submitFromDiscovery with governance
 *      evidence (_evidence: { types: ["reason"], refs: ["auto-discovery"] })
 *    - The server creates a catalog entry with status: "draft", origin: "discovery",
 *      reviewState: "needs_review", tags ["ai21.com", "candidate"]
 *    - It auto-classifies the entry with the first taxonomy axis node
 *    - The wizard closes, the Candidate page refetches, and you're navigated to the Register tab
 *
 * 3. Registration Review
 *    - The new entry appears in the Register tab with a Review badge
 *    - Clicking Review opens the Governance Review Dialog, which runs
 *      governance.stageReview with targetStage: "register"
 *    - The system evaluates 6 registration checks:
 *      - REG-01: Classification assigned (auto-done at submit)
 *      - REG-02: No architecture bypass flags in config
 *      - REG-03: RBAC mapping defined (actor has a role)
 *      - REG-04: Documentation provided (description >= 10 chars)
 *      - REG-05: API surface declared (config or capabilities present)
 *      - REG-06: No direct localhost provider call patterns
 *    - The checklist shows pass/fail for each item with a score percentage
 *
 * 4. Approve Registration
 *    - If all checks pass, click Approve Registration
 *    - This calls catalogManage.approve with stage: "register" and governance
 *      evidence (_evidence: { types: ["reason"], refs: ["stage-review-approved"] })
 *    - The server re-evaluates the stage review, updates stageReviews:
 *      { register: "approved" }, adds the "registered" tag, and sets the next
 *      stage (validate) to "needs_review"
 *    - The entry now appears in the Validate tab for the next pipeline stage
 *
 * 5. Subsequent Stages (Validate → Publish)
 *    - Validate: Run orchestrator validation, review 12 validation checks, approve validation
 *    - Publish: Create a versioned bundle, review 6 publication checks, approve publication
 *    - Each stage follows the same pattern: checklist review → approve → tag propagated → next stage unlocked
 *
 * 6. Batch Discovery Behavior
 *    - Individual "Submit" only marks the entry as submitted and shows a toast — the popup
 *      stays open so you can keep submitting others
 *    - Close button: When you're done and click Close, if any entries were submitted it
 *      navigates to the Candidate Register tab; otherwise it just closes
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */
import { useState } from "react";
import { useLocation } from "wouter";
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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Loader2,
  Globe,
  FileUp,
  Database,
  FileCode,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Search,
  ArrowLeft,
  ArrowRight,
  Download,
  Plus,
  Wand2,
  Brain,
  Workflow,
  Package,
} from "lucide-react";
import { toast } from "sonner";
import type {
  PreviewEntry,
  BulkCreateResult,
} from "../../../shared/catalog-import-types";

interface CatalogImportWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete?: () => void;
  /** When true, submitted entries navigate to Candidate page instead of staying */
  navigateToCandidate?: boolean;
}

type WizardStep = 1 | 2 | 3 | 4;

const METHODS = [
  {
    id: "api_discovery" as const,
    label: "API Discovery",
    description: "Discover models from a provider API endpoint",
    icon: Globe,
    enabled: true,
  },
  {
    id: "file_upload" as const,
    label: "File Import",
    description: "Import from CSV, JSON, or YAML file",
    icon: FileUp,
    enabled: false,
  },
  {
    id: "registry_sync" as const,
    label: "Registry Sync",
    description: "Sync from built-in provider registry",
    icon: Database,
    enabled: false,
  },
  {
    id: "openapi_spec" as const,
    label: "OpenAPI Spec",
    description: "Import from an OpenAPI specification",
    icon: FileCode,
    enabled: false,
  },
];

const DUPLICATE_BADGES: Record<string, { label: string; className: string }> = {
  new: { label: "New", className: "bg-green-600/20 text-green-400 border-green-600/30" },
  exact_match: { label: "Exact Match", className: "bg-gray-600/20 text-gray-400 border-gray-600/30" },
  fuzzy_match: { label: "Similar", className: "bg-yellow-600/20 text-yellow-400 border-yellow-600/30" },
  conflict: { label: "Conflict", className: "bg-red-600/20 text-red-400 border-red-600/30" },
};

const RISK_BADGES: Record<string, { label: string; className: string }> = {
  low: { label: "Low Risk", className: "bg-green-600/20 text-green-400 border-green-600/30" },
  medium: { label: "Med Risk", className: "bg-yellow-600/20 text-yellow-400 border-yellow-600/30" },
  high: { label: "High Risk", className: "bg-red-600/20 text-red-400 border-red-600/30" },
};

export function CatalogImportWizard({
  open,
  onOpenChange,
  onComplete,
  navigateToCandidate,
}: CatalogImportWizardProps) {
  const [, navigate] = useLocation();
  const [step, setStep] = useState<WizardStep>(1);
  const [method, setMethod] = useState<string>("api_discovery");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [previewRows, setPreviewRows] = useState<(PreviewEntry & { selected: boolean })[]>([]);
  const [importResult, setImportResult] = useState<BulkCreateResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [forceConflicts, setForceConflicts] = useState(false);
  const [selectedProviderId, setSelectedProviderId] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [batchResults, setBatchResults] = useState<Array<{ url: string; status: "pending" | "discovering" | "found" | "failed"; data?: any; registered?: boolean }>>([]);
  const [batchDiscovering, setBatchDiscovering] = useState(false);
  const [batchPopupOpen, setBatchPopupOpen] = useState(false);
  const normalizeUrl = (u: string) => {
    const v = u.trim();
    if (!v) return v;
    return /^https?:\/\//i.test(v) ? v : `https://${v}`;
  };

  const discoverMutation = trpc.catalogImport.discoverFromApi.useMutation();
  const websiteDiscoverMutation = trpc.catalogManage.discoverProvider.useMutation();
  const trpcUtils = trpc.useUtils();
  const bulkCreateMutation = trpc.catalogImport.bulkCreate.useMutation();
  const catalogListQuery = trpc.catalogManage.list.useQuery({ entryType: "provider" });
  const existingSlugs = new Set(
    (catalogListQuery.data || []).map((e: any) => e.name?.toLowerCase())
  );
  const registerMutation = trpc.catalogManage.create.useMutation({
    onSuccess: () => {
      trpcUtils.catalogManage.list.invalidate();
    },
  });
  const submitFromDiscoveryMutation = trpc.catalogManage.submitFromDiscovery.useMutation({
    onSuccess: () => {
      trpcUtils.catalogManage.list.invalidate();
    },
  });

  const runBatchDiscovery = async () => {
    const urls = websiteUrl
      .split(/[,\n]+/)
      .map((u) => u.trim())
      .filter(Boolean);
    if (urls.length === 0) return;

    const entries = urls.map((url) => ({ url: normalizeUrl(url), status: "pending" as const }));
    setBatchResults(entries);
    setBatchDiscovering(true);
    setBatchPopupOpen(true);

    // Discover all in parallel, updating state as each finishes
    await Promise.allSettled(
      entries.map(async (entry, i) => {
        setBatchResults((prev) => {
          const copy = [...prev];
          copy[i] = { ...copy[i], status: "discovering" };
          return copy;
        });
        try {
          const result = await websiteDiscoverMutation.mutateAsync({ websiteUrl: entry.url });
          setBatchResults((prev) => {
            const copy = [...prev];
            copy[i] = { ...copy[i], status: result.name ? "found" : "failed", data: result };
            return copy;
          });
        } catch {
          setBatchResults((prev) => {
            const copy = [...prev];
            copy[i] = { ...copy[i], status: "failed" };
            return copy;
          });
        }
      })
    );
    setBatchDiscovering(false);
  };

  const getSlug = (result: any) =>
    result.registrySlug || result.domain.replace(/\.(com|ai|io|dev|org|net|co)$/i, "").replace(/[^a-z0-9]+/gi, "-").toLowerCase();

  const isAlreadyRegistered = (result: any) => {
    if (!result) return false;
    const slug = getSlug(result);
    return existingSlugs.has(slug.toLowerCase());
  };

  const registerOne = async (index: number) => {
    const entry = batchResults[index];
    if (!entry?.data?.name) return;
    const result = entry.data;
    const slug = getSlug(result);
    if (existingSlugs.has(slug.toLowerCase())) {
      toast.error(`${result.name || slug} already exists in catalog`);
      return;
    }
    try {
      await submitFromDiscoveryMutation.mutateAsync({
        subjectId: 0,
        stage: "submit",
        subjectType: "provider",
        subjectName: slug,
        tags: [result.domain, "candidate"],
        name: slug,
        displayName: result.name || slug,
        description: result.description || undefined,
        config: {
          baseUrl: result.api?.bestUrl || undefined,
          registryId: result.registrySlug || undefined,
          websiteUrl: entry.url,
        },
        discoveryArtifactId: result.artifact?.artifactId || "legacy",
        origin: "import",
        _evidence: { types: ["reason"], refs: ["auto-discovery"] },
      });
      const updated = [...batchResults];
      updated[index] = { ...entry, registered: true };
      setBatchResults(updated);
      toast.success(`Submitted: ${result.name}`);
    } catch (e: any) {
      toast.error(`Failed to register ${result.name}: ${e.message}`);
    }
  };

  const registerAll = async () => {
    const registerable = batchResults
      .map((e, i) => ({ ...e, i }))
      .filter((e) => e.status === "found" && e.data?.name && !e.registered && !isAlreadyRegistered(e.data));
    for (const entry of registerable) {
      await registerOne(entry.i);
    }
  };

  // Reset state when dialog closes
  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      setStep(1);
      setMethod("api_discovery");
      setBaseUrl("");
      setApiKey("");
      setSessionId(null);
      setPreviewRows([]);
      setImportResult(null);
      setError(null);
      setForceConflicts(false);
      setSelectedProviderId("");
      setWebsiteUrl("");
    }
    onOpenChange(isOpen);
  };

  // Well-known base URLs for cloud providers (providerId → API base)
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
    groq: "https://api.groq.com/openai/v1",
    ollama: "http://localhost:11434",
    llamacpp: "http://localhost:8080",
  };

  // When a provider is selected from the dropdown, auto-fill URL and key
  const handleProviderSelect = async (value: string) => {
    setSelectedProviderId(value);
    if (!value) return;
    try {
      const entry = await trpcUtils.catalogManage.getById.fetch({ id: Number(value) });
      const config = entry.config as Record<string, any> | null;
      const registryId = (config?.registryId || config?.providerId || entry.name) as string | undefined;
      const providerType = config?.type as string | undefined;
      const displayName = (entry as any).displayName || entry.name;

      // 1. Auto-fill base URL: catalog config → well-known URL by name/type/displayName
      const nameLower = entry.name?.toLowerCase();
      const url = config?.baseUrl || config?.apiUrl || config?.endpoint
        || (registryId && PROVIDER_BASE_URLS[registryId])
        || (providerType && PROVIDER_BASE_URLS[providerType])
        || (nameLower && PROVIDER_BASE_URLS[nameLower]);
      if (url) {
        setBaseUrl(url);
        toast.success(`${displayName}: auto-filled ${url}`);
      } else {
        toast.info(`${displayName} selected — enter the API base URL manually`);
      }

      // 2. Auto-fill API key — use dedicated decrypt endpoint
      let resolvedKey: string | undefined;

      // Source A: catalog entry's own config (plaintext, saved from previous discovery)
      if (config?.apiKey) {
        resolvedKey = config.apiKey as string;
      }

      // Source B: provider registry via dedicated decrypt endpoint (handles encrypted keys)
      if (!resolvedKey && registryId) {
        try {
          const result = await trpcUtils.providers.getApiKeyByType.fetch({ type: registryId });
          if (result?.apiKey) resolvedKey = result.apiKey;
        } catch {
          // Provider key lookup failed
        }
      }

      // Source C: try matching by provider name
      if (!resolvedKey) {
        const typesToTry = [providerType, nameLower].filter(Boolean) as string[];
        for (const t of typesToTry) {
          try {
            const result = await trpcUtils.providers.getApiKeyByType.fetch({ type: t });
            if (result?.apiKey) { resolvedKey = result.apiKey; break; }
          } catch { /* skip */ }
        }
      }

      if (resolvedKey) setApiKey(resolvedKey);
    } catch {
      // Catalog entry fetch failed — try well-known URL by value as fallback
      toast.error("Could not fetch provider details — enter URL manually");
    }
  };

  // Step 2 → Step 3: Trigger discovery
  const handleDiscover = async () => {
    setError(null);
    try {
      const result = await discoverMutation.mutateAsync({
        baseUrl,
        apiKey: apiKey || undefined,
        providerId: selectedProviderId ? Number(selectedProviderId) : undefined,
      });

      if (result.error) {
        setError(result.error);
        return;
      }

      setSessionId(result.sessionId);

      // Fetch preview using the sessionId from the result directly (not stale state)
      const preview = await trpcUtils.catalogImport.getPreview.fetch(
        { sessionId: result.sessionId }
      );
      if (preview && preview.rows.length > 0) {
        setPreviewRows(
          preview.rows.map((r: PreviewEntry) => ({
            ...r,
            selected: r.duplicateStatus === "new" || r.duplicateStatus === "fuzzy_match",
          }))
        );
        setStep(3);
      } else {
        setError("Discovery completed but no models were returned");
      }
    } catch (e: any) {
      setError(e.message);
    }
  };

  // Step 3 → Step 4: Bulk create
  const handleImport = async () => {
    if (!sessionId) return;
    setError(null);

    const selectedIds = previewRows
      .filter((r) => r.selected)
      .map((r) => r.tempId);

    if (selectedIds.length === 0) {
      setError("No entries selected for import");
      return;
    }

    try {
      const result = await bulkCreateMutation.mutateAsync({
        sessionId,
        selectedTempIds: selectedIds,
        forceConflicts,
      });
      setImportResult(result);
      setStep(4);
    } catch (e: any) {
      setError(e.message);
    }
  };

  const toggleRow = (tempId: string) => {
    setPreviewRows((prev) =>
      prev.map((r) => (r.tempId === tempId ? { ...r, selected: !r.selected } : r))
    );
  };

  const toggleAll = (checked: boolean) => {
    setPreviewRows((prev) => prev.map((r) => ({ ...r, selected: checked })));
  };

  const selectedCount = previewRows.filter((r) => r.selected).length;

  const batchFoundCount = batchResults.filter((r) => r.status === "found" && r.data?.name && !r.registered && !isAlreadyRegistered(r.data)).length;
  const batchRegisteredCount = batchResults.filter((r) => r.registered).length;

  return (
    <>
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Import Catalog Entries
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              Step {step} of 4
            </span>
          </DialogTitle>
          <DialogDescription>
            {step === 1 && "Choose how you want to discover and import entries"}
            {step === 2 && "Configure the import source"}
            {step === 3 && "Review discovered entries before importing"}
            {step === 4 && "Import complete"}
          </DialogDescription>
        </DialogHeader>

        {/* Step 1: Method Selection */}
        {step === 1 && (
          <div className="grid grid-cols-2 gap-3 py-4">
            {METHODS.map((m) => {
              const Icon = m.icon;
              return (
                <button
                  key={m.id}
                  disabled={!m.enabled}
                  onClick={() => { setMethod(m.id); setStep(2); }}
                  className={`flex items-start gap-3 p-4 rounded-lg border text-left transition-colors
                    ${m.enabled ? "hover:bg-accent cursor-pointer" : "opacity-40 cursor-not-allowed"}
                    ${method === m.id ? "border-primary bg-accent" : "border-border"}`}
                >
                  <Icon className="h-5 w-5 mt-0.5 shrink-0" />
                  <div>
                    <div className="font-medium text-sm">{m.label}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{m.description}</div>
                    {!m.enabled && (
                      <Badge variant="outline" className="mt-1 text-xs">Coming Soon</Badge>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* Step 2: Input Form */}
        {step === 2 && method === "api_discovery" && (
          <div className="space-y-4 py-4">
            {/* Card 1: Configure the import source */}
            <div className="border rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-2 font-medium text-sm">
                <Search className="h-4 w-4" />
                Configure the import source
              </div>
              <div className="flex gap-2">
                <Input
                  placeholder="ai21.com, reka.ai, voyage.ai"
                  value={websiteUrl}
                  onChange={(e) => setWebsiteUrl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && websiteUrl.trim()) {
                      e.preventDefault();
                      const urls = websiteUrl.split(/[,\n]+/).map((u) => u.trim()).filter(Boolean);
                      if (urls.length > 1) {
                        runBatchDiscovery();
                      } else {
                        websiteDiscoverMutation.mutateAsync({ websiteUrl: normalizeUrl(websiteUrl) }).then((result: any) => {
                          if (result.api?.bestUrl) {
                            setBaseUrl(result.api.bestUrl);
                          }
                        }).catch(() => {});
                      }
                    }
                  }}
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  disabled={!websiteUrl.trim() || websiteDiscoverMutation.isPending || batchDiscovering}
                  onClick={() => {
                    const urls = websiteUrl.split(/[,\n]+/).map((u) => u.trim()).filter(Boolean);
                    if (urls.length > 1) {
                      runBatchDiscovery();
                    } else {
                      websiteDiscoverMutation.mutateAsync({ websiteUrl: normalizeUrl(websiteUrl) }).then((result: any) => {
                        if (result.api?.bestUrl) {
                          setBaseUrl(result.api.bestUrl);
                        }
                      }).catch(() => {});
                    }
                  }}
                >
                  {websiteDiscoverMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Globe className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <div className="flex items-center justify-between">
                <p className="text-xs text-green-400">
                  {websiteDiscoverMutation.isSuccess && websiteDiscoverMutation.data && (
                    <>
                      Found: {(websiteDiscoverMutation.data as any).name || (websiteDiscoverMutation.data as any).domain}
                      {(websiteDiscoverMutation.data as any).api?.bestUrl && ` — ${(websiteDiscoverMutation.data as any).api.bestUrl}`}
                    </>
                  )}
                </p>
                {websiteDiscoverMutation.data && isAlreadyRegistered(websiteDiscoverMutation.data as any) ? (
                  <Badge variant="outline" className="text-muted-foreground border-muted text-xs">Exists</Badge>
                ) : (
                <Button
                  size="sm"
                  variant="default"
                  className="h-6 text-xs shrink-0"
                  disabled={!(websiteDiscoverMutation.data as any)?.name || registerMutation.isPending || submitFromDiscoveryMutation.isPending}
                  onClick={() => {
                    const result = websiteDiscoverMutation.data as any;
                    const slug = getSlug(result);
                    if (existingSlugs.has(slug.toLowerCase())) {
                      toast.error(`${result.name || slug} already exists in catalog`);
                      return;
                    }
                    submitFromDiscoveryMutation.mutate({
                      subjectId: 0,
                      stage: "submit",
                      subjectType: "provider",
                      subjectName: slug,
                      tags: [result.domain, "candidate"],
                      name: slug,
                      displayName: result.name || slug,
                      description: result.description || undefined,
                      config: {
                        baseUrl: result.api?.bestUrl || undefined,
                        registryId: result.registrySlug || undefined,
                        websiteUrl: normalizeUrl(websiteUrl),
                      },
                      discoveryArtifactId: result.artifact?.artifactId || "legacy",
                      origin: "import",
                      _evidence: { types: ["reason"], refs: ["auto-discovery"] },
                    }, {
                      onSuccess: () => {
                        toast.success(`Submitted: ${result.name || slug}`);
                        onOpenChange(false);
                        onComplete?.();
                        navigate("/llm/catalogue/candidate");
                      },
                    });
                  }}
                >
                  {(registerMutation.isPending || submitFromDiscoveryMutation.isPending) ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Plus className="h-3 w-3 mr-1" />}
                  Submit
                </Button>
                )}
              </div>
              {websiteDiscoverMutation.isError && (
                <p className="text-xs text-red-400">Discovery failed — enter URL manually below</p>
              )}
              <p className="text-xs text-muted-foreground">
                Paste one or more provider websites (comma-separated) to auto-detect
              </p>
            </div>

            {/* Card 2: Select manually */}
            <div className="border rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-2 font-medium text-sm">
                <Globe className="h-4 w-4" />
                Select manually
              </div>
              <div className="space-y-2">
                <Label>Provider (optional)</Label>
                <CatalogSelect
                  entryType="provider"
                  value={selectedProviderId}
                  onValueChange={handleProviderSelect}
                  placeholder="Select a provider to auto-fill..."
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="baseUrl" className="flex items-center gap-2">
                  Provider API Base URL
                  {baseUrl && websiteDiscoverMutation.isSuccess && <CheckCircle2 className="h-4 w-4 text-green-500" />}
                </Label>
                <Input
                  id="baseUrl"
                  placeholder="https://api.openai.com"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Supports OpenAI-compatible (/v1/models) and Ollama (/api/tags) endpoints
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="apiKey">API Key (optional)</Label>
                <Input
                  id="apiKey"
                  type="password"
                  placeholder="sk-..."
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Required for authenticated APIs (OpenAI, Anthropic, etc.)
                </p>
              </div>
              <Button
                onClick={handleDiscover}
                disabled={!baseUrl || discoverMutation.isPending}
                size="sm"
                className="w-full"
              >
                {discoverMutation.isPending ? (
                  <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Discovering...</>
                ) : (
                  <><Search className="h-4 w-4 mr-1" />Discover</>
                )}
              </Button>
            </div>

            {/* Card 3: From Wizard */}
            <div className="border rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-2 font-medium text-sm">
                <Wand2 className="h-4 w-4" />
                From Wizard
              </div>
              <p className="text-xs text-muted-foreground">
                Select a deployable LLM or callable Agent for Catalog onboarding, or create entries through guided wizards
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { onOpenChange(false); navigate("/list/llms?mode=catalog-import&deployableOnly=1&returnTo=/llm/catalogue/candidate"); }}
                >
                  <Brain className="h-4 w-4 mr-1" />
                  LLM Select
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { onOpenChange(false); navigate("/llm/wizard"); }}
                >
                  <Brain className="h-4 w-4 mr-1" />
                  LLM Quick Setup
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { onOpenChange(false); navigate("/llm/create"); }}
                >
                  <Brain className="h-4 w-4 mr-1" />
                  LLM Creation
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { onOpenChange(false); navigate("/list/models?mode=catalog-import&deployableOnly=1&returnTo=/llm/catalogue/candidate"); }}
                >
                  <Package className="h-4 w-4 mr-1" />
                  Model Select
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { onOpenChange(false); navigate("/governance/agents?mode=catalog-import&callableOnly=1&returnTo=/llm/catalogue/candidate"); }}
                >
                  <Workflow className="h-4 w-4 mr-1" />
                  Agent Wizard
                </Button>
              </div>
              <Button
                size="sm"
                className="w-full"
                onClick={() => { onOpenChange(false); navigate("/llm/catalogue/candidate"); }}
              >
                <Search className="h-4 w-4 mr-1" />
                Discover
              </Button>
            </div>

            {error && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 p-3 rounded-md bg-red-900/20 border border-red-800/30 text-red-400 text-sm">
                  <XCircle className="h-4 w-4 shrink-0" />
                  {error}
                </div>
                {(error.includes("fetch fail") || error.includes("ECONNREFUSED")) &&
                  (baseUrl.includes("localhost") || baseUrl.includes("127.0.0.1") || baseUrl.includes("0.0.0.0")) && (
                  <div className="flex items-center gap-2 p-3 rounded-md bg-yellow-900/20 border border-yellow-800/30 text-yellow-400 text-xs">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    Local providers (Ollama, llama.cpp) can only be discovered when the server runs on the same machine. The cloud-deployed server cannot reach localhost on your device.
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Step 3: Preview Table */}
        {step === 3 && (
          <div className="py-4 space-y-4">
            {/* Summary bar */}
            <div className="flex gap-2 flex-wrap">
              <Badge variant="outline">{previewRows.length} discovered</Badge>
              <Badge className="bg-green-600/20 text-green-400 border-green-600/30">
                {previewRows.filter((r) => r.duplicateStatus === "new").length} new
              </Badge>
              {previewRows.filter((r) => r.duplicateStatus === "exact_match").length > 0 && (
                <Badge className="bg-gray-600/20 text-gray-400 border-gray-600/30">
                  {previewRows.filter((r) => r.duplicateStatus === "exact_match").length} duplicates
                </Badge>
              )}
              {previewRows.filter((r) => r.duplicateStatus === "fuzzy_match").length > 0 && (
                <Badge className="bg-yellow-600/20 text-yellow-400 border-yellow-600/30">
                  {previewRows.filter((r) => r.duplicateStatus === "fuzzy_match").length} similar
                </Badge>
              )}
              {previewRows.filter((r) => r.duplicateStatus === "conflict").length > 0 && (
                <Badge className="bg-red-600/20 text-red-400 border-red-600/30">
                  {previewRows.filter((r) => r.duplicateStatus === "conflict").length} conflicts
                </Badge>
              )}
            </div>

            <div className="max-h-[40vh] overflow-y-auto border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={selectedCount === previewRows.length}
                        onCheckedChange={(c) => toggleAll(!!c)}
                      />
                    </TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Risk</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {previewRows.map((row) => {
                    const dupBadge = DUPLICATE_BADGES[row.duplicateStatus];
                    const riskBadge = RISK_BADGES[row.riskLevel];
                    return (
                      <TableRow key={row.tempId} className={row.selected ? "" : "opacity-50"}>
                        <TableCell>
                          <Checkbox
                            checked={row.selected}
                            onCheckedChange={() => toggleRow(row.tempId)}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="font-medium text-sm">{row.name}</div>
                          {row.description && (
                            <div className="text-xs text-muted-foreground truncate max-w-[200px]">
                              {row.description}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">{row.type}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge className={dupBadge.className + " text-xs"}>
                            {dupBadge.label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {row.riskLevel !== "low" && (
                            <Badge className={riskBadge.className + " text-xs"}>
                              {riskBadge.label}
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            {previewRows.some((r) => r.duplicateStatus === "conflict") && (
              <div className="flex items-center gap-2">
                <Checkbox
                  id="forceConflicts"
                  checked={forceConflicts}
                  onCheckedChange={(c) => setForceConflicts(!!c)}
                />
                <Label htmlFor="forceConflicts" className="text-sm">
                  Force import conflicting entries
                </Label>
              </div>
            )}

            {error && (
              <div className="flex items-center gap-2 p-3 rounded-md bg-red-900/20 border border-red-800/30 text-red-400 text-sm">
                <XCircle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}
          </div>
        )}

        {/* Step 4: Results */}
        {step === 4 && importResult && (
          <div className="py-4 space-y-4">
            <div className="flex gap-3 flex-wrap">
              <Badge className="bg-green-600/20 text-green-400 border-green-600/30 text-sm px-3 py-1">
                <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                {importResult.created} created
              </Badge>
              {importResult.skipped > 0 && (
                <Badge className="bg-gray-600/20 text-gray-400 border-gray-600/30 text-sm px-3 py-1">
                  {importResult.skipped} skipped
                </Badge>
              )}
              {importResult.errors > 0 && (
                <Badge className="bg-red-600/20 text-red-400 border-red-600/30 text-sm px-3 py-1">
                  <XCircle className="h-3.5 w-3.5 mr-1" />
                  {importResult.errors} errors
                </Badge>
              )}
            </div>

            <div className="max-h-[40vh] overflow-y-auto border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Outcome</TableHead>
                    <TableHead>Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {importResult.entries.map((entry) => (
                    <TableRow key={entry.tempId}>
                      <TableCell className="font-medium text-sm">{entry.name}</TableCell>
                      <TableCell>
                        {entry.outcome === "created" && (
                          <Badge className="bg-green-600/20 text-green-400 border-green-600/30 text-xs">
                            Created
                          </Badge>
                        )}
                        {entry.outcome === "skipped" && (
                          <Badge className="bg-gray-600/20 text-gray-400 border-gray-600/30 text-xs">
                            Skipped
                          </Badge>
                        )}
                        {entry.outcome === "error" && (
                          <Badge className="bg-red-600/20 text-red-400 border-red-600/30 text-xs">
                            Error
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {entry.error || (entry.catalogEntryId ? `Entry #${entry.catalogEntryId}` : "")}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {/* Footer / Navigation */}
        <DialogFooter className="flex justify-between sm:justify-between">
          <div>
            {step > 1 && step < 4 && (
              <Button
                variant="ghost"
                onClick={() => setStep((s) => (s - 1) as WizardStep)}
              >
                <ArrowLeft className="h-4 w-4 mr-1" />
                Back
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            {step === 2 && (
              <Button
                onClick={handleDiscover}
                disabled={!baseUrl || discoverMutation.isPending}
              >
                {discoverMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Discovering...
                  </>
                ) : (
                  <>
                    <Search className="h-4 w-4 mr-2" />
                    Discover
                  </>
                )}
              </Button>
            )}
            {step === 3 && (
              <Button
                onClick={handleImport}
                disabled={selectedCount === 0 || bulkCreateMutation.isPending}
              >
                {bulkCreateMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Importing...
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4 mr-2" />
                    Import {selectedCount} {selectedCount === 1 ? "Entry" : "Entries"}
                  </>
                )}
              </Button>
            )}
            {step === 4 && (
              <Button
                onClick={() => {
                  handleOpenChange(false);
                  onComplete?.();
                }}
              >
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Done
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Batch Discovery Results Popup */}
    <Dialog open={batchPopupOpen} onOpenChange={setBatchPopupOpen}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Batch Discovery Results
            {batchDiscovering && <Loader2 className="inline h-4 w-4 animate-spin ml-2" />}
          </DialogTitle>
          <DialogDescription>
            {batchDiscovering
              ? `Discovering ${batchResults.length} providers...`
              : `${batchResults.filter((r) => r.status === "found").length} found, ${batchResults.filter((r) => r.status === "failed").length} failed, ${batchRegisteredCount} submitted`
            }
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1 py-2">
          {batchResults.map((entry, i) => {
            const d = entry.data;
            const modelCount = d?.api?.candidates?.[0]?.modelCount;
            const authType = d?.authType;
            return (
              <div key={i} className="flex items-center gap-3 p-2 rounded border bg-muted/20 text-sm">
                {/* Status icon */}
                <div className="shrink-0 w-5">
                  {entry.status === "discovering" && <Loader2 className="h-4 w-4 animate-spin text-blue-400" />}
                  {entry.status === "pending" && <Globe className="h-4 w-4 text-muted-foreground" />}
                  {entry.status === "found" && <CheckCircle2 className="h-4 w-4 text-green-400" />}
                  {entry.status === "failed" && <XCircle className="h-4 w-4 text-red-400" />}
                </div>

                {/* Provider info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium truncate">{d?.name || entry.url}</span>
                    {entry.status === "found" && (
                      <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${d?.api?.bestUrl ? "text-green-400 border-green-600/30" : "text-yellow-400 border-yellow-600/30"}`}>
                        {d?.status === "ok" ? "OK" : d?.status === "partial" ? "Partial" : "Failed"}
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {entry.status === "found" && d?.api?.bestUrl
                      ? d.api.bestUrl
                      : entry.status === "found"
                      ? "No API URL detected"
                      : entry.status === "failed"
                      ? "Discovery failed"
                      : entry.status === "discovering"
                      ? "Discovering..."
                      : "Waiting..."}
                  </div>
                  {entry.status === "found" && (
                    <div className="flex gap-2 mt-0.5">
                      {modelCount != null && (
                        <span className="text-[10px] text-muted-foreground">{modelCount} model{modelCount !== 1 ? "s" : ""}</span>
                      )}
                      {authType && authType !== "none" && (
                        <span className="text-[10px] text-muted-foreground">Auth: {authType}</span>
                      )}
                      {authType === "none" && (
                        <span className="text-[10px] text-muted-foreground">No auth required</span>
                      )}
                      {d?.domain && (
                        <span className="text-[10px] text-muted-foreground">{d.domain}</span>
                      )}
                    </div>
                  )}
                </div>

                {/* Register button */}
                <div className="shrink-0">
                  {entry.registered ? (
                    <Badge variant="outline" className="text-green-400 border-green-600/30">Submitted</Badge>
                  ) : entry.status === "found" && d?.name && isAlreadyRegistered(d) ? (
                    <Badge variant="outline" className="text-muted-foreground border-muted">Exists</Badge>
                  ) : entry.status === "found" && d?.name ? (
                    <Button
                      size="sm"
                      variant="default"
                      className="h-7 text-xs"
                      onClick={() => registerOne(i)}
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      Submit
                    </Button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => {
            setBatchPopupOpen(false);
            if (batchRegisteredCount > 0) {
              onOpenChange(false);
              onComplete?.();
              navigate("/llm/catalogue/candidate");
            }
          }}>
            Close
          </Button>
          {batchFoundCount > 0 && (
            <Button size="sm" onClick={registerAll}>
              <Plus className="h-4 w-4 mr-1" />
              Submit All ({batchFoundCount})
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
