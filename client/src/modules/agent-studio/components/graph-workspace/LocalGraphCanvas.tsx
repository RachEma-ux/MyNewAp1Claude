/**
 * LocalGraphCanvas — Native Graph Workspace visual node-link view.
 *
 * Renders the same `localGraph` tRPC payload as `LocalGraphView`, but
 * as a force-directed layout via d3-force instead of a text list.
 * The text-list view is preserved as a toggle so screen readers +
 * low-pixel-density operator views stay first-class.
 *
 * Layout: d3-force simulation runs for a fixed tick budget at mount
 * (off-DOM — no animation loop, no per-tick re-render). The seed
 * node is pinned at the origin via `fx`/`fy`; peers settle around
 * it under link + many-body (charge) + radial-anchor forces. The
 * BFS-derived depth (seed=0, neighbors=1, …) feeds the radial anchor
 * so the layout retains the legibility of the original radial rings
 * while honoring real edge geometry.
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
import {
  forceCenter,
  forceLink,
  forceManyBody,
  forceRadial,
  forceSimulation,
} from "d3-force";
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
 * d3-force layout: seed pinned at origin, peers settle under
 *   - link force (target distance ~ depth-step length)
 *   - many-body (charge) force for repulsion
 *   - radial anchor keyed by BFS depth so rings stay visible
 *   - center force to keep the whole graph framed
 *
 * The simulation runs for a fixed tick budget at mount, off the DOM
 * (no animation loop, no React re-render per tick). React-flow then
 * renders the settled positions as static node coordinates.
 */
const RING_RADIUS = 180;
const NODE_W = 140;
const NODE_H = 36;
const SIM_TICKS = 300;
const LINK_DISTANCE = RING_RADIUS;
const CHARGE_STRENGTH = -400;
const RADIAL_STRENGTH = 0.5;

interface ForceNode {
  id: string;
  ring: number;
  fx?: number;
  fy?: number;
  x?: number;
  y?: number;
}
interface ForceLink {
  source: string;
  target: string;
}

function layoutForce(
  seedId: string,
  nodes: ReadonlyArray<NodeRow>,
  edges: ReadonlyArray<EdgeRow>,
  depths: Map<string, number>,
): Map<string, { x: number; y: number }> {
  let maxRing = 0;
  for (const d of depths.values()) {
    if (Number.isFinite(d) && d > maxRing) maxRing = d;
  }
  const orphanRing = maxRing + 1;

  const forceNodes: ForceNode[] = nodes.map((n) => {
    const d = depths.get(n.id) ?? Number.POSITIVE_INFINITY;
    const ring = Number.isFinite(d) ? (d as number) : orphanRing;
    const angle = (2 * Math.PI * hashStringToUnit(n.id));
    const base: ForceNode = {
      id: n.id,
      ring,
      x: Math.cos(angle) * ring * RING_RADIUS,
      y: Math.sin(angle) * ring * RING_RADIUS,
    };
    if (n.id === seedId) {
      base.fx = 0;
      base.fy = 0;
    }
    return base;
  });
  const forceLinks: ForceLink[] = edges.map((e) => ({
    source: e.sourceNode.id,
    target: e.targetNode.id,
  }));

  const sim = forceSimulation(forceNodes as never)
    .force(
      "link",
      forceLink(forceLinks as never)
        .id((d: never) => (d as ForceNode).id)
        .distance(LINK_DISTANCE),
    )
    .force("charge", forceManyBody().strength(CHARGE_STRENGTH))
    .force(
      "radial",
      forceRadial<ForceNode>(
        (d) => d.ring * RING_RADIUS,
        0,
        0,
      ).strength(RADIAL_STRENGTH),
    )
    .force("center", forceCenter(0, 0))
    .stop();

  for (let i = 0; i < SIM_TICKS; i++) sim.tick();

  const positions = new Map<string, { x: number; y: number }>();
  for (const n of forceNodes) {
    positions.set(n.id, { x: n.x ?? 0, y: n.y ?? 0 });
  }
  return positions;
}

/**
 * Deterministic [0, 1) hash so initial seeding for sibling nodes
 * spreads around the ring rather than collapsing on top of each
 * other, which would stall the force simulation.
 */
function hashStringToUnit(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h * 16777619) >>> 0;
  }
  return (h >>> 0) / 0x100000000;
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

    // Defensive dedup pass on (id, typeKey) and (source, typeKey,
    // target). The DB-side partial unique index on
    // `(type_key, edge_key)` (slice 4 of the no-deferral catalogue)
    // is the source-of-truth dedup; this pass survives null-keyed
    // legacy edges that the partial index intentionally ignores.
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
    const positions = layoutForce(seedNodeId, dedupedNodes, dedupedEdges, depths);

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
