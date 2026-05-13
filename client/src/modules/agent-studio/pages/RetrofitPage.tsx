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

function formatRelative(date: Date | null | undefined): string {
  if (!date) return "never";
  const d = new Date(date);
  const ms = Date.now() - d.getTime();
  if (ms < 0) return d.toISOString();
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}

function CronStatusPanel() {
  const q = trpc.agentStudio.workspaceObservability.getCronStatus.useQuery(
    undefined,
    { refetchInterval: 30_000 },
  );

  if (q.isLoading) return <LoadingState label="Loading cron status…" />;
  if (q.isError) {
    return (
      <Card>
        <CardContent className="p-4 text-sm text-red-400">
          Failed to load cron status:{" "}
          {(q.error as { message?: string })?.message ?? "unknown"}
        </CardContent>
      </Card>
    );
  }

  const retention = q.data?.retention;
  const staleRunning = q.data?.staleRunning;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Retention sweep card */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <SectionLabel>Retention sweep</SectionLabel>
            {retention?.lastError ? (
              <Badge variant="destructive">error</Badge>
            ) : retention?.lastRunAt ? (
              <Badge>healthy</Badge>
            ) : (
              <Badge variant="secondary">never run</Badge>
            )}
          </div>
          <div className="text-xs text-zinc-400">
            Default: daily 03:00 UTC (env: AGS_RETENTION_CRON_EXPR).
            Sweeps `ags_workspace_error_events`,
            `ags_workspace_user_notifications`,
            `ags_workspace_background_jobs` older than 30 days.
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded border border-zinc-800 p-3">
              <div className="text-xs text-zinc-400 uppercase">last run</div>
              <div className="text-lg font-semibold">
                {formatRelative(retention?.lastRunAt)}
              </div>
            </div>
            <div className="rounded border border-zinc-800 p-3">
              <div className="text-xs text-zinc-400 uppercase">rows deleted</div>
              <div className="text-lg font-semibold">
                {retention?.lastResult
                  ? retention.lastResult.errorEventsDeleted +
                    retention.lastResult.notificationsDeleted +
                    retention.lastResult.backgroundJobsDeleted
                  : "—"}
              </div>
              {retention?.lastResult ? (
                <div className="text-xs text-zinc-500 mt-1">
                  errors {retention.lastResult.errorEventsDeleted} ·
                  notifications {retention.lastResult.notificationsDeleted} ·
                  jobs {retention.lastResult.backgroundJobsDeleted}
                </div>
              ) : null}
            </div>
          </div>
          {retention?.lastError ? (
            <div className="rounded border border-red-900 bg-red-950/40 p-3 text-xs text-red-300">
              <div className="uppercase tracking-wide mb-1">last error</div>
              {retention.lastError}
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* Stale-running sweep card */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <SectionLabel>Stale-running sweep</SectionLabel>
            {staleRunning?.lastError ? (
              <Badge variant="destructive">error</Badge>
            ) : staleRunning?.lastRunAt ? (
              <Badge>healthy</Badge>
            ) : (
              <Badge variant="secondary">never run</Badge>
            )}
          </div>
          <div className="text-xs text-zinc-400">
            Default: every 10 min, 30-min staleness threshold (env:
            AGS_STALE_RUNNING_CRON_EXPR / AGS_STALE_RUNNING_THRESHOLD_MS).
            Auto-fails background jobs stuck in `status='running'`.
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded border border-zinc-800 p-3">
              <div className="text-xs text-zinc-400 uppercase">last run</div>
              <div className="text-lg font-semibold">
                {formatRelative(staleRunning?.lastRunAt)}
              </div>
            </div>
            <div className="rounded border border-zinc-800 p-3">
              <div className="text-xs text-zinc-400 uppercase">jobs failed</div>
              <div className="text-lg font-semibold">
                {staleRunning?.lastResult
                  ? staleRunning.lastResult.failed.length
                  : "—"}
              </div>
              {staleRunning?.lastResult ? (
                <div className="text-xs text-zinc-500 mt-1">
                  scanned {staleRunning.lastResult.scanned}
                </div>
              ) : null}
            </div>
          </div>
          {staleRunning?.lastError ? (
            <div className="rounded border border-red-900 bg-red-950/40 p-3 text-xs text-red-300">
              <div className="uppercase tracking-wide mb-1">last error</div>
              {staleRunning.lastError}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

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

// ── Runtime Runs Retention (Phase 22 follow-up #624) ──────────────────
//
// Operator UI for the runtime-runs retention mini-arc (#621 prune
// primitive + #622 cron scheduler + #623 tRPC exposure). Mirrors the
// shape of CronStatusPanel + AdminSweepsPanel for the workspace-
// observability surface — two cards side-by-side:
//
//   1. Cron status (read-only, auto-refresh every 30s)
//   2. Manual sweep "Run Now" with retentionDays + environment inputs
//
// Operators use this to verify the daily 04:00 UTC cron is firing
// healthily and to fire on-demand sweeps post-incident (e.g. flush
// 7-day-old draft runs after a load test).

function RuntimeRunsRetentionPanel() {
  const statusQuery = trpc.agentStudio.runs.getRetentionCronStatus.useQuery(
    undefined,
    { refetchInterval: 30_000 },
  );
  const [retentionDays, setRetentionDays] = useState("30");
  const [environment, setEnvironment] = useState("");
  const [manualResult, setManualResult] = useState<
    { deletedRunsCount: number; deletedStepsCount: number } | null
  >(null);

  const pruneMut = trpc.agentStudio.runs.pruneRetention.useMutation({
    onSuccess: (data) => {
      setManualResult({
        deletedRunsCount: data.deletedRunsCount,
        deletedStepsCount: data.deletedStepsCount,
      });
      toast.success(
        `Retention sweep complete — ${data.deletedRunsCount} run(s) + ${data.deletedStepsCount} step row(s) deleted`,
      );
      void statusQuery.refetch();
    },
    onError: (err) =>
      toast.error(`Retention sweep failed: ${err.message ?? "unknown"}`),
  });

  const parsedDays = Math.max(1, parseInt(retentionDays, 10) || 30);
  const status = statusQuery.data;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Cron status */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <SectionLabel>Runtime-runs retention cron</SectionLabel>
            {statusQuery.isLoading ? (
              <Badge variant="secondary">loading</Badge>
            ) : status?.lastError ? (
              <Badge variant="destructive">error</Badge>
            ) : status?.lastRunAt ? (
              <Badge>healthy</Badge>
            ) : (
              <Badge variant="secondary">never run</Badge>
            )}
          </div>
          <div className="text-xs text-zinc-400">
            Default: daily 04:00 UTC (env: AGS_RUNTIME_RUNS_RETENTION_CRON_EXPR
            / AGS_RUNTIME_RUNS_RETENTION_DAYS). Sweeps `ags_runtime_runs` +
            cascades to `ags_runtime_run_steps` for runs older than the
            retention window with terminal statuses `completed` / `failed` /
            `cancelled`.
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded border border-zinc-800 p-3">
              <div className="text-xs text-zinc-400 uppercase">last run</div>
              <div className="text-lg font-semibold">
                {formatRelative(status?.lastRunAt)}
              </div>
            </div>
            <div className="rounded border border-zinc-800 p-3">
              <div className="text-xs text-zinc-400 uppercase">last result</div>
              <div className="text-lg font-semibold">
                {status?.lastResult
                  ? `${status.lastResult.deletedRunsCount} runs`
                  : "—"}
              </div>
              {status?.lastResult ? (
                <div className="text-xs text-zinc-500 mt-1">
                  + {status.lastResult.deletedStepsCount} step row(s)
                </div>
              ) : null}
            </div>
          </div>
          {status?.lastError ? (
            <div className="rounded border border-red-900 bg-red-950/40 p-3 text-xs text-red-300">
              <div className="uppercase tracking-wide mb-1">last error</div>
              {status.lastError}
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* Manual sweep */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <SectionLabel>Manual sweep</SectionLabel>
          <div className="text-xs text-zinc-400">
            Bypasses the daily cron — fires a sweep immediately. Useful for
            post-incident flushes or pre-demo prep. Empty `environment`
            sweeps all environments.
          </div>
          <div className="space-y-2">
            <div>
              <Label className="text-xs">retentionDays</Label>
              <Input
                type="number"
                value={retentionDays}
                onChange={(e) => setRetentionDays(e.target.value)}
                min={1}
                max={3650}
              />
            </div>
            <div>
              <Label className="text-xs">environment (optional)</Label>
              <Input
                value={environment}
                onChange={(e) => setEnvironment(e.target.value)}
                placeholder="e.g. draft / staging / production"
              />
            </div>
          </div>
          <Button
            size="sm"
            disabled={pruneMut.isPending}
            onClick={() => {
              const envSummary = environment.trim()
                ? ` in environment="${environment.trim()}"`
                : "";
              if (
                window.confirm(
                  `Delete runs older than ${parsedDays} days${envSummary}? This also cascade-deletes the corresponding step rows.`,
                )
              ) {
                pruneMut.mutate({
                  retentionDays: parsedDays,
                  environment: environment.trim() || undefined,
                });
              }
            }}
          >
            {pruneMut.isPending ? "Sweeping…" : "Run sweep now"}
          </Button>
          {manualResult ? (
            <div className="rounded border border-zinc-800 p-3 text-xs">
              <div className="text-zinc-400 uppercase mb-1">Last manual run</div>
              <div>runs deleted: {manualResult.deletedRunsCount}</div>
              <div>steps deleted: {manualResult.deletedStepsCount}</div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Tool Call Traces Retention (Phase 22 follow-up #628) ──────────────
//
// Operator UI for the tool-call-traces retention mini-arc (#625
// prune + #626 cron + #627 tRPC + #628 UI). Mirrors the shape of
// RuntimeRunsRetentionPanel (#624) — two cards (cron status +
// manual sweep) — for the `ags_tool_call_traces` table.

function ToolCallTracesRetentionPanel() {
  const statusQuery =
    trpc.agentStudio.runs.getToolCallTracesRetentionCronStatus.useQuery(
      undefined,
      { refetchInterval: 30_000 },
    );
  const [retentionDays, setRetentionDays] = useState("30");
  const [includeForensic, setIncludeForensic] = useState(false);
  const [manualResult, setManualResult] = useState<
    { deletedCount: number } | null
  >(null);

  const pruneMut =
    trpc.agentStudio.runs.pruneToolCallTracesRetention.useMutation({
      onSuccess: (data) => {
        setManualResult({ deletedCount: data.deletedCount });
        toast.success(
          `Tool-call-traces sweep complete — ${data.deletedCount} row(s) deleted`,
        );
        void statusQuery.refetch();
      },
      onError: (err) =>
        toast.error(`Sweep failed: ${err.message ?? "unknown"}`),
    });

  const parsedDays = Math.max(1, parseInt(retentionDays, 10) || 30);
  const status = statusQuery.data;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Cron status */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <SectionLabel>Tool-call-traces retention cron</SectionLabel>
            {statusQuery.isLoading ? (
              <Badge variant="secondary">loading</Badge>
            ) : status?.lastError ? (
              <Badge variant="destructive">error</Badge>
            ) : status?.lastRunAt ? (
              <Badge>healthy</Badge>
            ) : (
              <Badge variant="secondary">never run</Badge>
            )}
          </div>
          <div className="text-xs text-zinc-400">
            Default: daily 05:00 UTC (env: AGS_TOOL_CALL_TRACES_RETENTION_CRON_EXPR
            / AGS_TOOL_CALL_TRACES_RETENTION_DAYS). Sweeps the
            `ags_tool_call_traces` table — by default only the
            `dispatchResult="ok"` rows; `error` + `blocked` rows are
            preserved for forensic value (operators can override below).
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded border border-zinc-800 p-3">
              <div className="text-xs text-zinc-400 uppercase">last run</div>
              <div className="text-lg font-semibold">
                {formatRelative(status?.lastRunAt)}
              </div>
            </div>
            <div className="rounded border border-zinc-800 p-3">
              <div className="text-xs text-zinc-400 uppercase">rows deleted</div>
              <div className="text-lg font-semibold">
                {status?.lastResult ? status.lastResult.deletedCount : "—"}
              </div>
            </div>
          </div>
          {status?.lastError ? (
            <div className="rounded border border-red-900 bg-red-950/40 p-3 text-xs text-red-300">
              <div className="uppercase tracking-wide mb-1">last error</div>
              {status.lastError}
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* Manual sweep */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <SectionLabel>Manual sweep</SectionLabel>
          <div className="text-xs text-zinc-400">
            Bypasses the daily cron — fires a sweep immediately.
            Default only deletes `ok` rows; tick the box below to also
            delete `error` + `blocked` rows (loses forensic context).
          </div>
          <div className="space-y-2">
            <div>
              <Label className="text-xs">retentionDays</Label>
              <Input
                type="number"
                value={retentionDays}
                onChange={(e) => setRetentionDays(e.target.value)}
                min={1}
                max={3650}
              />
            </div>
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={includeForensic}
                onChange={(e) => setIncludeForensic(e.target.checked)}
              />
              Also delete `error` + `blocked` rows (aggressive cleanup)
            </label>
          </div>
          <Button
            size="sm"
            disabled={pruneMut.isPending}
            onClick={() => {
              const dispatchResults: ("ok" | "error" | "blocked")[] =
                includeForensic ? ["ok", "error", "blocked"] : ["ok"];
              const summary = includeForensic
                ? `Delete ALL tool-call-trace rows older than ${parsedDays} days INCLUDING error + blocked rows? This loses forensic context.`
                : `Delete tool-call-trace rows older than ${parsedDays} days (ok only — error + blocked rows preserved)?`;
              if (window.confirm(summary)) {
                pruneMut.mutate({
                  retentionDays: parsedDays,
                  dispatchResults,
                });
              }
            }}
          >
            {pruneMut.isPending ? "Sweeping…" : "Run sweep now"}
          </Button>
          {manualResult ? (
            <div className="rounded border border-zinc-800 p-3 text-xs">
              <div className="text-zinc-400 uppercase mb-1">Last manual run</div>
              <div>rows deleted: {manualResult.deletedCount}</div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

// ── MCP Transitions Retention (Phase 22 follow-up #632) ───────────────
//
// Operator UI for the mcp-transitions retention mini-arc (#629 prune
// + #630 cron + #631 tRPC + #632 UI). Simpler than the runtime-runs
// or tool-call-traces panels — no statuses or environment, just
// retention window + optional serverId scoping.

function McpTransitionsRetentionPanel() {
  const statusQuery =
    trpc.agentStudio.mcp.getTransitionsRetentionCronStatus.useQuery(
      undefined,
      { refetchInterval: 30_000 },
    );
  const [retentionDays, setRetentionDays] = useState("30");
  const [serverIdInput, setServerIdInput] = useState("");
  const [manualResult, setManualResult] = useState<
    { deletedCount: number } | null
  >(null);

  const pruneMut = trpc.agentStudio.mcp.pruneTransitionsRetention.useMutation({
    onSuccess: (data) => {
      setManualResult({ deletedCount: data.deletedCount });
      toast.success(
        `MCP transitions sweep complete — ${data.deletedCount} row(s) deleted`,
      );
      void statusQuery.refetch();
    },
    onError: (err) =>
      toast.error(`Sweep failed: ${err.message ?? "unknown"}`),
  });

  const parsedDays = Math.max(1, parseInt(retentionDays, 10) || 30);
  const parsedServerId = serverIdInput.trim()
    ? Number(serverIdInput.trim())
    : null;
  const status = statusQuery.data;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Cron status */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <SectionLabel>MCP transitions retention cron</SectionLabel>
            {statusQuery.isLoading ? (
              <Badge variant="secondary">loading</Badge>
            ) : status?.lastError ? (
              <Badge variant="destructive">error</Badge>
            ) : status?.lastRunAt ? (
              <Badge>healthy</Badge>
            ) : (
              <Badge variant="secondary">never run</Badge>
            )}
          </div>
          <div className="text-xs text-zinc-400">
            Default: daily 06:00 UTC (env:
            AGS_MCP_TRANSITIONS_RETENTION_CRON_EXPR /
            AGS_MCP_TRANSITIONS_RETENTION_DAYS). Sweeps
            `ags_mcp_transitions` — one row per FSM transition (high-
            volume when an MCP server flaps).
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded border border-zinc-800 p-3">
              <div className="text-xs text-zinc-400 uppercase">last run</div>
              <div className="text-lg font-semibold">
                {formatRelative(status?.lastRunAt)}
              </div>
            </div>
            <div className="rounded border border-zinc-800 p-3">
              <div className="text-xs text-zinc-400 uppercase">rows deleted</div>
              <div className="text-lg font-semibold">
                {status?.lastResult ? status.lastResult.deletedCount : "—"}
              </div>
            </div>
          </div>
          {status?.lastError ? (
            <div className="rounded border border-red-900 bg-red-950/40 p-3 text-xs text-red-300">
              <div className="uppercase tracking-wide mb-1">last error</div>
              {status.lastError}
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* Manual sweep */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <SectionLabel>Manual sweep</SectionLabel>
          <div className="text-xs text-zinc-400">
            Bypasses the daily cron — fires immediately. Useful after
            wrangling a flapping MCP server to flush the audit trail.
          </div>
          <div className="space-y-2">
            <div>
              <Label className="text-xs">retentionDays</Label>
              <Input
                type="number"
                value={retentionDays}
                onChange={(e) => setRetentionDays(e.target.value)}
                min={1}
                max={3650}
              />
            </div>
            <div>
              <Label className="text-xs">serverId (optional)</Label>
              <Input
                type="number"
                value={serverIdInput}
                onChange={(e) => setServerIdInput(e.target.value)}
                placeholder="any (default sweeps all servers)"
              />
            </div>
          </div>
          <Button
            size="sm"
            disabled={pruneMut.isPending}
            onClick={() => {
              const scope =
                parsedServerId !== null && parsedServerId > 0
                  ? ` for serverId=${parsedServerId}`
                  : "";
              if (
                window.confirm(
                  `Delete MCP transition rows older than ${parsedDays} days${scope}?`,
                )
              ) {
                pruneMut.mutate({
                  retentionDays: parsedDays,
                  serverId:
                    parsedServerId !== null && parsedServerId > 0
                      ? parsedServerId
                      : undefined,
                });
              }
            }}
          >
            {pruneMut.isPending ? "Sweeping…" : "Run sweep now"}
          </Button>
          {manualResult ? (
            <div className="rounded border border-zinc-800 p-3 text-xs">
              <div className="text-zinc-400 uppercase mb-1">Last manual run</div>
              <div>rows deleted: {manualResult.deletedCount}</div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Catalog Sync Log Retention (Phase 22 follow-up #636) ──────────────
//
// Operator UI for the catalog-sync-log retention mini-arc (#633 prune
// + #634 cron + #635 tRPC + #636 UI). Mirrors prior retention panels.
// Adds an eventTypes checkbox triplet so operators can preserve
// `deprecated` events selectively.

function CatalogSyncLogRetentionPanel() {
  const statusQuery =
    trpc.agentStudio.catalogSyncLog.getRetentionCronStatus.useQuery(
      undefined,
      { refetchInterval: 30_000 },
    );
  const [retentionDays, setRetentionDays] = useState("30");
  const [includeRegistered, setIncludeRegistered] = useState(true);
  const [includePublished, setIncludePublished] = useState(true);
  const [includeDeprecated, setIncludeDeprecated] = useState(false);
  const [manualResult, setManualResult] = useState<
    { deletedCount: number } | null
  >(null);

  const pruneMut =
    trpc.agentStudio.catalogSyncLog.pruneRetention.useMutation({
      onSuccess: (data) => {
        setManualResult({ deletedCount: data.deletedCount });
        toast.success(
          `Catalog-sync-log sweep complete — ${data.deletedCount} row(s) deleted`,
        );
        void statusQuery.refetch();
      },
      onError: (err) =>
        toast.error(`Sweep failed: ${err.message ?? "unknown"}`),
    });

  const parsedDays = Math.max(1, parseInt(retentionDays, 10) || 30);
  const status = statusQuery.data;

  const selectedEventTypes: (
    | "aiTypes.catalog.registered"
    | "aiTypes.catalog.published"
    | "aiTypes.catalog.deprecated"
  )[] = [];
  if (includeRegistered) selectedEventTypes.push("aiTypes.catalog.registered");
  if (includePublished) selectedEventTypes.push("aiTypes.catalog.published");
  if (includeDeprecated) selectedEventTypes.push("aiTypes.catalog.deprecated");

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <SectionLabel>Catalog sync log retention cron</SectionLabel>
            {statusQuery.isLoading ? (
              <Badge variant="secondary">loading</Badge>
            ) : status?.lastError ? (
              <Badge variant="destructive">error</Badge>
            ) : status?.lastRunAt ? (
              <Badge>healthy</Badge>
            ) : (
              <Badge variant="secondary">never run</Badge>
            )}
          </div>
          <div className="text-xs text-zinc-400">
            Default: daily 07:00 UTC (env:
            AGS_CATALOG_SYNC_LOG_RETENTION_CRON_EXPR /
            AGS_CATALOG_SYNC_LOG_RETENTION_DAYS). Sweeps
            `ags_catalog_sync_log` — one row per aiTypes catalog
            lifecycle event (registered / published / deprecated).
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded border border-zinc-800 p-3">
              <div className="text-xs text-zinc-400 uppercase">last run</div>
              <div className="text-lg font-semibold">
                {formatRelative(status?.lastRunAt)}
              </div>
            </div>
            <div className="rounded border border-zinc-800 p-3">
              <div className="text-xs text-zinc-400 uppercase">rows deleted</div>
              <div className="text-lg font-semibold">
                {status?.lastResult ? status.lastResult.deletedCount : "—"}
              </div>
            </div>
          </div>
          {status?.lastError ? (
            <div className="rounded border border-red-900 bg-red-950/40 p-3 text-xs text-red-300">
              <div className="uppercase tracking-wide mb-1">last error</div>
              {status.lastError}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 space-y-3">
          <SectionLabel>Manual sweep</SectionLabel>
          <div className="text-xs text-zinc-400">
            Pick which event types to sweep. `deprecated` is unchecked
            by default — those are rare lifecycle endpoints that
            operators usually want to preserve longer.
          </div>
          <div className="space-y-2">
            <div>
              <Label className="text-xs">retentionDays</Label>
              <Input
                type="number"
                value={retentionDays}
                onChange={(e) => setRetentionDays(e.target.value)}
                min={1}
                max={3650}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">eventTypes</Label>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={includeRegistered}
                  onChange={(e) => setIncludeRegistered(e.target.checked)}
                />
                aiTypes.catalog.registered
              </label>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={includePublished}
                  onChange={(e) => setIncludePublished(e.target.checked)}
                />
                aiTypes.catalog.published
              </label>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={includeDeprecated}
                  onChange={(e) => setIncludeDeprecated(e.target.checked)}
                />
                aiTypes.catalog.deprecated
                <span className="text-zinc-500">(rare lifecycle endpoints)</span>
              </label>
            </div>
          </div>
          <Button
            size="sm"
            disabled={pruneMut.isPending || selectedEventTypes.length === 0}
            onClick={() => {
              if (selectedEventTypes.length === 0) return;
              const types =
                selectedEventTypes.length === 3
                  ? "all event types"
                  : selectedEventTypes.join(", ");
              if (
                window.confirm(
                  `Delete catalog-sync-log rows older than ${parsedDays} days (${types})?`,
                )
              ) {
                pruneMut.mutate({
                  retentionDays: parsedDays,
                  eventTypes: selectedEventTypes,
                });
              }
            }}
          >
            {pruneMut.isPending ? "Sweeping…" : "Run sweep now"}
          </Button>
          {manualResult ? (
            <div className="rounded border border-zinc-800 p-3 text-xs">
              <div className="text-zinc-400 uppercase mb-1">Last manual run</div>
              <div>rows deleted: {manualResult.deletedCount}</div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

// ── RAC Runtime Traces Retention (Phase 22 follow-up #641) ────────────
//
// Operator UI for the rac-runtime-traces retention mini-arc (#638 prune
// + #639 cron + #640 tRPC + #641 UI). Last slot in the daily-sweep
// ladder (08:00 UTC). Cascades agsRacContextBlocks before agsRac
// RuntimeTraces, so the result UI surfaces both counters distinctly.
// Inputs are optional workspaceId / agentId CSVs (parsed to number[])
// for tenant-scoped sweeps when an operator needs to target one
// workspace/agent without affecting cross-tenant rows.

function RacRuntimeTracesRetentionPanel() {
  const statusQuery =
    trpc.agentStudio.racTrace.getRetentionCronStatus.useQuery(undefined, {
      refetchInterval: 30_000,
    });
  const [retentionDays, setRetentionDays] = useState("30");
  const [workspaceIdInput, setWorkspaceIdInput] = useState("");
  const [agentIdInput, setAgentIdInput] = useState("");
  const [manualResult, setManualResult] = useState<{
    deletedTracesCount: number;
    deletedContextBlocksCount: number;
  } | null>(null);

  const pruneMut = trpc.agentStudio.racTrace.pruneRetention.useMutation({
    onSuccess: (data) => {
      setManualResult({
        deletedTracesCount: data.deletedTracesCount,
        deletedContextBlocksCount: data.deletedContextBlocksCount,
      });
      toast.success(
        `RAC traces sweep complete — ${data.deletedTracesCount} trace(s), ${data.deletedContextBlocksCount} context block(s) deleted`,
      );
      void statusQuery.refetch();
    },
    onError: (err) => toast.error(`Sweep failed: ${err.message ?? "unknown"}`),
  });

  const parsedDays = Math.max(1, parseInt(retentionDays, 10) || 30);
  const status = statusQuery.data;

  function parseIdList(raw: string): number[] | undefined {
    const trimmed = raw.trim();
    if (trimmed.length === 0) return undefined;
    const parts = trimmed
      .split(/[\s,]+/)
      .map((s) => parseInt(s, 10))
      .filter((n) => Number.isFinite(n) && n > 0);
    return parts.length > 0 ? parts : undefined;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <SectionLabel>RAC runtime traces retention cron</SectionLabel>
            {statusQuery.isLoading ? (
              <Badge variant="secondary">loading</Badge>
            ) : status?.lastError ? (
              <Badge variant="destructive">error</Badge>
            ) : status?.lastRunAt ? (
              <Badge>healthy</Badge>
            ) : (
              <Badge variant="secondary">never run</Badge>
            )}
          </div>
          <div className="text-xs text-zinc-400">
            Default: daily 08:00 UTC (env:
            AGS_RAC_RUNTIME_TRACES_RETENTION_CRON_EXPR /
            AGS_RAC_RUNTIME_TRACES_RETENTION_DAYS). Sweeps
            `ags_rac_runtime_traces` + cascades
            `ags_rac_context_blocks`. 6th slot in the daily-sweep
            ladder (03/04/05/06/07/08 UTC).
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded border border-zinc-800 p-3">
              <div className="text-xs text-zinc-400 uppercase">last run</div>
              <div className="text-lg font-semibold">
                {formatRelative(status?.lastRunAt)}
              </div>
            </div>
            <div className="rounded border border-zinc-800 p-3">
              <div className="text-xs text-zinc-400 uppercase">traces deleted</div>
              <div className="text-lg font-semibold">
                {status?.lastResult
                  ? status.lastResult.deletedTracesCount
                  : "—"}
              </div>
            </div>
            <div className="rounded border border-zinc-800 p-3">
              <div className="text-xs text-zinc-400 uppercase">blocks deleted</div>
              <div className="text-lg font-semibold">
                {status?.lastResult
                  ? status.lastResult.deletedContextBlocksCount
                  : "—"}
              </div>
            </div>
          </div>
          {status?.lastError ? (
            <div className="rounded border border-red-900 bg-red-950/40 p-3 text-xs text-red-300">
              <div className="uppercase tracking-wide mb-1">last error</div>
              {status.lastError}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 space-y-3">
          <SectionLabel>Manual sweep</SectionLabel>
          <div className="text-xs text-zinc-400">
            Optional tenant filters: comma- or space-separated
            workspaceId / agentId lists. Leave blank to sweep across
            all tenants.
          </div>
          <div className="space-y-2">
            <div>
              <Label className="text-xs">retentionDays</Label>
              <Input
                type="number"
                value={retentionDays}
                onChange={(e) => setRetentionDays(e.target.value)}
                min={1}
                max={3650}
              />
            </div>
            <div>
              <Label className="text-xs">workspaceId (optional)</Label>
              <Input
                type="text"
                value={workspaceIdInput}
                onChange={(e) => setWorkspaceIdInput(e.target.value)}
                placeholder="e.g. 11, 22"
              />
            </div>
            <div>
              <Label className="text-xs">agentId (optional)</Label>
              <Input
                type="text"
                value={agentIdInput}
                onChange={(e) => setAgentIdInput(e.target.value)}
                placeholder="e.g. 42"
              />
            </div>
          </div>
          <Button
            size="sm"
            disabled={pruneMut.isPending}
            onClick={() => {
              const wsIds = parseIdList(workspaceIdInput);
              const agentIds = parseIdList(agentIdInput);
              const scope =
                wsIds || agentIds
                  ? `workspaceId=${wsIds?.join(",") ?? "any"} agentId=${agentIds?.join(",") ?? "any"}`
                  : "all tenants";
              if (
                window.confirm(
                  `Delete RAC runtime traces older than ${parsedDays} days (${scope})?`,
                )
              ) {
                pruneMut.mutate({
                  retentionDays: parsedDays,
                  workspaceId:
                    wsIds && wsIds.length === 1 ? wsIds[0] : wsIds,
                  agentId:
                    agentIds && agentIds.length === 1
                      ? agentIds[0]
                      : agentIds,
                });
              }
            }}
          >
            {pruneMut.isPending ? "Sweeping…" : "Run sweep now"}
          </Button>
          {manualResult ? (
            <div className="rounded border border-zinc-800 p-3 text-xs space-y-1">
              <div className="text-zinc-400 uppercase">Last manual run</div>
              <div>traces deleted: {manualResult.deletedTracesCount}</div>
              <div>
                context blocks deleted:{" "}
                {manualResult.deletedContextBlocksCount}
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

// ── CAG Pack Events Retention (Phase 22 follow-up #648) ───────────────
//
// Operator UI for the cag-pack-events retention mini-arc (#645 prune
// + #646 cron + #647 tRPC + #648 UI). 7th slot in the daily-sweep
// ladder (09:00 UTC). Sweeps the high-volume `ags_cag_pack_events`
// log (pack_used / pack_validation_failed / etc).
//
// Default sweep excludes `warn` + `error` severities (preserve them
// longer than info-level pack_used noise). Operators can override
// via the severity-include checkboxes.

function CagPackEventsRetentionPanel() {
  const statusQuery =
    trpc.agentStudio.cag.getEventsRetentionCronStatus.useQuery(undefined, {
      refetchInterval: 30_000,
    });
  const [retentionDays, setRetentionDays] = useState("30");
  const [includeInfo, setIncludeInfo] = useState(true);
  const [includeWarn, setIncludeWarn] = useState(false);
  const [includeError, setIncludeError] = useState(false);
  const [workspaceIdInput, setWorkspaceIdInput] = useState("");
  const [manualResult, setManualResult] = useState<{
    deletedCount: number;
  } | null>(null);

  const pruneMut = trpc.agentStudio.cag.pruneEventsRetention.useMutation({
    onSuccess: (data) => {
      setManualResult({ deletedCount: data.deletedCount });
      toast.success(
        `CAG pack events sweep complete — ${data.deletedCount} row(s) deleted`,
      );
      void statusQuery.refetch();
    },
    onError: (err) => toast.error(`Sweep failed: ${err.message ?? "unknown"}`),
  });

  const parsedDays = Math.max(1, parseInt(retentionDays, 10) || 30);
  const status = statusQuery.data;

  const selectedSeverities: ("info" | "warn" | "error")[] = [];
  if (includeInfo) selectedSeverities.push("info");
  if (includeWarn) selectedSeverities.push("warn");
  if (includeError) selectedSeverities.push("error");

  function parseIdList(raw: string): number[] | undefined {
    const trimmed = raw.trim();
    if (trimmed.length === 0) return undefined;
    const parts = trimmed
      .split(/[\s,]+/)
      .map((s) => parseInt(s, 10))
      .filter((n) => Number.isFinite(n) && n > 0);
    return parts.length > 0 ? parts : undefined;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <SectionLabel>CAG pack events retention cron</SectionLabel>
            {statusQuery.isLoading ? (
              <Badge variant="secondary">loading</Badge>
            ) : status?.lastError ? (
              <Badge variant="destructive">error</Badge>
            ) : status?.lastRunAt ? (
              <Badge>healthy</Badge>
            ) : (
              <Badge variant="secondary">never run</Badge>
            )}
          </div>
          <div className="text-xs text-zinc-400">
            Default: daily 09:00 UTC (env:
            AGS_CAG_PACK_EVENTS_RETENTION_CRON_EXPR /
            AGS_CAG_PACK_EVENTS_RETENTION_DAYS). Sweeps
            `ags_cag_pack_events` — high-volume CAG pack lifecycle
            event log (pack_used / pack_validation_failed / etc).
            7th slot in the daily-sweep ladder.
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded border border-zinc-800 p-3">
              <div className="text-xs text-zinc-400 uppercase">last run</div>
              <div className="text-lg font-semibold">
                {formatRelative(status?.lastRunAt)}
              </div>
            </div>
            <div className="rounded border border-zinc-800 p-3">
              <div className="text-xs text-zinc-400 uppercase">rows deleted</div>
              <div className="text-lg font-semibold">
                {status?.lastResult ? status.lastResult.deletedCount : "—"}
              </div>
            </div>
          </div>
          {status?.lastError ? (
            <div className="rounded border border-red-900 bg-red-950/40 p-3 text-xs text-red-300">
              <div className="uppercase tracking-wide mb-1">last error</div>
              {status.lastError}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 space-y-3">
          <SectionLabel>Manual sweep</SectionLabel>
          <div className="text-xs text-zinc-400">
            `info` is the high-volume default (pack_used). `warn` +
            `error` are unchecked by default — those are rare and
            usually want preserving for forensic value.
          </div>
          <div className="space-y-2">
            <div>
              <Label className="text-xs">retentionDays</Label>
              <Input
                type="number"
                value={retentionDays}
                onChange={(e) => setRetentionDays(e.target.value)}
                min={1}
                max={3650}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">eventSeverities</Label>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={includeInfo}
                  onChange={(e) => setIncludeInfo(e.target.checked)}
                />
                info (pack_used, etc — high-volume)
              </label>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={includeWarn}
                  onChange={(e) => setIncludeWarn(e.target.checked)}
                />
                warn
              </label>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={includeError}
                  onChange={(e) => setIncludeError(e.target.checked)}
                />
                error (pack_validation_failed, etc — preserve longer)
              </label>
            </div>
            <div>
              <Label className="text-xs">workspaceId (optional)</Label>
              <Input
                type="text"
                value={workspaceIdInput}
                onChange={(e) => setWorkspaceIdInput(e.target.value)}
                placeholder="e.g. 11, 22"
              />
            </div>
          </div>
          <Button
            size="sm"
            disabled={pruneMut.isPending || selectedSeverities.length === 0}
            onClick={() => {
              if (selectedSeverities.length === 0) return;
              const wsIds = parseIdList(workspaceIdInput);
              const severities =
                selectedSeverities.length === 3
                  ? "all severities"
                  : selectedSeverities.join(", ");
              if (
                window.confirm(
                  `Delete CAG pack events older than ${parsedDays} days (${severities}${wsIds ? `; workspaceId=${wsIds.join(",")}` : ""})?`,
                )
              ) {
                pruneMut.mutate({
                  retentionDays: parsedDays,
                  eventSeverities: selectedSeverities,
                  workspaceId:
                    wsIds && wsIds.length === 1 ? wsIds[0] : wsIds,
                });
              }
            }}
          >
            {pruneMut.isPending ? "Sweeping…" : "Run sweep now"}
          </Button>
          {manualResult ? (
            <div className="rounded border border-zinc-800 p-3 text-xs">
              <div className="text-zinc-400 uppercase mb-1">Last manual run</div>
              <div>rows deleted: {manualResult.deletedCount}</div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Simulation Runs Retention (Phase 22 follow-up #652) ───────────────
//
// Operator UI for the simulation-runs retention mini-arc (#649 prune
// + #650 cron + #651 tRPC + #652 UI). 8th slot in the daily-sweep
// ladder (10:00 UTC). Sweeps `ags_simulation_runs` + cascades
// `ags_simulation_run_steps`.

function SimulationRunsRetentionPanel() {
  const statusQuery =
    trpc.agentStudio.simulation.getRetentionCronStatus.useQuery(undefined, {
      refetchInterval: 30_000,
    });
  const [retentionDays, setRetentionDays] = useState("30");
  const [includePassed, setIncludePassed] = useState(true);
  const [includeFailed, setIncludeFailed] = useState(true);
  const [includeCancelled, setIncludeCancelled] = useState(true);
  const [agentIdInput, setAgentIdInput] = useState("");
  const [manualResult, setManualResult] = useState<{
    deletedRunsCount: number;
    deletedStepsCount: number;
  } | null>(null);

  const pruneMut = trpc.agentStudio.simulation.pruneRetention.useMutation({
    onSuccess: (data) => {
      setManualResult({
        deletedRunsCount: data.deletedRunsCount,
        deletedStepsCount: data.deletedStepsCount,
      });
      toast.success(
        `Simulation runs sweep complete — ${data.deletedRunsCount} run(s), ${data.deletedStepsCount} step(s) deleted`,
      );
      void statusQuery.refetch();
    },
    onError: (err) => toast.error(`Sweep failed: ${err.message ?? "unknown"}`),
  });

  const parsedDays = Math.max(1, parseInt(retentionDays, 10) || 30);
  const status = statusQuery.data;

  const selectedStatuses: ("passed" | "failed" | "cancelled")[] = [];
  if (includePassed) selectedStatuses.push("passed");
  if (includeFailed) selectedStatuses.push("failed");
  if (includeCancelled) selectedStatuses.push("cancelled");

  function parseIdList(raw: string): number[] | undefined {
    const trimmed = raw.trim();
    if (trimmed.length === 0) return undefined;
    const parts = trimmed
      .split(/[\s,]+/)
      .map((s) => parseInt(s, 10))
      .filter((n) => Number.isFinite(n) && n > 0);
    return parts.length > 0 ? parts : undefined;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <SectionLabel>Simulation runs retention cron</SectionLabel>
            {statusQuery.isLoading ? (
              <Badge variant="secondary">loading</Badge>
            ) : status?.lastError ? (
              <Badge variant="destructive">error</Badge>
            ) : status?.lastRunAt ? (
              <Badge>healthy</Badge>
            ) : (
              <Badge variant="secondary">never run</Badge>
            )}
          </div>
          <div className="text-xs text-zinc-400">
            Default: daily 10:00 UTC (env:
            AGS_SIMULATION_RUNS_RETENTION_CRON_EXPR /
            AGS_SIMULATION_RUNS_RETENTION_DAYS). Sweeps
            `ags_simulation_runs` + cascades
            `ags_simulation_run_steps`. 8th slot in the daily-sweep
            ladder.
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded border border-zinc-800 p-3">
              <div className="text-xs text-zinc-400 uppercase">last run</div>
              <div className="text-lg font-semibold">
                {formatRelative(status?.lastRunAt)}
              </div>
            </div>
            <div className="rounded border border-zinc-800 p-3">
              <div className="text-xs text-zinc-400 uppercase">runs deleted</div>
              <div className="text-lg font-semibold">
                {status?.lastResult
                  ? status.lastResult.deletedRunsCount
                  : "—"}
              </div>
            </div>
            <div className="rounded border border-zinc-800 p-3">
              <div className="text-xs text-zinc-400 uppercase">steps deleted</div>
              <div className="text-lg font-semibold">
                {status?.lastResult
                  ? status.lastResult.deletedStepsCount
                  : "—"}
              </div>
            </div>
          </div>
          {status?.lastError ? (
            <div className="rounded border border-red-900 bg-red-950/40 p-3 text-xs text-red-300">
              <div className="uppercase tracking-wide mb-1">last error</div>
              {status.lastError}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 space-y-3">
          <SectionLabel>Manual sweep</SectionLabel>
          <div className="text-xs text-zinc-400">
            `queued` + `running` are never swept — those are in-flight
            runs. Pick which terminal statuses to delete.
          </div>
          <div className="space-y-2">
            <div>
              <Label className="text-xs">retentionDays</Label>
              <Input
                type="number"
                value={retentionDays}
                onChange={(e) => setRetentionDays(e.target.value)}
                min={1}
                max={3650}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">statuses</Label>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={includePassed}
                  onChange={(e) => setIncludePassed(e.target.checked)}
                />
                passed
              </label>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={includeFailed}
                  onChange={(e) => setIncludeFailed(e.target.checked)}
                />
                failed
              </label>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={includeCancelled}
                  onChange={(e) => setIncludeCancelled(e.target.checked)}
                />
                cancelled
              </label>
            </div>
            <div>
              <Label className="text-xs">agentId (optional)</Label>
              <Input
                type="text"
                value={agentIdInput}
                onChange={(e) => setAgentIdInput(e.target.value)}
                placeholder="e.g. 42"
              />
            </div>
          </div>
          <Button
            size="sm"
            disabled={pruneMut.isPending || selectedStatuses.length === 0}
            onClick={() => {
              if (selectedStatuses.length === 0) return;
              const agentIds = parseIdList(agentIdInput);
              const statuses =
                selectedStatuses.length === 3
                  ? "all terminal statuses"
                  : selectedStatuses.join(", ");
              if (
                window.confirm(
                  `Delete simulation runs older than ${parsedDays} days (${statuses}${agentIds ? `; agentId=${agentIds.join(",")}` : ""})?`,
                )
              ) {
                pruneMut.mutate({
                  retentionDays: parsedDays,
                  statuses: selectedStatuses,
                  agentId:
                    agentIds && agentIds.length === 1
                      ? agentIds[0]
                      : agentIds,
                });
              }
            }}
          >
            {pruneMut.isPending ? "Sweeping…" : "Run sweep now"}
          </Button>
          {manualResult ? (
            <div className="rounded border border-zinc-800 p-3 text-xs space-y-1">
              <div className="text-zinc-400 uppercase">Last manual run</div>
              <div>runs deleted: {manualResult.deletedRunsCount}</div>
              <div>steps deleted: {manualResult.deletedStepsCount}</div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Test Runs Retention (Phase 22 follow-up #656) ─────────────────────
//
// Operator UI for the test-runs retention mini-arc (#653 prune
// + #654 cron + #655 tRPC + #656 UI). 9th slot in the daily-sweep
// ladder (11:00 UTC). Sweeps `ags_test_runs` + cascades
// `ags_test_run_results`. Mirrors SimulationRunsRetentionPanel
// shape; only the suiteId vs scenarioId filter differs.

function TestRunsRetentionPanel() {
  const statusQuery = trpc.agentStudio.testing.getRetentionCronStatus.useQuery(
    undefined,
    { refetchInterval: 30_000 },
  );
  const [retentionDays, setRetentionDays] = useState("30");
  const [includePassed, setIncludePassed] = useState(true);
  const [includeFailed, setIncludeFailed] = useState(true);
  const [includeCancelled, setIncludeCancelled] = useState(true);
  const [agentIdInput, setAgentIdInput] = useState("");
  const [suiteIdInput, setSuiteIdInput] = useState("");
  const [manualResult, setManualResult] = useState<{
    deletedRunsCount: number;
    deletedResultsCount: number;
  } | null>(null);

  const pruneMut = trpc.agentStudio.testing.pruneRetention.useMutation({
    onSuccess: (data) => {
      setManualResult({
        deletedRunsCount: data.deletedRunsCount,
        deletedResultsCount: data.deletedResultsCount,
      });
      toast.success(
        `Test runs sweep complete — ${data.deletedRunsCount} run(s), ${data.deletedResultsCount} result(s) deleted`,
      );
      void statusQuery.refetch();
    },
    onError: (err) => toast.error(`Sweep failed: ${err.message ?? "unknown"}`),
  });

  const parsedDays = Math.max(1, parseInt(retentionDays, 10) || 30);
  const status = statusQuery.data;

  const selectedStatuses: ("passed" | "failed" | "cancelled")[] = [];
  if (includePassed) selectedStatuses.push("passed");
  if (includeFailed) selectedStatuses.push("failed");
  if (includeCancelled) selectedStatuses.push("cancelled");

  function parseIdList(raw: string): number[] | undefined {
    const trimmed = raw.trim();
    if (trimmed.length === 0) return undefined;
    const parts = trimmed
      .split(/[\s,]+/)
      .map((s) => parseInt(s, 10))
      .filter((n) => Number.isFinite(n) && n > 0);
    return parts.length > 0 ? parts : undefined;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <SectionLabel>Test runs retention cron</SectionLabel>
            {statusQuery.isLoading ? (
              <Badge variant="secondary">loading</Badge>
            ) : status?.lastError ? (
              <Badge variant="destructive">error</Badge>
            ) : status?.lastRunAt ? (
              <Badge>healthy</Badge>
            ) : (
              <Badge variant="secondary">never run</Badge>
            )}
          </div>
          <div className="text-xs text-zinc-400">
            Default: daily 11:00 UTC (env:
            AGS_TEST_RUNS_RETENTION_CRON_EXPR /
            AGS_TEST_RUNS_RETENTION_DAYS). Sweeps `ags_test_runs` +
            cascades `ags_test_run_results`. 9th slot in the
            daily-sweep ladder.
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded border border-zinc-800 p-3">
              <div className="text-xs text-zinc-400 uppercase">last run</div>
              <div className="text-lg font-semibold">
                {formatRelative(status?.lastRunAt)}
              </div>
            </div>
            <div className="rounded border border-zinc-800 p-3">
              <div className="text-xs text-zinc-400 uppercase">runs deleted</div>
              <div className="text-lg font-semibold">
                {status?.lastResult
                  ? status.lastResult.deletedRunsCount
                  : "—"}
              </div>
            </div>
            <div className="rounded border border-zinc-800 p-3">
              <div className="text-xs text-zinc-400 uppercase">
                results deleted
              </div>
              <div className="text-lg font-semibold">
                {status?.lastResult
                  ? status.lastResult.deletedResultsCount
                  : "—"}
              </div>
            </div>
          </div>
          {status?.lastError ? (
            <div className="rounded border border-red-900 bg-red-950/40 p-3 text-xs text-red-300">
              <div className="uppercase tracking-wide mb-1">last error</div>
              {status.lastError}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 space-y-3">
          <SectionLabel>Manual sweep</SectionLabel>
          <div className="text-xs text-zinc-400">
            `queued` + `running` are never swept — those are in-flight
            runs. Pick which terminal statuses to delete.
          </div>
          <div className="space-y-2">
            <div>
              <Label className="text-xs">retentionDays</Label>
              <Input
                type="number"
                value={retentionDays}
                onChange={(e) => setRetentionDays(e.target.value)}
                min={1}
                max={3650}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">statuses</Label>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={includePassed}
                  onChange={(e) => setIncludePassed(e.target.checked)}
                />
                passed
              </label>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={includeFailed}
                  onChange={(e) => setIncludeFailed(e.target.checked)}
                />
                failed
              </label>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={includeCancelled}
                  onChange={(e) => setIncludeCancelled(e.target.checked)}
                />
                cancelled
              </label>
            </div>
            <div>
              <Label className="text-xs">agentId (optional)</Label>
              <Input
                type="text"
                value={agentIdInput}
                onChange={(e) => setAgentIdInput(e.target.value)}
                placeholder="e.g. 42"
              />
            </div>
            <div>
              <Label className="text-xs">suiteId (optional)</Label>
              <Input
                type="text"
                value={suiteIdInput}
                onChange={(e) => setSuiteIdInput(e.target.value)}
                placeholder="e.g. 99"
              />
            </div>
          </div>
          <Button
            size="sm"
            disabled={pruneMut.isPending || selectedStatuses.length === 0}
            onClick={() => {
              if (selectedStatuses.length === 0) return;
              const agentIds = parseIdList(agentIdInput);
              const suiteIds = parseIdList(suiteIdInput);
              const statuses =
                selectedStatuses.length === 3
                  ? "all terminal statuses"
                  : selectedStatuses.join(", ");
              const scopeBits: string[] = [];
              if (agentIds) scopeBits.push(`agentId=${agentIds.join(",")}`);
              if (suiteIds) scopeBits.push(`suiteId=${suiteIds.join(",")}`);
              const scope =
                scopeBits.length > 0 ? `; ${scopeBits.join("; ")}` : "";
              if (
                window.confirm(
                  `Delete test runs older than ${parsedDays} days (${statuses}${scope})?`,
                )
              ) {
                pruneMut.mutate({
                  retentionDays: parsedDays,
                  statuses: selectedStatuses,
                  agentId:
                    agentIds && agentIds.length === 1
                      ? agentIds[0]
                      : agentIds,
                  suiteId:
                    suiteIds && suiteIds.length === 1
                      ? suiteIds[0]
                      : suiteIds,
                });
              }
            }}
          >
            {pruneMut.isPending ? "Sweeping…" : "Run sweep now"}
          </Button>
          {manualResult ? (
            <div className="rounded border border-zinc-800 p-3 text-xs space-y-1">
              <div className="text-zinc-400 uppercase">Last manual run</div>
              <div>runs deleted: {manualResult.deletedRunsCount}</div>
              <div>results deleted: {manualResult.deletedResultsCount}</div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Graph Quality Scans Retention (Phase 22 follow-up #660) ──────────
//
// Operator UI for the graph-quality-scans retention mini-arc (#657
// prune + #658 cron + #659 tRPC + #660 UI). 10th slot in the
// daily-sweep ladder (12:00 UTC). Sweeps `ags_graph_quality_scans`
// + cascades `ags_graph_quality_findings`.

function GraphQualityScansRetentionPanel() {
  const statusQuery =
    trpc.agentStudio.graphQuality.getScansRetentionCronStatus.useQuery(
      undefined,
      { refetchInterval: 30_000 },
    );
  const [retentionDays, setRetentionDays] = useState("30");
  const [includeCompleted, setIncludeCompleted] = useState(true);
  const [includeFailed, setIncludeFailed] = useState(true);
  const [includeCancelled, setIncludeCancelled] = useState(true);
  const [scanKindInput, setScanKindInput] = useState("");
  const [scopeInput, setScopeInput] = useState("");
  const [manualResult, setManualResult] = useState<{
    deletedScansCount: number;
    deletedFindingsCount: number;
  } | null>(null);

  const pruneMut =
    trpc.agentStudio.graphQuality.pruneScansRetention.useMutation({
      onSuccess: (data) => {
        setManualResult({
          deletedScansCount: data.deletedScansCount,
          deletedFindingsCount: data.deletedFindingsCount,
        });
        toast.success(
          `Graph quality scans sweep complete — ${data.deletedScansCount} scan(s), ${data.deletedFindingsCount} finding(s) deleted`,
        );
        void statusQuery.refetch();
      },
      onError: (err) =>
        toast.error(`Sweep failed: ${err.message ?? "unknown"}`),
    });

  const parsedDays = Math.max(1, parseInt(retentionDays, 10) || 30);
  const status = statusQuery.data;

  const selectedStatuses: ("completed" | "failed" | "cancelled")[] = [];
  if (includeCompleted) selectedStatuses.push("completed");
  if (includeFailed) selectedStatuses.push("failed");
  if (includeCancelled) selectedStatuses.push("cancelled");

  function parseStringList(raw: string): string[] | undefined {
    const trimmed = raw.trim();
    if (trimmed.length === 0) return undefined;
    const parts = trimmed
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    return parts.length > 0 ? parts : undefined;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <SectionLabel>Graph quality scans retention cron</SectionLabel>
            {statusQuery.isLoading ? (
              <Badge variant="secondary">loading</Badge>
            ) : status?.lastError ? (
              <Badge variant="destructive">error</Badge>
            ) : status?.lastRunAt ? (
              <Badge>healthy</Badge>
            ) : (
              <Badge variant="secondary">never run</Badge>
            )}
          </div>
          <div className="text-xs text-zinc-400">
            Default: daily 12:00 UTC (env:
            AGS_GRAPH_QUALITY_SCANS_RETENTION_CRON_EXPR /
            AGS_GRAPH_QUALITY_SCANS_RETENTION_DAYS). Sweeps
            `ags_graph_quality_scans` + cascades
            `ags_graph_quality_findings`. 10th slot in the daily-sweep
            ladder.
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded border border-zinc-800 p-3">
              <div className="text-xs text-zinc-400 uppercase">last run</div>
              <div className="text-lg font-semibold">
                {formatRelative(status?.lastRunAt)}
              </div>
            </div>
            <div className="rounded border border-zinc-800 p-3">
              <div className="text-xs text-zinc-400 uppercase">scans deleted</div>
              <div className="text-lg font-semibold">
                {status?.lastResult
                  ? status.lastResult.deletedScansCount
                  : "—"}
              </div>
            </div>
            <div className="rounded border border-zinc-800 p-3">
              <div className="text-xs text-zinc-400 uppercase">
                findings deleted
              </div>
              <div className="text-lg font-semibold">
                {status?.lastResult
                  ? status.lastResult.deletedFindingsCount
                  : "—"}
              </div>
            </div>
          </div>
          {status?.lastError ? (
            <div className="rounded border border-red-900 bg-red-950/40 p-3 text-xs text-red-300">
              <div className="uppercase tracking-wide mb-1">last error</div>
              {status.lastError}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 space-y-3">
          <SectionLabel>Manual sweep</SectionLabel>
          <div className="text-xs text-zinc-400">
            `pending` + `running` are never swept — those are
            in-flight scans. Optional `scanKind` / `scope` CSVs scope
            the sweep to specific scanners or workspaces.
          </div>
          <div className="space-y-2">
            <div>
              <Label className="text-xs">retentionDays</Label>
              <Input
                type="number"
                value={retentionDays}
                onChange={(e) => setRetentionDays(e.target.value)}
                min={1}
                max={3650}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">statuses</Label>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={includeCompleted}
                  onChange={(e) => setIncludeCompleted(e.target.checked)}
                />
                completed
              </label>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={includeFailed}
                  onChange={(e) => setIncludeFailed(e.target.checked)}
                />
                failed
              </label>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={includeCancelled}
                  onChange={(e) => setIncludeCancelled(e.target.checked)}
                />
                cancelled
              </label>
            </div>
            <div>
              <Label className="text-xs">scanKind (optional)</Label>
              <Input
                type="text"
                value={scanKindInput}
                onChange={(e) => setScanKindInput(e.target.value)}
                placeholder="e.g. orphan-detector, broken-citation-detector"
              />
            </div>
            <div>
              <Label className="text-xs">scope (optional)</Label>
              <Input
                type="text"
                value={scopeInput}
                onChange={(e) => setScopeInput(e.target.value)}
                placeholder="e.g. workspace:11"
              />
            </div>
          </div>
          <Button
            size="sm"
            disabled={pruneMut.isPending || selectedStatuses.length === 0}
            onClick={() => {
              if (selectedStatuses.length === 0) return;
              const scanKinds = parseStringList(scanKindInput);
              const scopes = parseStringList(scopeInput);
              const statuses =
                selectedStatuses.length === 3
                  ? "all terminal statuses"
                  : selectedStatuses.join(", ");
              const scopeBits: string[] = [];
              if (scanKinds)
                scopeBits.push(`scanKind=${scanKinds.join(",")}`);
              if (scopes) scopeBits.push(`scope=${scopes.join(",")}`);
              const scopeMsg =
                scopeBits.length > 0 ? `; ${scopeBits.join("; ")}` : "";
              if (
                window.confirm(
                  `Delete graph quality scans older than ${parsedDays} days (${statuses}${scopeMsg})?`,
                )
              ) {
                pruneMut.mutate({
                  retentionDays: parsedDays,
                  statuses: selectedStatuses,
                  scanKind:
                    scanKinds && scanKinds.length === 1
                      ? scanKinds[0]
                      : scanKinds,
                  scope:
                    scopes && scopes.length === 1 ? scopes[0] : scopes,
                });
              }
            }}
          >
            {pruneMut.isPending ? "Sweeping…" : "Run sweep now"}
          </Button>
          {manualResult ? (
            <div className="rounded border border-zinc-800 p-3 text-xs space-y-1">
              <div className="text-zinc-400 uppercase">Last manual run</div>
              <div>scans deleted: {manualResult.deletedScansCount}</div>
              <div>findings deleted: {manualResult.deletedFindingsCount}</div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Graph Correction Proposals Retention (Phase 22 follow-up #664) ────
//
// Operator UI for the graph-correction-proposals retention mini-arc
// (#661 prune + #662 cron + #663 tRPC + #664 UI). 11th slot in the
// daily-sweep ladder (13:00 UTC). Sweeps
// `ags_graph_correction_proposals` + cascades both
// `ags_graph_correction_decisions` and
// `ags_graph_correction_audit_events` (both FK NO ACTION, parallel
// children-first deletion).

function GraphCorrectionProposalsRetentionPanel() {
  const statusQuery =
    trpc.agentStudio.graphCorrection.getProposalsRetentionCronStatus.useQuery(
      undefined,
      { refetchInterval: 30_000 },
    );
  const [retentionDays, setRetentionDays] = useState("30");
  const [includeApproved, setIncludeApproved] = useState(true);
  const [includeRejected, setIncludeRejected] = useState(true);
  const [includeApplied, setIncludeApplied] = useState(true);
  const [includeSuperseded, setIncludeSuperseded] = useState(true);
  const [proposalKindInput, setProposalKindInput] = useState("");
  const [targetTypeKeyInput, setTargetTypeKeyInput] = useState("");
  const [manualResult, setManualResult] = useState<{
    deletedProposalsCount: number;
    deletedDecisionsCount: number;
    deletedAuditEventsCount: number;
  } | null>(null);

  const pruneMut =
    trpc.agentStudio.graphCorrection.pruneProposalsRetention.useMutation({
      onSuccess: (data) => {
        setManualResult({
          deletedProposalsCount: data.deletedProposalsCount,
          deletedDecisionsCount: data.deletedDecisionsCount,
          deletedAuditEventsCount: data.deletedAuditEventsCount,
        });
        toast.success(
          `Graph correction proposals sweep complete — ${data.deletedProposalsCount} proposal(s), ${data.deletedDecisionsCount} decision(s), ${data.deletedAuditEventsCount} audit event(s) deleted`,
        );
        void statusQuery.refetch();
      },
      onError: (err) =>
        toast.error(`Sweep failed: ${err.message ?? "unknown"}`),
    });

  const parsedDays = Math.max(1, parseInt(retentionDays, 10) || 30);
  const status = statusQuery.data;

  const selectedStatuses: (
    | "approved"
    | "rejected"
    | "applied"
    | "superseded"
  )[] = [];
  if (includeApproved) selectedStatuses.push("approved");
  if (includeRejected) selectedStatuses.push("rejected");
  if (includeApplied) selectedStatuses.push("applied");
  if (includeSuperseded) selectedStatuses.push("superseded");

  function parseStringList(raw: string): string[] | undefined {
    const trimmed = raw.trim();
    if (trimmed.length === 0) return undefined;
    const parts = trimmed
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    return parts.length > 0 ? parts : undefined;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <SectionLabel>
              Graph correction proposals retention cron
            </SectionLabel>
            {statusQuery.isLoading ? (
              <Badge variant="secondary">loading</Badge>
            ) : status?.lastError ? (
              <Badge variant="destructive">error</Badge>
            ) : status?.lastRunAt ? (
              <Badge>healthy</Badge>
            ) : (
              <Badge variant="secondary">never run</Badge>
            )}
          </div>
          <div className="text-xs text-zinc-400">
            Default: daily 13:00 UTC (env:
            AGS_GRAPH_CORRECTION_PROPOSALS_RETENTION_CRON_EXPR /
            AGS_GRAPH_CORRECTION_PROPOSALS_RETENTION_DAYS). Sweeps
            `ags_graph_correction_proposals` + cascades
            `ags_graph_correction_decisions` and
            `ags_graph_correction_audit_events`. 11th slot in the
            daily-sweep ladder.
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded border border-zinc-800 p-3">
              <div className="text-xs text-zinc-400 uppercase">last run</div>
              <div className="text-lg font-semibold">
                {formatRelative(status?.lastRunAt)}
              </div>
            </div>
            <div className="rounded border border-zinc-800 p-3">
              <div className="text-xs text-zinc-400 uppercase">
                proposals deleted
              </div>
              <div className="text-lg font-semibold">
                {status?.lastResult
                  ? status.lastResult.deletedProposalsCount
                  : "—"}
              </div>
            </div>
            <div className="rounded border border-zinc-800 p-3">
              <div className="text-xs text-zinc-400 uppercase">
                children deleted
              </div>
              <div className="text-lg font-semibold">
                {status?.lastResult
                  ? status.lastResult.deletedDecisionsCount +
                    status.lastResult.deletedAuditEventsCount
                  : "—"}
              </div>
              {status?.lastResult ? (
                <div className="text-xs text-zinc-500 mt-1">
                  decisions {status.lastResult.deletedDecisionsCount} ·
                  audit events {status.lastResult.deletedAuditEventsCount}
                </div>
              ) : null}
            </div>
          </div>
          {status?.lastError ? (
            <div className="rounded border border-red-900 bg-red-950/40 p-3 text-xs text-red-300">
              <div className="uppercase tracking-wide mb-1">last error</div>
              {status.lastError}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 space-y-3">
          <SectionLabel>Manual sweep</SectionLabel>
          <div className="text-xs text-zinc-400">
            `pending` proposals are never swept — those are in-flight.
            Optional `proposalKind` / `targetTypeKey` CSVs scope the
            sweep.
          </div>
          <div className="space-y-2">
            <div>
              <Label className="text-xs">retentionDays</Label>
              <Input
                type="number"
                value={retentionDays}
                onChange={(e) => setRetentionDays(e.target.value)}
                min={1}
                max={3650}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">statuses</Label>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={includeApproved}
                  onChange={(e) => setIncludeApproved(e.target.checked)}
                />
                approved
              </label>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={includeRejected}
                  onChange={(e) => setIncludeRejected(e.target.checked)}
                />
                rejected
              </label>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={includeApplied}
                  onChange={(e) => setIncludeApplied(e.target.checked)}
                />
                applied
              </label>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={includeSuperseded}
                  onChange={(e) => setIncludeSuperseded(e.target.checked)}
                />
                superseded
              </label>
            </div>
            <div>
              <Label className="text-xs">proposalKind (optional)</Label>
              <Input
                type="text"
                value={proposalKindInput}
                onChange={(e) => setProposalKindInput(e.target.value)}
                placeholder="e.g. rename-entity, merge-entities"
              />
            </div>
            <div>
              <Label className="text-xs">targetTypeKey (optional)</Label>
              <Input
                type="text"
                value={targetTypeKeyInput}
                onChange={(e) => setTargetTypeKeyInput(e.target.value)}
                placeholder="e.g. entity, relationship"
              />
            </div>
          </div>
          <Button
            size="sm"
            disabled={pruneMut.isPending || selectedStatuses.length === 0}
            onClick={() => {
              if (selectedStatuses.length === 0) return;
              const kinds = parseStringList(proposalKindInput);
              const targets = parseStringList(targetTypeKeyInput);
              const statuses =
                selectedStatuses.length === 4
                  ? "all terminal statuses"
                  : selectedStatuses.join(", ");
              const scopeBits: string[] = [];
              if (kinds)
                scopeBits.push(`proposalKind=${kinds.join(",")}`);
              if (targets)
                scopeBits.push(`targetTypeKey=${targets.join(",")}`);
              const scopeMsg =
                scopeBits.length > 0 ? `; ${scopeBits.join("; ")}` : "";
              if (
                window.confirm(
                  `Delete graph correction proposals older than ${parsedDays} days (${statuses}${scopeMsg})?`,
                )
              ) {
                pruneMut.mutate({
                  retentionDays: parsedDays,
                  statuses: selectedStatuses,
                  proposalKind:
                    kinds && kinds.length === 1 ? kinds[0] : kinds,
                  targetTypeKey:
                    targets && targets.length === 1
                      ? targets[0]
                      : targets,
                });
              }
            }}
          >
            {pruneMut.isPending ? "Sweeping…" : "Run sweep now"}
          </Button>
          {manualResult ? (
            <div className="rounded border border-zinc-800 p-3 text-xs space-y-1">
              <div className="text-zinc-400 uppercase">Last manual run</div>
              <div>proposals deleted: {manualResult.deletedProposalsCount}</div>
              <div>decisions deleted: {manualResult.deletedDecisionsCount}</div>
              <div>audit events deleted: {manualResult.deletedAuditEventsCount}</div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Graph Quality Agent Runs Retention (Phase 22 follow-up #668) ──────
//
// Operator UI for the graph-quality-agent-runs retention mini-arc
// (#665 prune + #666 cron + #667 tRPC + #668 UI). 12th slot in the
// daily-sweep ladder (14:00 UTC). Single-table — no FK children;
// graph-correction proposals (which this agent emits) have their own
// retention via the #661-#664 mini-arc.

function GraphQualityAgentRunsRetentionPanel() {
  const statusQuery =
    trpc.agentStudio.graphQuality.getAgentRunsRetentionCronStatus.useQuery(
      undefined,
      { refetchInterval: 30_000 },
    );
  const [retentionDays, setRetentionDays] = useState("30");
  const [includeCompleted, setIncludeCompleted] = useState(true);
  const [includeFailed, setIncludeFailed] = useState(true);
  const [agentKeyInput, setAgentKeyInput] = useState("");
  const [manualResult, setManualResult] = useState<{
    deletedAgentRunsCount: number;
  } | null>(null);

  const pruneMut =
    trpc.agentStudio.graphQuality.pruneAgentRunsRetention.useMutation({
      onSuccess: (data) => {
        setManualResult({ deletedAgentRunsCount: data.deletedAgentRunsCount });
        toast.success(
          `Graph quality agent runs sweep complete — ${data.deletedAgentRunsCount} run(s) deleted`,
        );
        void statusQuery.refetch();
      },
      onError: (err) =>
        toast.error(`Sweep failed: ${err.message ?? "unknown"}`),
    });

  const parsedDays = Math.max(1, parseInt(retentionDays, 10) || 30);
  const status = statusQuery.data;

  const selectedStatuses: ("completed" | "failed")[] = [];
  if (includeCompleted) selectedStatuses.push("completed");
  if (includeFailed) selectedStatuses.push("failed");

  function parseStringList(raw: string): string[] | undefined {
    const trimmed = raw.trim();
    if (trimmed.length === 0) return undefined;
    const parts = trimmed
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    return parts.length > 0 ? parts : undefined;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <SectionLabel>Graph quality agent runs retention cron</SectionLabel>
            {statusQuery.isLoading ? (
              <Badge variant="secondary">loading</Badge>
            ) : status?.lastError ? (
              <Badge variant="destructive">error</Badge>
            ) : status?.lastRunAt ? (
              <Badge>healthy</Badge>
            ) : (
              <Badge variant="secondary">never run</Badge>
            )}
          </div>
          <div className="text-xs text-zinc-400">
            Default: daily 14:00 UTC (env:
            AGS_GRAPH_QUALITY_AGENT_RUNS_RETENTION_CRON_EXPR /
            AGS_GRAPH_QUALITY_AGENT_RUNS_RETENTION_DAYS). Sweeps
            `ags_graph_quality_agent_runs` — single table; the
            agent's emitted proposals are retained by the
            graph-correction-proposals mini-arc. 12th slot in the
            daily-sweep ladder.
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded border border-zinc-800 p-3">
              <div className="text-xs text-zinc-400 uppercase">last run</div>
              <div className="text-lg font-semibold">
                {formatRelative(status?.lastRunAt)}
              </div>
            </div>
            <div className="rounded border border-zinc-800 p-3">
              <div className="text-xs text-zinc-400 uppercase">
                agent runs deleted
              </div>
              <div className="text-lg font-semibold">
                {status?.lastResult
                  ? status.lastResult.deletedAgentRunsCount
                  : "—"}
              </div>
            </div>
          </div>
          {status?.lastError ? (
            <div className="rounded border border-red-900 bg-red-950/40 p-3 text-xs text-red-300">
              <div className="uppercase tracking-wide mb-1">last error</div>
              {status.lastError}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 space-y-3">
          <SectionLabel>Manual sweep</SectionLabel>
          <div className="text-xs text-zinc-400">
            `running` agent runs are never swept — those are in-flight.
            Optional `agentKey` CSV scopes the sweep (default agent key
            is `graph_quality_agent`; future sibling agents would share
            this table with different keys).
          </div>
          <div className="space-y-2">
            <div>
              <Label className="text-xs">retentionDays</Label>
              <Input
                type="number"
                value={retentionDays}
                onChange={(e) => setRetentionDays(e.target.value)}
                min={1}
                max={3650}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">statuses</Label>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={includeCompleted}
                  onChange={(e) => setIncludeCompleted(e.target.checked)}
                />
                completed
              </label>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={includeFailed}
                  onChange={(e) => setIncludeFailed(e.target.checked)}
                />
                failed
              </label>
            </div>
            <div>
              <Label className="text-xs">agentKey (optional)</Label>
              <Input
                type="text"
                value={agentKeyInput}
                onChange={(e) => setAgentKeyInput(e.target.value)}
                placeholder="e.g. graph_quality_agent"
              />
            </div>
          </div>
          <Button
            size="sm"
            disabled={pruneMut.isPending || selectedStatuses.length === 0}
            onClick={() => {
              if (selectedStatuses.length === 0) return;
              const agents = parseStringList(agentKeyInput);
              const statuses =
                selectedStatuses.length === 2
                  ? "all terminal statuses"
                  : selectedStatuses.join(", ");
              const scopeMsg = agents
                ? `; agentKey=${agents.join(",")}`
                : "";
              if (
                window.confirm(
                  `Delete graph quality agent runs older than ${parsedDays} days (${statuses}${scopeMsg})?`,
                )
              ) {
                pruneMut.mutate({
                  retentionDays: parsedDays,
                  statuses: selectedStatuses,
                  agentKey:
                    agents && agents.length === 1 ? agents[0] : agents,
                });
              }
            }}
          >
            {pruneMut.isPending ? "Sweeping…" : "Run sweep now"}
          </Button>
          {manualResult ? (
            <div className="rounded border border-zinc-800 p-3 text-xs space-y-1">
              <div className="text-zinc-400 uppercase">Last manual run</div>
              <div>agent runs deleted: {manualResult.deletedAgentRunsCount}</div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Ingestion Jobs Retention (Phase 22 follow-up #672) ────────────────
//
// Operator UI for the ingestion-jobs retention mini-arc
// (#669 prune + #670 cron + #671 tRPC + #672 UI). 13th slot in the
// daily-sweep ladder (15:00 UTC). Single-table — agsIngestionArtifacts
// is a SIBLING (compliance-adjacent, out of scope) per the #669
// doc-block.

function IngestionJobsRetentionPanel() {
  const statusQuery =
    trpc.agentStudio.ingestion.getJobsRetentionCronStatus.useQuery(
      undefined,
      { refetchInterval: 30_000 },
    );
  const [retentionDays, setRetentionDays] = useState("30");
  const [includeSucceeded, setIncludeSucceeded] = useState(true);
  const [includeFailed, setIncludeFailed] = useState(true);
  const [includeUnsupported, setIncludeUnsupported] = useState(true);
  const [workspaceIdInput, setWorkspaceIdInput] = useState("");
  const [connectorKeyInput, setConnectorKeyInput] = useState("");
  const [manualResult, setManualResult] = useState<{
    deletedJobsCount: number;
  } | null>(null);

  const pruneMut = trpc.agentStudio.ingestion.pruneJobsRetention.useMutation({
    onSuccess: (data) => {
      setManualResult({ deletedJobsCount: data.deletedJobsCount });
      toast.success(
        `Ingestion jobs sweep complete — ${data.deletedJobsCount} job(s) deleted`,
      );
      void statusQuery.refetch();
    },
    onError: (err) => toast.error(`Sweep failed: ${err.message ?? "unknown"}`),
  });

  const parsedDays = Math.max(1, parseInt(retentionDays, 10) || 30);
  const status = statusQuery.data;

  const selectedStatuses: (
    | "succeeded"
    | "failed"
    | "unsupported_type"
  )[] = [];
  if (includeSucceeded) selectedStatuses.push("succeeded");
  if (includeFailed) selectedStatuses.push("failed");
  if (includeUnsupported) selectedStatuses.push("unsupported_type");

  function parseStringList(raw: string): string[] | undefined {
    const trimmed = raw.trim();
    if (trimmed.length === 0) return undefined;
    const parts = trimmed
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    return parts.length > 0 ? parts : undefined;
  }

  function parseNumberList(raw: string): number[] | undefined {
    const parts = parseStringList(raw);
    if (!parts) return undefined;
    const nums = parts
      .map((s) => parseInt(s, 10))
      .filter((n) => Number.isFinite(n) && n > 0);
    return nums.length > 0 ? nums : undefined;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <SectionLabel>Ingestion jobs retention cron</SectionLabel>
            {statusQuery.isLoading ? (
              <Badge variant="secondary">loading</Badge>
            ) : status?.lastError ? (
              <Badge variant="destructive">error</Badge>
            ) : status?.lastRunAt ? (
              <Badge>healthy</Badge>
            ) : (
              <Badge variant="secondary">never run</Badge>
            )}
          </div>
          <div className="text-xs text-zinc-400">
            Default: daily 15:00 UTC (env:
            AGS_INGESTION_JOBS_RETENTION_CRON_EXPR /
            AGS_INGESTION_JOBS_RETENTION_DAYS). Sweeps
            `ags_ingestion_jobs` — the Universal Ingestion lifecycle
            wrapper. Single-table; `ags_ingestion_artifacts` is a
            SIBLING (compliance-adjacent, out of scope). 13th slot
            in the daily-sweep ladder.
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded border border-zinc-800 p-3">
              <div className="text-xs text-zinc-400 uppercase">last run</div>
              <div className="text-lg font-semibold">
                {formatRelative(status?.lastRunAt)}
              </div>
            </div>
            <div className="rounded border border-zinc-800 p-3">
              <div className="text-xs text-zinc-400 uppercase">
                jobs deleted
              </div>
              <div className="text-lg font-semibold">
                {status?.lastResult ? status.lastResult.deletedJobsCount : "—"}
              </div>
            </div>
          </div>
          {status?.lastError ? (
            <div className="rounded border border-red-900 bg-red-950/40 p-3 text-xs text-red-300">
              <div className="uppercase tracking-wide mb-1">last error</div>
              {status.lastError}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 space-y-3">
          <SectionLabel>Manual sweep</SectionLabel>
          <div className="text-xs text-zinc-400">
            `pending` + `running` jobs are never swept — those are
            queued/in-flight. Optional `workspaceId` + `connectorKey`
            CSVs scope the sweep.
          </div>
          <div className="space-y-2">
            <div>
              <Label className="text-xs">retentionDays</Label>
              <Input
                type="number"
                value={retentionDays}
                onChange={(e) => setRetentionDays(e.target.value)}
                min={1}
                max={3650}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">statuses</Label>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={includeSucceeded}
                  onChange={(e) => setIncludeSucceeded(e.target.checked)}
                />
                succeeded
              </label>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={includeFailed}
                  onChange={(e) => setIncludeFailed(e.target.checked)}
                />
                failed
              </label>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={includeUnsupported}
                  onChange={(e) => setIncludeUnsupported(e.target.checked)}
                />
                unsupported_type
              </label>
            </div>
            <div>
              <Label className="text-xs">workspaceId (optional, CSV)</Label>
              <Input
                type="text"
                value={workspaceIdInput}
                onChange={(e) => setWorkspaceIdInput(e.target.value)}
                placeholder="e.g. 11, 22"
              />
            </div>
            <div>
              <Label className="text-xs">
                sourceConnectorKey (optional, CSV)
              </Label>
              <Input
                type="text"
                value={connectorKeyInput}
                onChange={(e) => setConnectorKeyInput(e.target.value)}
                placeholder="e.g. s3, gdrive"
              />
            </div>
          </div>
          <Button
            size="sm"
            disabled={pruneMut.isPending || selectedStatuses.length === 0}
            onClick={() => {
              if (selectedStatuses.length === 0) return;
              const ws = parseNumberList(workspaceIdInput);
              const connectors = parseStringList(connectorKeyInput);
              const statuses =
                selectedStatuses.length === 3
                  ? "all terminal statuses"
                  : selectedStatuses.join(", ");
              const scopeBits: string[] = [];
              if (ws) scopeBits.push(`workspaceId=${ws.join(",")}`);
              if (connectors)
                scopeBits.push(`connectorKey=${connectors.join(",")}`);
              const scopeMsg =
                scopeBits.length > 0 ? `; ${scopeBits.join("; ")}` : "";
              if (
                window.confirm(
                  `Delete ingestion jobs older than ${parsedDays} days (${statuses}${scopeMsg})?`,
                )
              ) {
                pruneMut.mutate({
                  retentionDays: parsedDays,
                  statuses: selectedStatuses,
                  workspaceId: ws && ws.length === 1 ? ws[0] : ws,
                  sourceConnectorKey:
                    connectors && connectors.length === 1
                      ? connectors[0]
                      : connectors,
                });
              }
            }}
          >
            {pruneMut.isPending ? "Sweeping…" : "Run sweep now"}
          </Button>
          {manualResult ? (
            <div className="rounded border border-zinc-800 p-3 text-xs space-y-1">
              <div className="text-zinc-400 uppercase">Last manual run</div>
              <div>jobs deleted: {manualResult.deletedJobsCount}</div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Graph Change Proposals Retention (Phase 22 follow-up #676) ────────
//
// Operator UI for the graph-change-proposals retention mini-arc
// (#673 prune + #674 cron + #675 tRPC + #676 UI). 14th slot in the
// daily-sweep ladder (16:00 UTC). 4-table cascade: parent
// ags_graph_change_proposals + 3 NO-ACTION-FK children (items +
// decisions + audit_events).

function GraphChangeProposalsRetentionPanel() {
  const statusQuery =
    trpc.agentStudio.graphChange.getProposalsRetentionCronStatus.useQuery(
      undefined,
      { refetchInterval: 30_000 },
    );
  const [retentionDays, setRetentionDays] = useState("30");
  const [includeApproved, setIncludeApproved] = useState(true);
  const [includeRejected, setIncludeRejected] = useState(true);
  const [includeWithdrawn, setIncludeWithdrawn] = useState(true);
  const [proposalKindInput, setProposalKindInput] = useState("");
  const [manualResult, setManualResult] = useState<{
    deletedProposalsCount: number;
    deletedItemsCount: number;
    deletedDecisionsCount: number;
    deletedAuditEventsCount: number;
  } | null>(null);

  const pruneMut =
    trpc.agentStudio.graphChange.pruneProposalsRetention.useMutation({
      onSuccess: (data) => {
        setManualResult({
          deletedProposalsCount: data.deletedProposalsCount,
          deletedItemsCount: data.deletedItemsCount,
          deletedDecisionsCount: data.deletedDecisionsCount,
          deletedAuditEventsCount: data.deletedAuditEventsCount,
        });
        toast.success(
          `Graph change proposals sweep complete — ${data.deletedProposalsCount} proposal(s), ${data.deletedItemsCount} item(s), ${data.deletedDecisionsCount} decision(s), ${data.deletedAuditEventsCount} audit event(s) deleted`,
        );
        void statusQuery.refetch();
      },
      onError: (err) =>
        toast.error(`Sweep failed: ${err.message ?? "unknown"}`),
    });

  const parsedDays = Math.max(1, parseInt(retentionDays, 10) || 30);
  const status = statusQuery.data;

  const selectedStatuses: ("approved" | "rejected" | "withdrawn")[] = [];
  if (includeApproved) selectedStatuses.push("approved");
  if (includeRejected) selectedStatuses.push("rejected");
  if (includeWithdrawn) selectedStatuses.push("withdrawn");

  function parseStringList(raw: string): string[] | undefined {
    const trimmed = raw.trim();
    if (trimmed.length === 0) return undefined;
    const parts = trimmed
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    return parts.length > 0 ? parts : undefined;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <SectionLabel>
              Graph change proposals retention cron
            </SectionLabel>
            {statusQuery.isLoading ? (
              <Badge variant="secondary">loading</Badge>
            ) : status?.lastError ? (
              <Badge variant="destructive">error</Badge>
            ) : status?.lastRunAt ? (
              <Badge>healthy</Badge>
            ) : (
              <Badge variant="secondary">never run</Badge>
            )}
          </div>
          <div className="text-xs text-zinc-400">
            Default: daily 16:00 UTC (env:
            AGS_GRAPH_CHANGE_PROPOSALS_RETENTION_CRON_EXPR /
            AGS_GRAPH_CHANGE_PROPOSALS_RETENTION_DAYS). Sweeps
            `ags_graph_change_proposals` + cascades
            `ags_graph_change_proposal_items`,
            `ags_graph_change_decisions`, and
            `ags_graph_change_audit_events`. 14th slot in the
            daily-sweep ladder.
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded border border-zinc-800 p-3">
              <div className="text-xs text-zinc-400 uppercase">last run</div>
              <div className="text-lg font-semibold">
                {formatRelative(status?.lastRunAt)}
              </div>
            </div>
            <div className="rounded border border-zinc-800 p-3">
              <div className="text-xs text-zinc-400 uppercase">
                proposals deleted
              </div>
              <div className="text-lg font-semibold">
                {status?.lastResult
                  ? status.lastResult.deletedProposalsCount
                  : "—"}
              </div>
            </div>
            <div className="rounded border border-zinc-800 p-3">
              <div className="text-xs text-zinc-400 uppercase">
                children deleted
              </div>
              <div className="text-lg font-semibold">
                {status?.lastResult
                  ? status.lastResult.deletedItemsCount +
                    status.lastResult.deletedDecisionsCount +
                    status.lastResult.deletedAuditEventsCount
                  : "—"}
              </div>
              {status?.lastResult ? (
                <div className="text-xs text-zinc-500 mt-1">
                  items {status.lastResult.deletedItemsCount} · decisions{" "}
                  {status.lastResult.deletedDecisionsCount} · audit events{" "}
                  {status.lastResult.deletedAuditEventsCount}
                </div>
              ) : null}
            </div>
          </div>
          {status?.lastError ? (
            <div className="rounded border border-red-900 bg-red-950/40 p-3 text-xs text-red-300">
              <div className="uppercase tracking-wide mb-1">last error</div>
              {status.lastError}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 space-y-3">
          <SectionLabel>Manual sweep</SectionLabel>
          <div className="text-xs text-zinc-400">
            `pending` / `validating` / `in_review` proposals are never
            swept — those are in-flight. Optional `proposalKind` CSV
            scopes the sweep (e.g. `entity_merge`, `entity_split`,
            `projection_correction`).
          </div>
          <div className="space-y-2">
            <div>
              <Label className="text-xs">retentionDays</Label>
              <Input
                type="number"
                value={retentionDays}
                onChange={(e) => setRetentionDays(e.target.value)}
                min={1}
                max={3650}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">statuses</Label>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={includeApproved}
                  onChange={(e) => setIncludeApproved(e.target.checked)}
                />
                approved
              </label>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={includeRejected}
                  onChange={(e) => setIncludeRejected(e.target.checked)}
                />
                rejected
              </label>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={includeWithdrawn}
                  onChange={(e) => setIncludeWithdrawn(e.target.checked)}
                />
                withdrawn
              </label>
            </div>
            <div>
              <Label className="text-xs">proposalKind (optional, CSV)</Label>
              <Input
                type="text"
                value={proposalKindInput}
                onChange={(e) => setProposalKindInput(e.target.value)}
                placeholder="e.g. entity_merge, projection_correction"
              />
            </div>
          </div>
          <Button
            size="sm"
            disabled={pruneMut.isPending || selectedStatuses.length === 0}
            onClick={() => {
              if (selectedStatuses.length === 0) return;
              const kinds = parseStringList(proposalKindInput);
              const statuses =
                selectedStatuses.length === 3
                  ? "all terminal statuses"
                  : selectedStatuses.join(", ");
              const scopeMsg = kinds
                ? `; proposalKind=${kinds.join(",")}`
                : "";
              if (
                window.confirm(
                  `Delete graph change proposals older than ${parsedDays} days (${statuses}${scopeMsg})?`,
                )
              ) {
                pruneMut.mutate({
                  retentionDays: parsedDays,
                  statuses: selectedStatuses,
                  proposalKind:
                    kinds && kinds.length === 1 ? kinds[0] : kinds,
                });
              }
            }}
          >
            {pruneMut.isPending ? "Sweeping…" : "Run sweep now"}
          </Button>
          {manualResult ? (
            <div className="rounded border border-zinc-800 p-3 text-xs space-y-1">
              <div className="text-zinc-400 uppercase">Last manual run</div>
              <div>proposals deleted: {manualResult.deletedProposalsCount}</div>
              <div>items deleted: {manualResult.deletedItemsCount}</div>
              <div>decisions deleted: {manualResult.deletedDecisionsCount}</div>
              <div>audit events deleted: {manualResult.deletedAuditEventsCount}</div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Graph Agent Runtime Traces Retention (Phase 22 follow-up #679) ────
//
// Operator UI for the graph-agent runtime-traces retention mini-arc
// (#677 cron + #678 cron-status tRPC + #679 UI). 15th slot in the
// daily-sweep ladder (17:00 UTC). 90-day default retention (matches
// the existing pruneRuntimeTraces service's DEFAULT_HORIZON_MS).
//
// Different shape from prior panels: the prune mutation is the
// EXISTING `graphAgent.pruneTraces` (Phase 14 §3) — takes
// `olderThanMs` rather than `retentionDays`. The UI converts: user
// enters retentionDays in the input, the mutation receives ms.
// 4-table cascade: skillRuntimeUsages + queryTemplateRuns +
// graphAgentSteps + graphAgentRuns.

function GraphAgentRuntimeTracesRetentionPanel() {
  const statusQuery =
    trpc.agentStudio.graphAgent.getRuntimeTracesRetentionCronStatus.useQuery(
      undefined,
      { refetchInterval: 30_000 },
    );
  const [retentionDays, setRetentionDays] = useState("90");
  const [manualResult, setManualResult] = useState<{
    graphSkillRuntimeUsages: number;
    queryTemplateRuns: number;
    graphAgentSteps: number;
    graphAgentRuns: number;
  } | null>(null);

  const pruneMut = trpc.agentStudio.graphAgent.pruneTraces.useMutation({
    onSuccess: (data) => {
      if (data) {
        setManualResult({
          graphSkillRuntimeUsages: data.graphSkillRuntimeUsages,
          queryTemplateRuns: data.queryTemplateRuns,
          graphAgentSteps: data.graphAgentSteps,
          graphAgentRuns: data.graphAgentRuns,
        });
        const total =
          data.graphSkillRuntimeUsages +
          data.queryTemplateRuns +
          data.graphAgentSteps +
          data.graphAgentRuns;
        toast.success(
          `Graph agent runtime traces sweep complete — ${total} row(s) deleted across 4 tables`,
        );
        void statusQuery.refetch();
      }
    },
    onError: (err) => toast.error(`Sweep failed: ${err.message ?? "unknown"}`),
  });

  const parsedDays = Math.max(1, parseInt(retentionDays, 10) || 90);
  const status = statusQuery.data;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <SectionLabel>
              Graph agent runtime traces retention cron
            </SectionLabel>
            {statusQuery.isLoading ? (
              <Badge variant="secondary">loading</Badge>
            ) : status?.lastError ? (
              <Badge variant="destructive">error</Badge>
            ) : status?.lastRunAt ? (
              <Badge>healthy</Badge>
            ) : (
              <Badge variant="secondary">never run</Badge>
            )}
          </div>
          <div className="text-xs text-zinc-400">
            Default: daily 17:00 UTC, 90-day window (env:
            AGS_GRAPH_AGENT_RUNTIME_TRACES_RETENTION_CRON_EXPR /
            AGS_GRAPH_AGENT_RUNTIME_TRACES_RETENTION_DAYS). Sweeps 4
            trace-ledger tables (children-first):
            `ags_graph_skill_runtime_usages`,
            `ags_query_template_runs`, `ags_graph_agent_steps`,
            `ags_graph_agent_runs`. 15th slot in the daily-sweep
            ladder. Longer default than other retention crons
            because decision-trace ledgers have longer forensic
            value than per-tool-call traces.
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded border border-zinc-800 p-3">
              <div className="text-xs text-zinc-400 uppercase">last run</div>
              <div className="text-lg font-semibold">
                {formatRelative(status?.lastRunAt)}
              </div>
            </div>
            <div className="rounded border border-zinc-800 p-3">
              <div className="text-xs text-zinc-400 uppercase">
                rows deleted (last sweep)
              </div>
              <div className="text-lg font-semibold">
                {status?.lastResult
                  ? status.lastResult.graphSkillRuntimeUsages +
                    status.lastResult.queryTemplateRuns +
                    status.lastResult.graphAgentSteps +
                    status.lastResult.graphAgentRuns
                  : "—"}
              </div>
              {status?.lastResult ? (
                <div className="text-xs text-zinc-500 mt-1">
                  usages {status.lastResult.graphSkillRuntimeUsages} ·
                  queryRuns {status.lastResult.queryTemplateRuns} · steps{" "}
                  {status.lastResult.graphAgentSteps} · runs{" "}
                  {status.lastResult.graphAgentRuns}
                </div>
              ) : null}
            </div>
          </div>
          {status?.lastError ? (
            <div className="rounded border border-red-900 bg-red-950/40 p-3 text-xs text-red-300">
              <div className="uppercase tracking-wide mb-1">last error</div>
              {status.lastError}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 space-y-3">
          <SectionLabel>Manual sweep</SectionLabel>
          <div className="text-xs text-zinc-400">
            Triggers the existing `graphAgent.pruneTraces` mutation
            (Phase 14 §3) with a caller-supplied horizon. Sweeps
            rows whose `createdAt` is older than `now -
            retentionDays`. No status filter — the prune service
            is timestamp-only (the 4 trace tables don't carry
            lifecycle status columns).
          </div>
          <div>
            <Label className="text-xs">retentionDays</Label>
            <Input
              type="number"
              value={retentionDays}
              onChange={(e) => setRetentionDays(e.target.value)}
              min={1}
              max={365}
            />
          </div>
          <Button
            size="sm"
            disabled={pruneMut.isPending}
            onClick={() => {
              if (
                window.confirm(
                  `Delete graph agent runtime traces older than ${parsedDays} days?`,
                )
              ) {
                pruneMut.mutate({
                  olderThanMs: parsedDays * 86_400_000,
                });
              }
            }}
          >
            {pruneMut.isPending ? "Sweeping…" : "Run sweep now"}
          </Button>
          {manualResult ? (
            <div className="rounded border border-zinc-800 p-3 text-xs space-y-1">
              <div className="text-zinc-400 uppercase">Last manual run</div>
              <div>
                skill runtime usages deleted: {manualResult.graphSkillRuntimeUsages}
              </div>
              <div>
                query template runs deleted: {manualResult.queryTemplateRuns}
              </div>
              <div>graph agent steps deleted: {manualResult.graphAgentSteps}</div>
              <div>graph agent runs deleted: {manualResult.graphAgentRuns}</div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Approval-lifecycle retention panels ────────────────────────────────────
//
// Three sister panels for the approval-lifecycle retention surface
// (publish-requests / approval-steps / note-promotions). Unlike the
// age-only retention panels above, the manual-sweep result includes
// preservedCount + blockerCounts so operators see WHY rows weren't
// deleted ("oh — 12 are under legal hold").

function PublishRequestsRetentionPanel() {
  const statusQuery =
    trpc.agentStudio.publish.getPublishRequestsRetentionCronStatus.useQuery(
      undefined,
      { refetchInterval: 30_000 },
    );
  const [retentionDays, setRetentionDays] = useState("90");
  const [manualResult, setManualResult] = useState<{
    deletedCount: number;
    preservedCount: number;
    blockerCounts: Record<string, number>;
  } | null>(null);

  const pruneMut =
    trpc.agentStudio.publish.prunePublishRequestsRetention.useMutation({
      onSuccess: (data) => {
        if (data) {
          setManualResult({
            deletedCount: data.deletedCount,
            preservedCount: data.preservedCount,
            blockerCounts: data.blockerCounts as Record<string, number>,
          });
          toast.success(
            `Publish requests sweep complete — ${data.deletedCount} deleted, ${data.preservedCount} preserved`,
          );
          void statusQuery.refetch();
        }
      },
      onError: (err) => toast.error(`Sweep failed: ${err.message ?? "unknown"}`),
    });

  const parsedDays = Math.max(1, parseInt(retentionDays, 10) || 90);
  const status = statusQuery.data;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <SectionLabel>Publish requests retention cron</SectionLabel>
            {statusQuery.isLoading ? (
              <Badge variant="secondary">loading</Badge>
            ) : status?.lastError ? (
              <Badge variant="destructive">error</Badge>
            ) : status?.lastRunAt ? (
              <Badge>healthy</Badge>
            ) : (
              <Badge variant="secondary">never run</Badge>
            )}
          </div>
          <div className="text-xs text-zinc-400">
            Default: daily 18:00 UTC, 90-day window (env:
            AGS_PUBLISH_REQUESTS_RETENTION_CRON_EXPR /
            AGS_PUBLISH_REQUESTS_RETENTION_DAYS). Lifecycle-aware sweep —
            deletes only rows where every retention blocker (active
            release link, holds, etc.) is cleared. 90-day default
            covers two quarterly audit cycles.
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded border border-zinc-800 p-3">
              <div className="text-xs text-zinc-400 uppercase">last run</div>
              <div className="text-lg font-semibold">
                {formatRelative(status?.lastRunAt)}
              </div>
            </div>
            <div className="rounded border border-zinc-800 p-3">
              <div className="text-xs text-zinc-400 uppercase">last sweep</div>
              <div className="text-lg font-semibold">
                {status?.lastResult
                  ? `${status.lastResult.deletedCount} deleted`
                  : "—"}
              </div>
              {status?.lastResult ? (
                <div className="text-xs text-zinc-500 mt-1">
                  preserved {status.lastResult.preservedCount}
                </div>
              ) : null}
            </div>
          </div>
          {status?.lastError ? (
            <div className="rounded border border-red-900 bg-red-950/40 p-3 text-xs text-red-300">
              <div className="uppercase tracking-wide mb-1">last error</div>
              {status.lastError}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 space-y-3">
          <SectionLabel>Manual sweep</SectionLabel>
          <div className="text-xs text-zinc-400">
            Lifecycle-aware sweep against `ags_publish_requests`. Only
            rows in terminal state with non-null `terminal_at`, no
            active release link, no holds, and past the retention
            window are deleted.
          </div>
          <div>
            <Label className="text-xs">retentionDays</Label>
            <Input
              type="number"
              value={retentionDays}
              onChange={(e) => setRetentionDays(e.target.value)}
              min={1}
              max={3650}
            />
          </div>
          <Button
            size="sm"
            disabled={pruneMut.isPending}
            onClick={() => {
              if (
                window.confirm(
                  `Sweep publish-requests older than ${parsedDays} days (lifecycle-aware)?`,
                )
              ) {
                pruneMut.mutate({ retentionDays: parsedDays });
              }
            }}
          >
            {pruneMut.isPending ? "Sweeping…" : "Run sweep now"}
          </Button>
          {manualResult ? (
            <div className="rounded border border-zinc-800 p-3 text-xs space-y-1">
              <div className="text-zinc-400 uppercase">Last manual run</div>
              <div>deleted: {manualResult.deletedCount}</div>
              <div>preserved: {manualResult.preservedCount}</div>
              {Object.entries(manualResult.blockerCounts).length > 0 ? (
                <div className="text-zinc-500">
                  blockers:{" "}
                  {Object.entries(manualResult.blockerCounts)
                    .map(([k, v]) => `${k.toLowerCase()}=${v}`)
                    .join(", ")}
                </div>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

function ApprovalStepsRetentionPanel() {
  const statusQuery =
    trpc.agentStudio.publish.getApprovalStepsRetentionCronStatus.useQuery(
      undefined,
      { refetchInterval: 30_000 },
    );
  const [retentionDays, setRetentionDays] = useState("90");
  const [manualResult, setManualResult] = useState<{
    deletedCount: number;
    preservedCount: number;
    blockerCounts: Record<string, number>;
  } | null>(null);

  const pruneMut =
    trpc.agentStudio.publish.pruneApprovalStepsRetention.useMutation({
      onSuccess: (data) => {
        if (data) {
          setManualResult({
            deletedCount: data.deletedCount,
            preservedCount: data.preservedCount,
            blockerCounts: data.blockerCounts as Record<string, number>,
          });
          toast.success(
            `Approval steps sweep complete — ${data.deletedCount} deleted, ${data.preservedCount} preserved`,
          );
          void statusQuery.refetch();
        }
      },
      onError: (err) => toast.error(`Sweep failed: ${err.message ?? "unknown"}`),
    });

  const parsedDays = Math.max(1, parseInt(retentionDays, 10) || 90);
  const status = statusQuery.data;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <SectionLabel>Approval steps retention cron</SectionLabel>
            {statusQuery.isLoading ? (
              <Badge variant="secondary">loading</Badge>
            ) : status?.lastError ? (
              <Badge variant="destructive">error</Badge>
            ) : status?.lastRunAt ? (
              <Badge>healthy</Badge>
            ) : (
              <Badge variant="secondary">never run</Badge>
            )}
          </div>
          <div className="text-xs text-zinc-400">
            Default: daily 19:00 UTC, 90-day window (env:
            AGS_APPROVAL_STEPS_RETENTION_CRON_EXPR /
            AGS_APPROVAL_STEPS_RETENTION_DAYS). Parent-lifecycle-aware
            — a step can't be retention-eligible independently of its
            parent publish-request.
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded border border-zinc-800 p-3">
              <div className="text-xs text-zinc-400 uppercase">last run</div>
              <div className="text-lg font-semibold">
                {formatRelative(status?.lastRunAt)}
              </div>
            </div>
            <div className="rounded border border-zinc-800 p-3">
              <div className="text-xs text-zinc-400 uppercase">last sweep</div>
              <div className="text-lg font-semibold">
                {status?.lastResult
                  ? `${status.lastResult.deletedCount} deleted`
                  : "—"}
              </div>
              {status?.lastResult ? (
                <div className="text-xs text-zinc-500 mt-1">
                  preserved {status.lastResult.preservedCount}
                </div>
              ) : null}
            </div>
          </div>
          {status?.lastError ? (
            <div className="rounded border border-red-900 bg-red-950/40 p-3 text-xs text-red-300">
              <div className="uppercase tracking-wide mb-1">last error</div>
              {status.lastError}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 space-y-3">
          <SectionLabel>Manual sweep</SectionLabel>
          <div className="text-xs text-zinc-400">
            Lifecycle-aware sweep against `ags_approval_steps`. Step's
            effective terminal moment is MAX(step.terminal_at,
            parent.terminal_at).
          </div>
          <div>
            <Label className="text-xs">retentionDays</Label>
            <Input
              type="number"
              value={retentionDays}
              onChange={(e) => setRetentionDays(e.target.value)}
              min={1}
              max={3650}
            />
          </div>
          <Button
            size="sm"
            disabled={pruneMut.isPending}
            onClick={() => {
              if (
                window.confirm(
                  `Sweep approval-steps older than ${parsedDays} days (lifecycle-aware)?`,
                )
              ) {
                pruneMut.mutate({ retentionDays: parsedDays });
              }
            }}
          >
            {pruneMut.isPending ? "Sweeping…" : "Run sweep now"}
          </Button>
          {manualResult ? (
            <div className="rounded border border-zinc-800 p-3 text-xs space-y-1">
              <div className="text-zinc-400 uppercase">Last manual run</div>
              <div>deleted: {manualResult.deletedCount}</div>
              <div>preserved: {manualResult.preservedCount}</div>
              {Object.entries(manualResult.blockerCounts).length > 0 ? (
                <div className="text-zinc-500">
                  blockers:{" "}
                  {Object.entries(manualResult.blockerCounts)
                    .map(([k, v]) => `${k.toLowerCase()}=${v}`)
                    .join(", ")}
                </div>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

function NotePromotionsRetentionPanel() {
  const statusQuery =
    trpc.agentStudio.promotion.getRetentionCronStatus.useQuery(undefined, {
      refetchInterval: 30_000,
    });
  const [retentionDays, setRetentionDays] = useState("90");
  const [manualResult, setManualResult] = useState<{
    deletedCount: number;
    preservedCount: number;
    blockerCounts: Record<string, number>;
    cascadeDeletedCounts: {
      versions: number;
      decisions: number;
      auditEvents: number;
    };
  } | null>(null);

  const pruneMut = trpc.agentStudio.promotion.pruneRetention.useMutation({
    onSuccess: (data) => {
      if (data) {
        setManualResult({
          deletedCount: data.deletedCount,
          preservedCount: data.preservedCount,
          blockerCounts: data.blockerCounts as Record<string, number>,
          cascadeDeletedCounts: data.cascadeDeletedCounts,
        });
        toast.success(
          `Note promotions sweep complete — ${data.deletedCount} deleted, ${data.preservedCount} preserved`,
        );
        void statusQuery.refetch();
      }
    },
    onError: (err) => toast.error(`Sweep failed: ${err.message ?? "unknown"}`),
  });

  const parsedDays = Math.max(1, parseInt(retentionDays, 10) || 90);
  const status = statusQuery.data;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <SectionLabel>Note promotions retention cron</SectionLabel>
            {statusQuery.isLoading ? (
              <Badge variant="secondary">loading</Badge>
            ) : status?.lastError ? (
              <Badge variant="destructive">error</Badge>
            ) : status?.lastRunAt ? (
              <Badge>healthy</Badge>
            ) : (
              <Badge variant="secondary">never run</Badge>
            )}
          </div>
          <div className="text-xs text-zinc-400">
            Default: daily 20:00 UTC, 90-day window (env:
            AGS_NOTE_PROMOTIONS_RETENTION_CRON_EXPR /
            AGS_NOTE_PROMOTIONS_RETENTION_DAYS). Cascades child tables
            (versions / decisions / audit_events) children-first. Active
            version (`agsNotePromotionVersions.active=true`) is a
            retention blocker.
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded border border-zinc-800 p-3">
              <div className="text-xs text-zinc-400 uppercase">last run</div>
              <div className="text-lg font-semibold">
                {formatRelative(status?.lastRunAt)}
              </div>
            </div>
            <div className="rounded border border-zinc-800 p-3">
              <div className="text-xs text-zinc-400 uppercase">last sweep</div>
              <div className="text-lg font-semibold">
                {status?.lastResult
                  ? `${status.lastResult.deletedCount} deleted`
                  : "—"}
              </div>
              {status?.lastResult ? (
                <div className="text-xs text-zinc-500 mt-1">
                  preserved {status.lastResult.preservedCount} · cascade v
                  {status.lastResult.cascadeDeletedCounts.versions}/d
                  {status.lastResult.cascadeDeletedCounts.decisions}/a
                  {status.lastResult.cascadeDeletedCounts.auditEvents}
                </div>
              ) : null}
            </div>
          </div>
          {status?.lastError ? (
            <div className="rounded border border-red-900 bg-red-950/40 p-3 text-xs text-red-300">
              <div className="uppercase tracking-wide mb-1">last error</div>
              {status.lastError}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 space-y-3">
          <SectionLabel>Manual sweep</SectionLabel>
          <div className="text-xs text-zinc-400">
            Lifecycle-aware sweep against `ags_note_promotions`. Rolled-
            back promotions are terminal but preserved if a governance-
            review hold exists.
          </div>
          <div>
            <Label className="text-xs">retentionDays</Label>
            <Input
              type="number"
              value={retentionDays}
              onChange={(e) => setRetentionDays(e.target.value)}
              min={1}
              max={3650}
            />
          </div>
          <Button
            size="sm"
            disabled={pruneMut.isPending}
            onClick={() => {
              if (
                window.confirm(
                  `Sweep note-promotions older than ${parsedDays} days (lifecycle-aware, cascades children)?`,
                )
              ) {
                pruneMut.mutate({ retentionDays: parsedDays });
              }
            }}
          >
            {pruneMut.isPending ? "Sweeping…" : "Run sweep now"}
          </Button>
          {manualResult ? (
            <div className="rounded border border-zinc-800 p-3 text-xs space-y-1">
              <div className="text-zinc-400 uppercase">Last manual run</div>
              <div>deleted: {manualResult.deletedCount}</div>
              <div>preserved: {manualResult.preservedCount}</div>
              <div className="text-zinc-500">
                cascade — versions:{" "}
                {manualResult.cascadeDeletedCounts.versions}, decisions:{" "}
                {manualResult.cascadeDeletedCounts.decisions}, audit-events:{" "}
                {manualResult.cascadeDeletedCounts.auditEvents}
              </div>
              {Object.entries(manualResult.blockerCounts).length > 0 ? (
                <div className="text-zinc-500">
                  blockers:{" "}
                  {Object.entries(manualResult.blockerCounts)
                    .map(([k, v]) => `${k.toLowerCase()}=${v}`)
                    .join(", ")}
                </div>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
