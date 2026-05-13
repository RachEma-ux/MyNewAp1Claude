// RuntimeRunsRetentionPanel — operator UI for the `ags_runtime_runs`
// retention cron.
//
// Renders two side-by-side cards:
//   1. Cron status — last run, last result counts (runs + steps), last
//      error. Powered by `runs.getRetentionCronStatus`.
//   2. Manual sweep — operator-driven prune with retentionDays +
//      optional environment filter. Powered by `runs.pruneRetention`.
//
// Originally lived inline in `RetrofitPage.tsx` (lines 1455+); extracted
// at PR-D of the Native Graph Workspace full-closure mission to enable
// focused unit tests on each rendering branch. Pattern mirrors
// `CronStatusPanel` (PR #722) and `EligibilityExplainer` (PR #708).
//
// Backing cron: 18-slot daily-sweep ladder slot for runtime-runs
// (env: AGS_RUNTIME_RUNS_RETENTION_CRON_EXPR / AGS_RUNTIME_RUNS_RETENTION_DAYS).

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

export function RuntimeRunsRetentionPanel() {
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
            <CronStatusBadge
              isLoading={statusQuery.isLoading}
              lastError={status?.lastError}
              lastRunAt={status?.lastRunAt}
            />
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

export default RuntimeRunsRetentionPanel;
