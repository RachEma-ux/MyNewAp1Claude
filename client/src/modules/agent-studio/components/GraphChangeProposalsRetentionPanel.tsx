// GraphChangeProposalsRetentionPanel — operator UI for the
// `ags_graph_change_proposals` retention cron + 3-table cascade
// (`ags_graph_change_proposal_items`, `ags_graph_change_decisions`,
// `ags_graph_change_audit_events`).
//
// Three-cell status grid (last run + proposals deleted + children
// deleted with item/decision/audit-event breakdown) + manual sweep
// with 3-checkbox terminal-status selector (approved/rejected/
// withdrawn — pending/validating/in_review never swept) + optional
// proposalKind CSV (e.g. `entity_merge`, `entity_split`,
// `projection_correction`).
//
// Backing cron: env AGS_GRAPH_CHANGE_PROPOSALS_RETENTION_CRON_EXPR /
// AGS_GRAPH_CHANGE_PROPOSALS_RETENTION_DAYS. Default daily 16:00 UTC.
//
// Originally lived inline in `RetrofitPage.tsx`; extracted as part
// of the strict-audit batch-6 panel cleanup (PR-AT-7, 2026-05-13).

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SectionLabel } from "./ui";
import { CronStatusBadge } from "./CronStatusBadge";
import { formatRelative } from "./format-relative";

function parseStringList(raw: string): string[] | undefined {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return undefined;
  const parts = trimmed
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return parts.length > 0 ? parts : undefined;
}

export function GraphChangeProposalsRetentionPanel() {
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

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <SectionLabel>
              Graph change proposals retention cron
            </SectionLabel>
            <CronStatusBadge
              isLoading={statusQuery.isLoading}
              lastError={status?.lastError}
              lastRunAt={status?.lastRunAt}
            />
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
              <div>
                audit events deleted: {manualResult.deletedAuditEventsCount}
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

export default GraphChangeProposalsRetentionPanel;
