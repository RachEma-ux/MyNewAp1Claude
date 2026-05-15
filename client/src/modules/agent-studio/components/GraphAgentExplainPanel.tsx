/**
 * Native Graph Workspace — Why-This-Answer explanation panel.
 *
 * Phase 13 §5. Renders the decision-trace ledger produced by §2
 * (engine) and exposed by §3 (`agentStudio.graphAgent.explain` tRPC
 * procedure). Operators paste a graph-agent runId and the panel
 * surfaces:
 *
 *   - run header (query, status, total duration, error if failed)
 *   - step ledger (phase, duration, output payload)
 *
 * The component is self-contained — drop it into any agent-studio
 * page that wants the explain card without coupling the host to the
 * underlying data shape.
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Brain, Download } from "lucide-react";
import {
  EmptyState,
  ErrorCallout,
  LoadingState,
  PageHeader,
  SectionLabel,
} from "./ui";

function formatDuration(ms: number | null): string {
  if (ms === null || ms === undefined) return "—";
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

function StatusBadge({ status }: { status: string }) {
  const tone =
    status === "completed"
      ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/40"
      : status === "failed"
        ? "bg-red-500/15 text-red-300 border-red-500/40"
        : "bg-yellow-500/15 text-yellow-300 border-yellow-500/40";
  return (
    <Badge
      variant="outline"
      className={`text-[9px] px-1.5 py-0 h-4 ${tone}`}
    >
      {status}
    </Badge>
  );
}

interface Props {
  /** Optional pre-filled run id. When omitted, the panel renders an
   *  input field so operators can paste one in. */
  initialRunId?: number;
}

export default function GraphAgentExplainPanel({ initialRunId }: Props = {}) {
  const [runIdInput, setRunIdInput] = useState<string>(
    initialRunId ? String(initialRunId) : "",
  );
  const parsed = Number.parseInt(runIdInput, 10);
  const validRunId =
    Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;

  const query = trpc.agentStudio.graphAgent.explain.useQuery(
    { runId: validRunId ?? 0 },
    {
      enabled: validRunId !== undefined,
      refetchOnWindowFocus: false,
    },
  );

  const explanation = query.data?.explanation ?? null;

  // Phase 14 §2 — Markdown export download. The query fires
  // on-demand (only when the operator clicks the button) so we don't
  // pre-fetch markdown for every paste in the run-id field.
  const utils = trpc.useUtils();
  const [exportPending, setExportPending] = useState(false);
  async function downloadMarkdown() {
    if (validRunId === undefined) return;
    setExportPending(true);
    try {
      const result = await utils.client.agentStudio.graphAgent.exportTraceMarkdown.query(
        { runId: validRunId },
      );
      if (!result.exported) return;
      const blob = new Blob([result.exported.markdown], {
        type: "text/markdown;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `graph-agent-run-${result.runId}.md`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } finally {
      setExportPending(false);
    }
  }

  return (
    <Card>
      <CardContent className="p-4 space-y-4">
        <PageHeader
          title="Why This Answer?"
          subtitle="Decision-trace ledger for a Graph Agent run. Joins ags_graph_agent_runs + ags_graph_agent_steps via runtime_run_id."
          icon={<Brain className="h-4 w-4" />}
        />

        <div className="flex items-end gap-2">
          <div className="flex-1">
            <SectionLabel>Runtime run id</SectionLabel>
            <Input
              value={runIdInput}
              onChange={(e) => setRunIdInput(e.target.value)}
              placeholder="e.g. 1234"
              inputMode="numeric"
              className="h-8 text-xs"
            />
          </div>
          <Button
            size="sm"
            variant="outline"
            disabled={validRunId === undefined || query.isFetching}
            onClick={() => query.refetch()}
          >
            {query.isFetching ? "Loading…" : "Reload"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={
              validRunId === undefined || !explanation || exportPending
            }
            onClick={downloadMarkdown}
            title="Download decision-trace ledger as Markdown"
          >
            <Download className="h-3.5 w-3.5 mr-1" />
            {exportPending ? "Exporting…" : "Export .md"}
          </Button>
        </div>

        {validRunId === undefined ? (
          <EmptyState
            icon={<Brain />}
            title="Enter a run id"
            description="Paste the runId returned from agentStudio.graphAgent.run to see its decision trace."
          />
        ) : query.isLoading ? (
          <LoadingState label="Loading decision trace…" />
        ) : query.isError ? (
          <ErrorCallout
            title="Failed to load explanation"
            message={query.error?.message ?? "Unknown error"}
          />
        ) : !explanation ? (
          <EmptyState
            icon={<Brain />}
            title="No decision trace for this run"
            description="The run either ran before §2 shipped, or the engine wasn't wired with a decision-trace adapter."
          />
        ) : (
          <div className="space-y-3">
            <div className="border border-border/40 rounded p-3 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium truncate">
                  {explanation.userQuery}
                </p>
                <StatusBadge status={explanation.status} />
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-muted-foreground">
                <span>
                  Agent:{" "}
                  <span className="text-foreground/80">
                    {explanation.agentKey}
                  </span>
                </span>
                <span>
                  Total:{" "}
                  <span className="text-foreground/80 tabular-nums">
                    {formatDuration(explanation.durationMs)}
                  </span>
                </span>
                <span>
                  Steps:{" "}
                  <span className="text-foreground/80 tabular-nums">
                    {explanation.steps.length}
                  </span>
                </span>
                {/* PR-V1-231: slowest-step gauge. Total duration is
                    shown; "which step ate the most time" is the
                    immediate operator follow-up for perf
                    investigations. Computed in-render over the
                    existing steps array — no new RPC. Render-gated
                    on steps.length > 0. Skipped when every step has
                    null durationMs (engine ran without timing
                    adapter). */}
                {(() => {
                  if (explanation.steps.length === 0) return null;
                  let slowest = explanation.steps[0];
                  for (const s of explanation.steps) {
                    const sMs = s.durationMs ?? -1;
                    const cMs = slowest.durationMs ?? -1;
                    if (sMs > cMs) slowest = s;
                  }
                  if (slowest.durationMs == null) return null;
                  return (
                    <span data-testid="graph-agent-explain-slowest-step">
                      Slowest:{" "}
                      <span className="text-foreground/80 tabular-nums">
                        #{slowest.stepIndex} {slowest.stepKind}{" "}
                        ({formatDuration(slowest.durationMs)})
                      </span>
                    </span>
                  );
                })()}
              </div>
              {explanation.errorMessage && (
                <p className="text-[10px] text-red-300 mt-1 break-words">
                  Error: {explanation.errorMessage}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <SectionLabel>Steps</SectionLabel>
              {explanation.steps.length === 0 ? (
                <p className="text-[10px] text-muted-foreground/70">
                  No steps recorded.
                </p>
              ) : (
                explanation.steps.map((step) => (
                  <div
                    key={step.stepIndex}
                    className="border border-border/40 rounded px-3 py-2 space-y-1"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-[10px] font-mono text-muted-foreground/70 tabular-nums">
                          #{step.stepIndex}
                        </span>
                        <span className="text-xs font-medium truncate">
                          {step.stepKind}
                        </span>
                      </div>
                      <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
                        {formatDuration(step.durationMs)}
                      </span>
                    </div>
                    {step.stepOutput && (
                      <pre className="text-[10px] text-muted-foreground/80 bg-muted/30 rounded px-2 py-1 overflow-x-auto whitespace-pre-wrap break-words">
                        {JSON.stringify(step.stepOutput, null, 2)}
                      </pre>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
