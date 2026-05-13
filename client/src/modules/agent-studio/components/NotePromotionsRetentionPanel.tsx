// NotePromotionsRetentionPanel — operator UI for the
// `ags_note_promotions` lifecycle-aware retention cron with 3-table
// cascade (`ags_note_promotion_versions`, `ags_note_promotion_decisions`,
// `ags_note_promotion_audit_events`).
//
// Sister panel to PublishRequestsRetentionPanel + ApprovalStepsRetentionPanel.
// Unique to this panel: status grid shows cascade-deleted counts
// (versions/decisions/auditEvents) in the per-sweep breakdown. Active
// version (`agsNotePromotionVersions.active=true`) is a retention
// blocker.
//
// Backing cron: env AGS_NOTE_PROMOTIONS_RETENTION_CRON_EXPR /
// AGS_NOTE_PROMOTIONS_RETENTION_DAYS. Default daily 20:00 UTC, 90-day
// window.
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

export function NotePromotionsRetentionPanel() {
  const statusQuery =
    trpc.agentStudio.promotion.getRetentionCronStatus.useQuery(undefined, {
      refetchInterval: 30_000,
    });
  const [retentionDays, setRetentionDays] = useState("90");
  const [manualResult, setManualResult] = useState<{
    deletedCount: number;
    preservedCount: number;
    blockerCounts: Record<string, number>;
    cascadeDeletedCounts: {
      versions: number;
      decisions: number;
      auditEvents: number;
    };
  } | null>(null);

  const pruneMut = trpc.agentStudio.promotion.pruneRetention.useMutation({
    onSuccess: (data) => {
      if (data) {
        setManualResult({
          deletedCount: data.deletedCount,
          preservedCount: data.preservedCount,
          blockerCounts: data.blockerCounts as Record<string, number>,
          cascadeDeletedCounts: data.cascadeDeletedCounts,
        });
        toast.success(
          `Note promotions sweep complete — ${data.deletedCount} deleted, ${data.preservedCount} preserved`,
        );
        void statusQuery.refetch();
      }
    },
    onError: (err) => toast.error(`Sweep failed: ${err.message ?? "unknown"}`),
  });

  const parsedDays = Math.max(1, parseInt(retentionDays, 10) || 90);
  const status = statusQuery.data;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <SectionLabel>Note promotions retention cron</SectionLabel>
            <CronStatusBadge
              isLoading={statusQuery.isLoading}
              lastError={status?.lastError}
              lastRunAt={status?.lastRunAt}
            />
          </div>
          <div className="text-xs text-zinc-400">
            Default: daily 20:00 UTC, 90-day window (env:
            AGS_NOTE_PROMOTIONS_RETENTION_CRON_EXPR /
            AGS_NOTE_PROMOTIONS_RETENTION_DAYS). Cascades child tables
            (versions / decisions / audit_events) children-first. Active
            version (`agsNotePromotionVersions.active=true`) is a
            retention blocker.
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
                  preserved {status.lastResult.preservedCount} · cascade v
                  {status.lastResult.cascadeDeletedCounts.versions}/d
                  {status.lastResult.cascadeDeletedCounts.decisions}/a
                  {status.lastResult.cascadeDeletedCounts.auditEvents}
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
            Lifecycle-aware sweep against `ags_note_promotions`. Rolled-
            back promotions are terminal but preserved if a governance-
            review hold exists.
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
                  `Sweep note-promotions older than ${parsedDays} days (lifecycle-aware, cascades children)?`,
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
              <div className="text-zinc-500">
                cascade — versions:{" "}
                {manualResult.cascadeDeletedCounts.versions}, decisions:{" "}
                {manualResult.cascadeDeletedCounts.decisions}, audit-events:{" "}
                {manualResult.cascadeDeletedCounts.auditEvents}
              </div>
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

export default NotePromotionsRetentionPanel;
