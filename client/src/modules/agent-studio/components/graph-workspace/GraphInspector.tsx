/**
 * GraphInspector — Product Work item 20.
 *
 * Right-drawer panel that renders explainNode / explainPath output
 * for the currently-selected node or path.
 *
 * Permission-aware: the underlying repo's `explainNode` already
 * returns null for nodes invisible to the runtime. This component
 * renders a "hidden_reference" state in that case — NEVER the raw
 * properties.
 */

import React, { useMemo } from "react";
import { trpc } from "../../../../lib/trpc";
import WorkspaceStateLayer, {
  classifyWorkspaceState,
} from "./WorkspaceStateLayer";

export type InspectorTarget =
  | { kind: "node"; nodeId: string }
  | { kind: "edge"; fromId: string; toId: string }
  | { kind: "none" };

export interface GraphInspectorProps {
  readonly target: InspectorTarget;
}

export default function GraphInspector({
  target,
}: GraphInspectorProps): React.ReactElement {
  if (target.kind === "none") {
    return <NoTarget />;
  }
  if (target.kind === "node") {
    return <NodeInspector nodeId={target.nodeId} />;
  }
  return <PathInspector fromId={target.fromId} toId={target.toId} />;
}

function NoTarget(): React.ReactElement {
  return (
    <div
      className="border rounded p-3 text-xs text-gray-500"
      data-testid="graph-inspector-empty"
    >
      Select a node or edge in the graph to inspect it.
    </div>
  );
}

function NodeInspector({ nodeId }: { nodeId: string }): React.ReactElement {
  const query = trpc.agentStudio.graphWorkspace.explainNode.useQuery({
    nodeId,
  });

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
    if (!query.data?.found) return "hidden_reference" as const;
    return null;
  }, [query.isLoading, query.error, query.data]);

  return (
    <section
      className="border rounded"
      data-testid="graph-inspector-node"
      data-node-id={nodeId}
    >
      <header className="border-b px-3 py-1.5 text-xs font-semibold uppercase text-gray-500">
        Node inspector
      </header>
      <div className="p-3 space-y-2">
        {state !== null ? (
          <WorkspaceStateLayer
            state={state}
            rawErrorForDevtools={query.error?.message}
          />
        ) : (
          query.data?.found && (
            <>
              <div className="text-xs">
                <span className="text-gray-500">id:</span>{" "}
                <code data-testid="inspector-node-id">{query.data.node.id}</code>
              </div>
              <div className="text-xs">
                <span className="text-gray-500">type:</span>{" "}
                <code data-testid="inspector-node-type">{query.data.node.typeKey}</code>
              </div>
              <ProvenanceList provenance={query.data.provenance} />
              <Details title="Properties" testId="inspector-node-properties">
                <pre className="text-xs whitespace-pre-wrap break-all">
                  {JSON.stringify(query.data.properties, null, 2)}
                </pre>
              </Details>
            </>
          )
        )}
      </div>
    </section>
  );
}

function PathInspector({
  fromId,
  toId,
}: {
  fromId: string;
  toId: string;
}): React.ReactElement {
  const query = trpc.agentStudio.graphWorkspace.explainPath.useQuery({
    fromNodeId: fromId,
    toNodeId: toId,
  });

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
    if (!query.data?.path) return "hidden_reference" as const;
    return null;
  }, [query.isLoading, query.error, query.data]);

  return (
    <section
      className="border rounded"
      data-testid="graph-inspector-path"
      data-from-id={fromId}
      data-to-id={toId}
    >
      <header className="border-b px-3 py-1.5 text-xs font-semibold uppercase text-gray-500">
        Path inspector
      </header>
      <div className="p-3 space-y-2">
        {state !== null ? (
          <WorkspaceStateLayer
            state={state}
            rawErrorForDevtools={query.error?.message}
          />
        ) : (
          query.data?.path && (
            <>
              <div className="text-xs">
                <span className="text-gray-500">cost (hops):</span>{" "}
                <code data-testid="inspector-path-cost">{query.data.cost ?? query.data.path.length}</code>
              </div>
              <ol className="space-y-0.5 text-xs">
                {query.data.path.nodes.map((n, i) => (
                  <li
                    key={`${n.id}-${i}`}
                    data-testid={`inspector-path-step-${i}`}
                    className="font-mono"
                  >
                    {i + 1}. <span className="text-gray-500">{n.typeKey}:</span>{" "}
                    {n.id}
                  </li>
                ))}
              </ol>
              <Details title="Cypher" testId="inspector-path-cypher">
                <pre className="text-xs whitespace-pre-wrap break-all">
                  {query.data.cypher}
                </pre>
              </Details>
            </>
          )
        )}
      </div>
    </section>
  );
}

function ProvenanceList({
  provenance,
}: {
  provenance: {
    sourceType: string;
    sourceId: string;
    sourceVersionId?: string;
    confidence?: number;
    lineageStatus: string;
    extractionMethod?: string;
    governanceStatus?: string;
    projectionSnapshotId?: string;
  };
}): React.ReactElement {
  const rows: Array<[string, string | number | undefined]> = [
    ["source type", provenance.sourceType],
    ["source id", provenance.sourceId],
    ["source version id", provenance.sourceVersionId],
    ["lineage status", provenance.lineageStatus],
    ["extraction method", provenance.extractionMethod],
    ["confidence", provenance.confidence],
    ["governance status", provenance.governanceStatus],
    ["projection snapshot", provenance.projectionSnapshotId],
  ];
  return (
    <div data-testid="inspector-node-provenance" className="text-xs">
      <div className="font-semibold text-gray-500 mb-1">Provenance</div>
      <table className="w-full">
        <tbody>
          {rows.map(([label, value]) =>
            value === undefined ? null : (
              <tr key={label}>
                <td className="text-gray-500 pr-2 align-top">{label}</td>
                <td>
                  <code>{String(value)}</code>
                </td>
              </tr>
            ),
          )}
        </tbody>
      </table>
    </div>
  );
}

function Details({
  title,
  children,
  testId,
}: {
  title: string;
  children: React.ReactNode;
  testId: string;
}): React.ReactElement {
  return (
    <details className="text-xs" data-testid={testId}>
      <summary className="cursor-pointer text-gray-500">{title}</summary>
      <div className="pt-1">{children}</div>
    </details>
  );
}
