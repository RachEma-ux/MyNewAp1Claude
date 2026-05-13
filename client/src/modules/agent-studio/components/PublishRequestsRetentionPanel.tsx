// PublishRequestsRetentionPanel — operator UI for the
// `ags_publish_requests` lifecycle-aware retention cron.
//
// Sister panel to ApprovalStepsRetentionPanel + NotePromotionsRetentionPanel.
// Unlike the age-only retention panels, the manual-sweep result
// includes `preservedCount` + `blockerCounts` so operators see WHY
// rows weren't deleted ("oh — 12 are under legal hold").
//
// Backing cron: env AGS_PUBLISH_REQUESTS_RETENTION_CRON_EXPR /
// AGS_PUBLISH_REQUESTS_RETENTION_DAYS. Default daily 18:00 UTC, 90-day
// window — covers two quarterly audit cycles.
//
// Originally lived inline in `RetrofitPage.tsx`; extracted as part
// of the strict-audit batch-7 panel cleanup (PR-AT-8, 2026-05-13)
// closing item #14 (17/17 panels extracted).

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

export function PublishRequestsRetentionPanel() {
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
      onError: (err) =>
        toast.error(`Sweep failed: ${err.message ?? "unknown"}`),
    });

  const parsedDays = Math.max(1, parseInt(retentionDays, 10) || 90);
  const status = statusQuery.data;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <SectionLabel>Publish requests retention cron</SectionLabel>
            <CronStatusBadge
              isLoading={statusQuery.isLoading}
              lastError={status?.lastError}
              lastRunAt={status?.lastRunAt}
            />
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

export default PublishRequestsRetentionPanel;
