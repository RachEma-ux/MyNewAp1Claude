/**
 * Retrofit P12 — Universal KB / Tool-Knowledge / Approvals UI.
 *
 * One page, five tabs. Each tab is a small panel that wires straight to
 * one of the P11 routers; nothing here issues raw fetches. UI is
 * read-mostly — the only mutations are:
 *
 *   - mcpSchemaSync.sync (operator triggers a tool-knowledge refresh)
 *   - toolApprovals.decide (allow / deny pending approvals)
 *
 * Panels are intentionally compact. The retrofit's primary surface is
 * the TRACE — the dispatcher writes one row per ProposedToolCall and
 * a reviewer pivots from the runs page; this page is the *catalog*
 * view (what's in the KB, what tools are mirrored, what's waiting on
 * approval).
 */

import { useMemo, useState, type ReactNode } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { PageHeader, LoadingState, EmptyState, SectionLabel } from "../components/ui";
import { EligibilityExplainer } from "../components/EligibilityExplainer";
import { CronStatusBadge } from "../components/CronStatusBadge";
import { formatRelative } from "../components/format-relative";
import { CronStatusPanel } from "../components/CronStatusPanel";
import { RuntimeRunsRetentionPanel } from "../components/RuntimeRunsRetentionPanel";
import { McpTransitionsRetentionPanel } from "../components/McpTransitionsRetentionPanel";
import { ToolCallTracesRetentionPanel } from "../components/ToolCallTracesRetentionPanel";
import { CatalogSyncLogRetentionPanel } from "../components/CatalogSyncLogRetentionPanel";
import { RacRuntimeTracesRetentionPanel } from "../components/RacRuntimeTracesRetentionPanel";
import { CagPackEventsRetentionPanel } from "../components/CagPackEventsRetentionPanel";
import { SimulationRunsRetentionPanel } from "../components/SimulationRunsRetentionPanel";
import { TestRunsRetentionPanel } from "../components/TestRunsRetentionPanel";
import { GraphQualityScansRetentionPanel } from "../components/GraphQualityScansRetentionPanel";
import { GraphCorrectionProposalsRetentionPanel } from "../components/GraphCorrectionProposalsRetentionPanel";
import { GraphQualityAgentRunsRetentionPanel } from "../components/GraphQualityAgentRunsRetentionPanel";
import { IngestionJobsRetentionPanel } from "../components/IngestionJobsRetentionPanel";
import { GraphChangeProposalsRetentionPanel } from "../components/GraphChangeProposalsRetentionPanel";
import { GraphAgentRuntimeTracesRetentionPanel } from "../components/GraphAgentRuntimeTracesRetentionPanel";
import { PublishRequestsRetentionPanel } from "../components/PublishRequestsRetentionPanel";
import { ApprovalStepsRetentionPanel } from "../components/ApprovalStepsRetentionPanel";
import { NotePromotionsRetentionPanel } from "../components/NotePromotionsRetentionPanel";

/**
 * M1-c4 (cycle-4 audit `/sdcard/Download/APPROVAL_AUDIT_2026-05-09.md` §M1-c4)
 * — client-side role gate for approve/deny buttons. Mirrors the YAML
 * registration of `agentStudio.toolApprovals.decide` (R2 / agent.manage),
 * which `COARSE_CAPABILITY_ROLES` (server/governance/rbac-model.ts) maps
 * to {operator, developer}. Admin always permitted via the requireGovernedAction
 * early-return. Pre-cycle-4 the buttons rendered for any authenticated user;
 * the server-side governedProcedure rejected the click but the UI gave no
 * upfront signal. This helper hides the buttons + renders a "view-only"
 * badge instead.
 *
 * NOT a security boundary — the server enforces RBAC. This is purely a UX
 * affordance to avoid clicks that would 403.
 */

/**
 * L5-c4 (cycle-4 audit §L5-c4 / §G6-c4) — naming asymmetry between the
 * two approval surfaces operators see in the agent-studio UI:
 *
 *   - `agentStudio.toolApprovals.*` (this page, RetrofitPage Approvals tab)
 *     — Phase 9 surface. Scoped to a specific tool-call hash within a
 *     `ProposedToolCall`. Each row corresponds to one (agentDraftId,
 *     proposedToolCallHash). Operator decides whether THAT specific tool
 *     invocation can run.
 *
 *   - `agentStudio.permissions.*` (AgentRunsPage permission alert)
 *     — older run-level surface. Scoped to a runtime run + a permission
 *     rule that says "ask before allowing this category of action".
 *     Coarser-grained than the tool-call hash surface.
 *
 * The two surfaces are NOT redundant — they govern different things at
 * different lifecycle points. Operators see both because they serve
 * complementary purposes (per-call vs per-run). Future work could
 * unify the operator-facing label, but the underlying surfaces should
 * stay separate (different tables, different lifecycle).
 */
const APPROVAL_DECIDER_ROLES: ReadonlySet<string> = new Set([
  "admin",
  "operator",
  "developer",
]);

function canDecideApproval(role: string | undefined | null): boolean {
  if (!role) return false;
  return APPROVAL_DECIDER_ROLES.has(role);
}

interface Props {
  agentId: number;
  workspaceId?: number;
}

export default function RetrofitPage({ agentId, workspaceId = 1 }: Props) {
  const draftQuery = trpc.agentStudio.identity.get.useQuery({ agentId });
  const draftId = draftQuery.data?.draft?.id ?? null;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Retrofit"
        subtitle="Universal KB · Tool Knowledge · Approvals queue"
      />

      <Tabs defaultValue="ingestion">
        <TabsList>
          <TabsTrigger value="ingestion">Ingestion</TabsTrigger>
          <TabsTrigger value="kb">Knowledge Units</TabsTrigger>
          <TabsTrigger value="provenance">Provenance</TabsTrigger>
          <TabsTrigger value="tool-knowledge">Tool Knowledge</TabsTrigger>
          <TabsTrigger value="approvals">Approvals</TabsTrigger>
          <TabsTrigger value="cron-status">Cron Status</TabsTrigger>
          <TabsTrigger value="observability-stats">Observability Stats</TabsTrigger>
          <TabsTrigger value="observability-dashboard">Observability Dashboard</TabsTrigger>
          <TabsTrigger value="admin-sweeps">Admin Sweeps</TabsTrigger>
          <TabsTrigger value="bulk-job-ops">Bulk Job Ops</TabsTrigger>
          <TabsTrigger value="runtime-runs-retention">Runtime Runs Retention</TabsTrigger>
          <TabsTrigger value="tool-call-traces-retention">Tool Call Traces Retention</TabsTrigger>
          <TabsTrigger value="mcp-transitions-retention">MCP Transitions Retention</TabsTrigger>
          <TabsTrigger value="catalog-sync-log-retention">Catalog Sync Log Retention</TabsTrigger>
          <TabsTrigger value="rac-runtime-traces-retention">RAC Runtime Traces Retention</TabsTrigger>
          <TabsTrigger value="cag-pack-events-retention">CAG Pack Events Retention</TabsTrigger>
          <TabsTrigger value="simulation-runs-retention">Simulation Runs Retention</TabsTrigger>
          <TabsTrigger value="test-runs-retention">Test Runs Retention</TabsTrigger>
          <TabsTrigger value="graph-quality-scans-retention">Graph Quality Scans Retention</TabsTrigger>
          <TabsTrigger value="graph-correction-proposals-retention">Graph Correction Proposals Retention</TabsTrigger>
          <TabsTrigger value="graph-quality-agent-runs-retention">Graph Quality Agent Runs Retention</TabsTrigger>
          <TabsTrigger value="ingestion-jobs-retention">Ingestion Jobs Retention</TabsTrigger>
          <TabsTrigger value="graph-change-proposals-retention">Graph Change Proposals Retention</TabsTrigger>
          <TabsTrigger value="graph-agent-runtime-traces-retention">Graph Agent Runtime Traces Retention</TabsTrigger>
          <TabsTrigger value="publish-requests-retention">Publish Requests Retention</TabsTrigger>
          <TabsTrigger value="approval-steps-retention">Approval Steps Retention</TabsTrigger>
          <TabsTrigger value="note-promotions-retention">Note Promotions Retention</TabsTrigger>
          <TabsTrigger value="release-audit-refs-archival">Release Audit Refs Archival</TabsTrigger>
          <TabsTrigger value="lifecycle-holds-management">Lifecycle Holds</TabsTrigger>
        </TabsList>

        <TabsContent value="ingestion">
          <IngestionPanel workspaceId={workspaceId} />
        </TabsContent>
        <TabsContent value="kb">
          <KnowledgeUnitsPanel workspaceId={workspaceId} />
        </TabsContent>
        <TabsContent value="provenance">
          <ProvenancePanel workspaceId={workspaceId} />
        </TabsContent>
        <TabsContent value="tool-knowledge">
          <ToolKnowledgePanel workspaceId={workspaceId} />
        </TabsContent>
        <TabsContent value="approvals">
          <ApprovalsPanel agentDraftId={draftId} />
        </TabsContent>
        <TabsContent value="cron-status">
          <CronStatusPanel />
        </TabsContent>
        <TabsContent value="observability-stats">
          <ObservabilityStatsPanel />
        </TabsContent>
        <TabsContent value="observability-dashboard">
          <ObservabilityDashboardPanel />
        </TabsContent>
        <TabsContent value="admin-sweeps">
          <AdminSweepsPanel />
        </TabsContent>
        <TabsContent value="bulk-job-ops">
          <BulkJobOpsPanel />
        </TabsContent>
        <TabsContent value="runtime-runs-retention">
          <RuntimeRunsRetentionPanel />
        </TabsContent>
        <TabsContent value="tool-call-traces-retention">
          <ToolCallTracesRetentionPanel />
        </TabsContent>
        <TabsContent value="mcp-transitions-retention">
          <McpTransitionsRetentionPanel />
        </TabsContent>
        <TabsContent value="catalog-sync-log-retention">
          <CatalogSyncLogRetentionPanel />
        </TabsContent>
        <TabsContent value="rac-runtime-traces-retention">
          <RacRuntimeTracesRetentionPanel />
        </TabsContent>
        <TabsContent value="cag-pack-events-retention">
          <CagPackEventsRetentionPanel />
        </TabsContent>
        <TabsContent value="simulation-runs-retention">
          <SimulationRunsRetentionPanel />
        </TabsContent>
        <TabsContent value="test-runs-retention">
          <TestRunsRetentionPanel />
        </TabsContent>
        <TabsContent value="graph-quality-scans-retention">
          <GraphQualityScansRetentionPanel />
        </TabsContent>
        <TabsContent value="graph-correction-proposals-retention">
          <GraphCorrectionProposalsRetentionPanel />
        </TabsContent>
        <TabsContent value="graph-quality-agent-runs-retention">
          <GraphQualityAgentRunsRetentionPanel />
        </TabsContent>
        <TabsContent value="ingestion-jobs-retention">
          <IngestionJobsRetentionPanel />
        </TabsContent>
        <TabsContent value="graph-change-proposals-retention">
          <GraphChangeProposalsRetentionPanel />
        </TabsContent>
        <TabsContent value="graph-agent-runtime-traces-retention">
          <GraphAgentRuntimeTracesRetentionPanel />
        </TabsContent>
        <TabsContent value="publish-requests-retention">
          <PublishRequestsRetentionPanel />
        </TabsContent>
        <TabsContent value="approval-steps-retention">
          <ApprovalStepsRetentionPanel />
        </TabsContent>
        <TabsContent value="note-promotions-retention">
          <NotePromotionsRetentionPanel />
        </TabsContent>
        <TabsContent value="release-audit-refs-archival">
          <ReleaseAuditRefsArchivalPanel />
        </TabsContent>
        <TabsContent value="lifecycle-holds-management">
          <LifecycleHoldsManagementPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ── Cron Status (Phase 22 follow-up #615) ─────────────────────────────
//
// Seed client-side consumer for the workspace-observability surface
// (zero consumers existed before this PR — see project_phase_22_cron
// _mini_arc.md). Surfaces the two scheduled sweep crons (#612 retention,
// #613 stale-running) via the #614 `getCronStatus` adminProcedure.
//
// Two cards, identical shape: lastRunAt + lastResult counters +
// any outstanding lastError. Auto-refreshes every 30s so an operator
// who left the tab open sees the cron tick through without manual
// refresh. Renders an unambiguous "never" state for fresh boots
// where no sweep has fired yet.

// formatRelative extracted to ../components/format-relative.ts (PR #719).

// CronStatusPanel extracted to ../components/CronStatusPanel.tsx (PR #722).

// ── Ingestion ─────────────────────────────────────────────────────────

function IngestionPanel({ workspaceId }: { workspaceId: number }) {
  const counts = trpc.agentStudio.kb.listFreshnessCounts.useQuery({ workspaceId });
  if (counts.isLoading) return <LoadingState label="Loading freshness counts…" />;
  if (counts.isError) {
    return (
      <Card>
        <CardContent className="p-4 text-sm text-red-400">
          Failed to load: {(counts.error as { message?: string })?.message ?? "unknown"}
        </CardContent>
      </Card>
    );
  }
  const rows = counts.data ?? [];
  const total = rows.reduce((sum, r) => sum + r.count, 0);
  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <SectionLabel>Universal Ingestion — KB freshness</SectionLabel>
        {total === 0 ? (
          <EmptyState
            title="No knowledge units yet"
            description="Run the universal ingestion pipeline to populate this workspace's KB."
          />
        ) : (
          <div className="grid grid-cols-3 gap-3">
            {rows.map((r) => (
              <div key={r.freshnessState} className="rounded border border-zinc-800 p-3">
                <div className="text-xs text-zinc-400 uppercase">{r.freshnessState}</div>
                <div className="text-2xl font-semibold">{r.count}</div>
              </div>
            ))}
          </div>
        )}
        <div className="text-xs text-zinc-500">
          {total} total unit(s) (excluding archived).
        </div>
      </CardContent>
    </Card>
  );
}

// ── Knowledge Units ───────────────────────────────────────────────────

function KnowledgeUnitsPanel({ workspaceId }: { workspaceId: number }) {
  const [sourceId, setSourceId] = useState<number | null>(null);
  const list = trpc.agentStudio.kb.listUnits.useQuery({
    workspaceId,
    sourceId: sourceId ?? undefined,
    limit: 50,
  });
  const utils = trpc.useUtils();

  function refetchList() {
    utils.agentStudio.kb.listUnits.invalidate();
  }

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Label className="text-xs">Source ID filter (optional)</Label>
            <Input
              type="number"
              value={sourceId ?? ""}
              onChange={(e) => setSourceId(e.target.value ? Number(e.target.value) : null)}
              placeholder="any"
            />
          </div>
        </div>
        {list.isLoading ? (
          <LoadingState label="Loading units…" />
        ) : list.isError ? (
          <div className="text-sm text-red-400">
            {(list.error as { message?: string })?.message ?? "load failed"}
          </div>
        ) : (list.data ?? []).length === 0 ? (
          <EmptyState title="No units" description="Try clearing the filter." />
        ) : (
          <div className="space-y-2">
            {(list.data ?? []).map((u) => (
              <UnitRow
                key={u.id}
                unit={u}
                workspaceId={workspaceId}
                onChanged={refetchList}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface UnitRowShape {
  id: number;
  unitType: string;
  contentText: string;
  freshnessState: string;
  validationStatus: string;
  /** U5-b.1 + U5-b.4: nullable per-unit license tag. */
  license?: string | null;
  /** U5-b.1: denormalized PII finding projection. */
  piiFindings?: unknown;
}

function UnitRow({
  unit,
  workspaceId,
  onChanged,
}: {
  unit: UnitRowShape;
  workspaceId: number;
  onChanged: () => void;
}) {
  const [licenseInput, setLicenseInput] = useState<string>(unit.license ?? "");
  const setLicense = trpc.agentStudio.kb.setLicense.useMutation({
    onSuccess: () => {
      toast.success(`Unit #${unit.id} license updated`);
      onChanged();
    },
    onError: (err) => toast.error(`setLicense failed: ${err.message}`),
  });
  const clearPii = trpc.agentStudio.kb.clearPiiFindings.useMutation({
    onSuccess: (res) => {
      toast.success(
        `Unit #${unit.id} PII findings cleared; status → ${res.recomputedStatus}`,
      );
      onChanged();
    },
    onError: (err) => toast.error(`clearPiiFindings failed: ${err.message}`),
  });

  const piiCount = Array.isArray(unit.piiFindings) ? unit.piiFindings.length : 0;

  return (
    <div className="rounded border border-zinc-800 p-2 text-xs space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-mono text-zinc-500">#{unit.id}</span>
        <Badge variant="outline">{unit.unitType}</Badge>
        <Badge variant={unit.freshnessState === "fresh" ? "secondary" : "destructive"}>
          {unit.freshnessState}
        </Badge>
        <Badge variant={unit.validationStatus === "ok" ? "outline" : "destructive"}>
          {unit.validationStatus}
        </Badge>
        {unit.license ? (
          <Badge variant="secondary" className="font-mono">license: {unit.license}</Badge>
        ) : null}
        {piiCount > 0 ? (
          <Badge variant="destructive">PII: {piiCount}</Badge>
        ) : null}
      </div>
      <div className="text-zinc-400 line-clamp-2">
        {unit.contentText.slice(0, 240)}
        {unit.contentText.length > 240 ? "…" : ""}
      </div>
      <div className="flex items-center gap-2 pt-1">
        <Input
          value={licenseInput}
          onChange={(e) => setLicenseInput(e.target.value)}
          placeholder="SPDX or label (e.g. MIT)"
          className="h-7 text-xs flex-1 max-w-xs"
        />
        <Button
          size="sm"
          variant="outline"
          className="h-7"
          disabled={setLicense.isPending}
          onClick={() => {
            const trimmed = licenseInput.trim();
            const target = trimmed.length > 0 ? trimmed : null;
            const wasLicense = unit.license ?? "(unset)";
            const willBe = target ?? "(unset)";
            if (
              !window.confirm(
                `Change unit ${unit.id} license from "${wasLicense}" to "${willBe}"? ` +
                  `This affects retrieval-time license enforcement under any profile that blocklists either value.`,
              )
            ) {
              return;
            }
            setLicense.mutate({ workspaceId, unitId: unit.id, license: target });
          }}
        >
          {setLicense.isPending ? "…" : "Set license"}
        </Button>
        {piiCount > 0 ? (
          <Button
            size="sm"
            variant="destructive"
            className="h-7"
            disabled={clearPii.isPending}
            onClick={() => {
              if (
                !window.confirm(
                  `Clear ${piiCount} PII finding${piiCount === 1 ? "" : "s"} on unit ${unit.id}? ` +
                    `This unblocks retrieval of content that was previously gated and recomputes validationStatus from the audit trail.`,
                )
              ) {
                return;
              }
              clearPii.mutate({ workspaceId, unitId: unit.id });
            }}
          >
            {clearPii.isPending ? "…" : "Clear PII"}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

// ── Provenance Inspector ──────────────────────────────────────────────

function ProvenancePanel({ workspaceId }: { workspaceId: number }) {
  const [unitId, setUnitId] = useState<string>("");
  const unitQuery = trpc.agentStudio.kb.getUnit.useQuery(
    { workspaceId, unitId: Number(unitId) },
    { enabled: unitId !== "" && !Number.isNaN(Number(unitId)) },
  );
  const provenanceId = unitQuery.data?.provenanceId ?? null;
  const provenanceQuery = trpc.agentStudio.kb.getProvenance.useQuery(
    { workspaceId, provenanceId: provenanceId ?? 0 },
    { enabled: provenanceId !== null },
  );

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <SectionLabel>Provenance Inspector</SectionLabel>
        <div>
          <Label className="text-xs">Knowledge unit id</Label>
          <Input
            type="number"
            value={unitId}
            onChange={(e) => setUnitId(e.target.value)}
            placeholder="e.g. 42"
          />
        </div>
        {unitQuery.isFetching ? (
          <LoadingState label="Loading unit…" />
        ) : unitQuery.isError ? (
          <div className="text-sm text-red-400">
            {(unitQuery.error as { message?: string })?.message ?? "not found"}
          </div>
        ) : unitQuery.data ? (
          <div className="space-y-2 text-xs">
            <div>
              <div className="text-zinc-500 uppercase">Unit</div>
              <pre className="mt-1 rounded bg-zinc-900 p-2 overflow-auto">
                {JSON.stringify(
                  {
                    id: unitQuery.data.id,
                    unitType: unitQuery.data.unitType,
                    contentHash: unitQuery.data.contentHash,
                    freshnessState: unitQuery.data.freshnessState,
                    validationStatus: unitQuery.data.validationStatus,
                  },
                  null,
                  2,
                )}
              </pre>
            </div>
            {provenanceQuery.data ? (
              <div>
                <div className="text-zinc-500 uppercase">Provenance</div>
                <pre className="mt-1 rounded bg-zinc-900 p-2 overflow-auto">
                  {JSON.stringify(provenanceQuery.data, null, 2)}
                </pre>
              </div>
            ) : provenanceQuery.isLoading ? (
              <LoadingState label="Loading provenance…" />
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

// ── Tool Knowledge ────────────────────────────────────────────────────

function ToolKnowledgePanel({ workspaceId }: { workspaceId: number }) {
  const [serverId, setServerId] = useState("");
  const tools = trpc.agentStudio.toolKnowledge.listTools.useQuery({
    workspaceId,
    mcpServerId: serverId || undefined,
    onlyAvailable: true,
    limit: 100,
  });

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Label className="text-xs">MCP server id (optional)</Label>
            <Input
              value={serverId}
              onChange={(e) => setServerId(e.target.value)}
              placeholder="e.g. github-mcp"
            />
          </div>
        </div>
        {tools.isLoading ? (
          <LoadingState label="Loading mirror…" />
        ) : tools.isError ? (
          <div className="text-sm text-red-400">
            {(tools.error as { message?: string })?.message ?? "load failed"}
          </div>
        ) : (tools.data ?? []).length === 0 ? (
          <EmptyState title="No tool-knowledge rows" description="Run mcpSchemaSync.sync first." />
        ) : (
          <div className="space-y-2">
            {(tools.data ?? []).map((t) => (
              <div key={t.id} className="rounded border border-zinc-800 p-2 text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-zinc-500">{t.mcpServerId}</span>
                  <span className="font-semibold">{t.toolName}</span>
                  <Badge variant="outline">{t.riskClass}</Badge>
                </div>
                <div className="mt-1 text-zinc-400">{t.description ?? "(no description)"}</div>
                <div className="mt-1 text-[10px] text-zinc-600 font-mono">
                  hash {t.schemaHash.slice(0, 16)}… · last seen{" "}
                  {new Date(t.lastSeenAt).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Approvals ─────────────────────────────────────────────────────────

function ApprovalsPanel({ agentDraftId }: { agentDraftId: number | null }) {
  const utils = trpc.useUtils();
  const { user } = useAuth();
  const canDecide = canDecideApproval(user?.role);
  const list = trpc.agentStudio.toolApprovals.listByDraft.useQuery(
    { agentDraftId: agentDraftId ?? 0, status: "pending", limit: 50 },
    {
      enabled: agentDraftId !== null,
      // M3-c4 (cycle-4 audit §M3-c4) — refetch every 5s so a second
      // operator's view stays in sync after operator A decides. Without
      // this, the list was query-invalidate-only (refresh on local
      // mutation), so two-operator coordination collapsed to "first
      // operator's view." 5s rather than AgentRunsPage's 2s because
      // RetrofitPage approval rows are typically longer-lived than
      // per-run permission rows.
      refetchInterval: 5000,
    },
  );
  const decide = trpc.agentStudio.toolApprovals.decide.useMutation({
    onSuccess: (res) => {
      toast.success(`approval ${res.status}`);
      utils.agentStudio.toolApprovals.listByDraft.invalidate();
    },
    onError: (err) => toast.error(err.message ?? "decide failed"),
  });

  if (agentDraftId === null) return <LoadingState label="Resolving draft…" />;
  // L5-c4 (cycle-4 audit §L5-c4) — skeleton on initial load instead of
  // the bare top-level spinner. Three placeholder rows give the
  // operator a sense of structure while the query resolves.
  if (list.isLoading) {
    return (
      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <Card key={i}>
            <CardContent className="p-3 space-y-2">
              <div className="h-3 w-1/2 rounded bg-zinc-800/60 animate-pulse" />
              <div className="h-2 w-2/3 rounded bg-zinc-800/40 animate-pulse" />
              <div className="h-7 w-full rounded bg-zinc-800/30 animate-pulse" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }
  if (list.isError) {
    return (
      <div className="text-sm text-red-400">
        {(list.error as { message?: string })?.message ?? "load failed"}
      </div>
    );
  }
  const rows = list.data ?? [];
  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="p-4">
          <EmptyState
            title="Nothing pending"
            description="ProposedToolCalls that require approval will queue here."
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      {!canDecide && (
        <div className="text-xs text-zinc-400 italic px-1">
          View-only — approving / denying tool calls requires admin, operator, or developer role.
        </div>
      )}
      {rows.map((r) => (
        <ApprovalRow
          key={r.id}
          row={r}
          isDeciding={decide.isPending}
          canDecide={canDecide}
          onDecide={(status, reason) =>
            decide.mutate({
              approvalRequestId: r.id,
              status,
              reason: reason || undefined,
            })
          }
        />
      ))}
    </div>
  );
}

function ApprovalRow({
  row,
  isDeciding,
  canDecide,
  onDecide,
}: {
  row: {
    id: number;
    toolName: string;
    description: string | null;
    proposedToolCallHash: string | null;
    createdAt: Date;
  };
  isDeciding: boolean;
  canDecide: boolean;
  onDecide: (status: "allowed" | "denied", reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  const hashShort = useMemo(
    () => (row.proposedToolCallHash ? row.proposedToolCallHash.slice(0, 16) + "…" : "—"),
    [row.proposedToolCallHash],
  );
  return (
    <Card>
      <CardContent className="p-3 space-y-2">
        <div className="flex items-center gap-2 text-sm">
          <span className="font-mono text-zinc-500">#{row.id}</span>
          <span className="font-semibold">{row.toolName}</span>
          <Badge variant="outline">pending</Badge>
          <span className="ml-auto text-[10px] font-mono text-zinc-600">{hashShort}</span>
        </div>
        {row.description ? (
          <div className="text-xs text-zinc-400">{row.description}</div>
        ) : null}
        {canDecide ? (
          <>
            <Textarea
              // L5-c4 — placeholder hints + 2000-char lock matching the
              // server-side `z.string().max(2000)` on the decide input.
              placeholder="Reason (optional) — recorded with the audit row. 2000 char max."
              value={reason}
              onChange={(e) => setReason(e.target.value.slice(0, 2000))}
              rows={2}
              className="text-xs"
              maxLength={2000}
            />
            {reason.length > 1800 ? (
              <div className="text-[10px] text-zinc-500 text-right">
                {reason.length} / 2000
              </div>
            ) : null}
            <div className="flex gap-2">
              <Button
                size="sm"
                disabled={isDeciding}
                // M2-c4 (cycle-4 audit §M2-c4) — confirm before commit.
                // Matches the cycle-2 R4-c2 G5 precedent (8 agent-studio
                // destructive buttons use window.confirm). Approve grants
                // a 1-hour validity window for the tool call.
                onClick={() => {
                  if (
                    window.confirm(
                      `Approve "${row.toolName}" for this agent? This grants a 1-hour validity window for the tool call.`,
                    )
                  ) {
                    onDecide("allowed", reason);
                  }
                }}
              >
                Allow
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={isDeciding}
                // M2-c4 — deny is also destructive (the agent-loop sees
                // a tool error and may give up the task). Confirm.
                onClick={() => {
                  if (
                    window.confirm(
                      `Deny "${row.toolName}"? The agent will see a tool error and may abandon the current task.`,
                    )
                  ) {
                    onDecide("denied", reason);
                  }
                }}
              >
                Deny
              </Button>
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}

// ── Observability Stats (Phase 22 follow-up #616) ─────────────────────
//
// Second client-side consumer of the workspace-observability surface
// (after #615 cron status panel). Surfaces totals + per-status job
// counts + system-vs-user error split + the 4-day sparkline trend
// inputs from `agentStudio.workspaceObservability.getStats`.
//
// Intentionally shows the operator-most-relevant subset — failedJobs
// ByKind / pendingJobsByKind / runningJobsByKind drilldowns and the
// per-lane rollups stay deferred until operators ask for them (the
// shape they need varies by jobKind taxonomy and is hard to mock).

function StatBlock({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded border border-zinc-800 p-3">
      <div className="text-xs text-zinc-400 uppercase">{label}</div>
      <div className="text-2xl font-semibold">{value}</div>
      {sub ? <div className="text-xs text-zinc-500 mt-1">{sub}</div> : null}
    </div>
  );
}

function MiniTrend({
  label,
  buckets,
  valueKey,
}: {
  label: string;
  buckets: ReadonlyArray<{ [k: string]: unknown }>;
  valueKey: string;
}) {
  const total = buckets.reduce(
    (acc, b) => acc + ((b[valueKey] as number) ?? 0),
    0,
  );
  const max = buckets.reduce(
    (acc, b) => Math.max(acc, (b[valueKey] as number) ?? 0),
    0,
  );
  return (
    <div className="rounded border border-zinc-800 p-3">
      <div className="text-xs text-zinc-400 uppercase">{label}</div>
      <div className="text-2xl font-semibold">{total}</div>
      <div className="text-xs text-zinc-500 mt-1">last 14 days</div>
      <div className="flex items-end gap-0.5 h-6 mt-2">
        {buckets.map((b, i) => {
          const v = (b[valueKey] as number) ?? 0;
          const h = max > 0 ? Math.max(2, Math.round((v / max) * 24)) : 2;
          return (
            <div
              key={i}
              className="flex-1 bg-zinc-600 rounded-sm"
              style={{ height: `${h}px` }}
              title={`${(b.day as string) ?? ""}: ${v}`}
            />
          );
        })}
      </div>
    </div>
  );
}

// ── T-F.112 (T-F.7-α): jobs-by-kind breakdown card.
// Reads the 4 jobKind axes from getStats (total, failed, pending,
// running) and renders them as a per-kind 5-column table sorted
// by total descending. Lane-rollup variants (jobsByLane etc.) are
// intentionally NOT surfaced here — those are a separate axis whose
// own card lands in a later slice if operator demand surfaces.
//
// Precedent (j₂) clickable-rollup fusion is deferred to a follow-up
// because the retry/cancel form state lives in a sibling component
// (BulkJobOpsPanel); lifting state up is a larger refactor and the
// operator can read the card AND manually type a kind in the bulk
// ops form below in the same scroll. The first slice ships the data.
function JobsByKindBreakdownCard({
  jobsByKind,
  failedJobsByKind,
  pendingJobsByKind,
  runningJobsByKind,
}: {
  jobsByKind: Record<string, number>;
  failedJobsByKind: Record<string, number>;
  pendingJobsByKind: Record<string, number>;
  runningJobsByKind: Record<string, number>;
}) {
  // Union of all kinds seen across the four axes — a kind might be
  // 0 in `jobsByKind` overall (e.g. retention-pruned) but still
  // appear in pending/running.
  const allKinds = Array.from(
    new Set<string>([
      ...Object.keys(jobsByKind),
      ...Object.keys(failedJobsByKind),
      ...Object.keys(pendingJobsByKind),
      ...Object.keys(runningJobsByKind),
    ]),
  ).sort((a, b) => (jobsByKind[b] ?? 0) - (jobsByKind[a] ?? 0));

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <SectionLabel>Jobs by kind</SectionLabel>
        {allKinds.length === 0 ? (
          <div
            className="text-sm text-zinc-500"
            data-testid="retrofit-jobs-by-kind-empty"
          >
            No jobs recorded.
          </div>
        ) : (
          <div
            className="overflow-auto rounded border border-zinc-800"
            data-testid="retrofit-jobs-by-kind-card"
          >
            <table className="w-full text-xs">
              <thead className="bg-zinc-900/60 text-zinc-400">
                <tr>
                  <th className="px-2 py-1 text-left font-medium uppercase">
                    Kind
                  </th>
                  <th className="px-2 py-1 text-right font-medium uppercase">
                    Total
                  </th>
                  <th className="px-2 py-1 text-right font-medium uppercase">
                    Failed
                  </th>
                  <th className="px-2 py-1 text-right font-medium uppercase">
                    Pending
                  </th>
                  <th className="px-2 py-1 text-right font-medium uppercase">
                    Running
                  </th>
                </tr>
              </thead>
              <tbody>
                {allKinds.map((k) => (
                  <tr
                    key={k}
                    className="border-t border-zinc-800"
                    data-testid={`retrofit-jobs-by-kind-row-${k}`}
                  >
                    <td className="px-2 py-1 font-mono">{k}</td>
                    <td className="px-2 py-1 text-right tabular-nums">
                      {jobsByKind[k] ?? 0}
                    </td>
                    <td className="px-2 py-1 text-right tabular-nums">
                      {failedJobsByKind[k] ?? 0}
                    </td>
                    <td className="px-2 py-1 text-right tabular-nums">
                      {pendingJobsByKind[k] ?? 0}
                    </td>
                    <td className="px-2 py-1 text-right tabular-nums">
                      {runningJobsByKind[k] ?? 0}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ObservabilityStatsPanel() {
  const q = trpc.agentStudio.workspaceObservability.getStats.useQuery(
    undefined,
    { refetchInterval: 30_000 },
  );

  if (q.isLoading) return <LoadingState label="Loading observability stats…" />;
  if (q.isError) {
    return (
      <Card>
        <CardContent className="p-4 text-sm text-red-400">
          Failed to load stats:{" "}
          {(q.error as { message?: string })?.message ?? "unknown"}
        </CardContent>
      </Card>
    );
  }
  const s = q.data;
  if (!s) return null;

  return (
    <div className="space-y-4">
      {/* Totals row */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <SectionLabel>Totals</SectionLabel>
          <div className="grid grid-cols-3 gap-3">
            <StatBlock label="Background jobs" value={s.totals.jobs} />
            <StatBlock label="Notifications" value={s.totals.notifications} />
            <StatBlock label="Error events" value={s.totals.errorEvents} />
          </div>
        </CardContent>
      </Card>

      {/* Jobs by status */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <SectionLabel>Jobs by status</SectionLabel>
          <div className="grid grid-cols-5 gap-3">
            {["pending", "running", "completed", "failed", "cancelled"].map(
              (status) => (
                <StatBlock
                  key={status}
                  label={status}
                  value={s.jobsByStatus[status] ?? 0}
                />
              ),
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── T-F.112 (T-F.7-α): jobs-by-kind breakdown ──
          Surfaces the s.jobsByKind / failedJobsByKind / pendingJobsByKind /
          runningJobsByKind quartet — all four already in getStats. Pure
          panel-saturation: the data was live since stats.ts shipped, but
          the only UI consumption was per-row j.jobKind labels in the
          recent-jobs lists below. Operator question answered: "which
          jobKind dominates the queue / failure pool / running pool right
          now?" — currently they'd have to read the per-row labels and
          count by hand. */}
      <JobsByKindBreakdownCard
        jobsByKind={s.jobsByKind}
        failedJobsByKind={s.failedJobsByKind}
        pendingJobsByKind={s.pendingJobsByKind}
        runningJobsByKind={s.runningJobsByKind}
      />

      {/* Error events: system vs user */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <SectionLabel>Error events — system vs user</SectionLabel>
          <div className="grid grid-cols-2 gap-3">
            <StatBlock
              label="System (NULL userId)"
              value={s.errorEventsByUserPresence.system}
              sub="background workers / sweeps / cron"
            />
            <StatBlock
              label="User"
              value={s.errorEventsByUserPresence.user}
              sub="tRPC procedures with a session"
            />
          </div>
        </CardContent>
      </Card>

      {/* Notifications read state */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <SectionLabel>Notifications — read state</SectionLabel>
          <div className="grid grid-cols-2 gap-3">
            <StatBlock label="Unread" value={s.notificationsByReadState.unread} />
            <StatBlock label="Read" value={s.notificationsByReadState.read} />
          </div>
        </CardContent>
      </Card>

      {/* Day trends */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <SectionLabel>Daily trends (last 14 days)</SectionLabel>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <MiniTrend
              label="Error events / day"
              buckets={s.errorEventsByDay as ReadonlyArray<{ [k: string]: unknown }>}
              valueKey="count"
            />
            <MiniTrend
              label="Jobs created / day"
              buckets={s.jobsCreatedByDay as ReadonlyArray<{ [k: string]: unknown }>}
              valueKey="count"
            />
            <MiniTrend
              label="Failed jobs / day"
              buckets={s.failedJobsByDay as ReadonlyArray<{ [k: string]: unknown }>}
              valueKey="count"
            />
            <MiniTrend
              label="Completed jobs / day"
              buckets={s.completedJobsByDay as ReadonlyArray<{ [k: string]: unknown }>}
              valueKey="count"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Observability Dashboard (Phase 22 follow-up #617) ─────────────────
//
// Third client-side consumer of the workspace-observability surface
// (after #615 cron status + #616 stats). Surfaces the 5 recent-slice
// drilldown lists from `agentStudio.workspaceObservability.getDashboard`:
//  - recentFailedJobs   — drilldown for failedJobsByDay
//  - recentCompletedJobs — drilldown for completedJobsByDay
//  - recentErrorEvents  — drilldown for errorEventsByDay
//  - staleRunningJobs   — running-tier SLA breach
//  - oldestPendingJobs  — pending-tier backlog
//
// Each list is small + plaintext (id / kind / status / timestamp / a
// truncated message). Operators copy the id into a separate triage
// flow — this panel is the "what's on fire right now" overview, NOT
// the deep drilldown view. The 7-PR Phase 22 ledger covers far more
// stats than this seed panel surfaces; richer filtering UIs are
// natural follow-ups.

function shortTime(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toISOString().replace("T", " ").slice(0, 16) + "Z";
}

function truncate(s: string | null | undefined, n: number): string {
  if (!s) return "";
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

function ListSlice<T extends { id: number }>({
  title,
  rows,
  renderRow,
  emptyMessage,
}: {
  title: string;
  rows: readonly T[] | undefined;
  renderRow: (r: T) => ReactNode;
  emptyMessage: string;
}) {
  return (
    <Card>
      <CardContent className="p-4 space-y-2">
        <div className="flex items-center justify-between">
          <SectionLabel>{title}</SectionLabel>
          <Badge variant="secondary">{rows?.length ?? 0}</Badge>
        </div>
        {!rows || rows.length === 0 ? (
          <div className="text-xs text-zinc-500 italic">{emptyMessage}</div>
        ) : (
          <div className="space-y-1">
            {rows.map((r) => (
              <div
                key={r.id}
                className="rounded border border-zinc-800 p-2 text-xs"
              >
                {renderRow(r)}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ObservabilityDashboardPanel() {
  const q = trpc.agentStudio.workspaceObservability.getDashboard.useQuery(
    {},
    { refetchInterval: 30_000 },
  );

  if (q.isLoading) return <LoadingState label="Loading observability dashboard…" />;
  if (q.isError) {
    return (
      <Card>
        <CardContent className="p-4 text-sm text-red-400">
          Failed to load dashboard:{" "}
          {(q.error as { message?: string })?.message ?? "unknown"}
        </CardContent>
      </Card>
    );
  }
  const d = q.data;
  if (!d) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <ListSlice
        title="Recent failed jobs"
        rows={d.recentFailedJobs}
        emptyMessage="No recent failures."
        renderRow={(j: any) => (
          <>
            <div className="flex justify-between gap-2">
              <span className="font-mono">#{j.id}</span>
              <span className="text-zinc-400">{j.jobKind}</span>
              <span className="text-zinc-500">{shortTime(j.updatedAt)}</span>
            </div>
            {j.lastError ? (
              <div className="text-red-300 mt-1">{truncate(j.lastError, 160)}</div>
            ) : null}
          </>
        )}
      />
      <ListSlice
        title="Recent completed jobs"
        rows={d.recentCompletedJobs}
        emptyMessage="No recent completions."
        renderRow={(j: any) => (
          <div className="flex justify-between gap-2">
            <span className="font-mono">#{j.id}</span>
            <span className="text-zinc-400">{j.jobKind}</span>
            <span className="text-zinc-500">{shortTime(j.updatedAt)}</span>
          </div>
        )}
      />
      <ListSlice
        title="Recent error events"
        rows={d.recentErrorEvents}
        emptyMessage="No recent error events."
        renderRow={(e: any) => (
          <>
            <div className="flex justify-between gap-2">
              <span className="font-mono">#{e.id}</span>
              <span className="text-zinc-400">{e.errorClass ?? "—"}</span>
              <span className="text-zinc-500">{shortTime(e.createdAt)}</span>
            </div>
            <div className="text-zinc-300 mt-1">{e.sourceKind}</div>
            {e.errorMessage ? (
              <div className="text-red-300 mt-1">{truncate(e.errorMessage, 160)}</div>
            ) : null}
          </>
        )}
      />
      <ListSlice
        title="Stale running jobs"
        rows={d.staleRunningJobs}
        emptyMessage="No stuck running jobs."
        renderRow={(j: any) => (
          <div className="flex justify-between gap-2">
            <span className="font-mono">#{j.id}</span>
            <span className="text-zinc-400">{j.jobKind}</span>
            <span className="text-zinc-500">{shortTime(j.updatedAt)}</span>
          </div>
        )}
      />
      <div className="md:col-span-2">
        <ListSlice
          title="Oldest pending jobs"
          rows={d.oldestPendingJobs}
          emptyMessage="No pending backlog."
          renderRow={(j: any) => (
            <div className="flex justify-between gap-2">
              <span className="font-mono">#{j.id}</span>
              <span className="text-zinc-400">{j.jobKind}</span>
              <span className="text-zinc-500">
                queued {shortTime(j.createdAt)}
              </span>
            </div>
          )}
        />
      </div>
    </div>
  );
}

// ── Admin Sweeps (Phase 22 follow-up #618) ────────────────────────────
//
// Operator-triggered "Run Now" buttons for the two scheduled sweep
// crons. The crons fire on their own (#612 daily 03:00, #613 every
// 10 min), but operators occasionally want to flush rows on demand
// (post-incident cleanup, pre-demo prep, e2e test seeding). Bypasses
// the cron schedule + dedup contract — every click is a fresh sweep.
//
// Confirmation dialog on each click since these are destructive
// (retention DELETEs rows; stale-running flips running→failed and
// bridges into error_events). Result toast shows the row counts so
// operators can verify the sweep did what they expected.

function AdminSweepsPanel() {
  const [retentionResult, setRetentionResult] = useState<
    { errorEventsDeleted: number; notificationsDeleted: number; backgroundJobsDeleted: number } | null
  >(null);
  const [staleResult, setStaleResult] = useState<
    { scanned: number; failedCount: number } | null
  >(null);

  const retentionMut =
    trpc.agentStudio.workspaceObservability.runRetentionSweep.useMutation({
      onSuccess: (data) => {
        setRetentionResult({
          errorEventsDeleted: data.errorEventsDeleted,
          notificationsDeleted: data.notificationsDeleted,
          backgroundJobsDeleted: data.backgroundJobsDeleted,
        });
        toast.success(
          `Retention sweep complete — ${
            data.errorEventsDeleted + data.notificationsDeleted + data.backgroundJobsDeleted
          } row(s) deleted`,
        );
      },
      onError: (err) =>
        toast.error(`Retention sweep failed: ${err.message ?? "unknown"}`),
    });

  const staleMut =
    trpc.agentStudio.workspaceObservability.failStaleRunningBackgroundJobs.useMutation({
      onSuccess: (data) => {
        setStaleResult({ scanned: data.scanned, failedCount: data.failed.length });
        toast.success(
          `Stale-running sweep complete — ${data.failed.length} job(s) auto-failed (of ${data.scanned} scanned)`,
        );
      },
      onError: (err) =>
        toast.error(`Stale-running sweep failed: ${err.message ?? "unknown"}`),
    });

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Retention sweep card */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <SectionLabel>Retention sweep (manual)</SectionLabel>
          <div className="text-xs text-zinc-400">
            Bypasses the daily 03:00 UTC cron. Uses default 30-day windows
            on all three tables (error_events / notifications / background_jobs).
            Bypasses cron dedup — fires a fresh sweep regardless of when
            the schedule last ran.
          </div>
          <Button
            size="sm"
            disabled={retentionMut.isPending}
            onClick={() => {
              if (
                window.confirm(
                  "Run a 30-day retention sweep now? This DELETEs rows older than the cutoff from all three workspace-observability tables.",
                )
              ) {
                retentionMut.mutate({});
              }
            }}
          >
            {retentionMut.isPending ? "Sweeping…" : "Run retention sweep now"}
          </Button>
          {retentionResult ? (
            <div className="rounded border border-zinc-800 p-3 text-xs">
              <div className="text-zinc-400 uppercase mb-1">Last run</div>
              <div>error_events deleted: {retentionResult.errorEventsDeleted}</div>
              <div>notifications deleted: {retentionResult.notificationsDeleted}</div>
              <div>background_jobs deleted: {retentionResult.backgroundJobsDeleted}</div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* Stale-running sweep card */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <SectionLabel>Stale-running sweep (manual)</SectionLabel>
          <div className="text-xs text-zinc-400">
            Bypasses the 10-minute cron. Uses default 30-minute staleness
            threshold — running rows with no heartbeat older than now-30min
            are flipped to `failed` and a bridging error_event row is recorded.
          </div>
          <Button
            size="sm"
            disabled={staleMut.isPending}
            onClick={() => {
              if (
                window.confirm(
                  "Run a stale-running sweep now? This auto-FAILS background jobs stuck in status='running' with no heartbeat in the last 30 minutes.",
                )
              ) {
                staleMut.mutate({
                  olderThan: new Date(Date.now() - 30 * 60_000),
                });
              }
            }}
          >
            {staleMut.isPending ? "Sweeping…" : "Run stale-running sweep now"}
          </Button>
          {staleResult ? (
            <div className="rounded border border-zinc-800 p-3 text-xs">
              <div className="text-zinc-400 uppercase mb-1">Last run</div>
              <div>scanned: {staleResult.scanned}</div>
              <div>jobs auto-failed: {staleResult.failedCount}</div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Bulk Job Ops (Phase 22 follow-up #619) ────────────────────────────
//
// Fifth client-side consumer of the workspace-observability surface
// (after #615 cron status, #616 stats, #617 dashboard, #618 admin
// sweeps). Operator-triggered bulk retry / cancel by query — the
// "I just shipped a worker fix, retry the failed pile" and "this
// workflow is stampeding, cancel the queue" gestures, single round-
// trip from the UI instead of N per-row clicks.
//
// retryBackgroundJobsByQuery operates only on `status='failed'`;
// cancelBackgroundJobsByQuery accepts a statuses filter (default
// ["pending"]) so operators can scope the cancel to safe targets.

function BulkJobOpsPanel() {
  const [retryJobKind, setRetryJobKind] = useState("");
  const [retryLimit, setRetryLimit] = useState("50");
  const [cancelJobKind, setCancelJobKind] = useState("");
  const [cancelStatuses, setCancelStatuses] = useState("pending");
  const [cancelLimit, setCancelLimit] = useState("50");

  const [retryResult, setRetryResult] = useState<
    { retried: number; scanned: number } | null
  >(null);
  const [cancelResult, setCancelResult] = useState<
    { cancelled: number; scanned: number } | null
  >(null);

  const retryMut =
    trpc.agentStudio.workspaceObservability.retryBackgroundJobsByQuery.useMutation({
      onSuccess: (data: any) => {
        setRetryResult({
          retried: Array.isArray(data?.retried) ? data.retried.length : 0,
          scanned: data?.scanned ?? 0,
        });
        toast.success(
          `Retry sweep complete — ${Array.isArray(data?.retried) ? data.retried.length : 0} retried (of ${data?.scanned ?? 0} scanned)`,
        );
      },
      onError: (err) =>
        toast.error(`Retry sweep failed: ${err.message ?? "unknown"}`),
    });

  const cancelMut =
    trpc.agentStudio.workspaceObservability.cancelBackgroundJobsByQuery.useMutation({
      onSuccess: (data: any) => {
        setCancelResult({
          cancelled: Array.isArray(data?.cancelled) ? data.cancelled.length : 0,
          scanned: data?.scanned ?? 0,
        });
        toast.success(
          `Cancel sweep complete — ${Array.isArray(data?.cancelled) ? data.cancelled.length : 0} cancelled (of ${data?.scanned ?? 0} scanned)`,
        );
      },
      onError: (err) =>
        toast.error(`Cancel sweep failed: ${err.message ?? "unknown"}`),
    });

  const parsedRetryLimit = Math.max(1, parseInt(retryLimit, 10) || 50);
  const parsedCancelLimit = Math.max(1, parseInt(cancelLimit, 10) || 50);
  const parsedCancelStatuses = cancelStatuses
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Retry by query card */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <SectionLabel>Bulk retry failed jobs</SectionLabel>
          <div className="text-xs text-zinc-400">
            Flips `status='failed'` rows back to `pending` for re-execution.
            Operates only on failed rows — running/pending/completed are
            untouched. Default limit 50 per click; raise if you have a
            larger cohort to flush.
          </div>
          <div className="space-y-2">
            <div>
              <Label className="text-xs">jobKind filter (optional, single)</Label>
              <Input
                value={retryJobKind}
                onChange={(e) => setRetryJobKind(e.target.value)}
                placeholder="e.g. projection.rebuild"
              />
            </div>
            <div>
              <Label className="text-xs">limit</Label>
              <Input
                type="number"
                value={retryLimit}
                onChange={(e) => setRetryLimit(e.target.value)}
                min={1}
                max={500}
              />
            </div>
          </div>
          <Button
            size="sm"
            disabled={retryMut.isPending}
            onClick={() => {
              const summary = retryJobKind.trim()
                ? `Retry up to ${parsedRetryLimit} failed jobs of kind="${retryJobKind.trim()}"?`
                : `Retry up to ${parsedRetryLimit} failed jobs (any kind)?`;
              if (window.confirm(summary)) {
                retryMut.mutate({
                  jobKind: retryJobKind.trim() || undefined,
                  limit: parsedRetryLimit,
                });
              }
            }}
          >
            {retryMut.isPending ? "Retrying…" : "Retry failed jobs"}
          </Button>
          {retryResult ? (
            <div className="rounded border border-zinc-800 p-3 text-xs">
              <div className="text-zinc-400 uppercase mb-1">Last run</div>
              <div>retried: {retryResult.retried}</div>
              <div>scanned: {retryResult.scanned}</div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* Cancel by query card */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <SectionLabel>Bulk cancel jobs</SectionLabel>
          <div className="text-xs text-zinc-400">
            Flips rows matching the status filter to `cancelled`. Default
            scope is `["pending"]` — safe to cancel a stampede that hasn't
            started yet. Adding `"running"` will mark in-flight rows
            cancelled but won't kill the worker process; the worker is
            expected to honor cooperative cancellation.
          </div>
          <div className="space-y-2">
            <div>
              <Label className="text-xs">jobKind filter (optional, single)</Label>
              <Input
                value={cancelJobKind}
                onChange={(e) => setCancelJobKind(e.target.value)}
                placeholder="e.g. import.scan"
              />
            </div>
            <div>
              <Label className="text-xs">
                statuses (comma-separated)
              </Label>
              <Input
                value={cancelStatuses}
                onChange={(e) => setCancelStatuses(e.target.value)}
                placeholder="pending,running"
              />
            </div>
            <div>
              <Label className="text-xs">limit</Label>
              <Input
                type="number"
                value={cancelLimit}
                onChange={(e) => setCancelLimit(e.target.value)}
                min={1}
                max={500}
              />
            </div>
          </div>
          <Button
            size="sm"
            variant="destructive"
            disabled={cancelMut.isPending}
            onClick={() => {
              const statuses =
                parsedCancelStatuses.length > 0
                  ? parsedCancelStatuses
                  : ["pending"];
              const summary = cancelJobKind.trim()
                ? `Cancel up to ${parsedCancelLimit} jobs of kind="${cancelJobKind.trim()}" with status in [${statuses.join(", ")}]?`
                : `Cancel up to ${parsedCancelLimit} jobs (any kind) with status in [${statuses.join(", ")}]?`;
              if (window.confirm(summary)) {
                cancelMut.mutate({
                  jobKind: cancelJobKind.trim() || undefined,
                  statuses: statuses as ("pending" | "running" | "completed" | "failed" | "cancelled")[],
                  limit: parsedCancelLimit,
                });
              }
            }}
          >
            {cancelMut.isPending ? "Cancelling…" : "Cancel jobs"}
          </Button>
          {cancelResult ? (
            <div className="rounded border border-zinc-800 p-3 text-xs">
              <div className="text-zinc-400 uppercase mb-1">Last run</div>
              <div>cancelled: {cancelResult.cancelled}</div>
              <div>scanned: {cancelResult.scanned}</div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

// RuntimeRunsRetentionPanel extracted to ../components/RuntimeRunsRetentionPanel.tsx
// (PR-D of full closure mission — mechanical extraction pattern from PR #708 + #722).

// ToolCallTracesRetentionPanel extracted to ../components/ToolCallTracesRetentionPanel.tsx
// (strict-audit batch-3 panel cleanup, PR-AT-4).


// McpTransitionsRetentionPanel extracted to
// ../components/McpTransitionsRetentionPanel.tsx (PR-Y4 of full closure mission).

// CatalogSyncLogRetentionPanel extracted to
// ../components/CatalogSyncLogRetentionPanel.tsx (strict-audit
// batch-3 panel cleanup, PR-AT-4).

// RacRuntimeTracesRetentionPanel extracted to
// ../components/RacRuntimeTracesRetentionPanel.tsx (strict-audit
// batch-3 panel cleanup, PR-AT-4).

// CagPackEventsRetentionPanel + SimulationRunsRetentionPanel +
// TestRunsRetentionPanel extracted to
// ../components/{Cag,Simulation,Test}RetentionPanel.tsx
// (strict-audit batch-4 panel cleanup, PR-AT-5).

// GraphQualityScansRetentionPanel + GraphCorrectionProposalsRetentionPanel +
// GraphQualityAgentRunsRetentionPanel extracted to
// ../components/{...}.tsx (strict-audit batch-5 panel cleanup,
// PR-AT-6).

// IngestionJobsRetentionPanel + GraphChangeProposalsRetentionPanel +
// GraphAgentRuntimeTracesRetentionPanel extracted to
// ../components/{...}.tsx (strict-audit batch-6 panel cleanup,
// PR-AT-7).

// PublishRequestsRetentionPanel + ApprovalStepsRetentionPanel +
// NotePromotionsRetentionPanel (the approval-lifecycle trio) extracted
// to ../components/{...}.tsx (strict-audit batch-7 panel cleanup,
// PR-AT-8 — closes item #14 at 17/17 panels extracted).

// ── Track 2 — release-audit-refs compliance archival panel ─────────────────
//
// Different shape from the prior retention panels:
//   - NO cron status (this is not a scheduled sweep — permanent
//     factory exclusion).
//   - NO age threshold input (the 7-year floor is enforced server-side
//     and cannot be overridden).
//   - Read pane lists archival candidates (rows that have aged past
//     the floor + are not already archived + no holds + release is
//     archived).
//   - Action pane archives a single candidate at a time, requiring a
//     non-empty complianceApprovalRef + reason.
//   - Standing policy banner reminds operators that deletion is
//     blocked — only `archive` is admissible.

function ReleaseAuditRefsArchivalPanel() {
  const candidatesQuery =
    trpc.agentStudio.publish.listReleaseAuditRefsArchivalCandidates.useQuery(
      { minRetentionYears: 7, limit: 50 },
      { refetchInterval: 60_000 },
    );
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [complianceApprovalRef, setComplianceApprovalRef] = useState("");
  const [reason, setReason] = useState("");
  const [lastArchivedId, setLastArchivedId] = useState<number | null>(null);

  const archiveMut =
    trpc.agentStudio.publish.archiveReleaseAuditRef.useMutation({
      onSuccess: (data) => {
        if (data?.archived) {
          setLastArchivedId(data.id);
          setComplianceApprovalRef("");
          setReason("");
          setSelectedId(null);
          toast.success(`Archived release-audit-ref #${data.id}`);
          void candidatesQuery.refetch();
        } else {
          toast.error(
            `Archive returned archived:false — row may not exist or may already be archived`,
          );
        }
      },
      onError: (err) =>
        toast.error(`Archive failed: ${err.message ?? "unknown"}`),
    });

  const candidates = candidatesQuery.data ?? [];
  const selected = candidates.find((c) => c.id === selectedId) ?? null;

  return (
    <div className="space-y-4">
      <div className="rounded border border-amber-900 bg-amber-950/30 p-4 text-xs text-amber-200">
        <div className="font-semibold uppercase tracking-wide mb-1">
          Compliance long-retention table
        </div>
        <p>
          `ags_release_audit_refs` is permanently excluded from the
          generic retention factory. Default retention is indefinite;
          7-year minimum if finite. <strong>Deletion is blocked by
          policy</strong> — only the archive action is admissible, and
          archives require a per-row compliance approval reference.
          Standing principle (user 2026-05-12 §0): &ldquo;Do not weaken
          the retention predicate to fit the current schema.&rdquo;
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <SectionLabel>
                Archival candidates (≥7y old, release archived, no holds)
              </SectionLabel>
              {candidatesQuery.isLoading ? (
                <Badge variant="secondary">loading</Badge>
              ) : (
                <Badge>{candidates.length} candidate{candidates.length === 1 ? "" : "s"}</Badge>
              )}
            </div>
            <div className="text-xs text-zinc-400">
              Each candidate has cleared the 7-year retention floor AND
              its release is archived AND has no active hold. Click a
              row to select it; the archive form on the right enables
              once a row is selected.
            </div>
            {candidates.length === 0 ? (
              <div className="rounded border border-zinc-800 p-3 text-xs text-zinc-500">
                No candidates. This is the expected state on healthy
                long-retention tables — most rows are not archival-eligible
                yet, or are under active hold, or their release is still
                live.
              </div>
            ) : (
              <div className="space-y-1 max-h-72 overflow-y-auto">
                {candidates.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setSelectedId(c.id)}
                    className={`w-full text-left rounded border p-2 text-xs transition-colors ${
                      selectedId === c.id
                        ? "border-amber-700 bg-amber-950/30"
                        : "border-zinc-800 hover:border-zinc-700"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono">
                        #{c.id} · {c.auditSystem}
                      </span>
                      <span className="text-zinc-500">
                        release #{c.releaseId}
                      </span>
                    </div>
                    <div className="text-zinc-500 mt-0.5 truncate">
                      ref: {c.externalRef}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 space-y-3">
            <SectionLabel>Archive action</SectionLabel>
            <div className="text-xs text-zinc-400">
              Archives a single candidate. Does NOT delete the row —
              `archivedAt` + `archivedBy` + `archiveReason` +
              `complianceApprovalRef` are populated; the row remains for
              audit reconstruction.
            </div>
            {selected ? (
              <div className="rounded border border-zinc-800 p-2 text-xs">
                <div>
                  Selected: <span className="font-mono">#{selected.id}</span>
                </div>
                <div className="text-zinc-500">
                  {selected.auditSystem} · release #{selected.releaseId}
                </div>
              </div>
            ) : (
              <div className="rounded border border-dashed border-zinc-800 p-2 text-xs text-zinc-600">
                No candidate selected
              </div>
            )}
            <div>
              <Label className="text-xs">complianceApprovalRef</Label>
              <Input
                value={complianceApprovalRef}
                onChange={(e) => setComplianceApprovalRef(e.target.value)}
                placeholder="e.g. COMPLIANCE-1234"
                maxLength={128}
              />
              <div className="text-[10px] text-zinc-500 mt-1">
                External ticket/jira ID authorizing the archive. Required.
              </div>
            </div>
            <div>
              <Label className="text-xs">reason</Label>
              <Input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="audit-trail context"
                maxLength={1024}
              />
              <div className="text-[10px] text-zinc-500 mt-1">
                Free-form audit-reconstruction context. Required.
              </div>
            </div>
            <Button
              size="sm"
              disabled={
                archiveMut.isPending ||
                selectedId === null ||
                complianceApprovalRef.trim() === "" ||
                reason.trim() === ""
              }
              onClick={() => {
                if (selectedId === null) return;
                if (
                  window.confirm(
                    `Archive release-audit-ref #${selectedId} with approval ${complianceApprovalRef}?`,
                  )
                ) {
                  archiveMut.mutate({
                    id: selectedId,
                    complianceApprovalRef: complianceApprovalRef.trim(),
                    reason: reason.trim(),
                  });
                }
              }}
            >
              {archiveMut.isPending ? "Archiving…" : "Archive row"}
            </Button>
            {lastArchivedId !== null ? (
              <div className="rounded border border-zinc-800 p-2 text-xs text-zinc-500">
                Last archived: <span className="font-mono">#{lastArchivedId}</span>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ── Lifecycle-holds management panel ───────────────────────────────────────
//
// Standalone panel: pick an entity (table + id), see its hold history,
// place a new hold, or release an active one. This is the operator
// surface for the agsLifecycleHolds table — the same table that the
// retention predicate reads to block sweeps. Placing a hold here
// prevents the corresponding retention sweep from deleting the row;
// releasing it re-enables eligibility (after the retention window
// elapses).

function LifecycleHoldsManagementPanel() {
  const [entityType, setEntityType] = useState("ags_publish_requests");
  const [entityIdInput, setEntityIdInput] = useState("");
  const [holdType, setHoldType] = useState("legal_hold");
  const [reason, setReason] = useState("");
  const [holdUntil, setHoldUntil] = useState("");
  const [releaseNote, setReleaseNote] = useState("");
  const [pendingReleaseHoldId, setPendingReleaseHoldId] = useState<number | null>(null);

  const entityIdParsed = parseInt(entityIdInput, 10);
  const entityIdValid = !Number.isNaN(entityIdParsed) && entityIdParsed > 0;

  const holdsQuery = trpc.agentStudio.publish.listLifecycleHoldsForEntity.useQuery(
    { entityType, entityId: entityIdValid ? entityIdParsed : 0 },
    {
      enabled: entityIdValid,
      refetchInterval: 30_000,
    },
  );

  const setMut = trpc.agentStudio.publish.setLifecycleHold.useMutation({
    onSuccess: (data) => {
      if (data?.set) {
        toast.success(`Hold #${data.holdId} placed`);
        setReason("");
        setHoldUntil("");
        void holdsQuery.refetch();
      } else {
        toast.error("setLifecycleHold returned set:false (ASDB unavailable?)");
      }
    },
    onError: (err) => toast.error(`Failed to set hold: ${err.message ?? "unknown"}`),
  });

  const releaseMut = trpc.agentStudio.publish.releaseLifecycleHold.useMutation({
    onSuccess: (data) => {
      if (data?.released) {
        toast.success(`Hold #${data.holdId} released`);
        setReleaseNote("");
        setPendingReleaseHoldId(null);
        void holdsQuery.refetch();
      } else {
        toast.error(
          "Release returned released:false (hold may not exist or already released)",
        );
      }
    },
    onError: (err) => toast.error(`Failed to release hold: ${err.message ?? "unknown"}`),
  });

  const holds = holdsQuery.data ?? [];

  return (
    <div className="space-y-4">
      <div className="rounded border border-zinc-800 p-4 text-xs text-zinc-400">
        <div className="font-semibold uppercase tracking-wide mb-1 text-zinc-300">
          Lifecycle holds
        </div>
        <p>
          Holds block the retention sweep from deleting a specific row.
          Place a hold by entity (table + id); release it when the
          underlying legal / audit / governance / investigation matter
          resolves. Released holds stay in the table for audit
          reconstruction.
        </p>
      </div>

      <Card>
        <CardContent className="p-4 space-y-3">
          <SectionLabel>Entity selector</SectionLabel>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <div>
              <Label className="text-xs">entityType</Label>
              <select
                value={entityType}
                onChange={(e) => setEntityType(e.target.value)}
                className="w-full rounded border border-zinc-800 bg-zinc-950 px-2 py-1 text-sm"
              >
                <option value="ags_publish_requests">ags_publish_requests</option>
                <option value="ags_approval_steps">ags_approval_steps</option>
                <option value="ags_note_promotions">ags_note_promotions</option>
                <option value="ags_release_audit_refs">ags_release_audit_refs</option>
              </select>
            </div>
            <div>
              <Label className="text-xs">entityId</Label>
              <Input
                type="number"
                value={entityIdInput}
                onChange={(e) => setEntityIdInput(e.target.value)}
                placeholder="row id"
                min={1}
              />
            </div>
            <div className="flex items-end">
              <Badge variant={entityIdValid ? "default" : "secondary"}>
                {entityIdValid ? `${holds.length} hold(s)` : "enter an id"}
              </Badge>
            </div>
          </div>
          {entityIdValid && entityType !== "ags_release_audit_refs" ? (
            <EligibilityExplainer
              entityType={entityType as "ags_publish_requests" | "ags_approval_steps" | "ags_note_promotions"}
              entityId={entityIdParsed}
            />
          ) : null}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-4 space-y-3">
            <SectionLabel>Place a hold</SectionLabel>
            <div>
              <Label className="text-xs">holdType</Label>
              <select
                value={holdType}
                onChange={(e) => setHoldType(e.target.value)}
                className="w-full rounded border border-zinc-800 bg-zinc-950 px-2 py-1 text-sm"
              >
                <option value="legal_hold">legal_hold</option>
                <option value="audit_hold">audit_hold</option>
                <option value="governance_hold">governance_hold</option>
                <option value="governance_review">governance_review</option>
                <option value="audit_investigation">audit_investigation</option>
              </select>
            </div>
            <div>
              <Label className="text-xs">reason</Label>
              <Input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="audit-trail context"
                maxLength={1024}
              />
            </div>
            <div>
              <Label className="text-xs">holdUntil (optional ISO datetime)</Label>
              <Input
                value={holdUntil}
                onChange={(e) => setHoldUntil(e.target.value)}
                placeholder="2027-01-01T00:00:00Z (blank = indefinite)"
              />
            </div>
            <Button
              size="sm"
              disabled={
                setMut.isPending ||
                !entityIdValid ||
                reason.trim() === ""
              }
              onClick={() => {
                if (!entityIdValid) return;
                if (
                  window.confirm(
                    `Place ${holdType} on ${entityType} #${entityIdParsed}?`,
                  )
                ) {
                  setMut.mutate({
                    entityType,
                    entityId: entityIdParsed,
                    holdType,
                    reason: reason.trim(),
                    holdUntil: holdUntil.trim() || undefined,
                  });
                }
              }}
            >
              {setMut.isPending ? "Placing…" : "Place hold"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 space-y-3">
            <SectionLabel>Holds for this entity</SectionLabel>
            {!entityIdValid ? (
              <div className="text-xs text-zinc-500">
                Enter a valid entityId to load holds.
              </div>
            ) : holdsQuery.isLoading ? (
              <div className="text-xs text-zinc-500">Loading…</div>
            ) : holds.length === 0 ? (
              <div className="text-xs text-zinc-500">No holds on this entity.</div>
            ) : (
              <div className="space-y-1 max-h-72 overflow-y-auto">
                {holds.map((h) => {
                  const active = h.releasedAt === null;
                  return (
                    <div
                      key={h.id}
                      className={`rounded border p-2 text-xs ${
                        active
                          ? "border-amber-800 bg-amber-950/20"
                          : "border-zinc-800 bg-zinc-950/30"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono">
                          #{h.id} · {h.holdType}
                        </span>
                        <Badge variant={active ? "default" : "secondary"}>
                          {active ? "active" : "released"}
                        </Badge>
                      </div>
                      {h.reason ? (
                        <div className="text-zinc-500 mt-0.5 truncate">
                          reason: {h.reason}
                        </div>
                      ) : null}
                      {h.holdUntil ? (
                        <div className="text-zinc-500">
                          until: {String(h.holdUntil)}
                        </div>
                      ) : null}
                      {!active && h.releaseNote ? (
                        <div className="text-zinc-500">
                          release: {h.releaseNote}
                        </div>
                      ) : null}
                      {active ? (
                        pendingReleaseHoldId === h.id ? (
                          <div className="mt-1 space-y-1">
                            <Input
                              value={releaseNote}
                              onChange={(e) => setReleaseNote(e.target.value)}
                              placeholder="release reason"
                              maxLength={1024}
                            />
                            <div className="flex gap-1">
                              <Button
                                size="sm"
                                disabled={
                                  releaseMut.isPending || releaseNote.trim() === ""
                                }
                                onClick={() => {
                                  releaseMut.mutate({
                                    holdId: h.id,
                                    releaseNote: releaseNote.trim(),
                                  });
                                }}
                              >
                                Confirm release
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  setPendingReleaseHoldId(null);
                                  setReleaseNote("");
                                }}
                              >
                                Cancel
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="mt-1"
                            onClick={() => setPendingReleaseHoldId(h.id)}
                          >
                            Release…
                          </Button>
                        )
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// EligibilityExplainer extracted to ../components/EligibilityExplainer.tsx
// (PR #708 — enables focused unit-test coverage).
