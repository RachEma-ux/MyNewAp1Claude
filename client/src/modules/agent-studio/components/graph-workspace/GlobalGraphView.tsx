/**
 * GlobalGraphView — Product Work item 19.
 *
 * Bounded workspace-wide graph sample. Uses globalGraphSample under
 * the hood. Truncation indicator + empty / backend-down states.
 */

import React, { useMemo, useState } from "react";
import { trpc } from "../../../../lib/trpc";
import WorkspaceStateLayer, {
  classifyWorkspaceState,
} from "./WorkspaceStateLayer";
import GlobalGraphCanvas from "./GlobalGraphCanvas";

const SAMPLE_OPTIONS = [50, 100, 250] as const;
const VIEW_MODES = ["canvas", "list"] as const;
type ViewMode = (typeof VIEW_MODES)[number];

export interface GlobalGraphViewProps {
  readonly onSelectNode?: (nodeId: string) => void;
  readonly defaultViewMode?: ViewMode;
}

export default function GlobalGraphView({
  onSelectNode,
  defaultViewMode = "canvas",
}: GlobalGraphViewProps): React.ReactElement {
  const [sampleSize, setSampleSize] = useState<number>(100);
  const [viewMode, setViewMode] = useState<ViewMode>(defaultViewMode);
  const query = trpc.agentStudio.graphWorkspace.globalGraphSample.useQuery(
    { options: { maxDepth: 1, maxResults: sampleSize } },
    { enabled: viewMode === "list" },
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
    if ((query.data?.nodes ?? []).length === 0) return "empty_graph" as const;
    return null;
  }, [query.isLoading, query.error, query.data]);

  return (
    <section
      className="border rounded"
      data-testid="global-graph-view"
      data-sample-size={sampleSize}
      data-view-mode={viewMode}
    >
      <header className="flex items-center justify-between border-b px-3 py-1.5 text-xs gap-2">
        <span className="font-semibold uppercase text-gray-500">
          Global graph sample
        </span>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <span className="text-gray-500">view:</span>
            {VIEW_MODES.map((m) => (
              <button
                key={m}
                type="button"
                data-testid={`global-graph-view-mode-${m}`}
                data-active={m === viewMode ? "true" : "false"}
                onClick={() => setViewMode(m)}
                className={`px-2 py-0.5 rounded border ${
                  m === viewMode ? "bg-blue-50 border-blue-300" : ""
                }`}
              >
                {m}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1">
            <span className="text-gray-500">sample:</span>
            {SAMPLE_OPTIONS.map((s) => (
              <button
                key={s}
                type="button"
                data-testid={`global-graph-sample-${s}`}
                data-active={s === sampleSize ? "true" : "false"}
                onClick={() => setSampleSize(s)}
                className={`px-2 py-0.5 rounded border ${
                  s === sampleSize ? "bg-blue-50 border-blue-300" : ""
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </header>
      <div className="p-3 min-h-32">
        {viewMode === "canvas" ? (
          <GlobalGraphCanvas
            sampleSize={sampleSize}
            onSelectNode={onSelectNode}
          />
        ) : state !== null ? (
          <WorkspaceStateLayer
            state={state}
            rawErrorForDevtools={query.error?.message}
          />
        ) : (
          <>
            {query.data?.truncated && (
              <div
                className="rounded bg-amber-50 text-amber-700 px-2 py-1 text-xs mb-2"
                data-testid="global-graph-truncated"
              >
                ✂ Sample truncated at maxResults={sampleSize}.
              </div>
            )}
            <div className="text-xs font-semibold text-gray-500 mb-1">
              Nodes ({query.data?.nodes.length ?? 0})
            </div>
            <ul className="grid grid-cols-3 gap-1 text-xs">
              {(query.data?.nodes ?? []).map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    data-testid={`global-graph-node-${n.id}`}
                    className="text-left w-full px-2 py-0.5 rounded border hover:bg-gray-50 font-mono"
                    onClick={() => onSelectNode?.(n.id)}
                  >
                    <span className="text-gray-500">{n.typeKey}:</span> {n.id}
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </section>
  );
}
