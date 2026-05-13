// CronStatusPanel — workspace-observability bundled cron-status display.
//
// Renders 2 side-by-side cards covering the two background jobs that the
// workspace-observability surface owns:
//
//   1. Retention sweep — `ags_workspace_error_events` +
//      `ags_workspace_user_notifications` + `ags_workspace_background_jobs`
//      pruned older than 30 days at 03:00 UTC.
//   2. Stale-running sweep — auto-fails `background_jobs.status='running'`
//      rows stuck past the staleness threshold (every 10 min).
//
// Originally lived inline in `RetrofitPage.tsx`; extracted at PR #722
// to enable focused unit tests on each rendering branch.

import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { LoadingState, SectionLabel } from "./ui";
import { CronStatusBadge } from "./CronStatusBadge";
import { formatRelative } from "./format-relative";

export function CronStatusPanel() {
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
            <CronStatusBadge
              isLoading={false}
              lastError={retention?.lastError}
              lastRunAt={retention?.lastRunAt}
            />
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
            <CronStatusBadge
              isLoading={false}
              lastError={staleRunning?.lastError}
              lastRunAt={staleRunning?.lastRunAt}
            />
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

export default CronStatusPanel;
