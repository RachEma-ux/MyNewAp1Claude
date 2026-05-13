// CagPackEventsRetentionPanel — operator UI for the
// `ags_cag_pack_events` retention cron.
//
// Two-card layout: cron status + manual sweep with severity
// checkboxes (info default-on, warn/error default-off for
// forensic preservation) + optional workspaceId CSV filter.
//
// Backing cron: env AGS_CAG_PACK_EVENTS_RETENTION_CRON_EXPR /
// AGS_CAG_PACK_EVENTS_RETENTION_DAYS. Default daily 09:00 UTC.
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

export function CagPackEventsRetentionPanel() {
  const statusQuery =
    trpc.agentStudio.cag.getEventsRetentionCronStatus.useQuery(undefined, {
      refetchInterval: 30_000,
    });
  const [retentionDays, setRetentionDays] = useState("30");
  const [includeInfo, setIncludeInfo] = useState(true);
  const [includeWarn, setIncludeWarn] = useState(false);
  const [includeError, setIncludeError] = useState(false);
  const [workspaceIdInput, setWorkspaceIdInput] = useState("");
  const [manualResult, setManualResult] = useState<{
    deletedCount: number;
  } | null>(null);

  const pruneMut = trpc.agentStudio.cag.pruneEventsRetention.useMutation({
    onSuccess: (data) => {
      setManualResult({ deletedCount: data.deletedCount });
      toast.success(
        `CAG pack events sweep complete — ${data.deletedCount} row(s) deleted`,
      );
      void statusQuery.refetch();
    },
    onError: (err) => toast.error(`Sweep failed: ${err.message ?? "unknown"}`),
  });

  const parsedDays = Math.max(1, parseInt(retentionDays, 10) || 30);
  const status = statusQuery.data;

  const selectedSeverities: ("info" | "warn" | "error")[] = [];
  if (includeInfo) selectedSeverities.push("info");
  if (includeWarn) selectedSeverities.push("warn");
  if (includeError) selectedSeverities.push("error");

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <SectionLabel>CAG pack events retention cron</SectionLabel>
            <CronStatusBadge
              isLoading={statusQuery.isLoading}
              lastError={status?.lastError}
              lastRunAt={status?.lastRunAt}
            />
          </div>
          <div className="text-xs text-zinc-400">
            Default: daily 09:00 UTC (env:
            AGS_CAG_PACK_EVENTS_RETENTION_CRON_EXPR /
            AGS_CAG_PACK_EVENTS_RETENTION_DAYS). Sweeps
            `ags_cag_pack_events` — high-volume CAG pack lifecycle
            event log (pack_used / pack_validation_failed / etc).
            7th slot in the daily-sweep ladder.
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
            `info` is the high-volume default (pack_used). `warn` +
            `error` are unchecked by default — those are rare and
            usually want preserving for forensic value.
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
              <Label className="text-xs">eventSeverities</Label>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={includeInfo}
                  onChange={(e) => setIncludeInfo(e.target.checked)}
                />
                info (pack_used, etc — high-volume)
              </label>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={includeWarn}
                  onChange={(e) => setIncludeWarn(e.target.checked)}
                />
                warn
              </label>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={includeError}
                  onChange={(e) => setIncludeError(e.target.checked)}
                />
                error (pack_validation_failed, etc — preserve longer)
              </label>
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
          </div>
          <Button
            size="sm"
            disabled={pruneMut.isPending || selectedSeverities.length === 0}
            onClick={() => {
              if (selectedSeverities.length === 0) return;
              const wsIds = parseIdList(workspaceIdInput);
              const severities =
                selectedSeverities.length === 3
                  ? "all severities"
                  : selectedSeverities.join(", ");
              if (
                window.confirm(
                  `Delete CAG pack events older than ${parsedDays} days (${severities}${wsIds ? `; workspaceId=${wsIds.join(",")}` : ""})?`,
                )
              ) {
                pruneMut.mutate({
                  retentionDays: parsedDays,
                  eventSeverities: selectedSeverities,
                  workspaceId:
                    wsIds && wsIds.length === 1 ? wsIds[0] : wsIds,
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

export default CagPackEventsRetentionPanel;
