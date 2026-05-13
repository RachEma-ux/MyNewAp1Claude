// GraphAgentRuntimeTracesRetentionPanel — operator UI for the
// graph-agent runtime-traces retention cron (Phase 22 follow-up
// #677/#678/#679). 4-table cascade: `ags_graph_skill_runtime_usages`,
// `ags_query_template_runs`, `ags_graph_agent_steps`,
// `ags_graph_agent_runs` (children-first deletion order).
//
// Different shape from prior panels: the prune mutation is the
// EXISTING `graphAgent.pruneTraces` (Phase 14 §3) — takes
// `olderThanMs` rather than `retentionDays`. The UI converts: user
// enters retentionDays, the mutation receives ms.
//
// 90-day default retention (matches the existing `pruneRuntimeTraces`
// service's DEFAULT_HORIZON_MS) — longer than other retention crons
// because decision-trace ledgers have longer forensic value than
// per-tool-call traces.
//
// Backing cron: env AGS_GRAPH_AGENT_RUNTIME_TRACES_RETENTION_CRON_EXPR /
// AGS_GRAPH_AGENT_RUNTIME_TRACES_RETENTION_DAYS. Default daily 17:00 UTC.
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

export function GraphAgentRuntimeTracesRetentionPanel() {
  const statusQuery =
    trpc.agentStudio.graphAgent.getRuntimeTracesRetentionCronStatus.useQuery(
      undefined,
      { refetchInterval: 30_000 },
    );
  const [retentionDays, setRetentionDays] = useState("90");
  const [manualResult, setManualResult] = useState<{
    graphSkillRuntimeUsages: number;
    queryTemplateRuns: number;
    graphAgentSteps: number;
    graphAgentRuns: number;
  } | null>(null);

  const pruneMut = trpc.agentStudio.graphAgent.pruneTraces.useMutation({
    onSuccess: (data) => {
      if (data) {
        setManualResult({
          graphSkillRuntimeUsages: data.graphSkillRuntimeUsages,
          queryTemplateRuns: data.queryTemplateRuns,
          graphAgentSteps: data.graphAgentSteps,
          graphAgentRuns: data.graphAgentRuns,
        });
        const total =
          data.graphSkillRuntimeUsages +
          data.queryTemplateRuns +
          data.graphAgentSteps +
          data.graphAgentRuns;
        toast.success(
          `Graph agent runtime traces sweep complete — ${total} row(s) deleted across 4 tables`,
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
            <SectionLabel>
              Graph agent runtime traces retention cron
            </SectionLabel>
            <CronStatusBadge
              isLoading={statusQuery.isLoading}
              lastError={status?.lastError}
              lastRunAt={status?.lastRunAt}
            />
          </div>
          <div className="text-xs text-zinc-400">
            Default: daily 17:00 UTC, 90-day window (env:
            AGS_GRAPH_AGENT_RUNTIME_TRACES_RETENTION_CRON_EXPR /
            AGS_GRAPH_AGENT_RUNTIME_TRACES_RETENTION_DAYS). Sweeps 4
            trace-ledger tables (children-first):
            `ags_graph_skill_runtime_usages`,
            `ags_query_template_runs`, `ags_graph_agent_steps`,
            `ags_graph_agent_runs`. 15th slot in the daily-sweep
            ladder. Longer default than other retention crons
            because decision-trace ledgers have longer forensic
            value than per-tool-call traces.
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
                rows deleted (last sweep)
              </div>
              <div className="text-lg font-semibold">
                {status?.lastResult
                  ? status.lastResult.graphSkillRuntimeUsages +
                    status.lastResult.queryTemplateRuns +
                    status.lastResult.graphAgentSteps +
                    status.lastResult.graphAgentRuns
                  : "—"}
              </div>
              {status?.lastResult ? (
                <div className="text-xs text-zinc-500 mt-1">
                  usages {status.lastResult.graphSkillRuntimeUsages} ·
                  queryRuns {status.lastResult.queryTemplateRuns} · steps{" "}
                  {status.lastResult.graphAgentSteps} · runs{" "}
                  {status.lastResult.graphAgentRuns}
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
            Triggers the existing `graphAgent.pruneTraces` mutation
            (Phase 14 §3) with a caller-supplied horizon. Sweeps
            rows whose `createdAt` is older than `now -
            retentionDays`. No status filter — the prune service
            is timestamp-only (the 4 trace tables don't carry
            lifecycle status columns).
          </div>
          <div>
            <Label className="text-xs">retentionDays</Label>
            <Input
              type="number"
              value={retentionDays}
              onChange={(e) => setRetentionDays(e.target.value)}
              min={1}
              max={365}
            />
          </div>
          <Button
            size="sm"
            disabled={pruneMut.isPending}
            onClick={() => {
              if (
                window.confirm(
                  `Delete graph agent runtime traces older than ${parsedDays} days?`,
                )
              ) {
                pruneMut.mutate({
                  olderThanMs: parsedDays * 86_400_000,
                });
              }
            }}
          >
            {pruneMut.isPending ? "Sweeping…" : "Run sweep now"}
          </Button>
          {manualResult ? (
            <div className="rounded border border-zinc-800 p-3 text-xs space-y-1">
              <div className="text-zinc-400 uppercase">Last manual run</div>
              <div>
                skill runtime usages deleted:{" "}
                {manualResult.graphSkillRuntimeUsages}
              </div>
              <div>
                query template runs deleted: {manualResult.queryTemplateRuns}
              </div>
              <div>
                graph agent steps deleted: {manualResult.graphAgentSteps}
              </div>
              <div>graph agent runs deleted: {manualResult.graphAgentRuns}</div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

export default GraphAgentRuntimeTracesRetentionPanel;
