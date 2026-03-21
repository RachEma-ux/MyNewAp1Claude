/**
 * LLM List Page — Governed LLM inventory and Catalog import readiness
 *
 * This is an inventory page (NOT a dashboard).
 * Shows all LLMs from both register and creation flows with computed statuses.
 */

import { useMemo, useState } from "react";
import { useLocation } from "wouter";
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
  Wand2,
  Cpu,
  ArrowRight,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  Package,
  AlertTriangle,
  Upload,
  Eye,
  Wrench,
  ExternalLink,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────

type DerivedStatus = "draft" | "building" | "blocked" | "deployable" | "imported";

interface LLMRow {
  id: number;
  name: string;
  displayName: string;
  description: string | null;
  role: string;
  source: "registered" | "created";
  status: DerivedStatus;
  readiness: string;
  catalogState: "not_imported" | "candidate" | "imported" | "published";
  catalogEntryId: number | null;
  updatedAt: string;
  creationProjectId: number | null;
}

// ── Status computation ───────────────────────────────────────────────

function computeStatus(
  llm: any,
  versions: any[],
  creationProject: any | null,
  catalogEntry: any | null
): { status: DerivedStatus; readiness: string; catalogState: LLMRow["catalogState"] } {
  // Check catalog import state first
  if (catalogEntry) {
    const tags: string[] = catalogEntry.tags || [];
    if (tags.includes("published")) {
      return { status: "imported", readiness: "Published in Catalog", catalogState: "published" };
    }
    if (catalogEntry.status === "active" || catalogEntry.reviewState === "approved") {
      return { status: "imported", readiness: "Imported to Catalog", catalogState: "imported" };
    }
    if (catalogEntry.reviewState === "needs_review") {
      return { status: "imported", readiness: "Catalog candidate", catalogState: "candidate" };
    }
  }

  // Check creation pipeline
  if (creationProject) {
    const pStatus = creationProject.status;
    if (["training", "evaluating", "quantizing", "in_progress"].includes(pStatus)) {
      const phase = creationProject.currentPhase || pStatus;
      return { status: "building", readiness: `${phase} in progress`, catalogState: "not_imported" };
    }
    if (pStatus === "failed") {
      return { status: "blocked", readiness: "Creation pipeline failed", catalogState: "not_imported" };
    }
  }

  // Check versions for governance state
  if (versions.length > 0) {
    const hasBlockedVersion = versions.some(
      (v) => v.policyDecision === "deny" || v.attestationStatus === "failed" || v.attestationStatus === "revoked"
    );
    if (hasBlockedVersion) {
      const blockedVersion = versions.find(
        (v) => v.policyDecision === "deny" || v.attestationStatus === "failed" || v.attestationStatus === "revoked"
      );
      let reason = "Governance blocker";
      if (blockedVersion?.policyDecision === "deny") reason = "Policy denied";
      if (blockedVersion?.attestationStatus === "failed") reason = "Attestation failed";
      if (blockedVersion?.attestationStatus === "revoked") reason = "Attestation revoked";
      return { status: "blocked", readiness: reason, catalogState: "not_imported" };
    }

    const hasCallableVersion = versions.some((v) => v.callable === true);
    const hasPassedPolicy = versions.some((v) => v.policyDecision === "pass" || v.policyDecision === "warn");
    if (hasCallableVersion || hasPassedPolicy) {
      return { status: "deployable", readiness: "Eligible for Catalog import", catalogState: "not_imported" };
    }

    // Has versions but none are callable yet
    return { status: "draft", readiness: "Versions pending review", catalogState: "not_imported" };
  }

  // No versions, no creation project — pure draft
  return { status: "draft", readiness: "Identity only — no versions", catalogState: "not_imported" };
}

// ── Badge helpers ────────────────────────────────────────────────────

const statusConfig: Record<DerivedStatus, { label: string; className: string; icon: typeof CheckCircle2 }> = {
  draft: { label: "Draft", className: "bg-gray-500/10 text-gray-400 border-gray-500/20", icon: Clock },
  building: { label: "Building", className: "bg-blue-500/10 text-blue-500 border-blue-500/20", icon: Loader2 },
  blocked: { label: "Blocked", className: "bg-red-500/10 text-red-500 border-red-500/20", icon: XCircle },
  deployable: { label: "Deployable", className: "bg-green-500/10 text-green-500 border-green-500/20", icon: CheckCircle2 },
  imported: { label: "Imported", className: "bg-purple-500/10 text-purple-400 border-purple-500/20", icon: Package },
};

function StatusBadge({ status }: { status: DerivedStatus }) {
  const config = statusConfig[status];
  const Icon = config.icon;
  return (
    <Badge variant="outline" className={`text-xs ${config.className}`}>
      <Icon className={`w-3 h-3 mr-1 ${status === "building" ? "animate-spin" : ""}`} />
      {config.label}
    </Badge>
  );
}

function CatalogBadge({ state }: { state: LLMRow["catalogState"] }) {
  const map: Record<string, { label: string; className: string }> = {
    not_imported: { label: "Not imported", className: "text-muted-foreground" },
    candidate: { label: "Candidate", className: "text-yellow-500 border-yellow-500/20" },
    imported: { label: "Imported", className: "text-green-500 border-green-500/20" },
    published: { label: "Published", className: "text-purple-500 border-purple-500/20" },
  };
  const { label, className } = map[state];
  return <Badge variant="outline" className={`text-xs ${className}`}>{label}</Badge>;
}

function SourceBadge({ source }: { source: "registered" | "created" }) {
  if (source === "registered") {
    return <Badge variant="outline" className="text-xs text-blue-500 border-blue-500/20">Registered</Badge>;
  }
  return <Badge variant="outline" className="text-xs text-cyan-500 border-cyan-500/20">Created</Badge>;
}

// ── Main Component ───────────────────────────────────────────────────

export default function LLMListPage() {
  const [, navigate] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");

  // Data queries
  const llmsQuery = trpc.llm.list.useQuery({ archived: false });
  const projectsQuery = trpc.llm.listCreationProjects.useQuery({});
  const catalogQuery = trpc.catalogManage.list.useQuery({ entryType: "llm" });

  const isLoading = llmsQuery.isLoading || projectsQuery.isLoading || catalogQuery.isLoading;
  const isError = llmsQuery.isError || projectsQuery.isError;

  // Build unified rows
  const rows: LLMRow[] = useMemo(() => {
    const llms = llmsQuery.data ?? [];
    const projects = projectsQuery.data ?? [];
    const catalogEntries = catalogQuery.data ?? [];

    // Index projects by linked llmId
    const projectByLlmId = new Map<number, any>();
    for (const p of projects) {
      if ((p as any).llmId) {
        projectByLlmId.set((p as any).llmId, p);
      }
    }

    // Index catalog entries by name (lowercase) for matching
    const catalogByName = new Map<string, any>();
    for (const entry of catalogEntries) {
      catalogByName.set(entry.name.toLowerCase(), entry);
      if (entry.displayName) {
        catalogByName.set(entry.displayName.toLowerCase(), entry);
      }
    }

    return llms.map((llm: any): LLMRow => {
      const project = projectByLlmId.get(llm.id) ?? null;
      const catalogEntry = catalogByName.get(llm.name.toLowerCase()) ?? null;
      const source: "registered" | "created" = project ? "created" : "registered";

      // We don't have per-LLM versions in the list query, so derive from available data
      // For a real implementation we'd batch-fetch versions; here we use catalog state as proxy
      const { status, readiness, catalogState } = computeStatus(llm, [], project, catalogEntry);

      return {
        id: llm.id,
        name: llm.name,
        displayName: llm.name,
        description: llm.description,
        role: llm.role,
        source,
        status,
        readiness,
        catalogState,
        catalogEntryId: catalogEntry?.id ?? null,
        updatedAt: llm.updatedAt,
        creationProjectId: project?.id ?? null,
      };
    });
  }, [llmsQuery.data, projectsQuery.data, catalogQuery.data]);

  // Apply filters
  const filtered = useMemo(() => {
    let result = rows;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          r.displayName.toLowerCase().includes(q) ||
          (r.description ?? "").toLowerCase().includes(q) ||
          r.role.toLowerCase().includes(q)
      );
    }

    if (statusFilter !== "all") {
      result = result.filter((r) => r.status === statusFilter);
    }

    if (sourceFilter !== "all") {
      result = result.filter((r) => r.source === sourceFilter);
    }

    return result;
  }, [rows, searchQuery, statusFilter, sourceFilter]);

  // Summary counts
  const counts = useMemo(() => {
    const c = { total: rows.length, draft: 0, building: 0, blocked: 0, deployable: 0, imported: 0 };
    for (const r of rows) c[r.status]++;
    return c;
  }, [rows]);

  // Action handlers
  const handleImport = (row: LLMRow) => {
    navigate(`/llm/catalogue/manage`);
  };

  const handleAction = (row: LLMRow) => {
    switch (row.status) {
      case "deployable":
        handleImport(row);
        break;
      case "blocked":
        navigate(`/llm/${row.id}`);
        break;
      case "building":
        navigate(`/llm/wizard`);
        break;
      case "imported":
        if (row.catalogEntryId) {
          navigate(`/llm/catalogue/manage`);
        }
        break;
      default:
        navigate(`/llm/${row.id}`);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="p-6 space-y-6 max-w-6xl mx-auto">
        <Skeleton className="h-10 w-48" />
        <div className="grid grid-cols-6 gap-3">
          {[1, 2, 3, 4, 5, 6].map((i) => <Skeleton key={i} className="h-16 rounded-lg" />)}
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
          <h1 className="text-2xl font-bold">LLMs List</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Governed LLM inventory and Catalog import readiness
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate("/llm/register")}>
            <Wand2 className="h-4 w-4 mr-1" /> Register LLM
          </Button>
          <Button size="sm" onClick={() => navigate("/llm/wizard")}>
            <Cpu className="h-4 w-4 mr-1" /> LLM Wizard
          </Button>
        </div>
      </div>

      {/* Summary Strip */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
        {[
          { label: "Total", value: counts.total, className: "text-foreground" },
          { label: "Draft", value: counts.draft, className: "text-gray-400" },
          { label: "Building", value: counts.building, className: "text-blue-500" },
          { label: "Blocked", value: counts.blocked, className: "text-red-500" },
          { label: "Deployable", value: counts.deployable, className: "text-green-500" },
          { label: "Imported", value: counts.imported, className: "text-purple-400" },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="p-3 text-center">
              <p className={`text-xl font-bold ${s.className}`}>{s.value}</p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name, role, description..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="building">Building</SelectItem>
            <SelectItem value="blocked">Blocked</SelectItem>
            <SelectItem value="deployable">Deployable</SelectItem>
            <SelectItem value="imported">Imported</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sourceFilter} onValueChange={setSourceFilter}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Source" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sources</SelectItem>
            <SelectItem value="registered">Registered</SelectItem>
            <SelectItem value="created">Created</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Error state */}
      {isError && (
        <Card className="border-destructive/30">
          <CardHeader>
            <CardTitle className="text-sm">Failed to load LLMs</CardTitle>
            <CardDescription>{llmsQuery.error?.message || "Unknown error"}</CardDescription>
          </CardHeader>
        </Card>
      )}

      {/* Empty state */}
      {!isError && filtered.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Package className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">
              {rows.length === 0 ? "No LLMs registered" : "No LLMs match filters"}
            </h3>
            <p className="text-muted-foreground text-center mb-4 text-sm">
              {rows.length === 0
                ? "Get started by registering an LLM or using the creation wizard."
                : "Try adjusting your search or filter criteria."}
            </p>
            {rows.length === 0 && (
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => navigate("/llm/register")}>
                  Register LLM
                </Button>
                <Button size="sm" onClick={() => navigate("/llm/wizard")}>
                  LLM Wizard
                </Button>
              </div>
            )}
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
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">LLM</th>
                    <th className="text-left py-3 px-3 font-medium text-muted-foreground">Source</th>
                    <th className="text-left py-3 px-3 font-medium text-muted-foreground">Status</th>
                    <th className="text-left py-3 px-3 font-medium text-muted-foreground">Readiness / Blocker</th>
                    <th className="text-left py-3 px-3 font-medium text-muted-foreground">Catalog</th>
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
                      {/* LLM */}
                      <td className="py-3 px-4">
                        <div className="min-w-0">
                          <p className="font-medium truncate max-w-[200px]">{row.displayName}</p>
                          {row.name !== row.displayName && (
                            <p className="text-xs text-muted-foreground truncate">{row.name}</p>
                          )}
                          <p className="text-xs text-muted-foreground capitalize">{row.role}</p>
                        </div>
                      </td>

                      {/* Source */}
                      <td className="py-3 px-3">
                        <SourceBadge source={row.source} />
                      </td>

                      {/* Status */}
                      <td className="py-3 px-3">
                        <StatusBadge status={row.status} />
                      </td>

                      {/* Readiness / Blocker */}
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-1.5">
                          {row.status === "blocked" && <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0" />}
                          {row.status === "deployable" && <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />}
                          <span className="text-xs text-muted-foreground">{row.readiness}</span>
                        </div>
                      </td>

                      {/* Catalog */}
                      <td className="py-3 px-3">
                        <CatalogBadge state={row.catalogState} />
                      </td>

                      {/* Updated */}
                      <td className="py-3 px-3 text-xs text-muted-foreground whitespace-nowrap">
                        {row.updatedAt ? new Date(row.updatedAt).toLocaleDateString() : "—"}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-right">
                        <ActionButton row={row} onAction={handleAction} />
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

function ActionButton({ row, onAction }: { row: LLMRow; onAction: (row: LLMRow) => void }) {
  const config: Record<DerivedStatus, { label: string; icon: typeof Upload; variant: "default" | "outline" | "ghost" }> = {
    deployable: { label: "Import", icon: Upload, variant: "default" },
    blocked: { label: "Fix", icon: Wrench, variant: "outline" },
    building: { label: "View", icon: Eye, variant: "outline" },
    imported: { label: "Open", icon: ExternalLink, variant: "ghost" },
    draft: { label: "View", icon: ArrowRight, variant: "ghost" },
  };

  const { label, icon: Icon, variant } = config[row.status];

  return (
    <Button size="sm" variant={variant} className="h-7 text-xs" onClick={() => onAction(row)}>
      <Icon className="w-3.5 h-3.5 mr-1" />
      {label}
    </Button>
  );
}
