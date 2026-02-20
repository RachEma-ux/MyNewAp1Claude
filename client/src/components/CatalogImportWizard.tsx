/**
 * CatalogImportWizard — 4-step modal for importing catalog entries via API discovery
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
} from "lucide-react";
import type {
  PreviewEntry,
  BulkCreateResult,
} from "../../../shared/catalog-import-types";

interface CatalogImportWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete?: () => void;
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
}: CatalogImportWizardProps) {
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
  const normalizeUrl = (u: string) => {
    const v = u.trim();
    if (!v) return v;
    return /^https?:\/\//i.test(v) ? v : `https://${v}`;
  };

  const discoverMutation = trpc.catalogImport.discoverFromApi.useMutation();
  const websiteDiscoverMutation = trpc.catalogManage.discoverProvider.useMutation();
  const trpcUtils = trpc.useUtils();
  const bulkCreateMutation = trpc.catalogImport.bulkCreate.useMutation();

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

      // 1. Auto-fill base URL: catalog config → well-known URL by name/type
      const url = config?.baseUrl || config?.apiUrl || config?.endpoint
        || (registryId && PROVIDER_BASE_URLS[registryId])
        || (providerType && PROVIDER_BASE_URLS[providerType]);
      if (url) setBaseUrl(url);

      // 2. Auto-fill API key from multiple sources
      let apiKey: string | undefined;

      // Source A: catalog entry's own config (saved back from previous discovery)
      if (config?.apiKey) {
        apiKey = config.apiKey as string;
      }

      // Source B: providers registry table (auto-provisioned from env vars)
      if (!apiKey && registryId) {
        try {
          const providers = await trpcUtils.providers.list.fetch({ type: registryId as any });
          const provConfig = providers?.[0]?.config as Record<string, any> | null;
          if (provConfig?.apiKey) apiKey = provConfig.apiKey as string;
        } catch {
          // Provider registry lookup failed
        }
      }

      // Source C: fetch all providers and match by name
      if (!apiKey) {
        try {
          const allProviders = await trpcUtils.providers.list.fetch({});
          const match = allProviders.find((p: any) =>
            p.type === registryId || p.name.toLowerCase() === entry.name.toLowerCase()
          );
          const matchConfig = match?.config as Record<string, any> | null;
          if (matchConfig?.apiKey) apiKey = matchConfig.apiKey as string;
        } catch {
          // Fallback lookup failed
        }
      }

      if (apiKey) setApiKey(apiKey);
    } catch {
      // Ignore fetch errors — user can still type manually
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

  return (
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
            {/* Discover from Website */}
            <div className="border rounded-lg p-3 space-y-2 bg-muted/30">
              <Label className="flex items-center gap-2 text-sm">
                <Search className="h-4 w-4" />
                Discover from Website
              </Label>
              <div className="flex gap-2">
                <Input
                  placeholder="https://fireworks.ai"
                  value={websiteUrl}
                  onChange={(e) => setWebsiteUrl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && websiteUrl.trim()) {
                      e.preventDefault();
                      websiteDiscoverMutation.mutateAsync({ websiteUrl: normalizeUrl(websiteUrl) }).then((result: any) => {
                        if (result.api?.bestUrl) setBaseUrl(result.api.bestUrl);
                      }).catch(() => {});
                    }
                  }}
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  disabled={!websiteUrl.trim() || websiteDiscoverMutation.isPending}
                  onClick={() => {
                    websiteDiscoverMutation.mutateAsync({ websiteUrl: normalizeUrl(websiteUrl) }).then((result: any) => {
                      if (result.api?.bestUrl) setBaseUrl(result.api.bestUrl);
                    }).catch(() => {});
                  }}
                >
                  {websiteDiscoverMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Globe className="h-4 w-4" />
                  )}
                </Button>
              </div>
              {websiteDiscoverMutation.isSuccess && websiteDiscoverMutation.data && (
                <p className="text-xs text-green-400">
                  Found: {(websiteDiscoverMutation.data as any).name || (websiteDiscoverMutation.data as any).domain}
                  {(websiteDiscoverMutation.data as any).api?.bestUrl && ` — ${(websiteDiscoverMutation.data as any).api.bestUrl}`}
                </p>
              )}
              {websiteDiscoverMutation.isError && (
                <p className="text-xs text-red-400">Discovery failed — enter URL manually below</p>
              )}
              <p className="text-xs text-muted-foreground">
                Paste a provider website to auto-detect the API URL
              </p>
            </div>

            <div className="relative">
              <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
              <div className="relative flex justify-center text-xs"><span className="bg-background px-2 text-muted-foreground">or select manually</span></div>
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
              <Label htmlFor="baseUrl">Provider API Base URL</Label>
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

            {error && (
              <div className="flex items-center gap-2 p-3 rounded-md bg-red-900/20 border border-red-800/30 text-red-400 text-sm">
                <XCircle className="h-4 w-4 shrink-0" />
                {error}
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
  );
}
