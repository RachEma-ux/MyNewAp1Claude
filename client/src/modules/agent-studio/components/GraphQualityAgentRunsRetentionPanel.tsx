// GraphQualityAgentRunsRetentionPanel — operator UI for the
// `ags_graph_quality_agent_runs` retention cron (single-table sweep;
// the agent's emitted proposals are retained by
// graph-correction-proposals).
//
// Two-cell status grid + manual sweep with terminal-status
// checkboxes (completed/failed — never running) + optional
// agentKey CSV.
//
// Backing cron: env AGS_GRAPH_QUALITY_AGENT_RUNS_RETENTION_CRON_EXPR
// / AGS_GRAPH_QUALITY_AGENT_RUNS_RETENTION_DAYS. Default daily 14:00 UTC.
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

export function GraphQualityAgentRunsRetentionPanel() {
  const statusQuery =
    trpc.agentStudio.graphQuality.getAgentRunsRetentionCronStatus.useQuery(
      undefined,
      { refetchInterval: 30_000 },
    );
  const [retentionDays, setRetentionDays] = useState("30");
  const [includeCompleted, setIncludeCompleted] = useState(true);
  const [includeFailed, setIncludeFailed] = useState(true);
  const [agentKeyInput, setAgentKeyInput] = useState("");
  const [manualResult, setManualResult] = useState<{
    deletedAgentRunsCount: number;
  } | null>(null);

  const pruneMut =
    trpc.agentStudio.graphQuality.pruneAgentRunsRetention.useMutation({
      onSuccess: (data) => {
        setManualResult({ deletedAgentRunsCount: data.deletedAgentRunsCount });
        toast.success(
          `Graph quality agent runs sweep complete — ${data.deletedAgentRunsCount} run(s) deleted`,
        );
        void statusQuery.refetch();
      },
      onError: (err) =>
        toast.error(`Sweep failed: ${err.message ?? "unknown"}`),
    });

  const parsedDays = Math.max(1, parseInt(retentionDays, 10) || 30);
  const status = statusQuery.data;

  const selectedStatuses: ("completed" | "failed")[] = [];
  if (includeCompleted) selectedStatuses.push("completed");
  if (includeFailed) selectedStatuses.push("failed");

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <SectionLabel>Graph quality agent runs retention cron</SectionLabel>
            <CronStatusBadge
              isLoading={statusQuery.isLoading}
              lastError={status?.lastError}
              lastRunAt={status?.lastRunAt}
            />
          </div>
          <div className="text-xs text-zinc-400">
            Default: daily 14:00 UTC (env:
            AGS_GRAPH_QUALITY_AGENT_RUNS_RETENTION_CRON_EXPR /
            AGS_GRAPH_QUALITY_AGENT_RUNS_RETENTION_DAYS). Sweeps
            `ags_graph_quality_agent_runs` — single table; the
            agent's emitted proposals are retained by the
            graph-correction-proposals mini-arc. 12th slot in the
            daily-sweep ladder.
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
                agent runs deleted
              </div>
              <div className="text-lg font-semibold">
                {status?.lastResult
                  ? status.lastResult.deletedAgentRunsCount
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
            `running` agent runs are never swept — those are in-flight.
            Optional `agentKey` CSV scopes the sweep (default agent key
            is `graph_quality_agent`; future sibling agents would share
            this table with different keys).
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
            </div>
            <div>
              <Label className="text-xs">agentKey (optional)</Label>
              <Input
                type="text"
                value={agentKeyInput}
                onChange={(e) => setAgentKeyInput(e.target.value)}
                placeholder="e.g. graph_quality_agent"
              />
            </div>
          </div>
          <Button
            size="sm"
            disabled={pruneMut.isPending || selectedStatuses.length === 0}
            onClick={() => {
              if (selectedStatuses.length === 0) return;
              const agents = parseStringList(agentKeyInput);
              const statuses =
                selectedStatuses.length === 2
                  ? "all terminal statuses"
                  : selectedStatuses.join(", ");
              const scopeMsg = agents
                ? `; agentKey=${agents.join(",")}`
                : "";
              if (
                window.confirm(
                  `Delete graph quality agent runs older than ${parsedDays} days (${statuses}${scopeMsg})?`,
                )
              ) {
                pruneMut.mutate({
                  retentionDays: parsedDays,
                  statuses: selectedStatuses,
                  agentKey:
                    agents && agents.length === 1 ? agents[0] : agents,
                });
              }
            }}
          >
            {pruneMut.isPending ? "Sweeping…" : "Run sweep now"}
          </Button>
          {manualResult ? (
            <div className="rounded border border-zinc-800 p-3 text-xs space-y-1">
              <div className="text-zinc-400 uppercase">Last manual run</div>
              <div>agent runs deleted: {manualResult.deletedAgentRunsCount}</div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

export default GraphQualityAgentRunsRetentionPanel;
