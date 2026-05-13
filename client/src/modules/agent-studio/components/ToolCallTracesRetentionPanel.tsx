// ToolCallTracesRetentionPanel — operator UI for the
// `ags_tool_call_traces` retention cron.
//
// Two-card layout: cron status + manual sweep with optional
// "include forensic rows" checkbox (default preserves `error` +
// `blocked` rows).
//
// Backing cron: env AGS_TOOL_CALL_TRACES_RETENTION_CRON_EXPR /
// AGS_TOOL_CALL_TRACES_RETENTION_DAYS. Default daily 05:00 UTC.
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

export function ToolCallTracesRetentionPanel() {
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
            <CronStatusBadge
              isLoading={statusQuery.isLoading}
              lastError={status?.lastError}
              lastRunAt={status?.lastRunAt}
            />
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

export default ToolCallTracesRetentionPanel;
