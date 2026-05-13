// RacRuntimeTracesRetentionPanel — operator UI for the
// `ags_rac_runtime_traces` retention cron (with cascaded
// `ags_rac_context_blocks`).
//
// Three-cell status grid (last run / traces deleted / blocks
// deleted) + manual sweep with optional workspaceId / agentId
// CSV filters for tenant-scoped sweeps.
//
// Backing cron: env AGS_RAC_RUNTIME_TRACES_RETENTION_CRON_EXPR /
// AGS_RAC_RUNTIME_TRACES_RETENTION_DAYS. Default daily 08:00 UTC.
//
// Originally lived inline in `RetrofitPage.tsx`; extracted as part
// of the strict-audit batch-3 panel cleanup (PR-AT-4, 2026-05-13).

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

function parseIdList(raw: string): number[] | undefined {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return undefined;
  const parts = trimmed
    .split(/[\s,]+/)
    .map((s) => parseInt(s, 10))
    .filter((n) => Number.isFinite(n) && n > 0);
  return parts.length > 0 ? parts : undefined;
}

export function RacRuntimeTracesRetentionPanel() {
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

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <SectionLabel>RAC runtime traces retention cron</SectionLabel>
            <CronStatusBadge
              isLoading={statusQuery.isLoading}
              lastError={status?.lastError}
              lastRunAt={status?.lastRunAt}
            />
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

export default RacRuntimeTracesRetentionPanel;
