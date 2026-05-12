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
