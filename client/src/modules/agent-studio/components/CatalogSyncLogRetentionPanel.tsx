// CatalogSyncLogRetentionPanel — operator UI for the
// `ags_catalog_sync_log` retention cron.
//
// Two-card layout: cron status + manual sweep. Includes a three-
// checkbox eventTypes selector so operators can preserve
// `deprecated` events while sweeping `registered` / `published`.
//
// Backing cron: env AGS_CATALOG_SYNC_LOG_RETENTION_CRON_EXPR /
// AGS_CATALOG_SYNC_LOG_RETENTION_DAYS. Default daily 07:00 UTC.
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

type CatalogSyncEventType =
  | "aiTypes.catalog.registered"
  | "aiTypes.catalog.published"
  | "aiTypes.catalog.deprecated";

export function CatalogSyncLogRetentionPanel() {
  const statusQuery =
    trpc.agentStudio.catalogSyncLog.getRetentionCronStatus.useQuery(
      undefined,
      { refetchInterval: 30_000 },
    );
  const [retentionDays, setRetentionDays] = useState("30");
  const [includeRegistered, setIncludeRegistered] = useState(true);
  const [includePublished, setIncludePublished] = useState(true);
  const [includeDeprecated, setIncludeDeprecated] = useState(false);
  const [manualResult, setManualResult] = useState<
    { deletedCount: number } | null
  >(null);

  const pruneMut =
    trpc.agentStudio.catalogSyncLog.pruneRetention.useMutation({
      onSuccess: (data) => {
        setManualResult({ deletedCount: data.deletedCount });
        toast.success(
          `Catalog-sync-log sweep complete — ${data.deletedCount} row(s) deleted`,
        );
        void statusQuery.refetch();
      },
      onError: (err) =>
        toast.error(`Sweep failed: ${err.message ?? "unknown"}`),
    });

  const parsedDays = Math.max(1, parseInt(retentionDays, 10) || 30);
  const status = statusQuery.data;

  const selectedEventTypes: CatalogSyncEventType[] = [];
  if (includeRegistered) selectedEventTypes.push("aiTypes.catalog.registered");
  if (includePublished) selectedEventTypes.push("aiTypes.catalog.published");
  if (includeDeprecated) selectedEventTypes.push("aiTypes.catalog.deprecated");

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <SectionLabel>Catalog sync log retention cron</SectionLabel>
            <CronStatusBadge
              isLoading={statusQuery.isLoading}
              lastError={status?.lastError}
              lastRunAt={status?.lastRunAt}
            />
          </div>
          <div className="text-xs text-zinc-400">
            Default: daily 07:00 UTC (env:
            AGS_CATALOG_SYNC_LOG_RETENTION_CRON_EXPR /
            AGS_CATALOG_SYNC_LOG_RETENTION_DAYS). Sweeps
            `ags_catalog_sync_log` — one row per aiTypes catalog
            lifecycle event (registered / published / deprecated).
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

      <Card>
        <CardContent className="p-4 space-y-3">
          <SectionLabel>Manual sweep</SectionLabel>
          <div className="text-xs text-zinc-400">
            Pick which event types to sweep. `deprecated` is unchecked
            by default — those are rare lifecycle endpoints that
            operators usually want to preserve longer.
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
              <Label className="text-xs">eventTypes</Label>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={includeRegistered}
                  onChange={(e) => setIncludeRegistered(e.target.checked)}
                />
                aiTypes.catalog.registered
              </label>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={includePublished}
                  onChange={(e) => setIncludePublished(e.target.checked)}
                />
                aiTypes.catalog.published
              </label>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={includeDeprecated}
                  onChange={(e) => setIncludeDeprecated(e.target.checked)}
                />
                aiTypes.catalog.deprecated
                <span className="text-zinc-500">(rare lifecycle endpoints)</span>
              </label>
            </div>
          </div>
          <Button
            size="sm"
            disabled={pruneMut.isPending || selectedEventTypes.length === 0}
            onClick={() => {
              if (selectedEventTypes.length === 0) return;
              const types =
                selectedEventTypes.length === 3
                  ? "all event types"
                  : selectedEventTypes.join(", ");
              if (
                window.confirm(
                  `Delete catalog-sync-log rows older than ${parsedDays} days (${types})?`,
                )
              ) {
                pruneMut.mutate({
                  retentionDays: parsedDays,
                  eventTypes: selectedEventTypes,
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

export default CatalogSyncLogRetentionPanel;
