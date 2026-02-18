import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import {
  getCapabilitiesForType,
  ENTRY_TYPES,
  ENTRY_TYPE_DEFS,
} from "@shared/catalog-taxonomy";
import type { EntryType } from "@shared/catalog-taxonomy";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
  ChevronLeft,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Search,
  History,
  Package,
  Server,
  Play,
  CheckCircle2,
  XCircle,
  Clock,
  Activity,
  Cpu,
  Layers,
  MessageSquare,
  Shield,
  ShieldCheck,
  ShieldX,
  Zap,
  Brain,
  Bot,
  Workflow,
  Lock,
  Globe,
  Gauge,
  Eye,
  Code,
  FileText,
  Rocket,
} from "lucide-react";
import { CatalogSelect } from "@/components/CatalogSelect";
import { MultiAxisPanel } from "@/components/MultiAxisPanel";

const TYPE_ICONS: Record<string, any> = {
  provider: Server,
  llm: Brain,
  model: Package,
  agent: Workflow,
  bot: Bot,
};

// EntryType imported from @shared/catalog-taxonomy

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-600/20 text-gray-400 border-gray-600/30",
  active: "bg-green-600/20 text-green-400 border-green-600/30",
  deprecated: "bg-red-600/20 text-red-400 border-red-600/30",
  disabled: "bg-red-800/20 text-red-500 border-red-800/30",
  validating: "bg-yellow-600/20 text-yellow-400 border-yellow-600/30",
  publishing: "bg-orange-600/20 text-orange-400 border-orange-600/30",
};

const REVIEW_COLORS: Record<string, string> = {
  needs_review: "bg-amber-600/20 text-amber-400 border-amber-600/30",
  approved: "bg-emerald-600/20 text-emerald-400 border-emerald-600/30",
  rejected: "bg-rose-600/20 text-rose-400 border-rose-600/30",
};

const ORIGIN_COLORS: Record<string, string> = {
  admin: "bg-blue-600/20 text-blue-400 border-blue-600/30",
  discovery: "bg-purple-600/20 text-purple-400 border-purple-600/30",
  api: "bg-cyan-600/20 text-cyan-400 border-cyan-600/30",
};

/** Inline component to show classification badges for a table row */
function ClassificationBadges({ entryId }: { entryId: number }) {
  const { data: nodes } = trpc.catalogManage.getClassifications.useQuery(
    { catalogEntryId: entryId },
  );
  if (!nodes || nodes.length === 0) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  // Show up to 3 axis-level labels, +N overflow
  const labels = nodes.map((n: any) => n.label);
  const shown = labels.slice(0, 3);
  const overflow = labels.length - 3;
  return (
    <div className="flex gap-0.5 flex-wrap">
      {shown.map((label: string, i: number) => (
        <Badge key={i} variant="secondary" className="text-[10px] px-1 py-0">
          {label}
        </Badge>
      ))}
      {overflow > 0 && (
        <span className="text-[10px] text-muted-foreground">+{overflow}</span>
      )}
    </div>
  );
}

export default function CatalogManagePage() {
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState<"catalog" | "validation" | "publishing" | "audit">("catalog");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | EntryType>("all");

  // Create/Edit dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<any>(null);
  const [formName, setFormName] = useState("");
  const [formDisplayName, setFormDisplayName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formEntryType, setFormEntryType] = useState<EntryType>("provider");
  const [formTags, setFormTags] = useState("");
  const [formConfig, setFormConfig] = useState("{}");
  const [formClassifications, setFormClassifications] = useState<number[]>([]);
  const [formCapabilities, setFormCapabilities] = useState<string[]>([]);
  const [formProviderId, setFormProviderId] = useState<string>("");
  const [createStep, setCreateStep] = useState(0);

  // Step 2: Security & Governance
  const [authProtocols, setAuthProtocols] = useState<string[]>([]);
  const [tlsVersion, setTlsVersion] = useState("1.3");
  const [encryptionAtRest, setEncryptionAtRest] = useState(true);
  const [complianceCerts, setComplianceCerts] = useState<string[]>([]);
  const [rateLimiting, setRateLimiting] = useState(true);
  const [throttling, setThrottling] = useState(true);
  const [wafEnabled, setWafEnabled] = useState(false);

  // Step 3: Performance & Reliability
  const [slaUptime, setSlaUptime] = useState("99.9");
  const [maxLatencyMs, setMaxLatencyMs] = useState("500");
  const [throughputRps, setThroughputRps] = useState("1000");
  const [autoScaling, setAutoScaling] = useState(true);
  const [loadBalancing, setLoadBalancing] = useState("round-robin");
  const [cachingEnabled, setCachingEnabled] = useState(false);
  const [cacheTtl, setCacheTtl] = useState("300");
  const [retryPolicy, setRetryPolicy] = useState("exponential");
  const [circuitBreaker, setCircuitBreaker] = useState(true);

  // Step 4: Integration & Interoperability
  const [apiStandard, setApiStandard] = useState("REST");
  const [apiVersioning, setApiVersioning] = useState("url-path");
  const [webhooksEnabled, setWebhooksEnabled] = useState(false);
  const [sdkLanguages, setSdkLanguages] = useState<string[]>([]);
  const [batchSupport, setBatchSupport] = useState(false);
  const [streamingSupport, setStreamingSupport] = useState(false);
  const [graphqlSupport, setGraphqlSupport] = useState(false);
  const [grpcSupport, setGrpcSupport] = useState(false);

  // Step 5: Monitoring & Observability
  const [loggingLevel, setLoggingLevel] = useState("info");
  const [metricsEnabled, setMetricsEnabled] = useState(true);
  const [metricsExporter, setMetricsExporter] = useState("prometheus");
  const [tracingEnabled, setTracingEnabled] = useState(false);
  const [tracingProtocol, setTracingProtocol] = useState("opentelemetry");
  const [alertingEnabled, setAlertingEnabled] = useState(false);
  const [auditLogging, setAuditLogging] = useState(true);
  const [costTracking, setCostTracking] = useState(false);

  // SaaS: Step 2 — Core API Architecture & Design
  const [saasApiStyle, setSaasApiStyle] = useState("REST");
  const [saasVersioning, setSaasVersioning] = useState("url-path");
  const [saasMultiTenancy, setSaasMultiTenancy] = useState("tenant-id");
  const [saasWebhooks, setSaasWebhooks] = useState(true);
  const [saasEventTypes, setSaasEventTypes] = useState<string[]>([]);
  const [saasJsonMode, setSaasJsonMode] = useState(true);
  const [saasGraphql, setSaasGraphql] = useState(false);
  const [saasStreaming, setSaasStreaming] = useState(true);

  // SaaS: Step 3 — Security & Compliance
  const [saasAuthMethods, setSaasAuthMethods] = useState<string[]>(["API Key"]);
  const [saasEncryptionTransit, setSaasEncryptionTransit] = useState("TLS 1.3");
  const [saasEncryptionRest, setSaasEncryptionRest] = useState("AES-256");
  const [saasRbac, setSaasRbac] = useState(true);
  const [saasCompliance, setSaasCompliance] = useState<string[]>([]);

  // SaaS: Step 4 — Reliability & Performance
  const [saasSla, setSaasSla] = useState("99.9");
  const [saasRateLimiting, setSaasRateLimiting] = useState(true);
  const [saasThrottling, setSaasThrottling] = useState(true);
  const [saasCdn, setSaasCdn] = useState(false);
  const [saasMultiRegion, setSaasMultiRegion] = useState(false);
  const [saasRegions, setSaasRegions] = useState<string[]>([]);
  const [saasAutoScaling, setSaasAutoScaling] = useState(true);

  // SaaS: Step 5 — Developer Experience
  const [saasDocumentation, setSaasDocumentation] = useState(true);
  const [saasSandbox, setSaasSandbox] = useState(false);
  const [saasCodeSamples, setSaasCodeSamples] = useState(true);
  const [saasMonitoring, setSaasMonitoring] = useState(true);
  const [saasLogging, setSaasLogging] = useState(true);
  const [saasAnalytics, setSaasAnalytics] = useState(false);
  const [saasSdkLanguages, setSaasSdkLanguages] = useState<string[]>([]);

  // Delete dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingEntry, setDeletingEntry] = useState<any>(null);

  // Version history dialog state
  const [versionsDialogOpen, setVersionsDialogOpen] = useState(false);
  const [versionsEntryId, setVersionsEntryId] = useState<number | null>(null);

  // Validation state
  const [validatingId, setValidatingId] = useState<number | null>(null);
  const [validationResults, setValidationResults] = useState<Record<number, any>>({});
  const [runTestPrompt, setRunTestPrompt] = useState(false);

  // Publishing wizard state
  const [publishDialogOpen, setPublishDialogOpen] = useState(false);
  const [publishEntry, setPublishEntry] = useState<any>(null);
  const [wizardStep, setWizardStep] = useState(0); // 0=review, 1=version, 2=confirm, 3=done
  const [publishVersion, setPublishVersion] = useState("");
  const [publishNotes, setPublishNotes] = useState("");

  const trpcUtils = trpc.useUtils();

  // Data queries
  const { data: entries = [], isLoading, refetch } = trpc.catalogManage.list.useQuery({
    ...(typeFilter !== "all" ? { entryType: typeFilter } : {}),
  });
  const { data: versions = [] } = trpc.catalogManage.listVersions.useQuery(
    { catalogEntryId: versionsEntryId! },
    { enabled: !!versionsEntryId }
  );
  const { data: bundles = [], refetch: refetchBundles } = trpc.catalogManage.listBundles.useQuery({});
  const { data: auditEvents = [] } = trpc.catalogRegistry.auditLog.useQuery({ limit: 50 });

  // Mutations
  const createMutation = trpc.catalogManage.create.useMutation({
    onSuccess: (created) => {
      if (formClassifications.length > 0) {
        classifyMutation.mutate({ catalogEntryId: created.id, nodeIds: formClassifications });
      }
      refetch(); closeDialog();
    },
  });
  const updateMutation = trpc.catalogManage.update.useMutation({
    onSuccess: (_, vars) => {
      classifyMutation.mutate({ catalogEntryId: vars.id, nodeIds: formClassifications });
      refetch(); closeDialog();
    },
  });
  const deleteMutation = trpc.catalogManage.delete.useMutation({
    onSuccess: () => { refetch(); setDeleteDialogOpen(false); setDeletingEntry(null); },
  });
  const validateMutation = trpc.catalogManage.validate.useMutation({
    onSuccess: (data, variables) => {
      setValidationResults((prev) => ({ ...prev, [variables.id]: data }));
      setValidatingId(null);
      refetch();
    },
    onError: () => setValidatingId(null),
  });
  const publishMutation = trpc.catalogManage.publish.useMutation({
    onSuccess: () => {
      setWizardStep(3);
      refetch();
      refetchBundles();
    },
  });
  const recallMutation = trpc.catalogManage.recall.useMutation({
    onSuccess: () => refetchBundles(),
  });
  const approveMutation = trpc.catalogManage.approve.useMutation({
    onSuccess: () => refetch(),
  });
  const activateMutation = trpc.catalogManage.activate.useMutation({
    onSuccess: () => refetch(),
  });
  const classifyMutation = trpc.catalogManage.classify.useMutation();

  // Filter entries by search
  const filteredEntries = entries.filter((e: any) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      e.name?.toLowerCase().includes(q) ||
      e.displayName?.toLowerCase().includes(q) ||
      e.description?.toLowerCase().includes(q)
    );
  });

  function openCreateDialog() {
    setEditingEntry(null);
    setFormName("");
    setFormDisplayName("");
    setFormDescription("");
    setFormEntryType("provider");
    setFormTags("");
    setFormConfig("{}");
    setFormClassifications([]);
    setFormCapabilities([]);
    setFormProviderId("");
    setCreateStep(0);
    setDialogOpen(true);
  }

  function openEditDialog(entry: any) {
    setEditingEntry(entry);
    setFormName(entry.name);
    setFormDisplayName(entry.displayName || "");
    setFormDescription(entry.description || "");
    setFormEntryType(entry.entryType);
    setFormTags((entry.tags || []).join(", "));
    setFormConfig(JSON.stringify(entry.config || {}, null, 2));
    setFormClassifications([]);
    setFormCapabilities(entry.capabilities || []);
    setFormProviderId(entry.providerId ? String(entry.providerId) : "");
    setDialogOpen(true);
    // Load classifications from DB
    trpcUtils.catalogManage.getClassifications
      .fetch({ catalogEntryId: entry.id })
      .then((nodes) => setFormClassifications(nodes.map((n: any) => n.id)))
      .catch(() => {});
  }

  function closeDialog() {
    setDialogOpen(false);
    setEditingEntry(null);
  }

  // Whether the current form targets an enterprise or SaaS provider
  // (advanced wizard steps — kept for future taxonomy-driven detection)
  const isEnterprise = false;
  const isSaas = false;
  const hasAdvancedSteps = isEnterprise || isSaas;

  // Dynamic step labels
  const stepLabels = isEnterprise
    ? ["Details", "Security", "Performance", "Integration", "Monitoring"]
    : isSaas
    ? ["Details", "API Architecture", "Security", "Reliability", "Developer XP"]
    : ["Details", "Step 2", "Step 3", "Step 4", "Step 5"];

  // Build the enriched config by merging user JSON with step 2-5 data
  function buildFullConfig(): Record<string, unknown> {
    let base: Record<string, unknown> = {};
    try {
      base = JSON.parse(formConfig);
    } catch {
      // Keep empty on parse error
    }

    if (isEnterprise) {
      base.security = {
        authProtocols,
        tlsVersion,
        encryptionAtRest,
        complianceCerts,
        rateLimiting,
        throttling,
        wafEnabled,
      };
      base.performance = {
        slaUptime,
        maxLatencyMs,
        throughputRps,
        autoScaling,
        loadBalancing,
        cachingEnabled,
        cacheTtl: cachingEnabled ? cacheTtl : undefined,
        retryPolicy,
        circuitBreaker,
      };
      base.integration = {
        apiStandard,
        apiVersioning,
        webhooksEnabled,
        sdkLanguages,
        batchSupport,
        streamingSupport,
        graphqlSupport,
        grpcSupport,
      };
      base.monitoring = {
        loggingLevel,
        metricsEnabled,
        metricsExporter: metricsEnabled ? metricsExporter : undefined,
        tracingEnabled,
        tracingProtocol: tracingEnabled ? tracingProtocol : undefined,
        alertingEnabled,
        auditLogging,
        costTracking,
      };
    } else if (isSaas) {
      base.apiArchitecture = {
        apiStyle: saasApiStyle,
        versioning: saasVersioning,
        multiTenancy: saasMultiTenancy,
        jsonMode: saasJsonMode,
        streaming: saasStreaming,
        graphql: saasGraphql,
        webhooks: saasWebhooks,
        webhookEventTypes: saasWebhooks ? saasEventTypes : [],
      };
      base.security = {
        authMethods: saasAuthMethods,
        encryptionTransit: saasEncryptionTransit,
        encryptionRest: saasEncryptionRest,
        rbac: saasRbac,
        compliance: saasCompliance,
      };
      base.reliability = {
        sla: saasSla,
        rateLimiting: saasRateLimiting,
        throttling: saasThrottling,
        cdn: saasCdn,
        multiRegion: saasMultiRegion,
        regions: saasMultiRegion ? saasRegions : [],
        autoScaling: saasAutoScaling,
      };
      base.developerExperience = {
        documentation: saasDocumentation,
        sandbox: saasSandbox,
        codeSamples: saasCodeSamples,
        monitoring: saasMonitoring,
        logging: saasLogging,
        analytics: saasAnalytics,
        sdkLanguages: saasSdkLanguages,
      };
    }

    return base;
  }

  // Step validation — returns error message or null if valid
  function validateCurrentStep(): string | null {
    if (createStep === 0) {
      if (!formName.trim()) return "Name is required";
    }
    if (isEnterprise && createStep === 1) {
      if (authProtocols.length === 0) return "Select at least one authentication protocol";
    }
    if (isSaas && createStep === 1) {
      if (!saasApiStyle) return "Select an API style";
    }
    if (isSaas && createStep === 2) {
      if (saasAuthMethods.length === 0) return "Select at least one authentication method";
    }
    return null;
  }

  const [stepError, setStepError] = useState<string | null>(null);

  function handleNextStep() {
    const err = validateCurrentStep();
    if (err) {
      setStepError(err);
      return;
    }
    setStepError(null);
    setCreateStep(createStep + 1);
  }

  function handleSave() {
    const fullConfig = buildFullConfig();
    const tags = formTags.split(",").map((t) => t.trim()).filter(Boolean);
    const providerId = formProviderId && formProviderId !== "none" ? parseInt(formProviderId, 10) : undefined;

    if (editingEntry) {
      updateMutation.mutate({
        id: editingEntry.id,
        name: formName,
        displayName: formDisplayName || formName,
        description: formDescription || undefined,
        config: fullConfig,
        tags,
        capabilities: formCapabilities.length > 0 ? formCapabilities : undefined,
        providerId,
      });
    } else {
      createMutation.mutate({
        name: formName,
        displayName: formDisplayName || undefined,
        description: formDescription || undefined,
        entryType: formEntryType,
        config: fullConfig,
        tags,
        providerId,
        capabilities: formCapabilities.length > 0 ? formCapabilities : undefined,
      });
    }
  }

  function openVersions(entryId: number) {
    setVersionsEntryId(entryId);
    setVersionsDialogOpen(true);
  }

  function runValidation(entryId: number) {
    setValidatingId(entryId);
    validateMutation.mutate({ id: entryId, runTestPrompt });
  }

  function openPublishWizard(entry: any) {
    setPublishEntry(entry);
    setWizardStep(0);
    setPublishVersion("");
    setPublishNotes("");
    setPublishDialogOpen(true);
  }

  function handlePublish() {
    if (!publishEntry || !publishVersion) return;
    publishMutation.mutate({
      catalogEntryId: publishEntry.id,
      versionLabel: publishVersion,
      changeNotes: publishNotes || undefined,
    });
  }

  const saving = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="container mx-auto py-8 max-w-6xl px-4">
      <Button variant="ghost" size="sm" className="mb-4" onClick={() => navigate("/llm/catalogue")}>
        <ChevronLeft className="h-4 w-4 mr-1" />Back to Catalogue
      </Button>

      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Manage Catalogue</h1>
          <p className="text-muted-foreground mt-1">
            Create, edit, and manage catalog entries before publishing
          </p>
        </div>
        <Button onClick={openCreateDialog}>
          <Plus className="h-4 w-4 mr-2" />New Entry
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
        <TabsList>
          <TabsTrigger value="catalog">Catalog</TabsTrigger>
          <TabsTrigger value="validation">Validation</TabsTrigger>
          <TabsTrigger value="publishing">Publishing</TabsTrigger>
          <TabsTrigger value="audit">Audit Log</TabsTrigger>
        </TabsList>

        <TabsContent value="catalog" className="mt-4">
          {/* Filters */}
          <div className="flex gap-3 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search entries..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as any)}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {ENTRY_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>{ENTRY_TYPE_DEFS[t].label}s</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Table */}
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredEntries.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Package className="h-10 w-10 mx-auto mb-3 opacity-50" />
              <p className="text-lg font-medium">No catalog entries yet</p>
              <p className="text-sm mt-1">Create your first entry to get started</p>
              <Button className="mt-4" onClick={openCreateDialog}>
                <Plus className="h-4 w-4 mr-2" />Create Entry
              </Button>
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Classification</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Review</TableHead>
                    <TableHead>Origin</TableHead>
                    <TableHead>Tags</TableHead>
                    <TableHead>Updated</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredEntries.map((entry: any) => (
                    <TableRow key={entry.id}>
                      <TableCell>
                        <div>
                          <div className="font-medium">{entry.displayName || entry.name}</div>
                          {entry.description && (
                            <div className="text-xs text-muted-foreground truncate max-w-[250px]">
                              {entry.description}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {(() => { const Icon = TYPE_ICONS[entry.entryType] || Package; return (
                          <Badge variant="outline" className="text-xs">
                            <Icon className="h-3 w-3 mr-1" />
                            {ENTRY_TYPE_DEFS[entry.entryType as EntryType]?.label || entry.entryType}
                          </Badge>
                        ); })()}
                      </TableCell>
                      <TableCell>
                        <ClassificationBadges entryId={entry.id} />
                      </TableCell>
                      <TableCell>
                        <Badge className={`text-xs ${STATUS_COLORS[entry.status] || ""}`}>
                          {entry.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={`text-xs ${REVIEW_COLORS[entry.reviewState] || ""}`}>
                          {entry.reviewState === "needs_review" ? (
                            <Shield className="h-3 w-3 mr-1" />
                          ) : entry.reviewState === "approved" ? (
                            <ShieldCheck className="h-3 w-3 mr-1" />
                          ) : (
                            <ShieldX className="h-3 w-3 mr-1" />
                          )}
                          {entry.reviewState}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-xs ${ORIGIN_COLORS[entry.origin] || ""}`}>
                          {entry.origin}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1 flex-wrap">
                          {(entry.tags || []).slice(0, 3).map((tag: string, i: number) => (
                            <Badge key={i} variant="secondary" className="text-xs">
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-muted-foreground">
                          {new Date(entry.updatedAt).toLocaleDateString()}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex gap-1 justify-end">
                          {entry.reviewState === "needs_review" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => approveMutation.mutate({ id: entry.id, activateNow: false })}
                              disabled={approveMutation.isPending}
                              title="Approve"
                              className="text-emerald-400 hover:text-emerald-300"
                            >
                              <ShieldCheck className="h-4 w-4" />
                            </Button>
                          )}
                          {entry.status === "draft" && entry.reviewState === "approved" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => activateMutation.mutate({ id: entry.id })}
                              disabled={activateMutation.isPending}
                              title="Activate"
                              className="text-green-400 hover:text-green-300"
                            >
                              <Zap className="h-4 w-4" />
                            </Button>
                          )}
                          <Button variant="ghost" size="sm" onClick={() => openVersions(entry.id)} title="Version history">
                            <History className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => openEditDialog(entry)} title="Edit">
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => { setDeletingEntry(entry); setDeleteDialogOpen(true); }}
                            title="Delete"
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="validation" className="mt-4">
          {/* Test prompt toggle */}
          <div className="flex items-center gap-3 mb-4 p-3 rounded-md border bg-muted/30">
            <Switch checked={runTestPrompt} onCheckedChange={setRunTestPrompt} />
            <div>
              <p className="text-sm font-medium">Run Test Prompt</p>
              <p className="text-xs text-muted-foreground">Send a test prompt to verify model inference works</p>
            </div>
          </div>

          {entries.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Activity className="h-10 w-10 mx-auto mb-3 opacity-50" />
              <p className="text-lg font-medium">No entries to validate</p>
              <p className="text-sm mt-1">Create catalog entries in the Catalog tab first</p>
            </div>
          ) : (
            <div className="space-y-4">
              {entries.map((entry: any) => {
                const result = validationResults[entry.id];
                const isRunning = validatingId === entry.id;

                return (
                  <Card key={entry.id}>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <CardTitle className="text-base">{entry.displayName || entry.name}</CardTitle>
                          {(() => { const Icon = TYPE_ICONS[entry.entryType] || Package; return (
                            <Badge variant="outline" className="text-xs">
                              <Icon className="h-3 w-3 mr-1" />
                              {ENTRY_TYPE_DEFS[entry.entryType as EntryType]?.label || entry.entryType}
                            </Badge>
                          ); })()}
                          <Badge className={`text-xs ${STATUS_COLORS[entry.status] || ""}`}>{entry.status}</Badge>
                          {entry.validationStatus && (
                            <Badge className={`text-xs ${entry.validationStatus === "passed" ? "bg-green-600/20 text-green-400" : "bg-red-600/20 text-red-400"}`}>
                              {entry.validationStatus === "passed" ? <CheckCircle2 className="h-3 w-3 mr-1" /> : <XCircle className="h-3 w-3 mr-1" />}
                              {entry.validationStatus}
                            </Badge>
                          )}
                        </div>
                        <Button
                          size="sm"
                          onClick={() => runValidation(entry.id)}
                          disabled={isRunning}
                        >
                          {isRunning ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
                          {isRunning ? "Validating..." : "Validate"}
                        </Button>
                      </div>
                      {entry.lastValidatedAt && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                          <Clock className="h-3 w-3" />
                          Last validated: {new Date(entry.lastValidatedAt).toLocaleString()}
                        </p>
                      )}
                    </CardHeader>

                    {result && (
                      <CardContent className="pt-0">
                        <Separator className="mb-3" />
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {/* Health */}
                          <div className="border rounded-md p-3">
                            <div className="flex items-center gap-2 mb-1">
                              <Activity className="h-4 w-4" />
                              <span className="text-sm font-medium">Health</span>
                              {result.results.health.passed
                                ? <CheckCircle2 className="h-4 w-4 text-green-500 ml-auto" />
                                : <XCircle className="h-4 w-4 text-red-500 ml-auto" />}
                            </div>
                            <p className="text-xs text-muted-foreground">{result.results.health.message}</p>
                            <p className="text-xs text-muted-foreground mt-1">{result.results.health.latencyMs}ms</p>
                          </div>

                          {/* Capabilities */}
                          <div className="border rounded-md p-3">
                            <div className="flex items-center gap-2 mb-1">
                              <Cpu className="h-4 w-4" />
                              <span className="text-sm font-medium">Capabilities</span>
                              {result.results.capabilities.passed
                                ? <CheckCircle2 className="h-4 w-4 text-green-500 ml-auto" />
                                : <XCircle className="h-4 w-4 text-red-500 ml-auto" />}
                            </div>
                            <p className="text-xs text-muted-foreground">{result.results.capabilities.message}</p>
                          </div>

                          {/* Models */}
                          <div className="border rounded-md p-3">
                            <div className="flex items-center gap-2 mb-1">
                              <Layers className="h-4 w-4" />
                              <span className="text-sm font-medium">Models</span>
                              {result.results.models.passed
                                ? <CheckCircle2 className="h-4 w-4 text-green-500 ml-auto" />
                                : <XCircle className="h-4 w-4 text-red-500 ml-auto" />}
                            </div>
                            <p className="text-xs text-muted-foreground">{result.results.models.message}</p>
                            {result.results.models.models.length > 0 && (
                              <div className="flex gap-1 flex-wrap mt-1">
                                {result.results.models.models.slice(0, 5).map((m: string, i: number) => (
                                  <Badge key={i} variant="secondary" className="text-xs">{m}</Badge>
                                ))}
                                {result.results.models.models.length > 5 && (
                                  <span className="text-xs text-muted-foreground">+{result.results.models.models.length - 5} more</span>
                                )}
                              </div>
                            )}
                          </div>

                          {/* Test Prompt */}
                          {result.results.testPrompt && (
                            <div className="border rounded-md p-3">
                              <div className="flex items-center gap-2 mb-1">
                                <MessageSquare className="h-4 w-4" />
                                <span className="text-sm font-medium">Test Prompt</span>
                                {result.results.testPrompt.passed
                                  ? <CheckCircle2 className="h-4 w-4 text-green-500 ml-auto" />
                                  : <XCircle className="h-4 w-4 text-red-500 ml-auto" />}
                              </div>
                              <p className="text-xs text-muted-foreground">{result.results.testPrompt.message}</p>
                              {result.results.testPrompt.response && (
                                <p className="text-xs font-mono bg-muted/50 rounded p-1.5 mt-1 truncate">
                                  {result.results.testPrompt.response}
                                </p>
                              )}
                              <p className="text-xs text-muted-foreground mt-1">{result.results.testPrompt.latencyMs}ms</p>
                            </div>
                          )}
                        </div>

                        {/* Errors */}
                        {result.errors && result.errors.length > 0 && (
                          <div className="mt-3 p-2 rounded-md bg-red-950/20 border border-red-900/30">
                            <p className="text-xs font-medium text-red-400 mb-1">Errors:</p>
                            {result.errors.map((err: string, i: number) => (
                              <p key={i} className="text-xs text-red-400/80">- {err}</p>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="publishing" className="mt-4">
          {/* Ready to Publish */}
          <div className="mb-6">
            <h3 className="text-lg font-semibold mb-3">Ready to Publish</h3>
            {(() => {
              const publishable = entries.filter((e: any) => e.status === "active");
              if (publishable.length === 0) return (
                <div className="text-center py-8 text-muted-foreground border rounded-md">
                  <p className="text-sm">No active entries ready for publishing</p>
                  <p className="text-xs mt-1">Approve and activate entries first</p>
                </div>
              );
              return (
                <div className="space-y-2">
                  {publishable.map((entry: any) => (
                    <div key={entry.id} className="flex items-center justify-between p-3 border rounded-md">
                      <div className="flex items-center gap-3">
                        {(() => { const Icon = TYPE_ICONS[entry.entryType] || Package; return (
                          <Badge variant="outline" className="text-xs">
                            <Icon className="h-3 w-3 mr-1" />
                            {ENTRY_TYPE_DEFS[entry.entryType as EntryType]?.label || entry.entryType}
                          </Badge>
                        ); })()}
                        <span className="font-medium text-sm">{entry.displayName || entry.name}</span>
                        <Badge className={`text-xs ${STATUS_COLORS[entry.status] || ""}`}>{entry.status}</Badge>
                      </div>
                      <Button size="sm" onClick={() => openPublishWizard(entry)}>
                        Publish
                      </Button>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>

          <Separator className="my-6" />

          {/* Published Bundles */}
          <div>
            <h3 className="text-lg font-semibold mb-3">Published Bundles</h3>
            {bundles.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground border rounded-md">
                <p className="text-sm">No published bundles yet</p>
              </div>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Entry</TableHead>
                      <TableHead>Version</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Hash</TableHead>
                      <TableHead>Published</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {bundles.map((bundle: any) => {
                      const snap = bundle.snapshot as any;
                      return (
                        <TableRow key={bundle.id}>
                          <TableCell>
                            <span className="font-medium text-sm">{snap?.displayName || snap?.name || `Entry #${bundle.catalogEntryId}`}</span>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs font-mono">{bundle.versionLabel}</Badge>
                          </TableCell>
                          <TableCell>
                            <Badge className={`text-xs ${
                              bundle.status === "active" ? "bg-green-600/20 text-green-400 border-green-600/30" :
                              bundle.status === "recalled" ? "bg-red-600/20 text-red-400 border-red-600/30" :
                              "bg-gray-600/20 text-gray-400 border-gray-600/30"
                            }`}>
                              {bundle.status}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <span className="text-xs font-mono text-muted-foreground">
                              {bundle.snapshotHash?.substring(0, 12)}...
                            </span>
                          </TableCell>
                          <TableCell>
                            <span className="text-xs text-muted-foreground">
                              {new Date(bundle.publishedAt).toLocaleString()}
                            </span>
                          </TableCell>
                          <TableCell className="text-right">
                            {bundle.status === "active" && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-destructive hover:text-destructive"
                                onClick={() => recallMutation.mutate({ bundleId: bundle.id })}
                                disabled={recallMutation.isPending}
                              >
                                Recall
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="audit" className="mt-4">
          {auditEvents.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground border rounded-md">
              <History className="h-10 w-10 mx-auto mb-3 opacity-50" />
              <p className="text-sm">No audit events recorded yet</p>
              <p className="text-xs mt-1">Events are logged when entries are created, validated, published, or recalled</p>
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Event</TableHead>
                    <TableHead>Entry ID</TableHead>
                    <TableHead>Details</TableHead>
                    <TableHead>Timestamp</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {auditEvents.map((evt: any) => (
                    <TableRow key={evt.id}>
                      <TableCell>
                        <Badge variant="outline" className="text-xs font-mono">
                          {evt.eventType}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-muted-foreground">
                          {evt.catalogEntryId ? `#${evt.catalogEntryId}` : "—"}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-muted-foreground truncate block max-w-[300px]">
                          {(() => {
                            const p = evt.payload as any;
                            if (p?.name) return p.name;
                            if (p?.versionLabel) return `v${p.versionLabel}`;
                            if (p?.passed !== undefined) return p.passed ? "Passed" : "Failed";
                            if (p?.changes) return `Changed: ${p.changes.join(", ")}`;
                            if (p?.bundleId) return `Bundle #${p.bundleId}`;
                            return JSON.stringify(p).substring(0, 60);
                          })()}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-muted-foreground">
                          {new Date(evt.timestamp).toLocaleString()}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{editingEntry ? "Edit Entry" : "New Catalog Entry"}</DialogTitle>
            <DialogDescription>
              {editingEntry
                ? "Update this catalog entry's details"
                : "Create a new entry in the catalog"}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4 overflow-y-auto pr-2">
            {!editingEntry && (
              <div className="grid gap-2">
                <Label>Type</Label>
                <Select value={formEntryType} onValueChange={(v) => {
                  setFormEntryType(v as EntryType);
                  setFormClassifications([]);
                  setFormCapabilities([]);
                }}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ENTRY_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {ENTRY_TYPE_DEFS[t].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Multi-Axis Classification */}
            <div className="grid gap-2">
              <Label>Classification</Label>
              <div className="border rounded-md p-2 max-h-[280px] overflow-y-auto">
                <MultiAxisPanel
                  entryType={formEntryType}
                  selectedNodeIds={formClassifications}
                  onSelectionChange={setFormClassifications}
                />
              </div>
            </div>

            {/* Capabilities (multi-select chips) */}
            <div className="grid gap-2">
              <Label>Capabilities</Label>
              <div className="flex flex-wrap gap-1.5 p-2 border rounded-md min-h-[38px]">
                {Object.entries(getCapabilitiesForType(formEntryType)).map(([key, cap]) => {
                  const selected = formCapabilities.includes(key);
                  return (
                    <Badge
                      key={key}
                      variant={selected ? "default" : "outline"}
                      className={`text-xs cursor-pointer select-none ${selected ? "" : "opacity-60 hover:opacity-100"}`}
                      onClick={() => {
                        setFormCapabilities((prev) =>
                          selected ? prev.filter((c) => c !== key) : [...prev, key]
                        );
                      }}
                    >
                      {cap.label}
                    </Badge>
                  );
                })}
              </div>
              {formCapabilities.length > 0 && (
                <p className="text-xs text-muted-foreground">{formCapabilities.length} selected</p>
              )}
            </div>

            {/* Step Progress Bar */}
            {!editingEntry && (
              <div className="flex items-center justify-center gap-2 py-3">
                {stepLabels.map((label, i) => (
                  <div key={label} className="flex items-center gap-2">
                    <button
                      onClick={() => setCreateStep(i)}
                      className={`flex flex-col items-center gap-1 group`}
                    >
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium border-2 transition-colors ${
                        i === createStep
                          ? "bg-primary text-primary-foreground border-primary"
                          : i < createStep
                          ? "bg-primary/20 text-primary border-primary/50"
                          : "bg-muted text-muted-foreground border-muted-foreground/30"
                      }`}>
                        {i + 1}
                      </div>
                      <span className={`text-[10px] ${i === createStep ? "text-primary font-medium" : "text-muted-foreground"}`}>
                        {label}
                      </span>
                    </button>
                    {i < 4 && <div className={`w-6 h-0.5 mb-4 ${i < createStep ? "bg-primary/50" : "bg-muted-foreground/20"}`} />}
                  </div>
                ))}
              </div>
            )}

            {/* Step 1: Details (existing form) */}
            {(editingEntry || createStep === 0) && (
              <>
                <div className="grid gap-2">
                  <Label>Name</Label>
                  <Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="e.g., my-ollama-provider" />
                </div>
                <div className="grid gap-2">
                  <Label>Display Name</Label>
                  <Input value={formDisplayName} onChange={(e) => setFormDisplayName(e.target.value)} placeholder="e.g., My Ollama Provider" />
                </div>
                <div className="grid gap-2">
                  <Label>Description</Label>
                  <Textarea value={formDescription} onChange={(e) => setFormDescription(e.target.value)} placeholder="What this entry does..." rows={2} />
                </div>
                {formEntryType !== "provider" && (
                  <div className="grid gap-2">
                    <Label>Linked Provider</Label>
                    <CatalogSelect
                      entryType="provider"
                      value={formProviderId === "none" ? "" : formProviderId}
                      onValueChange={(v) => setFormProviderId(v || "none")}
                      placeholder="Select provider (for validation)..."
                    />
                    <p className="text-xs text-muted-foreground">Required for validation — links this entry to a provider runtime</p>
                  </div>
                )}
                <div className="grid gap-2">
                  <Label>Tags (comma-separated)</Label>
                  <Input value={formTags} onChange={(e) => setFormTags(e.target.value)} placeholder="local, ollama, inference" />
                </div>
                <div className="grid gap-2">
                  <Label>Configuration (JSON)</Label>
                  <Textarea
                    value={formConfig}
                    onChange={(e) => setFormConfig(e.target.value)}
                    placeholder="{}"
                    rows={4}
                    className="font-mono text-xs"
                  />
                </div>
              </>
            )}

            {/* Steps 2-5: Coming Soon (no advanced steps) */}
            {!editingEntry && createStep > 0 && !hasAdvancedSteps && (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
                  <Loader2 className="h-5 w-5 text-muted-foreground" />
                </div>
                <p className="text-sm font-medium text-muted-foreground">Coming Soon</p>
                <p className="text-xs text-muted-foreground/70 mt-1">
                  Advanced configuration steps are available for Provider &gt; Cloud API &gt; Enterprise Managed entries.
                </p>
              </div>
            )}

            {/* Step 2: Security & Governance (Enterprise Provider only) */}
            {!editingEntry && createStep === 1 && isEnterprise && (
              <div className="space-y-5">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Shield className="h-4 w-4 text-primary" />
                  Security &amp; Governance
                </div>

                {/* Authentication & Authorization */}
                <div className="space-y-3">
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">Authentication &amp; Authorization</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {["OAuth 2.0", "OIDC", "JWT", "AWS IAM", "Azure AD", "API Key", "mTLS"].map((proto) => {
                      const selected = authProtocols.includes(proto);
                      return (
                        <Badge
                          key={proto}
                          variant={selected ? "default" : "outline"}
                          className={`text-xs cursor-pointer select-none ${selected ? "" : "opacity-60 hover:opacity-100"}`}
                          onClick={() => setAuthProtocols((prev) =>
                            selected ? prev.filter((p) => p !== proto) : [...prev, proto]
                          )}
                        >
                          <Lock className="h-3 w-3 mr-1" />{proto}
                        </Badge>
                      );
                    })}
                  </div>
                </div>

                {/* Data Protection */}
                <div className="space-y-3">
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">Data Protection</Label>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="grid gap-1.5">
                      <Label className="text-xs">TLS Version</Label>
                      <Select value={tlsVersion} onValueChange={setTlsVersion}>
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1.2">TLS 1.2</SelectItem>
                          <SelectItem value="1.3">TLS 1.3</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-center justify-between p-2 border rounded-md">
                      <Label className="text-xs">Encryption at Rest</Label>
                      <Switch checked={encryptionAtRest} onCheckedChange={setEncryptionAtRest} />
                    </div>
                  </div>
                </div>

                {/* Compliance Standards */}
                <div className="space-y-3">
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">Compliance Standards</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {["SOC 2 Type II", "GDPR", "HIPAA", "PCI DSS", "ISO 27001", "FedRAMP", "CCPA"].map((cert) => {
                      const selected = complianceCerts.includes(cert);
                      return (
                        <Badge
                          key={cert}
                          variant={selected ? "default" : "outline"}
                          className={`text-xs cursor-pointer select-none ${selected ? "" : "opacity-60 hover:opacity-100"}`}
                          onClick={() => setComplianceCerts((prev) =>
                            selected ? prev.filter((c) => c !== cert) : [...prev, cert]
                          )}
                        >
                          <ShieldCheck className="h-3 w-3 mr-1" />{cert}
                        </Badge>
                      );
                    })}
                  </div>
                </div>

                {/* Threat Protection */}
                <div className="space-y-3">
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">Threat Protection</Label>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="flex items-center justify-between p-2 border rounded-md">
                      <Label className="text-xs">Rate Limiting</Label>
                      <Switch checked={rateLimiting} onCheckedChange={setRateLimiting} />
                    </div>
                    <div className="flex items-center justify-between p-2 border rounded-md">
                      <Label className="text-xs">Throttling</Label>
                      <Switch checked={throttling} onCheckedChange={setThrottling} />
                    </div>
                    <div className="flex items-center justify-between p-2 border rounded-md">
                      <Label className="text-xs">WAF</Label>
                      <Switch checked={wafEnabled} onCheckedChange={setWafEnabled} />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Step 3: Performance & Reliability (Enterprise Provider only) */}
            {!editingEntry && createStep === 2 && isEnterprise && (
              <div className="space-y-5">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Gauge className="h-4 w-4 text-primary" />
                  Performance &amp; Reliability
                </div>

                {/* SLA & Targets */}
                <div className="space-y-3">
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">SLA &amp; Targets</Label>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="grid gap-1.5">
                      <Label className="text-xs">Uptime SLA (%)</Label>
                      <Select value={slaUptime} onValueChange={setSlaUptime}>
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="99.0">99.0%</SelectItem>
                          <SelectItem value="99.9">99.9%</SelectItem>
                          <SelectItem value="99.95">99.95%</SelectItem>
                          <SelectItem value="99.99">99.99%</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-1.5">
                      <Label className="text-xs">Max Latency (ms)</Label>
                      <Input className="h-8 text-xs" value={maxLatencyMs} onChange={(e) => setMaxLatencyMs(e.target.value)} />
                    </div>
                    <div className="grid gap-1.5">
                      <Label className="text-xs">Throughput (req/s)</Label>
                      <Input className="h-8 text-xs" value={throughputRps} onChange={(e) => setThroughputRps(e.target.value)} />
                    </div>
                  </div>
                </div>

                {/* Scaling & Load */}
                <div className="space-y-3">
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">Scaling &amp; Load Balancing</Label>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex items-center justify-between p-2 border rounded-md">
                      <Label className="text-xs">Auto-Scaling</Label>
                      <Switch checked={autoScaling} onCheckedChange={setAutoScaling} />
                    </div>
                    <div className="grid gap-1.5">
                      <Label className="text-xs">Load Balancing</Label>
                      <Select value={loadBalancing} onValueChange={setLoadBalancing}>
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="round-robin">Round Robin</SelectItem>
                          <SelectItem value="least-connections">Least Connections</SelectItem>
                          <SelectItem value="weighted">Weighted</SelectItem>
                          <SelectItem value="ip-hash">IP Hash</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                {/* Caching & Resilience */}
                <div className="space-y-3">
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">Caching &amp; Resilience</Label>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="flex items-center justify-between p-2 border rounded-md">
                      <Label className="text-xs">Caching</Label>
                      <Switch checked={cachingEnabled} onCheckedChange={setCachingEnabled} />
                    </div>
                    {cachingEnabled && (
                      <div className="grid gap-1.5">
                        <Label className="text-xs">Cache TTL (s)</Label>
                        <Input className="h-8 text-xs" value={cacheTtl} onChange={(e) => setCacheTtl(e.target.value)} />
                      </div>
                    )}
                    <div className="flex items-center justify-between p-2 border rounded-md">
                      <Label className="text-xs">Circuit Breaker</Label>
                      <Switch checked={circuitBreaker} onCheckedChange={setCircuitBreaker} />
                    </div>
                  </div>
                  <div className="grid gap-1.5">
                    <Label className="text-xs">Retry Policy</Label>
                    <Select value={retryPolicy} onValueChange={setRetryPolicy}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        <SelectItem value="fixed">Fixed Delay</SelectItem>
                        <SelectItem value="exponential">Exponential Backoff</SelectItem>
                        <SelectItem value="jitter">Exponential + Jitter</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            )}

            {/* Step 4: Integration & Interoperability (Enterprise Provider only) */}
            {!editingEntry && createStep === 3 && isEnterprise && (
              <div className="space-y-5">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Globe className="h-4 w-4 text-primary" />
                  Integration &amp; Interoperability
                </div>

                {/* API Standards */}
                <div className="space-y-3">
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">API Standards</Label>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="grid gap-1.5">
                      <Label className="text-xs">Primary API</Label>
                      <Select value={apiStandard} onValueChange={setApiStandard}>
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="REST">REST</SelectItem>
                          <SelectItem value="GraphQL">GraphQL</SelectItem>
                          <SelectItem value="gRPC">gRPC</SelectItem>
                          <SelectItem value="WebSocket">WebSocket</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-1.5">
                      <Label className="text-xs">API Versioning</Label>
                      <Select value={apiVersioning} onValueChange={setApiVersioning}>
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="url-path">URL Path (/v1/)</SelectItem>
                          <SelectItem value="header">Header-based</SelectItem>
                          <SelectItem value="query">Query Param</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                {/* Protocol Support */}
                <div className="space-y-3">
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">Protocol Support</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex items-center justify-between p-2 border rounded-md">
                      <Label className="text-xs">Streaming (SSE)</Label>
                      <Switch checked={streamingSupport} onCheckedChange={setStreamingSupport} />
                    </div>
                    <div className="flex items-center justify-between p-2 border rounded-md">
                      <Label className="text-xs">Batch Requests</Label>
                      <Switch checked={batchSupport} onCheckedChange={setBatchSupport} />
                    </div>
                    <div className="flex items-center justify-between p-2 border rounded-md">
                      <Label className="text-xs">Webhooks</Label>
                      <Switch checked={webhooksEnabled} onCheckedChange={setWebhooksEnabled} />
                    </div>
                    <div className="flex items-center justify-between p-2 border rounded-md">
                      <Label className="text-xs">gRPC</Label>
                      <Switch checked={grpcSupport} onCheckedChange={setGrpcSupport} />
                    </div>
                  </div>
                </div>

                {/* SDK Languages */}
                <div className="space-y-3">
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">SDK &amp; Client Libraries</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {["Python", "TypeScript", "Java", "Go", "C#", "Ruby", "Rust", "Swift"].map((lang) => {
                      const selected = sdkLanguages.includes(lang);
                      return (
                        <Badge
                          key={lang}
                          variant={selected ? "default" : "outline"}
                          className={`text-xs cursor-pointer select-none ${selected ? "" : "opacity-60 hover:opacity-100"}`}
                          onClick={() => setSdkLanguages((prev) =>
                            selected ? prev.filter((l) => l !== lang) : [...prev, lang]
                          )}
                        >
                          {lang}
                        </Badge>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* Review Summary — shown on last step for advanced flows */}
            {!editingEntry && createStep === 4 && hasAdvancedSteps && (
              <Card className="mb-4 border-dashed">
                <CardHeader className="py-3 px-4">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                    Review Summary
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-3 space-y-3 text-xs">
                  {/* Step 1 summary */}
                  <div>
                    <span className="font-medium text-muted-foreground uppercase tracking-wide">Details</span>
                    <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-0.5">
                      <span>Name: <span className="text-foreground">{formName || "—"}</span></span>
                      <span>Display: <span className="text-foreground">{formDisplayName || "—"}</span></span>
                      <span>Type: <span className="text-foreground">{ENTRY_TYPE_DEFS[formEntryType]?.label}</span></span>
                      <span>Classifications: <span className="text-foreground">{formClassifications.length || "—"}</span></span>
                      {formTags && <span className="col-span-2">Tags: <span className="text-foreground">{formTags}</span></span>}
                    </div>
                  </div>
                  <Separator />

                  {isEnterprise && (
                    <>
                      <div>
                        <span className="font-medium text-muted-foreground uppercase tracking-wide">Security</span>
                        <div className="mt-1 space-y-0.5">
                          <div>Auth: <span className="text-foreground">{authProtocols.join(", ") || "None"}</span></div>
                          <div>TLS: <span className="text-foreground">{tlsVersion}</span> | Encryption at Rest: <span className="text-foreground">{encryptionAtRest ? "Yes" : "No"}</span></div>
                          <div>Compliance: <span className="text-foreground">{complianceCerts.join(", ") || "None"}</span></div>
                          <div>Rate Limiting: <span className="text-foreground">{rateLimiting ? "Yes" : "No"}</span> | Throttling: <span className="text-foreground">{throttling ? "Yes" : "No"}</span> | WAF: <span className="text-foreground">{wafEnabled ? "Yes" : "No"}</span></div>
                        </div>
                      </div>
                      <Separator />
                      <div>
                        <span className="font-medium text-muted-foreground uppercase tracking-wide">Performance</span>
                        <div className="mt-1 space-y-0.5">
                          <div>SLA: <span className="text-foreground">{slaUptime}%</span> | Latency: <span className="text-foreground">{maxLatencyMs}ms</span> | Throughput: <span className="text-foreground">{throughputRps} rps</span></div>
                          <div>Auto-Scale: <span className="text-foreground">{autoScaling ? "Yes" : "No"}</span> | LB: <span className="text-foreground">{loadBalancing}</span> | Circuit Breaker: <span className="text-foreground">{circuitBreaker ? "Yes" : "No"}</span></div>
                          <div>Retry: <span className="text-foreground">{retryPolicy}</span>{cachingEnabled && <> | Cache TTL: <span className="text-foreground">{cacheTtl}s</span></>}</div>
                        </div>
                      </div>
                      <Separator />
                      <div>
                        <span className="font-medium text-muted-foreground uppercase tracking-wide">Integration</span>
                        <div className="mt-1 space-y-0.5">
                          <div>API: <span className="text-foreground">{apiStandard}</span> | Versioning: <span className="text-foreground">{apiVersioning}</span></div>
                          <div>Streaming: <span className="text-foreground">{streamingSupport ? "Yes" : "No"}</span> | Batch: <span className="text-foreground">{batchSupport ? "Yes" : "No"}</span> | Webhooks: <span className="text-foreground">{webhooksEnabled ? "Yes" : "No"}</span> | gRPC: <span className="text-foreground">{grpcSupport ? "Yes" : "No"}</span></div>
                          {sdkLanguages.length > 0 && <div>SDKs: <span className="text-foreground">{sdkLanguages.join(", ")}</span></div>}
                        </div>
                      </div>
                    </>
                  )}

                  {isSaas && (
                    <>
                      <div>
                        <span className="font-medium text-muted-foreground uppercase tracking-wide">API Architecture</span>
                        <div className="mt-1 space-y-0.5">
                          <div>Style: <span className="text-foreground">{saasApiStyle}</span> | Versioning: <span className="text-foreground">{saasVersioning}</span></div>
                          <div>Multi-Tenancy: <span className="text-foreground">{saasMultiTenancy}</span> | JSON: <span className="text-foreground">{saasJsonMode ? "Yes" : "No"}</span> | Streaming: <span className="text-foreground">{saasStreaming ? "Yes" : "No"}</span></div>
                          <div>Webhooks: <span className="text-foreground">{saasWebhooks ? "Yes" : "No"}</span>{saasWebhooks && saasEventTypes.length > 0 && <> ({saasEventTypes.join(", ")})</>}</div>
                        </div>
                      </div>
                      <Separator />
                      <div>
                        <span className="font-medium text-muted-foreground uppercase tracking-wide">Security</span>
                        <div className="mt-1 space-y-0.5">
                          <div>Auth: <span className="text-foreground">{saasAuthMethods.join(", ")}</span></div>
                          <div>Transit: <span className="text-foreground">{saasEncryptionTransit}</span> | At Rest: <span className="text-foreground">{saasEncryptionRest}</span> | RBAC: <span className="text-foreground">{saasRbac ? "Yes" : "No"}</span></div>
                          <div>Compliance: <span className="text-foreground">{saasCompliance.join(", ") || "None"}</span></div>
                        </div>
                      </div>
                      <Separator />
                      <div>
                        <span className="font-medium text-muted-foreground uppercase tracking-wide">Reliability</span>
                        <div className="mt-1 space-y-0.5">
                          <div>SLA: <span className="text-foreground">{saasSla}%</span> | Rate Limit: <span className="text-foreground">{saasRateLimiting ? "Yes" : "No"}</span> | Throttle: <span className="text-foreground">{saasThrottling ? "Yes" : "No"}</span></div>
                          <div>CDN: <span className="text-foreground">{saasCdn ? "Yes" : "No"}</span> | Multi-Region: <span className="text-foreground">{saasMultiRegion ? "Yes" : "No"}</span>{saasMultiRegion && saasRegions.length > 0 && <> ({saasRegions.join(", ")})</>} | Auto-Scale: <span className="text-foreground">{saasAutoScaling ? "Yes" : "No"}</span></div>
                        </div>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Step 5: Monitoring & Observability (Enterprise Provider only) */}
            {!editingEntry && createStep === 4 && isEnterprise && (
              <div className="space-y-5">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Eye className="h-4 w-4 text-primary" />
                  Monitoring &amp; Observability
                </div>

                {/* Logging */}
                <div className="space-y-3">
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">Logging</Label>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="grid gap-1.5">
                      <Label className="text-xs">Log Level</Label>
                      <Select value={loggingLevel} onValueChange={setLoggingLevel}>
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="debug">Debug</SelectItem>
                          <SelectItem value="info">Info</SelectItem>
                          <SelectItem value="warn">Warn</SelectItem>
                          <SelectItem value="error">Error Only</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-center justify-between p-2 border rounded-md">
                      <Label className="text-xs">Audit Logging</Label>
                      <Switch checked={auditLogging} onCheckedChange={setAuditLogging} />
                    </div>
                  </div>
                </div>

                {/* Metrics */}
                <div className="space-y-3">
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">Metrics &amp; Tracing</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex items-center justify-between p-2 border rounded-md">
                      <Label className="text-xs">Metrics</Label>
                      <Switch checked={metricsEnabled} onCheckedChange={setMetricsEnabled} />
                    </div>
                    {metricsEnabled && (
                      <div className="grid gap-1.5">
                        <Label className="text-xs">Exporter</Label>
                        <Select value={metricsExporter} onValueChange={setMetricsExporter}>
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="prometheus">Prometheus</SelectItem>
                            <SelectItem value="datadog">Datadog</SelectItem>
                            <SelectItem value="cloudwatch">CloudWatch</SelectItem>
                            <SelectItem value="stackdriver">Stackdriver</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    <div className="flex items-center justify-between p-2 border rounded-md">
                      <Label className="text-xs">Distributed Tracing</Label>
                      <Switch checked={tracingEnabled} onCheckedChange={setTracingEnabled} />
                    </div>
                    {tracingEnabled && (
                      <div className="grid gap-1.5">
                        <Label className="text-xs">Protocol</Label>
                        <Select value={tracingProtocol} onValueChange={setTracingProtocol}>
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="opentelemetry">OpenTelemetry</SelectItem>
                            <SelectItem value="jaeger">Jaeger</SelectItem>
                            <SelectItem value="zipkin">Zipkin</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                </div>

                {/* Alerting & Cost */}
                <div className="space-y-3">
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">Alerting &amp; Cost Management</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex items-center justify-between p-2 border rounded-md">
                      <Label className="text-xs">Alerting</Label>
                      <Switch checked={alertingEnabled} onCheckedChange={setAlertingEnabled} />
                    </div>
                    <div className="flex items-center justify-between p-2 border rounded-md">
                      <Label className="text-xs">Cost Tracking</Label>
                      <Switch checked={costTracking} onCheckedChange={setCostTracking} />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ===== OFFICIAL SAAS STEPS ===== */}

            {/* SaaS Step 2: Core API Architecture & Design */}
            {!editingEntry && createStep === 1 && isSaas && (
              <div className="space-y-5">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Code className="h-4 w-4 text-primary" />
                  Core API Architecture &amp; Design
                </div>

                {/* API Style & Versioning */}
                <div className="space-y-3">
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">RESTful Standards &amp; Versioning</Label>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="grid gap-1.5">
                      <Label className="text-xs">API Style</Label>
                      <Select value={saasApiStyle} onValueChange={setSaasApiStyle}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="REST">RESTful (JSON)</SelectItem>
                          <SelectItem value="REST+GraphQL">REST + GraphQL</SelectItem>
                          <SelectItem value="gRPC">gRPC</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-1.5">
                      <Label className="text-xs">Versioning Strategy</Label>
                      <Select value={saasVersioning} onValueChange={setSaasVersioning}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="url-path">URL Path (/v1/)</SelectItem>
                          <SelectItem value="header">Header-based</SelectItem>
                          <SelectItem value="query">Query Param</SelectItem>
                          <SelectItem value="none">No Versioning</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                {/* Multi-Tenancy */}
                <div className="space-y-3">
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">Multi-Tenancy Support</Label>
                  <div className="grid gap-1.5">
                    <Label className="text-xs">Isolation Model</Label>
                    <Select value={saasMultiTenancy} onValueChange={setSaasMultiTenancy}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="tenant-id">Tenant ID Header</SelectItem>
                        <SelectItem value="subdomain">Subdomain-based</SelectItem>
                        <SelectItem value="schema">Schema Isolation</SelectItem>
                        <SelectItem value="database">Database per Tenant</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Protocols & Features */}
                <div className="space-y-3">
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">Protocols &amp; Features</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex items-center justify-between p-2 border rounded-md">
                      <Label className="text-xs">JSON Mode</Label>
                      <Switch checked={saasJsonMode} onCheckedChange={setSaasJsonMode} />
                    </div>
                    <div className="flex items-center justify-between p-2 border rounded-md">
                      <Label className="text-xs">Streaming (SSE)</Label>
                      <Switch checked={saasStreaming} onCheckedChange={setSaasStreaming} />
                    </div>
                    <div className="flex items-center justify-between p-2 border rounded-md">
                      <Label className="text-xs">GraphQL</Label>
                      <Switch checked={saasGraphql} onCheckedChange={setSaasGraphql} />
                    </div>
                    <div className="flex items-center justify-between p-2 border rounded-md">
                      <Label className="text-xs">Webhooks</Label>
                      <Switch checked={saasWebhooks} onCheckedChange={setSaasWebhooks} />
                    </div>
                  </div>
                </div>

                {/* Webhook Events */}
                {saasWebhooks && (
                  <div className="space-y-3">
                    <Label className="text-xs uppercase tracking-wide text-muted-foreground">Webhook Event Types</Label>
                    <div className="flex flex-wrap gap-1.5">
                      {["completion.done", "job.started", "job.failed", "model.updated", "usage.threshold", "error.rate_limit", "billing.alert"].map((evt) => {
                        const selected = saasEventTypes.includes(evt);
                        return (
                          <Badge
                            key={evt}
                            variant={selected ? "default" : "outline"}
                            className={`text-xs cursor-pointer select-none ${selected ? "" : "opacity-60 hover:opacity-100"}`}
                            onClick={() => setSaasEventTypes((prev) =>
                              selected ? prev.filter((e) => e !== evt) : [...prev, evt]
                            )}
                          >
                            {evt}
                          </Badge>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* SaaS Step 3: Security & Compliance */}
            {!editingEntry && createStep === 2 && isSaas && (
              <div className="space-y-5">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Shield className="h-4 w-4 text-primary" />
                  Security &amp; Compliance
                </div>

                {/* Authentication */}
                <div className="space-y-3">
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">Authentication Protocols</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {["API Key", "OAuth 2.0", "JWT", "Bearer Token", "mTLS"].map((method) => {
                      const selected = saasAuthMethods.includes(method);
                      return (
                        <Badge
                          key={method}
                          variant={selected ? "default" : "outline"}
                          className={`text-xs cursor-pointer select-none ${selected ? "" : "opacity-60 hover:opacity-100"}`}
                          onClick={() => setSaasAuthMethods((prev) =>
                            selected ? prev.filter((m) => m !== method) : [...prev, method]
                          )}
                        >
                          <Lock className="h-3 w-3 mr-1" />{method}
                        </Badge>
                      );
                    })}
                  </div>
                </div>

                {/* Encryption */}
                <div className="space-y-3">
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">Encryption</Label>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="grid gap-1.5">
                      <Label className="text-xs">In Transit</Label>
                      <Select value={saasEncryptionTransit} onValueChange={setSaasEncryptionTransit}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="TLS 1.2">TLS 1.2 / HTTPS</SelectItem>
                          <SelectItem value="TLS 1.3">TLS 1.3 / HTTPS</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-1.5">
                      <Label className="text-xs">At Rest</Label>
                      <Select value={saasEncryptionRest} onValueChange={setSaasEncryptionRest}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="AES-256">AES-256</SelectItem>
                          <SelectItem value="AES-128">AES-128</SelectItem>
                          <SelectItem value="none">Not Specified</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                {/* Access Control */}
                <div className="space-y-3">
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">Access Control</Label>
                  <div className="flex items-center justify-between p-2 border rounded-md">
                    <Label className="text-xs">Role-Based Access Control (RBAC)</Label>
                    <Switch checked={saasRbac} onCheckedChange={setSaasRbac} />
                  </div>
                </div>

                {/* Compliance */}
                <div className="space-y-3">
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">Compliance Certifications</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {["GDPR", "SOC 2 Type II", "ISO 27001", "HIPAA", "CCPA", "PCI DSS", "FedRAMP"].map((cert) => {
                      const selected = saasCompliance.includes(cert);
                      return (
                        <Badge
                          key={cert}
                          variant={selected ? "default" : "outline"}
                          className={`text-xs cursor-pointer select-none ${selected ? "" : "opacity-60 hover:opacity-100"}`}
                          onClick={() => setSaasCompliance((prev) =>
                            selected ? prev.filter((c) => c !== cert) : [...prev, cert]
                          )}
                        >
                          <ShieldCheck className="h-3 w-3 mr-1" />{cert}
                        </Badge>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* SaaS Step 4: Reliability & Performance */}
            {!editingEntry && createStep === 3 && isSaas && (
              <div className="space-y-5">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Gauge className="h-4 w-4 text-primary" />
                  Reliability &amp; Performance
                </div>

                {/* SLA */}
                <div className="space-y-3">
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">Service Level Agreement</Label>
                  <div className="grid gap-1.5">
                    <Label className="text-xs">Uptime Guarantee</Label>
                    <Select value={saasSla} onValueChange={setSaasSla}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="99.0">99.0%</SelectItem>
                        <SelectItem value="99.9">99.9%</SelectItem>
                        <SelectItem value="99.95">99.95%</SelectItem>
                        <SelectItem value="99.99">99.99%</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Rate Limiting & Throttling */}
                <div className="space-y-3">
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">Rate Limiting &amp; Throttling</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex items-center justify-between p-2 border rounded-md">
                      <Label className="text-xs">Rate Limiting</Label>
                      <Switch checked={saasRateLimiting} onCheckedChange={setSaasRateLimiting} />
                    </div>
                    <div className="flex items-center justify-between p-2 border rounded-md">
                      <Label className="text-xs">Throttling</Label>
                      <Switch checked={saasThrottling} onCheckedChange={setSaasThrottling} />
                    </div>
                  </div>
                </div>

                {/* Global Infrastructure */}
                <div className="space-y-3">
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">Global Infrastructure</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex items-center justify-between p-2 border rounded-md">
                      <Label className="text-xs">CDN Integration</Label>
                      <Switch checked={saasCdn} onCheckedChange={setSaasCdn} />
                    </div>
                    <div className="flex items-center justify-between p-2 border rounded-md">
                      <Label className="text-xs">Multi-Region</Label>
                      <Switch checked={saasMultiRegion} onCheckedChange={setSaasMultiRegion} />
                    </div>
                  </div>
                  {saasMultiRegion && (
                    <div className="flex flex-wrap gap-1.5">
                      {["us-east-1", "us-west-2", "eu-west-1", "eu-central-1", "ap-southeast-1", "ap-northeast-1"].map((region) => {
                        const selected = saasRegions.includes(region);
                        return (
                          <Badge
                            key={region}
                            variant={selected ? "default" : "outline"}
                            className={`text-xs cursor-pointer select-none ${selected ? "" : "opacity-60 hover:opacity-100"}`}
                            onClick={() => setSaasRegions((prev) =>
                              selected ? prev.filter((r) => r !== region) : [...prev, region]
                            )}
                          >
                            <Globe className="h-3 w-3 mr-1" />{region}
                          </Badge>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Auto-Scaling */}
                <div className="space-y-3">
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">Auto-Scaling</Label>
                  <div className="flex items-center justify-between p-2 border rounded-md">
                    <Label className="text-xs">Automatic Resource Scaling</Label>
                    <Switch checked={saasAutoScaling} onCheckedChange={setSaasAutoScaling} />
                  </div>
                </div>
              </div>
            )}

            {/* SaaS Step 5: Developer Experience */}
            {!editingEntry && createStep === 4 && isSaas && (
              <div className="space-y-5">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Rocket className="h-4 w-4 text-primary" />
                  Developer Experience (DX)
                </div>

                {/* Documentation */}
                <div className="space-y-3">
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">Documentation &amp; Testing</Label>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="flex items-center justify-between p-2 border rounded-md">
                      <Label className="text-xs">API Docs</Label>
                      <Switch checked={saasDocumentation} onCheckedChange={setSaasDocumentation} />
                    </div>
                    <div className="flex items-center justify-between p-2 border rounded-md">
                      <Label className="text-xs">Code Samples</Label>
                      <Switch checked={saasCodeSamples} onCheckedChange={setSaasCodeSamples} />
                    </div>
                    <div className="flex items-center justify-between p-2 border rounded-md">
                      <Label className="text-xs">Sandbox</Label>
                      <Switch checked={saasSandbox} onCheckedChange={setSaasSandbox} />
                    </div>
                  </div>
                </div>

                {/* Observability */}
                <div className="space-y-3">
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">Observability Tools</Label>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="flex items-center justify-between p-2 border rounded-md">
                      <Label className="text-xs">Monitoring</Label>
                      <Switch checked={saasMonitoring} onCheckedChange={setSaasMonitoring} />
                    </div>
                    <div className="flex items-center justify-between p-2 border rounded-md">
                      <Label className="text-xs">Logging</Label>
                      <Switch checked={saasLogging} onCheckedChange={setSaasLogging} />
                    </div>
                    <div className="flex items-center justify-between p-2 border rounded-md">
                      <Label className="text-xs">Analytics</Label>
                      <Switch checked={saasAnalytics} onCheckedChange={setSaasAnalytics} />
                    </div>
                  </div>
                </div>

                {/* Client SDKs */}
                <div className="space-y-3">
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">Official Client SDKs</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {["Python", "JavaScript/TypeScript", "Go", "Java", "C#/.NET", "Ruby", "Rust", "Swift", "Kotlin"].map((lang) => {
                      const selected = saasSdkLanguages.includes(lang);
                      return (
                        <Badge
                          key={lang}
                          variant={selected ? "default" : "outline"}
                          className={`text-xs cursor-pointer select-none ${selected ? "" : "opacity-60 hover:opacity-100"}`}
                          onClick={() => setSaasSdkLanguages((prev) =>
                            selected ? prev.filter((l) => l !== lang) : [...prev, lang]
                          )}
                        >
                          <Code className="h-3 w-3 mr-1" />{lang}
                        </Badge>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
          {stepError && (
            <p className="text-xs text-destructive px-1 pt-2">{stepError}</p>
          )}
          <div className="flex items-center justify-end gap-2 pt-2">
            {!editingEntry && createStep > 0 && (
              <Button variant="outline" onClick={() => { setStepError(null); setCreateStep(createStep - 1); }}>Back</Button>
            )}
            <Button variant="outline" onClick={closeDialog}>Cancel</Button>
            {editingEntry && (
              <Button onClick={handleSave} disabled={!formName || saving}>
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Save Changes
              </Button>
            )}
            {!editingEntry && createStep < 4 && (
              <Button onClick={handleNextStep}>Next</Button>
            )}
            {!editingEntry && createStep === 4 && (
              <Button onClick={handleSave} disabled={!formName || saving}>
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Create
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Entry</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{deletingEntry?.displayName || deletingEntry?.name}"?
              This will remove all version history and cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => deletingEntry && deleteMutation.mutate({ id: deletingEntry.id })}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Version History Dialog */}
      <Dialog open={versionsDialogOpen} onOpenChange={setVersionsDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Version History</DialogTitle>
            <DialogDescription>
              Configuration snapshots for this entry
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[400px] overflow-y-auto">
            {versions.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No versions found</p>
            ) : (
              <div className="space-y-3">
                {versions.map((v: any) => (
                  <div key={v.id} className="border rounded-md p-3">
                    <div className="flex items-center justify-between mb-1">
                      <Badge variant="outline" className="text-xs">v{v.version}</Badge>
                      <span className="text-xs text-muted-foreground">
                        {new Date(v.createdAt).toLocaleString()}
                      </span>
                    </div>
                    {v.changeNotes && (
                      <p className="text-xs text-muted-foreground">{v.changeNotes}</p>
                    )}
                    <p className="text-xs font-mono text-muted-foreground mt-1 truncate">
                      Hash: {v.configHash?.substring(0, 16)}...
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Publish Wizard Dialog */}
      <Dialog open={publishDialogOpen} onOpenChange={(open) => {
        if (!open) { setPublishDialogOpen(false); setPublishEntry(null); setWizardStep(0); }
      }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {wizardStep === 3 ? "Published!" : `Publish — Step ${wizardStep + 1} of 3`}
            </DialogTitle>
            <DialogDescription>
              {wizardStep === 0 && "Review the entry configuration before publishing"}
              {wizardStep === 1 && "Set a version label for this publish bundle"}
              {wizardStep === 2 && "Confirm and publish the immutable snapshot"}
              {wizardStep === 3 && "The bundle has been published to the registry"}
            </DialogDescription>
          </DialogHeader>

          {/* Step 0: Review */}
          {wizardStep === 0 && publishEntry && (
            <div className="space-y-3 py-2">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="text-muted-foreground">Name</div>
                <div className="font-medium">{publishEntry.displayName || publishEntry.name}</div>
                <div className="text-muted-foreground">Type</div>
                <div>{publishEntry.entryType}</div>
                <div className="text-muted-foreground">Scope</div>
                <div>{publishEntry.scope}</div>
                <div className="text-muted-foreground">Validation</div>
                <div>
                  <Badge className={`text-xs ${publishEntry.validationStatus === "passed" ? "bg-green-600/20 text-green-400" : "bg-yellow-600/20 text-yellow-400"}`}>
                    {publishEntry.validationStatus || "unknown"}
                  </Badge>
                </div>
              </div>
              {publishEntry.config && Object.keys(publishEntry.config).length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Configuration:</p>
                  <pre className="text-xs font-mono bg-muted/50 rounded p-2 max-h-[150px] overflow-y-auto">
                    {JSON.stringify(publishEntry.config, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}

          {/* Step 1: Version label */}
          {wizardStep === 1 && (
            <div className="space-y-4 py-2">
              <div className="grid gap-2">
                <Label>Version Label</Label>
                <Input
                  value={publishVersion}
                  onChange={(e) => setPublishVersion(e.target.value)}
                  placeholder="e.g., 1.0.0 or v2024.02.17"
                />
                <p className="text-xs text-muted-foreground">
                  Use semantic versioning (1.0.0) or date-based labels
                </p>
              </div>
              <div className="grid gap-2">
                <Label>Change Notes (optional)</Label>
                <Textarea
                  value={publishNotes}
                  onChange={(e) => setPublishNotes(e.target.value)}
                  placeholder="What changed in this version..."
                  rows={3}
                />
              </div>
            </div>
          )}

          {/* Step 2: Confirm */}
          {wizardStep === 2 && publishEntry && (
            <div className="space-y-3 py-2">
              <div className="p-3 border rounded-md bg-muted/30">
                <p className="text-sm font-medium mb-2">You are about to publish:</p>
                <div className="grid grid-cols-2 gap-1 text-xs">
                  <span className="text-muted-foreground">Entry:</span>
                  <span>{publishEntry.displayName || publishEntry.name}</span>
                  <span className="text-muted-foreground">Version:</span>
                  <span className="font-mono">{publishVersion}</span>
                  {publishNotes && (
                    <>
                      <span className="text-muted-foreground">Notes:</span>
                      <span>{publishNotes}</span>
                    </>
                  )}
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                This will create an immutable snapshot that cannot be edited. Previous active bundles will be superseded.
              </p>
            </div>
          )}

          {/* Step 3: Done */}
          {wizardStep === 3 && (
            <div className="flex flex-col items-center py-6">
              <CheckCircle2 className="h-12 w-12 text-green-500 mb-3" />
              <p className="text-lg font-medium">Successfully Published</p>
              <p className="text-sm text-muted-foreground mt-1">
                Version <span className="font-mono">{publishVersion}</span> is now active in the registry
              </p>
            </div>
          )}

          <DialogFooter>
            {wizardStep === 0 && (
              <>
                <Button variant="outline" onClick={() => setPublishDialogOpen(false)}>Cancel</Button>
                <Button onClick={() => setWizardStep(1)}>Next</Button>
              </>
            )}
            {wizardStep === 1 && (
              <>
                <Button variant="outline" onClick={() => setWizardStep(0)}>Back</Button>
                <Button onClick={() => setWizardStep(2)} disabled={!publishVersion}>Next</Button>
              </>
            )}
            {wizardStep === 2 && (
              <>
                <Button variant="outline" onClick={() => setWizardStep(1)}>Back</Button>
                <Button onClick={handlePublish} disabled={publishMutation.isPending}>
                  {publishMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Publish
                </Button>
              </>
            )}
            {wizardStep === 3 && (
              <Button onClick={() => { setPublishDialogOpen(false); setPublishEntry(null); setWizardStep(0); }}>
                Done
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
