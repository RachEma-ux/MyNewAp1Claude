import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import {
  getCategoriesForType,
  getSubCategories,
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
} from "lucide-react";

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

export default function CatalogManagePage() {
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState<"catalog" | "validation" | "publishing" | "audit">("catalog");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | EntryType>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  // Create/Edit dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<any>(null);
  const [formName, setFormName] = useState("");
  const [formDisplayName, setFormDisplayName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formEntryType, setFormEntryType] = useState<EntryType>("provider");
  const [formTags, setFormTags] = useState("");
  const [formConfig, setFormConfig] = useState("{}");
  const [formCategory, setFormCategory] = useState("");
  const [formSubCategory, setFormSubCategory] = useState("");
  const [formCapabilities, setFormCapabilities] = useState<string[]>([]);

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

  // Data queries
  const { data: entries = [], isLoading, refetch } = trpc.catalogManage.list.useQuery({
    ...(typeFilter !== "all" ? { entryType: typeFilter } : {}),
    ...(categoryFilter !== "all" ? { category: categoryFilter } : {}),
  });
  const { data: versions = [] } = trpc.catalogManage.listVersions.useQuery(
    { catalogEntryId: versionsEntryId! },
    { enabled: !!versionsEntryId }
  );
  const { data: bundles = [], refetch: refetchBundles } = trpc.catalogManage.listBundles.useQuery({});
  const { data: auditEvents = [] } = trpc.catalogRegistry.auditLog.useQuery({ limit: 50 });

  // Mutations
  const createMutation = trpc.catalogManage.create.useMutation({
    onSuccess: () => { refetch(); closeDialog(); },
  });
  const updateMutation = trpc.catalogManage.update.useMutation({
    onSuccess: () => { refetch(); closeDialog(); },
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
    setFormCategory("");
    setFormSubCategory("");
    setFormCapabilities([]);
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
    setFormCategory(entry.category || "");
    setFormSubCategory(entry.subCategory || "");
    setFormCapabilities(entry.capabilities || []);
    setDialogOpen(true);
  }

  function closeDialog() {
    setDialogOpen(false);
    setEditingEntry(null);
  }

  function handleSave() {
    let parsedConfig: Record<string, unknown> = {};
    try {
      parsedConfig = JSON.parse(formConfig);
    } catch {
      // Keep empty config on parse error
    }

    const tags = formTags.split(",").map((t) => t.trim()).filter(Boolean);

    if (editingEntry) {
      updateMutation.mutate({
        id: editingEntry.id,
        name: formName,
        displayName: formDisplayName || formName,
        description: formDescription || undefined,
        config: parsedConfig,
        tags,
        category: formCategory || undefined,
        subCategory: formSubCategory || undefined,
        capabilities: formCapabilities.length > 0 ? formCapabilities : undefined,
      });
    } else {
      createMutation.mutate({
        name: formName,
        displayName: formDisplayName || undefined,
        description: formDescription || undefined,
        entryType: formEntryType,
        config: parsedConfig,
        tags,
        category: formCategory || undefined,
        subCategory: formSubCategory || undefined,
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
            <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v as any); setCategoryFilter("all"); }}>
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
            <Select value={categoryFilter} onValueChange={(v) => setCategoryFilter(v)}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {typeFilter !== "all" ? (
                  Object.entries(getCategoriesForType(typeFilter as EntryType)).map(([key, cat]) => (
                    <SelectItem key={key} value={key}>{cat.label}</SelectItem>
                  ))
                ) : (
                  ENTRY_TYPES.map((t) => {
                    const cats = Object.entries(getCategoriesForType(t));
                    if (cats.length === 0) return null;
                    return [
                      <SelectItem key={`_hdr_${t}`} value={`_hdr_${t}`} disabled>{ENTRY_TYPE_DEFS[t].label}</SelectItem>,
                      ...cats.map(([key, cat]) => (
                        <SelectItem key={`${t}-${key}`} value={key}>{cat.label}</SelectItem>
                      ))
                    ];
                  })
                )}
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
                    <TableHead>Category</TableHead>
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
                        <div className="flex flex-col gap-0.5">
                          {entry.category ? (
                            <Badge variant="secondary" className="text-xs w-fit">
                              {getCategoriesForType(entry.entryType)[entry.category]?.label || entry.category}
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                          {entry.subCategory && (
                            <span className="text-[10px] text-muted-foreground">
                              {getSubCategories(entry.category)?.[entry.subCategory] || entry.subCategory}
                            </span>
                          )}
                          {entry.capabilities && entry.capabilities.length > 0 && (
                            <div className="flex gap-0.5 flex-wrap mt-0.5">
                              {entry.capabilities.slice(0, 2).map((c: string) => (
                                <Badge key={c} variant="outline" className="text-[10px] px-1 py-0">
                                  {c.replace(/_/g, " ")}
                                </Badge>
                              ))}
                              {entry.capabilities.length > 2 && (
                                <span className="text-[10px] text-muted-foreground">+{entry.capabilities.length - 2}</span>
                              )}
                            </div>
                          )}
                        </div>
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
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingEntry ? "Edit Entry" : "New Catalog Entry"}</DialogTitle>
            <DialogDescription>
              {editingEntry
                ? "Update this catalog entry's details"
                : "Create a new provider or model entry in the catalog"}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            {!editingEntry && (
              <div className="grid gap-2">
                <Label>Type</Label>
                <Select value={formEntryType} onValueChange={(v) => {
                  setFormEntryType(v as EntryType);
                  setFormCategory("");
                  setFormSubCategory("");
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

            {/* Category */}
            <div className="grid gap-2">
              <Label>Category</Label>
              <Select value={formCategory} onValueChange={(v) => {
                setFormCategory(v);
                setFormSubCategory("");
              }}>
                <SelectTrigger>
                  <SelectValue placeholder="Select category..." />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(getCategoriesForType(formEntryType)).map(([key, cat]) => (
                    <SelectItem key={key} value={key}>
                      {cat.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {formCategory && getCategoriesForType(formEntryType)[formCategory] && (
                <p className="text-xs text-muted-foreground">{getCategoriesForType(formEntryType)[formCategory].description}</p>
              )}
            </div>

            {/* Sub-Category (conditional) */}
            {formCategory && getSubCategories(formCategory) && Object.keys(getSubCategories(formCategory)!).length > 0 && (
              <div className="grid gap-2">
                <Label>Sub-Category</Label>
                <Select value={formSubCategory} onValueChange={setFormSubCategory}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select sub-category..." />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(getSubCategories(formCategory)!).map(([key, label]) => (
                      <SelectItem key={key} value={key}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

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
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>Cancel</Button>
            <Button onClick={handleSave} disabled={!formName || saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editingEntry ? "Save Changes" : "Create"}
            </Button>
          </DialogFooter>
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
