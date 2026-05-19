/**
 * LocalGraphCanvas — Native Graph Workspace visual node-link view.
 *
 * Renders the same `localGraph` tRPC payload as `LocalGraphView`, but
 * as a force-directed-ish layout with react-flow instead of a text
 * list. The text-list view is preserved as a toggle so screen readers
 * + low-pixel-density operator views stay first-class.
 *
 * No mock data. Re-uses the same `classifyWorkspaceState` helper as
 * the sibling text view so error/empty states render identically.
 *
 * The seed node is centered; peers fan out in radial rings keyed by
 * a simple depth-vs-incident-edge heuristic computed client-side
 * (the localGraph response does not currently expose per-row depth;
 * we infer it by BFS over the returned edges). For 27-node Movies
 * Demo neighborhoods this lands cheap and stable. Larger graphs
 * benefit from a true force simulation — d3-force can be slotted
 * in later without changing this file's caller contract.
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

export interface LocalGraphCanvasProps {
  readonly seedNodeId: string;
  readonly depth: number;
  readonly maxResults?: number;
  readonly onSelectNode?: (nodeId: string) => void;
  readonly onSelectEdge?: (edgeKey: { fromId: string; toId: string }) => void;
}

interface NodeRow {
  readonly typeKey: string;
  readonly id: string;
}
interface EdgeRow {
  readonly typeKey: string;
  readonly id: string;
  readonly sourceNode: NodeRow;
  readonly targetNode: NodeRow;
}

/**
 * BFS over the returned edges to assign each node a "depth" relative
 * to the seed. Seed = 0. Neighbors-of-seed = 1. Unreachable = Infinity
 * (orphan; placed in a fallback ring at depth+1).
 */
function computeDepths(
  seedId: string,
  nodes: ReadonlyArray<NodeRow>,
  edges: ReadonlyArray<EdgeRow>,
): Map<string, number> {
  const adjacency = new Map<string, Set<string>>();
  for (const n of nodes) adjacency.set(n.id, new Set());
  for (const e of edges) {
    adjacency.get(e.sourceNode.id)?.add(e.targetNode.id);
    adjacency.get(e.targetNode.id)?.add(e.sourceNode.id);
  }
  const depth = new Map<string, number>();
  if (!adjacency.has(seedId)) return depth;
  depth.set(seedId, 0);
  const queue: string[] = [seedId];
  while (queue.length) {
    const cur = queue.shift()!;
    const curDepth = depth.get(cur)!;
    for (const next of adjacency.get(cur) ?? []) {
      if (!depth.has(next)) {
        depth.set(next, curDepth + 1);
        queue.push(next);
      }
    }
  }
  return depth;
}

/**
 * Radial layout: seed at origin, ring N at radius N * STEP. Within a
 * ring, nodes evenly distributed by angle. Orphans (depth = ∞) land
 * on the outermost ring.
 */
const RING_RADIUS = 180;
const NODE_W = 140;
const NODE_H = 36;

function layoutRadial(
  seedId: string,
  nodes: ReadonlyArray<NodeRow>,
  depths: Map<string, number>,
): Map<string, { x: number; y: number }> {
  const byRing = new Map<number, NodeRow[]>();
  let maxRing = 0;
  for (const n of nodes) {
    const d = depths.get(n.id) ?? Number.POSITIVE_INFINITY;
    const ring = Number.isFinite(d) ? d : -1;
    if (!byRing.has(ring)) byRing.set(ring, []);
    byRing.get(ring)!.push(n);
    if (Number.isFinite(d)) maxRing = Math.max(maxRing, d);
  }
  // Orphan ring sits one step beyond the deepest reachable ring.
  const orphanRing = maxRing + 1;

  const positions = new Map<string, { x: number; y: number }>();
  for (const [ring, members] of byRing.entries()) {
    const effectiveRing = ring === -1 ? orphanRing : ring;
    if (effectiveRing === 0) {
      // Seed at origin.
      positions.set(seedId, { x: 0, y: 0 });
      continue;
    }
    const radius = effectiveRing * RING_RADIUS;
    members.forEach((m, idx) => {
      const angle = (2 * Math.PI * idx) / members.length;
      positions.set(m.id, {
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius,
      });
    });
  }
  return positions;
}

function nodeStyle(typeKey: string, isSeed: boolean): React.CSSProperties {
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
    border: `${isSeed ? "3" : "1.5"}px solid ${colors.border}`,
    borderRadius: 6,
    padding: "4px 8px",
    fontSize: 11,
    fontFamily: "ui-monospace, SFMono-Regular, monospace",
    minWidth: NODE_W,
    maxWidth: NODE_W,
    textAlign: "center",
    boxShadow: isSeed ? "0 0 0 3px rgba(245, 158, 11, 0.2)" : undefined,
  };
}

function edgeStyle(typeKey: string): React.CSSProperties {
  const palette: Record<string, string> = {
    VERSION_OF: "#0284c7",
    LINKS_TO: "#f59e0b",
    PROMOTED_TO: "#16a34a",
    OF_BASE: "#7c3aed",
    ROW_OF_NOTE: "#8b5cf6",
  };
  return { stroke: palette[typeKey] ?? "#6b7280", strokeWidth: 1.5 };
}

export default function LocalGraphCanvas({
  seedNodeId,
  depth,
  maxResults = 100,
  onSelectNode,
  onSelectEdge,
}: LocalGraphCanvasProps): React.ReactElement {
  const query = trpc.agentStudio.graphWorkspace.localGraph.useQuery(
    { seedNodeId, options: { maxDepth: depth, maxResults } },
    { enabled: seedNodeId.length > 0 },
  );

  const { rfNodes, rfEdges } = useMemo(() => {
    const nodes: ReadonlyArray<NodeRow> = query.data?.nodes ?? [];
    const edges: ReadonlyArray<EdgeRow> = query.data?.edges ?? [];

    // Dedup identical (id, typeKey) — `ags_graph_edges` currently
    // allows duplicate rows because `upsertEdge` does not use
    // `onConflictDoUpdate`. The canvas would render overlapping
    // edges otherwise.
    const seenNodes = new Set<string>();
    const dedupedNodes = nodes.filter((n) => {
      const key = `${n.typeKey}:${n.id}`;
      if (seenNodes.has(key)) return false;
      seenNodes.add(key);
      return true;
    });
    const seenEdges = new Set<string>();
    const dedupedEdges = edges.filter((e) => {
      const key = `${e.sourceNode.id}|${e.typeKey}|${e.targetNode.id}`;
      if (seenEdges.has(key)) return false;
      seenEdges.add(key);
      return true;
    });

    const depths = computeDepths(seedNodeId, dedupedNodes, dedupedEdges);
    const positions = layoutRadial(seedNodeId, dedupedNodes, depths);

    const rfNodes: RFNode[] = dedupedNodes.map((n) => {
      const pos = positions.get(n.id) ?? { x: 0, y: 0 };
      const isSeed = n.id === seedNodeId;
      return {
        id: n.id,
        position: pos,
        data: { label: `${n.typeKey}\n${n.id}` },
        style: nodeStyle(n.typeKey, isSeed),
        type: "default",
      };
    });

    const rfEdges: RFEdge[] = dedupedEdges.map((e, idx) => ({
      id: `${e.sourceNode.id}__${e.typeKey}__${e.targetNode.id}__${idx}`,
      source: e.sourceNode.id,
      target: e.targetNode.id,
      label: e.typeKey,
      style: edgeStyle(e.typeKey),
      labelStyle: {
        fontSize: 9,
        fontFamily: "ui-monospace, SFMono-Regular, monospace",
        fill: "#374151",
      },
      labelBgStyle: { fill: "#fff", fillOpacity: 0.85 },
      labelBgPadding: [2, 4] as [number, number],
      animated: false,
    }));

    return { rfNodes, rfEdges };
  }, [query.data, seedNodeId]);

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
    if (rfNodes.length === 0) return "empty_graph" as const;
    return null;
  }, [seedNodeId, query.isLoading, query.error, rfNodes.length]);

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
      data-testid="local-graph-canvas"
      data-seed-id={seedNodeId}
      data-depth={depth}
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
        onEdgeClick={(_evt, edge) =>
          onSelectEdge?.({ fromId: String(edge.source), toId: String(edge.target) })
        }
        proOptions={{ hideAttribution: true }}
        minZoom={0.1}
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
          data-testid="local-graph-canvas-truncated"
        >
          ✂ Result truncated to {maxResults} nodes/edges.
        </div>
      )}
    </div>
  );
}
