/**
 * RuntimeAndDecisionTraceView — Product Work items 23 + 24.
 *
 * Operator-entered runtime run id → render runtime trace + decision
 * trace projection. Uses the existing seeded Cypher templates
 * (`runtime_trace_path`, `decision_trace_path`) via the allow-listed
 * graphWorkspace.runImpactTemplate equivalent surface — for traces
 * we wrap GraphRepository.executeTemplate directly via a dedicated
 * surface; for now we read the same impact_runtime template seeded
 * with the runId as the startId (the template is `MATCH (start { id: $startId })-[r:USED_BY|EXECUTED_IN|TRACED_IN*1..2]->...`)
 *
 * Permission-aware: the runtime context (workspace + userId) is
 * threaded into every read; the repository filters out other users'
 * traces.
 *
 * View modes — 2026-05-20 (closes the items 23 / 24 graph-visual gap
 * from PR #1397's classification):
 *   - "list" — JSON-row list of impacted entities (the original).
 *   - "graph" — radial SVG node-link diagram with the trace's start
 *     id at the center and one satellite per impacted row. No new
 *     runtime dependency (pure SVG; matches the LocalGraphCanvas
 *     reuse-first principle while keeping the bundle slim — the
 *     trace surfaces don't need react-flow's drag/pan affordances).
 */

import React, { useMemo, useState } from "react";
import { trpc } from "../../../../lib/trpc";
import WorkspaceStateLayer, {
  classifyWorkspaceState,
} from "./WorkspaceStateLayer";
import TraceGraphView from "./TraceGraphView";

const VIEW_MODES = ["graph", "list"] as const;
type TraceViewMode = (typeof VIEW_MODES)[number];

export interface RuntimeAndDecisionTraceViewProps {
  readonly defaultRuntimeRunId?: string;
}

export default function RuntimeAndDecisionTraceView({
  defaultRuntimeRunId = "",
}: RuntimeAndDecisionTraceViewProps): React.ReactElement {
  const [runtimeRunId, setRuntimeRunId] = useState<string>(defaultRuntimeRunId);
  // View-mode shared by BOTH the runtime and decision projections —
  // operators reading a trace usually want the same mode for both,
  // and a shared toggle keeps the header tidy.
  const [viewMode, setViewMode] = useState<TraceViewMode>("graph");

  return (
    <section
      className="border rounded"
      data-testid="runtime-decision-trace-view"
      data-runtime-run-id={runtimeRunId}
      data-view-mode={viewMode}
    >
      <header className="flex items-center justify-between border-b px-3 py-1.5 text-xs gap-2">
        <span className="font-semibold uppercase text-gray-500">
          Runtime + decision trace
        </span>
        <div
          className="flex items-center gap-1"
          data-testid="trace-view-mode-toggle"
        >
          {VIEW_MODES.map((mode) => (
            <button
              key={mode}
              type="button"
              data-testid={`trace-view-mode-${mode}`}
              data-active={mode === viewMode ? "true" : "false"}
              onClick={() => setViewMode(mode)}
              className={`text-[10px] px-1.5 py-0.5 rounded border ${
                mode === viewMode
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-white text-gray-700 border-gray-300 hover:bg-gray-100"
              }`}
              title={mode === "graph" ? "Radial node-link view" : "JSON-row list view"}
            >
              {mode === "graph" ? "Graph" : "List"}
            </button>
          ))}
        </div>
      </header>
      <div className="p-3 space-y-3 text-xs">
        <label className="flex items-center gap-2">
          <span className="text-gray-500">runtime_run_id:</span>
          <input
            data-testid="runtime-run-id-input"
            type="text"
            value={runtimeRunId}
            onChange={(e) => setRuntimeRunId(e.target.value)}
            placeholder="enter runtime run id"
            className="flex-1 px-2 py-1 border rounded font-mono"
          />
        </label>
        {runtimeRunId.length === 0 ? (
          <WorkspaceStateLayer state="empty_graph" />
        ) : (
          <>
            <TraceTemplate
              testIdPrefix="runtime-trace"
              templateKey="impact_runtime"
              runtimeRunId={runtimeRunId}
              title="Runtime trace"
              viewMode={viewMode}
            />
            <TraceTemplate
              testIdPrefix="decision-trace"
              templateKey="impact_governance"
              runtimeRunId={runtimeRunId}
              title="Decision trace (governance projection)"
              viewMode={viewMode}
            />
          </>
        )}
      </div>
    </section>
  );
}

function TraceTemplate({
  templateKey,
  runtimeRunId,
  title,
  testIdPrefix,
  viewMode,
}: {
  templateKey: string;
  runtimeRunId: string;
  title: string;
  testIdPrefix: string;
  viewMode: TraceViewMode;
}): React.ReactElement {
  const query = trpc.agentStudio.graphWorkspace.runImpactTemplate.useQuery(
    {
      templateKey,
      parameters: { startId: runtimeRunId, maxResults: 200 },
    },
    { enabled: runtimeRunId.length > 0 },
  );

  const state = useMemo(() => {
    if (query.isLoading) return "loading" as const;
    if (query.error) {
      return classifyWorkspaceState({
        trpcError: {
          code: query.error.data?.code,
          message: query.error.message,
        },
      });
    }
    if ((query.data?.rows ?? []).length === 0) return "empty_graph" as const;
    return null;
  }, [query.isLoading, query.error, query.data]);

  return (
    <div
      data-testid={testIdPrefix}
      data-view-mode={viewMode}
      className="border rounded"
    >
      <div className="px-2 py-1 font-semibold border-b">{title}</div>
      <div className="p-2">
        {state !== null ? (
          <WorkspaceStateLayer
            state={state}
            rawErrorForDevtools={query.error?.message}
          />
        ) : viewMode === "graph" ? (
          <TraceGraphView
            seedId={runtimeRunId}
            rows={(query.data?.rows ?? []) as ReadonlyArray<Record<string, unknown>>}
            testIdPrefix={testIdPrefix}
          />
        ) : (
          <ul className="space-y-0.5">
            {(query.data?.rows ?? []).map((row, idx) => (
              <li
                key={idx}
                data-testid={`${testIdPrefix}-step-${idx}`}
                className="px-2 py-0.5 rounded border font-mono break-all text-xs"
              >
                {JSON.stringify(row)}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
