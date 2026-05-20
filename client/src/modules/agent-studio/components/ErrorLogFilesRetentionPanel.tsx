// ErrorLogFilesRetentionPanel — operator UI for the universal error
// event log file retention cron (#1674, follow-on to #1673).
//
// Two-card layout: cron status + manual sweep. Mirrors the existing
// retention-panel pattern (CagPackEventsRetentionPanel,
// RuntimeRunsRetentionPanel, etc) but sweeps FILES on disk rather
// than DB rows, so no per-severity / per-workspace filter — the
// only knob is `retentionDays`.
//
// Backing cron: env AGS_ERROR_LOG_FILE_RETENTION_CRON_EXPR /
// AGS_ERROR_LOG_FILE_RETENTION_DAYS. Default daily 09:30 UTC, 30d.

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

export function ErrorLogFilesRetentionPanel() {
  const statusQuery =
    trpc.agentStudio.clientObservability.getErrorLogFilesRetentionCronStatus.useQuery(
      undefined,
      { refetchInterval: 30_000 },
    );
  const [retentionDays, setRetentionDays] = useState("30");
  const [manualResult, setManualResult] = useState<{
    deletedCount: number;
    bytesFreed: number;
    skippedCount: number;
    errors: ReadonlyArray<{ path: string; reason: string }>;
  } | null>(null);

  const pruneMut =
    trpc.agentStudio.clientObservability.pruneErrorLogFilesRetention.useMutation(
      {
        onSuccess: (data) => {
          setManualResult({
            deletedCount: data.deletedCount,
            bytesFreed: data.bytesFreed,
            skippedCount: data.skippedCount,
            errors: data.errors,
          });
          toast.success(
            `Log file sweep complete — ${data.deletedCount} file(s) deleted, ${formatBytes(data.bytesFreed)} freed`,
          );
          void statusQuery.refetch();
        },
        onError: (err) =>
          toast.error(`Sweep failed: ${err.message ?? "unknown"}`),
      },
    );

  const parsedDays = Math.max(1, parseInt(retentionDays, 10) || 30);
  const status = statusQuery.data;

  return (
    <div
      className="grid grid-cols-1 md:grid-cols-2 gap-4"
      data-testid="elf-retention-panel"
    >
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <SectionLabel>Error log files retention cron</SectionLabel>
            <CronStatusBadge
              isLoading={statusQuery.isLoading}
              lastError={status?.lastError}
              lastRunAt={status?.lastRunAt}
            />
          </div>
          <div className="text-xs text-zinc-400">
            Default: daily 09:30 UTC (env:
            AGS_ERROR_LOG_FILE_RETENTION_CRON_EXPR /
            AGS_ERROR_LOG_FILE_RETENTION_DAYS / _CRON_DISABLED).
            Sweeps `logs/error-events-YYYY-MM-DD.jsonl` files — the
            universal error event log file pair of
            `ags_workspace_error_events` (#1673 / #1674). Files
            whose embedded date is strictly older than the boundary
            are deleted.
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded border border-zinc-800 p-3">
              <div className="text-xs text-zinc-400 uppercase">last run</div>
              <div
                className="text-lg font-semibold"
                data-testid="elf-last-run"
              >
                {formatRelative(status?.lastRunAt)}
              </div>
            </div>
            <div className="rounded border border-zinc-800 p-3">
              <div className="text-xs text-zinc-400 uppercase">
                files deleted
              </div>
              <div
                className="text-lg font-semibold"
                data-testid="elf-deleted"
              >
                {status?.lastResult ? status.lastResult.deletedCount : "—"}
              </div>
            </div>
            <div className="rounded border border-zinc-800 p-3">
              <div className="text-xs text-zinc-400 uppercase">
                bytes freed
              </div>
              <div
                className="text-lg font-semibold"
                data-testid="elf-bytes-freed"
              >
                {status?.lastResult
                  ? formatBytes(status.lastResult.bytesFreed)
                  : "—"}
              </div>
            </div>
          </div>
          {status?.lastError ? (
            <div
              className="rounded border border-red-900 bg-red-950/40 p-3 text-xs text-red-300"
              data-testid="elf-last-error"
            >
              <div className="uppercase tracking-wide mb-1">last error</div>
              {status.lastError}
            </div>
          ) : null}
          {status?.lastResult && status.lastResult.errors.length > 0 ? (
            <div className="rounded border border-yellow-900 bg-yellow-950/40 p-3 text-xs text-yellow-300">
              <div className="uppercase tracking-wide mb-1">
                per-file errors (sweep continued)
              </div>
              <ul className="space-y-1">
                {status.lastResult.errors.slice(0, 5).map((e, i) => (
                  <li key={i} className="font-mono">
                    {e.path}: {e.reason}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 space-y-3">
          <SectionLabel>Manual sweep</SectionLabel>
          <div className="text-xs text-zinc-400">
            Deletes log files whose embedded UTC date is strictly older
            than `Date.now() - retentionDays * 86_400_000`. Pure fs
            sweep — no DB writes.
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
                data-testid="elf-retention-days"
              />
            </div>
          </div>
          <Button
            size="sm"
            disabled={pruneMut.isPending}
            data-testid="elf-sweep-button"
            onClick={() => {
              if (
                window.confirm(
                  `Delete error log files older than ${parsedDays} days?`,
                )
              ) {
                pruneMut.mutate({ retentionDays: parsedDays });
              }
            }}
          >
            {pruneMut.isPending ? "Sweeping…" : "Run sweep now"}
          </Button>
          {manualResult ? (
            <div
              className="rounded border border-zinc-800 p-3 text-xs space-y-1"
              data-testid="elf-manual-result"
            >
              <div className="text-zinc-400 uppercase mb-1">
                Last manual run
              </div>
              <div>files deleted: {manualResult.deletedCount}</div>
              <div>bytes freed: {formatBytes(manualResult.bytesFreed)}</div>
              <div>skipped (non-matching): {manualResult.skippedCount}</div>
              {manualResult.errors.length > 0 ? (
                <div className="text-yellow-400">
                  per-file errors: {manualResult.errors.length}
                </div>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export default ErrorLogFilesRetentionPanel;
