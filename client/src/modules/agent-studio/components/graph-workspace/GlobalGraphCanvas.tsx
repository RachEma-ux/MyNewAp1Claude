/**
 * GlobalGraphCanvas — visual companion to GlobalGraphView.
 *
 * Force-directed render of `globalGraphSample` via d3-force. The
 * postgres backend now returns edges between sampled nodes (PR #1526)
 * and boundary-node edges where the next slice extends the sample,
 * so the canvas renders a real node-link diagram instead of a grid.
 * The companion text view exposes the same data without the layout
 * overhead.
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
  forceSimulation,
  forceX,
  forceY,
} from "d3-force";
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
const SIM_TICKS = 300;
const LINK_DISTANCE = 160;
const CHARGE_STRENGTH = -300;
const TYPE_BUCKET_RADIUS = 320;

interface ForceNode {
  id: string;
  typeKey: string;
  x?: number;
  y?: number;
}
interface ForceLink {
  source: string;
  target: string;
}

/**
 * Deterministic [0, 1) hash so seeded positions spread by typeKey
 * rather than collapsing on top of each other.
 */
function hashStringToUnit(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h * 16777619) >>> 0;
  }
  return (h >>> 0) / 0x100000000;
}

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

    // Dedup node + edge keys before feeding the simulation.
    const seenNodes = new Set<string>();
    const dedupedNodes = nodes.filter((n) => {
      const k = `${n.typeKey}:${n.id}`;
      if (seenNodes.has(k)) return false;
      seenNodes.add(k);
      return true;
    });
    const seenEdges = new Set<string>();
    const dedupedEdges = edges.filter((e) => {
      const k = `${e.sourceNode.id}|${e.typeKey}|${e.targetNode.id}`;
      if (seenEdges.has(k)) return false;
      seenEdges.add(k);
      return true;
    });

    // Stable typeKey bucket index — keeps the typeKey clustering
    // legible by anchoring each typeKey's centroid around a circle
    // of radius TYPE_BUCKET_RADIUS while letting the rest of the
    // simulation move freely.
    const typeKeys = Array.from(new Set(dedupedNodes.map((n) => n.typeKey)));
    typeKeys.sort();
    const typeAngle = new Map<string, number>();
    typeKeys.forEach((tk, i) => {
      typeAngle.set(tk, (2 * Math.PI * i) / Math.max(1, typeKeys.length));
    });

    // Constrain layout to the set of nodes that actually appear in
    // the edge set so disconnected sub-components don't drift apart
    // arbitrarily — d3 already handles this, but seeding helps the
    // simulation settle within SIM_TICKS.
    const forceNodes: ForceNode[] = dedupedNodes.map((n) => {
      const a = typeAngle.get(n.typeKey) ?? 0;
      const jitter = hashStringToUnit(n.id) * 0.8;
      return {
        id: n.id,
        typeKey: n.typeKey,
        x: Math.cos(a + jitter) * TYPE_BUCKET_RADIUS,
        y: Math.sin(a + jitter) * TYPE_BUCKET_RADIUS,
      };
    });
    const forceLinks: ForceLink[] = dedupedEdges.map((e) => ({
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
      .force("center", forceCenter(0, 0))
      .force(
        "typeX",
        forceX<ForceNode>(
          (d) =>
            Math.cos(typeAngle.get(d.typeKey) ?? 0) * TYPE_BUCKET_RADIUS,
        ).strength(0.05),
      )
      .force(
        "typeY",
        forceY<ForceNode>(
          (d) =>
            Math.sin(typeAngle.get(d.typeKey) ?? 0) * TYPE_BUCKET_RADIUS,
        ).strength(0.05),
      )
      .stop();
    for (let i = 0; i < SIM_TICKS; i++) sim.tick();

    const rfNodes: RFNode[] = forceNodes.map((fn) => ({
      id: fn.id,
      position: { x: fn.x ?? 0, y: fn.y ?? 0 },
      data: { label: `${fn.typeKey}\n${fn.id}` },
      style: nodeStyle(fn.typeKey),
      type: "default",
    }));

    const rfEdges: RFEdge[] = dedupedEdges.map((e, idx) => ({
      id: `${e.sourceNode.id}__${e.typeKey}__${e.targetNode.id}__${idx}`,
      source: e.sourceNode.id,
      target: e.targetNode.id,
      label: e.typeKey,
      style: { stroke: "#6b7280", strokeWidth: 1 },
      labelStyle: {
        fontSize: 9,
        fontFamily: "ui-monospace, SFMono-Regular, monospace",
        fill: "#374151",
      },
      labelBgStyle: { fill: "#fff", fillOpacity: 0.85 },
      labelBgPadding: [2, 4] as [number, number],
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
