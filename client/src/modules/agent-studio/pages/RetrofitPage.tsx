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

import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { PageHeader, LoadingState, EmptyState, SectionLabel } from "../components/ui";

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
      </Tabs>
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
          onClick={() =>
            setLicense.mutate({
              workspaceId,
              unitId: unit.id,
              license: licenseInput.trim().length > 0 ? licenseInput.trim() : null,
            })
          }
        >
          {setLicense.isPending ? "…" : "Set license"}
        </Button>
        {piiCount > 0 ? (
          <Button
            size="sm"
            variant="destructive"
            className="h-7"
            disabled={clearPii.isPending}
            onClick={() =>
              clearPii.mutate({ workspaceId, unitId: unit.id })
            }
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
  const list = trpc.agentStudio.toolApprovals.listByDraft.useQuery(
    { agentDraftId: agentDraftId ?? 0, status: "pending", limit: 50 },
    { enabled: agentDraftId !== null },
  );
  const decide = trpc.agentStudio.toolApprovals.decide.useMutation({
    onSuccess: (res) => {
      toast.success(`approval ${res.status}`);
      utils.agentStudio.toolApprovals.listByDraft.invalidate();
    },
    onError: (err) => toast.error(err.message ?? "decide failed"),
  });

  if (agentDraftId === null) return <LoadingState label="Resolving draft…" />;
  if (list.isLoading) return <LoadingState label="Loading approvals…" />;
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
      {rows.map((r) => (
        <ApprovalRow
          key={r.id}
          row={r}
          isDeciding={decide.isPending}
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
        <Textarea
          placeholder="Reason (optional)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          className="text-xs"
        />
        <div className="flex gap-2">
          <Button
            size="sm"
            disabled={isDeciding}
            onClick={() => onDecide("allowed", reason)}
          >
            Allow
          </Button>
          <Button
            size="sm"
            variant="destructive"
            disabled={isDeciding}
            onClick={() => onDecide("denied", reason)}
          >
            Deny
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
