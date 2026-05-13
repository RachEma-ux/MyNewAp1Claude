// GraphQualityScansRetentionPanel — operator UI for the
// `ags_graph_quality_scans` retention cron (cascades
// `ags_graph_quality_findings`).
//
// Three-cell status grid + manual sweep with terminal-status
// checkboxes + scanKind + scope CSV filters.
//
// Backing cron: env AGS_GRAPH_QUALITY_SCANS_RETENTION_CRON_EXPR /
// AGS_GRAPH_QUALITY_SCANS_RETENTION_DAYS. Default daily 12:00 UTC.
//
// Originally lived inline in `RetrofitPage.tsx`; extracted as part
// of the strict-audit batch-5 panel cleanup (PR-AT-6, 2026-05-13).

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

export function GraphQualityScansRetentionPanel() {
  const statusQuery =
    trpc.agentStudio.graphQuality.getScansRetentionCronStatus.useQuery(
      undefined,
      { refetchInterval: 30_000 },
    );
  const [retentionDays, setRetentionDays] = useState("30");
  const [includeCompleted, setIncludeCompleted] = useState(true);
  const [includeFailed, setIncludeFailed] = useState(true);
  const [includeCancelled, setIncludeCancelled] = useState(true);
  const [scanKindInput, setScanKindInput] = useState("");
  const [scopeInput, setScopeInput] = useState("");
  const [manualResult, setManualResult] = useState<{
    deletedScansCount: number;
    deletedFindingsCount: number;
  } | null>(null);

  const pruneMut =
    trpc.agentStudio.graphQuality.pruneScansRetention.useMutation({
      onSuccess: (data) => {
        setManualResult({
          deletedScansCount: data.deletedScansCount,
          deletedFindingsCount: data.deletedFindingsCount,
        });
        toast.success(
          `Graph quality scans sweep complete — ${data.deletedScansCount} scan(s), ${data.deletedFindingsCount} finding(s) deleted`,
        );
        void statusQuery.refetch();
      },
      onError: (err) =>
        toast.error(`Sweep failed: ${err.message ?? "unknown"}`),
    });

  const parsedDays = Math.max(1, parseInt(retentionDays, 10) || 30);
  const status = statusQuery.data;

  const selectedStatuses: ("completed" | "failed" | "cancelled")[] = [];
  if (includeCompleted) selectedStatuses.push("completed");
  if (includeFailed) selectedStatuses.push("failed");
  if (includeCancelled) selectedStatuses.push("cancelled");

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <SectionLabel>Graph quality scans retention cron</SectionLabel>
            <CronStatusBadge
              isLoading={statusQuery.isLoading}
              lastError={status?.lastError}
              lastRunAt={status?.lastRunAt}
            />
          </div>
          <div className="text-xs text-zinc-400">
            Default: daily 12:00 UTC (env:
            AGS_GRAPH_QUALITY_SCANS_RETENTION_CRON_EXPR /
            AGS_GRAPH_QUALITY_SCANS_RETENTION_DAYS). Sweeps
            `ags_graph_quality_scans` + cascades
            `ags_graph_quality_findings`. 10th slot in the daily-sweep
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
              <div className="text-xs text-zinc-400 uppercase">scans deleted</div>
              <div className="text-lg font-semibold">
                {status?.lastResult
                  ? status.lastResult.deletedScansCount
                  : "—"}
              </div>
            </div>
            <div className="rounded border border-zinc-800 p-3">
              <div className="text-xs text-zinc-400 uppercase">
                findings deleted
              </div>
              <div className="text-lg font-semibold">
                {status?.lastResult
                  ? status.lastResult.deletedFindingsCount
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
            `pending` + `running` are never swept — those are
            in-flight scans. Optional `scanKind` / `scope` CSVs scope
            the sweep to specific scanners or workspaces.
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
                  checked={includeCompleted}
                  onChange={(e) => setIncludeCompleted(e.target.checked)}
                />
                completed
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
              <Label className="text-xs">scanKind (optional)</Label>
              <Input
                type="text"
                value={scanKindInput}
                onChange={(e) => setScanKindInput(e.target.value)}
                placeholder="e.g. orphan-detector, broken-citation-detector"
              />
            </div>
            <div>
              <Label className="text-xs">scope (optional)</Label>
              <Input
                type="text"
                value={scopeInput}
                onChange={(e) => setScopeInput(e.target.value)}
                placeholder="e.g. workspace:11"
              />
            </div>
          </div>
          <Button
            size="sm"
            disabled={pruneMut.isPending || selectedStatuses.length === 0}
            onClick={() => {
              if (selectedStatuses.length === 0) return;
              const scanKinds = parseStringList(scanKindInput);
              const scopes = parseStringList(scopeInput);
              const statuses =
                selectedStatuses.length === 3
                  ? "all terminal statuses"
                  : selectedStatuses.join(", ");
              const scopeBits: string[] = [];
              if (scanKinds)
                scopeBits.push(`scanKind=${scanKinds.join(",")}`);
              if (scopes) scopeBits.push(`scope=${scopes.join(",")}`);
              const scopeMsg =
                scopeBits.length > 0 ? `; ${scopeBits.join("; ")}` : "";
              if (
                window.confirm(
                  `Delete graph quality scans older than ${parsedDays} days (${statuses}${scopeMsg})?`,
                )
              ) {
                pruneMut.mutate({
                  retentionDays: parsedDays,
                  statuses: selectedStatuses,
                  scanKind:
                    scanKinds && scanKinds.length === 1
                      ? scanKinds[0]
                      : scanKinds,
                  scope:
                    scopes && scopes.length === 1 ? scopes[0] : scopes,
                });
              }
            }}
          >
            {pruneMut.isPending ? "Sweeping…" : "Run sweep now"}
          </Button>
          {manualResult ? (
            <div className="rounded border border-zinc-800 p-3 text-xs space-y-1">
              <div className="text-zinc-400 uppercase">Last manual run</div>
              <div>scans deleted: {manualResult.deletedScansCount}</div>
              <div>findings deleted: {manualResult.deletedFindingsCount}</div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

export default GraphQualityScansRetentionPanel;
