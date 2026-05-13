// McpTransitionsRetentionPanel — operator UI for the
// `ags_mcp_transitions` retention cron.
//
// Mirrors RuntimeRunsRetentionPanel + CronStatusPanel pattern (PR #722,
// #729). Two-card layout: cron status + manual sweep. Slot 6 in the
// 18-cron daily-sweep ladder.
//
// Backing cron: env AGS_MCP_TRANSITIONS_RETENTION_CRON_EXPR /
// AGS_MCP_TRANSITIONS_RETENTION_DAYS. Default daily 06:00 UTC.
//
// Originally lived inline in `RetrofitPage.tsx` (lines 1591+);
// extracted in PR-Y4 of the V1.0 closure mission.

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

export function McpTransitionsRetentionPanel() {
  const statusQuery =
    trpc.agentStudio.mcp.getTransitionsRetentionCronStatus.useQuery(
      undefined,
      { refetchInterval: 30_000 },
    );
  const [retentionDays, setRetentionDays] = useState("30");
  const [serverIdInput, setServerIdInput] = useState("");
  const [manualResult, setManualResult] = useState<
    { deletedCount: number } | null
  >(null);

  const pruneMut = trpc.agentStudio.mcp.pruneTransitionsRetention.useMutation({
    onSuccess: (data) => {
      setManualResult({ deletedCount: data.deletedCount });
      toast.success(
        `MCP transitions sweep complete — ${data.deletedCount} row(s) deleted`,
      );
      void statusQuery.refetch();
    },
    onError: (err) =>
      toast.error(`Sweep failed: ${err.message ?? "unknown"}`),
  });

  const parsedDays = Math.max(1, parseInt(retentionDays, 10) || 30);
  const parsedServerId = serverIdInput.trim()
    ? Number(serverIdInput.trim())
    : null;
  const status = statusQuery.data;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Cron status */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <SectionLabel>MCP transitions retention cron</SectionLabel>
            <CronStatusBadge
              isLoading={statusQuery.isLoading}
              lastError={status?.lastError}
              lastRunAt={status?.lastRunAt}
            />
          </div>
          <div className="text-xs text-zinc-400">
            Default: daily 06:00 UTC (env:
            AGS_MCP_TRANSITIONS_RETENTION_CRON_EXPR /
            AGS_MCP_TRANSITIONS_RETENTION_DAYS). Sweeps
            `ags_mcp_transitions` — one row per FSM transition (high-
            volume when an MCP server flaps).
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
            Bypasses the daily cron — fires immediately. Useful after
            wrangling a flapping MCP server to flush the audit trail.
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
              <Label className="text-xs">serverId (optional)</Label>
              <Input
                type="number"
                value={serverIdInput}
                onChange={(e) => setServerIdInput(e.target.value)}
                placeholder="any (default sweeps all servers)"
              />
            </div>
          </div>
          <Button
            size="sm"
            disabled={pruneMut.isPending}
            onClick={() => {
              const scope =
                parsedServerId !== null && parsedServerId > 0
                  ? ` for serverId=${parsedServerId}`
                  : "";
              if (
                window.confirm(
                  `Delete MCP transition rows older than ${parsedDays} days${scope}?`,
                )
              ) {
                pruneMut.mutate({
                  retentionDays: parsedDays,
                  serverId:
                    parsedServerId !== null && parsedServerId > 0
                      ? parsedServerId
                      : undefined,
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

export default McpTransitionsRetentionPanel;
