/**
 * LLM List Page — Governed LLM inventory and Catalog import readiness
 *
 * This is an inventory page (NOT a dashboard).
 * Shows all LLMs from both register and creation flows with computed statuses.
 *
 * Supports two modes:
 * A. Normal mode — full inventory with statuses, filters, no import initiation
 * B. Catalog-import mode — triggered via ?mode=catalog-import&deployableOnly=1&returnTo=...
 *    Shows only deployable LLMs, selection UI, returns to Catalog candidate flow
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
  blockedReason: string | null;
  catalogState: "not_imported" | "candidate" | "imported" | "published";
  catalogEntryId: number | null;
  updatedAt: string;
  creationProjectId: number | null;
  /** For building status: current pipeline phase */
  currentPhase: string | null;
  /** For building status: progress 0–100 */
  progress: number | null;
}

// ── Status computation ───────────────────────────────────────────────

interface ComputedStatus {
  status: DerivedStatus;
  readiness: string;
  blockedReason: string | null;
  catalogState: LLMRow["catalogState"];
  currentPhase: string | null;
  progress: number | null;
}

/** Phase label for human-readable display */
function phaseLabel(phase: string | null): string {
  if (!phase) return "In progress";
  const map: Record<string, string> = {
    phase_0_planning: "Planning",
    phase_1_base_model: "Base model selection",
    phase_2_dataset: "Dataset preparation",
    phase_3_fine_tune: "Fine-tuning (SFT)",
    phase_4_alignment: "Alignment (DPO)",
    phase_5_tool_tuning: "Tool tuning",
    phase_6_evaluation: "Evaluation",
    phase_7_quantization: "Quantization",
    phase_8_packaging: "Packaging",
    phase_9_governance: "Governance handoff",
  };
  return map[phase] || phase.replace(/_/g, " ");
}

function computeStatus(
  llm: any | null,
  versions: any[],
  creationProject: any | null,
  catalogEntry: any | null
): ComputedStatus {
  const base: Pick<ComputedStatus, "blockedReason" | "currentPhase" | "progress"> = {
    blockedReason: null,
    currentPhase: null,
    progress: null,
  };

  // Check catalog import state first
  if (catalogEntry) {
    const tags: string[] = catalogEntry.tags || [];
    if (tags.includes("published")) {
      return { ...base, status: "imported", readiness: "Published in Catalog", catalogState: "published" };
    }
    if (catalogEntry.status === "active" || catalogEntry.reviewState === "approved") {
      return { ...base, status: "imported", readiness: "Imported to Catalog", catalogState: "imported" };
    }
    if (catalogEntry.reviewState === "needs_review") {
      return { ...base, status: "imported", readiness: "Catalog candidate", catalogState: "candidate" };
    }
  }

  // Check creation pipeline
  if (creationProject) {
    const pStatus = creationProject.status;
    const phase = creationProject.currentPhase || null;
    const prog = typeof creationProject.progress === "number" ? creationProject.progress : null;

    // Active building phases
    if (["training", "evaluating", "quantizing", "in_progress"].includes(pStatus)) {
      return {
        status: "building",
        readiness: phaseLabel(phase),
        blockedReason: null,
        catalogState: "not_imported",
        currentPhase: phase,
        progress: prog,
      };
    }

    // Draft creation project — still in early phases
    if (pStatus === "draft") {
      return {
        status: "building",
        readiness: phaseLabel(phase),
        blockedReason: null,
        catalogState: "not_imported",
        currentPhase: phase,
        progress: prog ?? 0,
      };
    }

    // Failed — derive richer blocked reason from phase
    if (pStatus === "failed") {
      let reason = "Creation pipeline failed";
      if (phase) {
        const label = phaseLabel(phase);
        reason = `Failed at: ${label}`;
      }
      return {
        status: "blocked",
        readiness: reason,
        blockedReason: reason,
        catalogState: "not_imported",
        currentPhase: phase,
        progress: prog,
      };
    }

    // Completed creation project — deployable if linked to an LLM identity
    if (pStatus === "completed") {
      if (creationProject.llmId) {
        // Governance handoff done: LLM identity exists, creation complete → deployable
        return { ...base, status: "deployable", readiness: "Creation complete — eligible for Catalog import", catalogState: "not_imported" };
      }
      // Completed but no LLM identity yet → still needs governance handoff
      return {
        status: "building",
        readiness: "Awaiting governance handoff",
        blockedReason: null,
        catalogState: "not_imported",
        currentPhase: "phase_9_governance",
        progress: 95,
      };
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
      return { ...base, status: "blocked", readiness: reason, blockedReason: reason, catalogState: "not_imported" };
    }

    const hasPassedPolicy = versions.some((v) => v.policyDecision === "pass" || v.policyDecision === "warn");
    if (hasPassedPolicy) {
      return { ...base, status: "deployable", readiness: "Eligible for Catalog import", catalogState: "not_imported" };
    }

    // Has versions but none passed yet
    return { ...base, status: "draft", readiness: "Versions pending review", catalogState: "not_imported" };
  }

  // No versions, no creation project — pure draft
  return { ...base, status: "draft", readiness: "Identity only — no versions", catalogState: "not_imported" };
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
  const search = useSearch();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");

  // Catalog-import mode detection (mirrors Agent pattern)
  const searchParams = useMemo(() => new URLSearchParams(search), [search]);
  const importSelectionMode = searchParams.get("mode") === "catalog-import";
  const deployableOnly = searchParams.get("deployableOnly") === "1";
  const returnTo = searchParams.get("returnTo") || "/llm/catalogue/candidate";

  // Data queries — listEnriched returns LLMs with per-LLM version summaries
  const llmsQuery = trpc.llm.listEnriched.useQuery({ archived: false });
  const projectsQuery = trpc.llm.listCreationProjects.useQuery({});
  const catalogQuery = trpc.catalogManage.list.useQuery({ entryType: "llm" });

  // Catalog import mutation (mirrors agents.importToCatalog)
  const importMutation = trpc.llm.importToCatalog.useMutation();

  const isLoading = llmsQuery.isLoading || projectsQuery.isLoading || catalogQuery.isLoading;
  const isError = llmsQuery.isError || projectsQuery.isError;

  // Build unified rows
  const rows: LLMRow[] = useMemo(() => {
    const llms = llmsQuery.data ?? [];
    const projects = projectsQuery.data ?? [];
    const catalogEntries = catalogQuery.data ?? [];

    // Index projects by linked llmId
    const projectByLlmId = new Map<number, any>();
    const orphanProjects: any[] = [];
    for (const p of projects) {
      if ((p as any).llmId) {
        projectByLlmId.set((p as any).llmId, p);
      } else {
        orphanProjects.push(p);
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

    // 1. Rows from registered/linked LLMs
    const llmRows: LLMRow[] = llms.map((llm: any): LLMRow => {
      const project = projectByLlmId.get(llm.id) ?? null;
      const catalogEntry = catalogByName.get(llm.name.toLowerCase()) ?? null;
      const source: "registered" | "created" = project ? "created" : "registered";

      // Build synthetic version indicators from the enriched versionSummary
      const vs = llm.versionSummary;
      const syntheticVersions: any[] = [];
      if (vs && vs.count > 0) {
        if (vs.hasBlockedVersion) {
          syntheticVersions.push({
            policyDecision: vs.blockedReason === "Policy denied" ? "deny" : "pass",
            attestationStatus: vs.blockedReason === "Attestation failed" ? "failed"
              : vs.blockedReason === "Attestation revoked" ? "revoked" : "pending",
          });
        }
        if (vs.hasPassingPolicy) {
          syntheticVersions.push({ policyDecision: "pass", attestationStatus: "pending" });
        }
        if (syntheticVersions.length === 0) {
          // Has versions but none passing or blocked — pending review
          syntheticVersions.push({ policyDecision: null, attestationStatus: "pending" });
        }
      }

      const computed = computeStatus(llm, syntheticVersions, project, catalogEntry);

      return {
        id: llm.id,
        name: llm.name,
        displayName: llm.name,
        description: llm.description,
        role: llm.role,
        source,
        status: computed.status,
        readiness: computed.readiness,
        blockedReason: computed.blockedReason,
        catalogState: computed.catalogState,
        catalogEntryId: catalogEntry?.id ?? null,
        updatedAt: llm.updatedAt,
        creationProjectId: project?.id ?? null,
        currentPhase: computed.currentPhase,
        progress: computed.progress,
      };
    });

    // 2. Orphan creation projects (no llmId yet — still in pipeline)
    const orphanRows: LLMRow[] = orphanProjects.map((p: any): LLMRow => {
      const computed = computeStatus(null, [], p, null);

      return {
        id: -(p.id),  // negative ID to distinguish from LLM IDs
        name: p.name,
        displayName: p.name,
        description: p.description ?? null,
        role: "—",
        source: "created",
        status: computed.status,
        readiness: computed.readiness,
        blockedReason: computed.blockedReason,
        catalogState: "not_imported",
        catalogEntryId: null,
        updatedAt: p.updatedAt,
        creationProjectId: p.id,
        currentPhase: computed.currentPhase,
        progress: computed.progress,
      };
    });

    return [...llmRows, ...orphanRows];
  }, [llmsQuery.data, projectsQuery.data, catalogQuery.data]);

  // Apply filters
  const filtered = useMemo(() => {
    let result = rows;

    // In catalog-import mode with deployableOnly, show only deployable + not already imported
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
          (r.description ?? "").toLowerCase().includes(q) ||
          r.role.toLowerCase().includes(q)
      );
    }

    if (!importSelectionMode && statusFilter !== "all") {
      result = result.filter((r) => r.status === statusFilter);
    }

    if (!importSelectionMode && sourceFilter !== "all") {
      result = result.filter((r) => r.source === sourceFilter);
    }

    return result;
  }, [rows, searchQuery, statusFilter, sourceFilter, importSelectionMode, deployableOnly]);

  // Summary counts
  const counts = useMemo(() => {
    const c = { total: rows.length, draft: 0, building: 0, blocked: 0, deployable: 0, imported: 0 };
    for (const r of rows) c[r.status]++;
    return c;
  }, [rows]);

  // Catalog import selection handler (mirrors Agent pattern)
  const handleCatalogSelection = async (row: LLMRow) => {
    if (row.id <= 0) return; // Orphan projects can't be imported
    const result = await importMutation.mutateAsync({ id: row.id });
    const entryId = result.entry?.id;
    navigate(entryId ? `${returnTo}?entryId=${entryId}` : returnTo);
  };

  // Action handlers (normal mode only)
  const handleImport = (row: LLMRow) => {
    navigate(`/llm/catalogue/manage`);
  };

  const handleAction = (row: LLMRow) => {
    switch (row.status) {
      case "deployable":
        handleImport(row);
        break;
      case "blocked":
        // Orphan projects (negative id) go to wizard; linked LLMs go to detail
        if (row.id < 0 && row.creationProjectId) {
          navigate(`/llm/wizard`);
        } else {
          navigate(`/llm/${row.id}`);
        }
        break;
      case "building":
        // Navigate to wizard for creation projects, or training monitor
        if (row.creationProjectId) {
          navigate(`/llm/wizard`);
        } else {
          navigate(`/llm/training`);
        }
        break;
      case "imported":
        if (row.catalogEntryId) {
          navigate(`/llm/catalogue/manage`);
        }
        break;
      default:
        // Orphan projects go to wizard; linked LLMs go to detail
        if (row.id < 0 && row.creationProjectId) {
          navigate(`/llm/wizard`);
        } else {
          navigate(`/llm/${row.id}`);
        }
    }
  };

  // ── Render ──────────────────────────────────────────────────────────

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            {importSelectionMode ? "Select LLM for Catalog" : "LLMs List"}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {importSelectionMode
              ? "Select a deployable LLM to continue Catalog candidate creation"
              : "Governed LLM inventory and Catalog import readiness"}
          </p>
        </div>
        {importSelectionMode ? (
          <Button variant="outline" size="sm" onClick={() => navigate(returnTo)}>
            Back to Candidate Pipeline
          </Button>
        ) : (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate("/llm/register")}>
              <Wand2 className="h-4 w-4 mr-1" /> Register LLM
            </Button>
            <Button size="sm" onClick={() => navigate("/llm/wizard")}>
              <Cpu className="h-4 w-4 mr-1" /> LLM Wizard
            </Button>
          </div>
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
                Only deployable LLMs are shown. Select one to create a Catalog candidate entry.
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
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={importSelectionMode ? "Search deployable LLMs..." : "Search by name, role, description..."}
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
              <SelectItem value="building">Building</SelectItem>
              <SelectItem value="blocked">Blocked</SelectItem>
              <SelectItem value="deployable">Deployable</SelectItem>
              <SelectItem value="imported">Imported</SelectItem>
            </SelectContent>
          </Select>
        )}
        {!importSelectionMode && (
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
        )}
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

      {/* Loading / Empty state */}
      {isLoading && (
        <p className="text-sm text-muted-foreground py-4">Loading LLMs...</p>
      )}
      {!isLoading && !isError && filtered.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Package className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">
              {importSelectionMode
                ? "No deployable LLMs available"
                : rows.length === 0
                  ? "No LLMs registered"
                  : "No LLMs match filters"}
            </h3>
            <p className="text-muted-foreground text-center mb-4 text-sm">
              {importSelectionMode
                ? "Register and configure an LLM with passing governance before it can be imported to the Catalog."
                : rows.length === 0
                  ? "Get started by registering an LLM or using the creation wizard."
                  : "Try adjusting your search or filter criteria."}
            </p>
            {importSelectionMode ? (
              <Button variant="outline" size="sm" onClick={() => navigate(returnTo)}>
                Back to Candidate Pipeline
              </Button>
            ) : rows.length === 0 ? (
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => navigate("/llm/register")}>
                  Register LLM
                </Button>
                <Button size="sm" onClick={() => navigate("/llm/wizard")}>
                  LLM Wizard
                </Button>
              </div>
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
                      key={row.id < 0 ? `proj-${row.creationProjectId}` : `llm-${row.id}`}
                      className="border-b border-border/30 hover:bg-muted/20 transition-colors"
                    >
                      {/* LLM */}
                      <td className="py-3 px-4">
                        <div className="min-w-0">
                          <p className="font-medium truncate max-w-[200px]">{row.displayName}</p>
                          {row.name !== row.displayName && (
                            <p className="text-xs text-muted-foreground truncate">{row.name}</p>
                          )}
                          {row.id < 0 ? (
                            <p className="text-xs text-muted-foreground italic">Creation project (no LLM identity yet)</p>
                          ) : (
                            <p className="text-xs text-muted-foreground capitalize">{row.role}</p>
                          )}
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
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-1.5">
                            {row.status === "blocked" && <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0" />}
                            {row.status === "deployable" && <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />}
                            <span className="text-xs text-muted-foreground">{row.readiness}</span>
                          </div>
                          {row.status === "building" && row.progress !== null && (
                            <div className="flex items-center gap-2">
                              <div className="h-1.5 w-20 bg-muted rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-blue-500 rounded-full transition-all"
                                  style={{ width: `${Math.min(row.progress, 100)}%` }}
                                />
                              </div>
                              <span className="text-[10px] text-muted-foreground">{row.progress}%</span>
                            </div>
                          )}
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
