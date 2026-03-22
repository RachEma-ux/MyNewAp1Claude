/**
 * Model List Page — Governed model inventory and Catalog import readiness
 *
 * Supports two modes:
 * A. Normal mode — full inventory with statuses, filters
 * B. Catalog-import mode — triggered via ?mode=catalog-import&deployableOnly=1&returnTo=...
 *    Shows only deployable models, selection UI, returns to Catalog candidate flow
 */

import { useMemo, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Search,
  Brain,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  Package,
  Upload,
  Eye,
  ArrowRight,
  ExternalLink,
  Plus,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────

type DerivedStatus = "draft" | "deployable" | "imported" | "deprecated" | "disabled";

interface ModelRow {
  id: number;
  name: string;
  displayName: string;
  modelType: string;
  status: DerivedStatus;
  catalogState: "not_imported" | "candidate" | "imported" | "published";
  catalogEntryId: number | null;
  parameterCount: string | null;
  contextLength: number | null;
  architecture: string | null;
  blockingReasons: string[];
  updatedAt: string;
}

// ── Badge helpers ────────────────────────────────────────────────────

const statusConfig: Record<DerivedStatus, { label: string; className: string; icon: typeof CheckCircle2 }> = {
  draft: { label: "Draft", className: "bg-gray-500/10 text-gray-400 border-gray-500/20", icon: Clock },
  deployable: { label: "Deployable", className: "bg-green-500/10 text-green-500 border-green-500/20", icon: CheckCircle2 },
  imported: { label: "Imported", className: "bg-purple-500/10 text-purple-400 border-purple-500/20", icon: Package },
  deprecated: { label: "Deprecated", className: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20", icon: Clock },
  disabled: { label: "Disabled", className: "bg-red-500/10 text-red-500 border-red-500/20", icon: XCircle },
};

function StatusBadge({ status }: { status: DerivedStatus }) {
  const config = statusConfig[status];
  const Icon = config.icon;
  return (
    <Badge variant="outline" className={`text-xs ${config.className}`}>
      <Icon className="w-3 h-3 mr-1" />
      {config.label}
    </Badge>
  );
}

function CatalogBadge({ state }: { state: ModelRow["catalogState"] }) {
  const map: Record<string, { label: string; className: string }> = {
    not_imported: { label: "Not imported", className: "text-muted-foreground" },
    candidate: { label: "Candidate", className: "text-yellow-500 border-yellow-500/20" },
    imported: { label: "Imported", className: "text-green-500 border-green-500/20" },
    published: { label: "Published", className: "text-purple-500 border-purple-500/20" },
  };
  const { label, className } = map[state];
  return <Badge variant="outline" className={`text-xs ${className}`}>{label}</Badge>;
}

// ── Main Component ───────────────────────────────────────────────────

export default function ModelListPage() {
  const [, navigate] = useLocation();
  const search = useSearch();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");

  // Catalog-import mode detection
  const searchParams = useMemo(() => new URLSearchParams(search), [search]);
  const importSelectionMode = searchParams.get("mode") === "catalog-import";
  const deployableOnly = searchParams.get("deployableOnly") === "1";
  const returnTo = searchParams.get("returnTo") || "/llm/catalogue/candidate";

  // Data queries
  const modelsQuery = trpc.models.listEnriched.useQuery();
  const importMutation = trpc.models.importToCatalog.useMutation();

  const isLoading = modelsQuery.isLoading;
  const isError = modelsQuery.isError;

  // Build rows
  const rows: ModelRow[] = useMemo(() => {
    const models = modelsQuery.data ?? [];
    return models.map((model: any): ModelRow => {
      const isDeployable = model.isDeployable && model.catalogState === "not_imported";
      let derivedStatus: DerivedStatus;

      if (model.catalogState !== "not_imported") {
        derivedStatus = "imported";
      } else if (model.status === "deprecated") {
        derivedStatus = "deprecated";
      } else if (model.status === "disabled") {
        derivedStatus = "disabled";
      } else if (isDeployable) {
        derivedStatus = "deployable";
      } else {
        derivedStatus = "draft";
      }

      return {
        id: model.id,
        name: model.name,
        displayName: model.displayName,
        modelType: model.modelType,
        status: derivedStatus,
        catalogState: model.catalogState,
        catalogEntryId: model.catalogEntryId,
        parameterCount: model.parameterCount,
        contextLength: model.contextLength,
        architecture: model.architecture,
        blockingReasons: model.blockingReasons ?? [],
        updatedAt: model.updatedAt,
      };
    });
  }, [modelsQuery.data]);

  // Apply filters
  const filtered = useMemo(() => {
    let result = rows;

    if (importSelectionMode && deployableOnly) {
      result = result.filter(
        (r) => r.status === "deployable" && r.catalogState === "not_imported"
      );
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          r.displayName.toLowerCase().includes(q) ||
          r.modelType.toLowerCase().includes(q)
      );
    }

    if (!importSelectionMode && statusFilter !== "all") {
      result = result.filter((r) => r.status === statusFilter);
    }

    if (!importSelectionMode && typeFilter !== "all") {
      result = result.filter((r) => r.modelType === typeFilter);
    }

    return result;
  }, [rows, searchQuery, statusFilter, typeFilter, importSelectionMode, deployableOnly]);

  // Summary counts
  const counts = useMemo(() => {
    const c = { total: rows.length, draft: 0, deployable: 0, imported: 0, deprecated: 0, disabled: 0 };
    for (const r of rows) c[r.status]++;
    return c;
  }, [rows]);

  // Catalog import selection handler
  const handleCatalogSelection = async (row: ModelRow) => {
    const result = await importMutation.mutateAsync({ id: row.id });
    const entryId = result.entry?.id;
    navigate(entryId ? `${returnTo}?entryId=${entryId}` : returnTo);
  };

  // Action handlers (normal mode)
  const handleAction = (row: ModelRow) => {
    switch (row.status) {
      case "deployable":
        navigate("/llm/catalogue/manage");
        break;
      case "imported":
        if (row.catalogEntryId) {
          navigate("/llm/catalogue/manage");
        }
        break;
      default:
        navigate("/models/wizard");
    }
  };

  // ── Render ──────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="p-6 space-y-6 max-w-6xl mx-auto">
        <Skeleton className="h-10 w-48" />
        <div className="grid grid-cols-5 gap-3">
          {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-16 rounded-lg" />)}
        </div>
        <Skeleton className="h-64 rounded-lg" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            {importSelectionMode ? "Select Model for Catalog" : "Models List"}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {importSelectionMode
              ? "Select a deployable model to continue Catalog candidate creation"
              : "Governed model inventory and Catalog import readiness"}
          </p>
        </div>
        {importSelectionMode ? (
          <Button variant="outline" size="sm" onClick={() => navigate(returnTo)}>
            Back to Candidate Pipeline
          </Button>
        ) : (
          <Button size="sm" onClick={() => navigate("/models/wizard")}>
            <Plus className="h-4 w-4 mr-1" /> Register Model
          </Button>
        )}
      </div>

      {/* Catalog Import Mode Banner */}
      {importSelectionMode && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="flex items-start gap-3 pt-6">
            <CheckCircle2 className="mt-0.5 h-5 w-5 text-primary" />
            <div className="space-y-1 text-sm">
              <p className="font-medium">Catalog Import Mode</p>
              <p className="text-muted-foreground">
                Only deployable models are shown. Select one to create a Catalog candidate entry.
                This does not grant runtime authority — the Catalog pipeline handles review, publication, and activation.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Summary Strip — hidden in catalog-import mode */}
      {!importSelectionMode && (
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
          {[
            { label: "Total", value: counts.total, className: "text-foreground" },
            { label: "Draft", value: counts.draft, className: "text-gray-400" },
            { label: "Deployable", value: counts.deployable, className: "text-green-500" },
            { label: "Imported", value: counts.imported, className: "text-purple-400" },
            { label: "Deprecated", value: counts.deprecated, className: "text-yellow-500" },
            { label: "Disabled", value: counts.disabled, className: "text-red-500" },
          ].map((s) => (
            <Card key={s.label}>
              <CardContent className="p-3 text-center">
                <p className={`text-xl font-bold ${s.className}`}>{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={importSelectionMode ? "Search deployable models..." : "Search by name, type..."}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        {!importSelectionMode && (
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="deployable">Deployable</SelectItem>
              <SelectItem value="imported">Imported</SelectItem>
              <SelectItem value="deprecated">Deprecated</SelectItem>
              <SelectItem value="disabled">Disabled</SelectItem>
            </SelectContent>
          </Select>
        )}
        {!importSelectionMode && (
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              <SelectItem value="llm">LLM</SelectItem>
              <SelectItem value="embedding">Embedding</SelectItem>
              <SelectItem value="reranker">Reranker</SelectItem>
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Error state */}
      {isError && (
        <Card className="border-destructive/30">
          <CardHeader>
            <CardTitle className="text-sm">Failed to load models</CardTitle>
            <CardDescription>{modelsQuery.error?.message || "Unknown error"}</CardDescription>
          </CardHeader>
        </Card>
      )}

      {/* Empty state */}
      {!isError && filtered.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Package className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">
              {importSelectionMode
                ? "No deployable models available"
                : rows.length === 0
                  ? "No models registered"
                  : "No models match filters"}
            </h3>
            <p className="text-muted-foreground text-center mb-4 text-sm">
              {importSelectionMode
                ? "Register a model and set its status to 'ready' or 'active' before it can be imported to the Catalog."
                : rows.length === 0
                  ? "Get started by registering a model using the wizard."
                  : "Try adjusting your search or filter criteria."}
            </p>
            {importSelectionMode ? (
              <Button variant="outline" size="sm" onClick={() => navigate(returnTo)}>
                Back to Candidate Pipeline
              </Button>
            ) : rows.length === 0 ? (
              <Button size="sm" onClick={() => navigate("/models/wizard")}>
                <Plus className="h-4 w-4 mr-1" /> Register Model
              </Button>
            ) : null}
          </CardContent>
        </Card>
      )}

      {/* Table */}
      {filtered.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/50">
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Model</th>
                    <th className="text-left py-3 px-3 font-medium text-muted-foreground">Type</th>
                    <th className="text-left py-3 px-3 font-medium text-muted-foreground">Status</th>
                    <th className="text-left py-3 px-3 font-medium text-muted-foreground">Catalog</th>
                    <th className="text-left py-3 px-3 font-medium text-muted-foreground">Params</th>
                    <th className="text-left py-3 px-3 font-medium text-muted-foreground">Updated</th>
                    <th className="text-right py-3 px-4 font-medium text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row) => (
                    <tr
                      key={row.id}
                      className="border-b border-border/30 hover:bg-muted/20 transition-colors"
                    >
                      {/* Model */}
                      <td className="py-3 px-4">
                        <div className="min-w-0">
                          <p className="font-medium truncate max-w-[200px]">{row.displayName}</p>
                          {row.name !== row.displayName && (
                            <p className="text-xs text-muted-foreground truncate">{row.name}</p>
                          )}
                        </div>
                      </td>

                      {/* Type */}
                      <td className="py-3 px-3">
                        <Badge variant="outline" className="text-xs capitalize">{row.modelType}</Badge>
                      </td>

                      {/* Status */}
                      <td className="py-3 px-3">
                        <StatusBadge status={row.status} />
                      </td>

                      {/* Catalog */}
                      <td className="py-3 px-3">
                        <CatalogBadge state={row.catalogState} />
                      </td>

                      {/* Params */}
                      <td className="py-3 px-3 text-xs text-muted-foreground">
                        {row.parameterCount || "—"}
                      </td>

                      {/* Updated */}
                      <td className="py-3 px-3 text-xs text-muted-foreground whitespace-nowrap">
                        {row.updatedAt ? new Date(row.updatedAt).toLocaleDateString() : "—"}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-right">
                        {importSelectionMode ? (
                          <Button
                            size="sm"
                            className="h-7 text-xs"
                            disabled={importMutation.isPending}
                            onClick={() => handleCatalogSelection(row)}
                          >
                            <Upload className="w-3.5 h-3.5 mr-1" />
                            {importMutation.isPending ? "Importing..." : "Select for Catalog"}
                          </Button>
                        ) : (
                          <ActionButton row={row} onAction={handleAction} />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── Action Button ────────────────────────────────────────────────────

function ActionButton({ row, onAction }: { row: ModelRow; onAction: (row: ModelRow) => void }) {
  const config: Record<DerivedStatus, { label: string; icon: typeof Upload; variant: "default" | "outline" | "ghost" }> = {
    deployable: { label: "Import", icon: Upload, variant: "default" },
    imported: { label: "Open", icon: ExternalLink, variant: "ghost" },
    draft: { label: "View", icon: ArrowRight, variant: "ghost" },
    deprecated: { label: "View", icon: Eye, variant: "ghost" },
    disabled: { label: "View", icon: Eye, variant: "ghost" },
  };

  const { label, icon: Icon, variant } = config[row.status];

  return (
    <Button size="sm" variant={variant} className="h-7 text-xs" onClick={() => onAction(row)}>
      <Icon className="w-3.5 h-3.5 mr-1" />
      {label}
    </Button>
  );
}
