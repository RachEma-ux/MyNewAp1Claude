// SimulationRunsRetentionPanel — operator UI for the
// `ags_simulation_runs` retention cron (cascades
// `ags_simulation_run_steps`).
//
// Three-cell status grid (last run / runs deleted / steps deleted)
// + manual sweep with terminal-status checkboxes (passed / failed /
// cancelled — never sweeps queued/running) + optional agentId CSV
// filter.
//
// Backing cron: env AGS_SIMULATION_RUNS_RETENTION_CRON_EXPR /
// AGS_SIMULATION_RUNS_RETENTION_DAYS. Default daily 10:00 UTC.
//
// Originally lived inline in `RetrofitPage.tsx`; extracted as part
// of the strict-audit batch-4 panel cleanup (PR-AT-5, 2026-05-13).

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

export function SimulationRunsRetentionPanel() {
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

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <SectionLabel>Simulation runs retention cron</SectionLabel>
            <CronStatusBadge
              isLoading={statusQuery.isLoading}
              lastError={status?.lastError}
              lastRunAt={status?.lastRunAt}
            />
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

export default SimulationRunsRetentionPanel;
