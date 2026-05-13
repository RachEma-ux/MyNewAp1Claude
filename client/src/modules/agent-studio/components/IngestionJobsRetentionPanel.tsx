// IngestionJobsRetentionPanel — operator UI for the
// `ags_ingestion_jobs` retention cron.
//
// Two-cell status grid + manual sweep with 3-checkbox terminal-
// status selector (succeeded/failed/unsupported_type — pending/
// running never swept) + optional workspaceId (numeric CSV) +
// sourceConnectorKey (string CSV) filters.
//
// Backing cron: env AGS_INGESTION_JOBS_RETENTION_CRON_EXPR /
// AGS_INGESTION_JOBS_RETENTION_DAYS. Default daily 15:00 UTC.
//
// Originally lived inline in `RetrofitPage.tsx`; extracted as part
// of the strict-audit batch-6 panel cleanup (PR-AT-7, 2026-05-13).

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

function parseStringList(raw: string): string[] | undefined {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return undefined;
  const parts = trimmed
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return parts.length > 0 ? parts : undefined;
}

function parseNumberList(raw: string): number[] | undefined {
  const parts = parseStringList(raw);
  if (!parts) return undefined;
  const nums = parts
    .map((s) => parseInt(s, 10))
    .filter((n) => Number.isFinite(n) && n > 0);
  return nums.length > 0 ? nums : undefined;
}

export function IngestionJobsRetentionPanel() {
  const statusQuery =
    trpc.agentStudio.ingestion.getJobsRetentionCronStatus.useQuery(
      undefined,
      { refetchInterval: 30_000 },
    );
  const [retentionDays, setRetentionDays] = useState("30");
  const [includeSucceeded, setIncludeSucceeded] = useState(true);
  const [includeFailed, setIncludeFailed] = useState(true);
  const [includeUnsupported, setIncludeUnsupported] = useState(true);
  const [workspaceIdInput, setWorkspaceIdInput] = useState("");
  const [connectorKeyInput, setConnectorKeyInput] = useState("");
  const [manualResult, setManualResult] = useState<{
    deletedJobsCount: number;
  } | null>(null);

  const pruneMut = trpc.agentStudio.ingestion.pruneJobsRetention.useMutation({
    onSuccess: (data) => {
      setManualResult({ deletedJobsCount: data.deletedJobsCount });
      toast.success(
        `Ingestion jobs sweep complete — ${data.deletedJobsCount} job(s) deleted`,
      );
      void statusQuery.refetch();
    },
    onError: (err) => toast.error(`Sweep failed: ${err.message ?? "unknown"}`),
  });

  const parsedDays = Math.max(1, parseInt(retentionDays, 10) || 30);
  const status = statusQuery.data;

  const selectedStatuses: (
    | "succeeded"
    | "failed"
    | "unsupported_type"
  )[] = [];
  if (includeSucceeded) selectedStatuses.push("succeeded");
  if (includeFailed) selectedStatuses.push("failed");
  if (includeUnsupported) selectedStatuses.push("unsupported_type");

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <SectionLabel>Ingestion jobs retention cron</SectionLabel>
            <CronStatusBadge
              isLoading={statusQuery.isLoading}
              lastError={status?.lastError}
              lastRunAt={status?.lastRunAt}
            />
          </div>
          <div className="text-xs text-zinc-400">
            Default: daily 15:00 UTC (env:
            AGS_INGESTION_JOBS_RETENTION_CRON_EXPR /
            AGS_INGESTION_JOBS_RETENTION_DAYS). Sweeps
            `ags_ingestion_jobs` — the Universal Ingestion lifecycle
            wrapper. Single-table; `ags_ingestion_artifacts` is a
            SIBLING (compliance-adjacent, out of scope). 13th slot
            in the daily-sweep ladder.
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded border border-zinc-800 p-3">
              <div className="text-xs text-zinc-400 uppercase">last run</div>
              <div className="text-lg font-semibold">
                {formatRelative(status?.lastRunAt)}
              </div>
            </div>
            <div className="rounded border border-zinc-800 p-3">
              <div className="text-xs text-zinc-400 uppercase">
                jobs deleted
              </div>
              <div className="text-lg font-semibold">
                {status?.lastResult ? status.lastResult.deletedJobsCount : "—"}
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
            `pending` + `running` jobs are never swept — those are
            queued/in-flight. Optional `workspaceId` + `connectorKey`
            CSVs scope the sweep.
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
                  checked={includeSucceeded}
                  onChange={(e) => setIncludeSucceeded(e.target.checked)}
                />
                succeeded
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
                  checked={includeUnsupported}
                  onChange={(e) => setIncludeUnsupported(e.target.checked)}
                />
                unsupported_type
              </label>
            </div>
            <div>
              <Label className="text-xs">workspaceId (optional, CSV)</Label>
              <Input
                type="text"
                value={workspaceIdInput}
                onChange={(e) => setWorkspaceIdInput(e.target.value)}
                placeholder="e.g. 11, 22"
              />
            </div>
            <div>
              <Label className="text-xs">
                sourceConnectorKey (optional, CSV)
              </Label>
              <Input
                type="text"
                value={connectorKeyInput}
                onChange={(e) => setConnectorKeyInput(e.target.value)}
                placeholder="e.g. s3, gdrive"
              />
            </div>
          </div>
          <Button
            size="sm"
            disabled={pruneMut.isPending || selectedStatuses.length === 0}
            onClick={() => {
              if (selectedStatuses.length === 0) return;
              const ws = parseNumberList(workspaceIdInput);
              const connectors = parseStringList(connectorKeyInput);
              const statuses =
                selectedStatuses.length === 3
                  ? "all terminal statuses"
                  : selectedStatuses.join(", ");
              const scopeBits: string[] = [];
              if (ws) scopeBits.push(`workspaceId=${ws.join(",")}`);
              if (connectors)
                scopeBits.push(`connectorKey=${connectors.join(",")}`);
              const scopeMsg =
                scopeBits.length > 0 ? `; ${scopeBits.join("; ")}` : "";
              if (
                window.confirm(
                  `Delete ingestion jobs older than ${parsedDays} days (${statuses}${scopeMsg})?`,
                )
              ) {
                pruneMut.mutate({
                  retentionDays: parsedDays,
                  statuses: selectedStatuses,
                  workspaceId: ws && ws.length === 1 ? ws[0] : ws,
                  sourceConnectorKey:
                    connectors && connectors.length === 1
                      ? connectors[0]
                      : connectors,
                });
              }
            }}
          >
            {pruneMut.isPending ? "Sweeping…" : "Run sweep now"}
          </Button>
          {manualResult ? (
            <div className="rounded border border-zinc-800 p-3 text-xs space-y-1">
              <div className="text-zinc-400 uppercase">Last manual run</div>
              <div>jobs deleted: {manualResult.deletedJobsCount}</div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

export default IngestionJobsRetentionPanel;
