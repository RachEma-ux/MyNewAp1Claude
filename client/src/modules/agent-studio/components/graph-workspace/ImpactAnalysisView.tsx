/**
 * ImpactAnalysisView — Product Work item 21.
 *
 * Runs the 7 impact_* templates (Phase 7.5c) against the selected
 * node via the allow-listed graphWorkspace.runImpactTemplate procedure.
 */

import React, { useMemo, useState } from "react";
import { trpc } from "../../../../lib/trpc";
import WorkspaceStateLayer, {
  classifyWorkspaceState,
} from "./WorkspaceStateLayer";

const IMPACT_TEMPLATES = [
  { key: "impact_knowledge", label: "Knowledge" },
  { key: "impact_runtime", label: "Runtime" },
  { key: "impact_code", label: "Code" },
  { key: "impact_security", label: "Security" },
  { key: "impact_governance", label: "Governance" },
  { key: "impact_tool", label: "Tool" },
  { key: "impact_workflow", label: "Workflow" },
] as const;

export interface ImpactAnalysisViewProps {
  readonly seedNodeId: string;
}

export default function ImpactAnalysisView({
  seedNodeId,
}: ImpactAnalysisViewProps): React.ReactElement {
  const [templateKey, setTemplateKey] = useState<string>(
    IMPACT_TEMPLATES[0]!.key,
  );

  const query = trpc.agentStudio.graphWorkspace.runImpactTemplate.useQuery(
    {
      templateKey,
      parameters: { startId: seedNodeId, maxResults: 100 },
    },
    { enabled: seedNodeId.length > 0 },
  );

  const state = useMemo(() => {
    if (!seedNodeId) return "empty_graph" as const;
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
  }, [seedNodeId, query.isLoading, query.error, query.data]);

  return (
    <section
      className="border rounded"
      data-testid="impact-analysis-view"
      data-seed-id={seedNodeId}
      data-template-key={templateKey}
    >
      <header className="flex items-center justify-between border-b px-3 py-1.5 text-xs">
        <span className="font-semibold uppercase text-gray-500">
          Impact analysis
        </span>
        <div className="flex flex-wrap items-center gap-1">
          {IMPACT_TEMPLATES.map((t) => (
            <button
              key={t.key}
              type="button"
              data-testid={`impact-template-${t.key}`}
              data-active={t.key === templateKey ? "true" : "false"}
              onClick={() => setTemplateKey(t.key)}
              className={`px-2 py-0.5 rounded border ${
                t.key === templateKey ? "bg-blue-50 border-blue-300" : ""
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </header>
      <div className="p-3 min-h-32">
        {state !== null ? (
          <WorkspaceStateLayer
            state={state}
            rawErrorForDevtools={query.error?.message}
          />
        ) : (
          <>
            {query.data?.truncated && (
              <div
                className="rounded bg-amber-50 text-amber-700 px-2 py-1 text-xs mb-2"
                data-testid="impact-truncated"
              >
                ✂ Result truncated; results may be incomplete.
              </div>
            )}
            <div className="text-xs font-semibold text-gray-500 mb-1">
              Affected rows ({query.data?.rows.length ?? 0})
            </div>
            <ul className="space-y-0.5 text-xs">
              {(query.data?.rows ?? []).map((row, idx) => (
                <li
                  key={idx}
                  data-testid={`impact-row-${idx}`}
                  className="px-2 py-0.5 rounded border font-mono break-all"
                >
                  {JSON.stringify(row)}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </section>
  );
}
