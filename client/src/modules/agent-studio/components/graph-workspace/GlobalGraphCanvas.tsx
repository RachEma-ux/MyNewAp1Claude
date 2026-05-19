/**
 * GlobalGraphCanvas — visual companion to GlobalGraphView.
 *
 * Force-directed-ish render of `globalGraphSample`. Since the postgres
 * backend currently returns `edges: []` for the sample (Cypher-side
 * sampling on Neo4j would include edges; the recursive-CTE fallback
 * does not), the canvas degrades gracefully to a grid of orphan nodes
 * grouped by `typeKey`. The companion text view exposes the same
 * data without the layout overhead.
 */

import React, { useMemo } from "react";
import ReactFlow, {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  type Edge as RFEdge,
  type Node as RFNode,
} from "reactflow";
import "reactflow/dist/style.css";
import { trpc } from "../../../../lib/trpc";
import WorkspaceStateLayer, {
  classifyWorkspaceState,
} from "./WorkspaceStateLayer";

export interface GlobalGraphCanvasProps {
  readonly sampleSize: number;
  readonly onSelectNode?: (nodeId: string) => void;
}

const NODE_W = 150;
const NODE_H = 36;
const CELL_W = NODE_W + 30;
const CELL_H = NODE_H + 24;

function nodeStyle(typeKey: string): React.CSSProperties {
  const palette: Record<string, { bg: string; border: string }> = {
    Note: { bg: "#fef3c7", border: "#f59e0b" },
    NoteVersion: { bg: "#e0f2fe", border: "#0284c7" },
    Base: { bg: "#ede9fe", border: "#7c3aed" },
    BaseRow: { bg: "#f5f3ff", border: "#8b5cf6" },
    RuntimeTrace: { bg: "#fce7f3", border: "#db2777" },
    Entity: { bg: "#dcfce7", border: "#16a34a" },
  };
  const colors = palette[typeKey] ?? { bg: "#f3f4f6", border: "#6b7280" };
  return {
    background: colors.bg,
    border: `1.5px solid ${colors.border}`,
    borderRadius: 6,
    padding: "4px 8px",
    fontSize: 11,
    fontFamily: "ui-monospace, SFMono-Regular, monospace",
    minWidth: NODE_W,
    maxWidth: NODE_W,
    textAlign: "center",
  };
}

export default function GlobalGraphCanvas({
  sampleSize,
  onSelectNode,
}: GlobalGraphCanvasProps): React.ReactElement {
  const query = trpc.agentStudio.graphWorkspace.globalGraphSample.useQuery({
    options: { maxDepth: 1, maxResults: sampleSize },
  });

  const { rfNodes, rfEdges } = useMemo(() => {
    const nodes = query.data?.nodes ?? [];
    const edges = query.data?.edges ?? [];

    // Group by typeKey, then column-row layout per group.
    const byType = new Map<string, Array<{ typeKey: string; id: string }>>();
    for (const n of nodes) {
      if (!byType.has(n.typeKey)) byType.set(n.typeKey, []);
      byType.get(n.typeKey)!.push(n);
    }

    const rfNodes: RFNode[] = [];
    let columnX = 0;
    for (const [, group] of byType.entries()) {
      const cols = Math.ceil(Math.sqrt(group.length));
      group.forEach((g, idx) => {
        const col = idx % cols;
        const row = Math.floor(idx / cols);
        rfNodes.push({
          id: g.id,
          position: { x: columnX + col * CELL_W, y: row * CELL_H },
          data: { label: `${g.typeKey}\n${g.id}` },
          style: nodeStyle(g.typeKey),
          type: "default",
        });
      });
      columnX += cols * CELL_W + 60;
    }

    const rfEdges: RFEdge[] = edges.map((e, idx) => ({
      id: `${e.sourceNode.id}__${e.typeKey}__${e.targetNode.id}__${idx}`,
      source: e.sourceNode.id,
      target: e.targetNode.id,
      label: e.typeKey,
      style: { stroke: "#6b7280", strokeWidth: 1 },
    }));

    return { rfNodes, rfEdges };
  }, [query.data]);

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
    if (rfNodes.length === 0) return "empty_graph" as const;
    return null;
  }, [query.isLoading, query.error, rfNodes.length]);

  if (state !== null) {
    return (
      <div className="border rounded min-h-64 flex items-center justify-center">
        <WorkspaceStateLayer
          state={state}
          rawErrorForDevtools={query.error?.message}
        />
      </div>
    );
  }

  return (
    <div
      className="border rounded"
      style={{ width: "100%", height: 480 }}
      data-testid="global-graph-canvas"
      data-sample-size={sampleSize}
      data-node-count={rfNodes.length}
      data-edge-count={rfEdges.length}
    >
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        nodesDraggable
        nodesConnectable={false}
        elementsSelectable
        onNodeClick={(_evt, node) => onSelectNode?.(node.id)}
        proOptions={{ hideAttribution: true }}
        minZoom={0.05}
        maxZoom={2}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
        <Controls showInteractive={false} />
        <MiniMap
          zoomable
          pannable
          nodeStrokeWidth={2}
          style={{ height: 80, width: 120 }}
        />
      </ReactFlow>
      {query.data?.truncated && (
        <div
          className="text-xs text-amber-700 bg-amber-50 px-2 py-1 border-t"
          data-testid="global-graph-canvas-truncated"
        >
          ✂ Sample truncated at maxResults={sampleSize}.
        </div>
      )}
    </div>
  );
}
