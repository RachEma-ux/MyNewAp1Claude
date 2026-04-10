import { useEffect, useRef, useState, useCallback } from "react";

interface GraphNode {
  id: number;
  nodeType: string;
  label: string;
  confidence: number | null;
  properties?: any;
}

interface GraphEdge {
  id: number;
  fromNodeId: number;
  toNodeId: number;
  relationshipType: string;
  confidence: number | null;
}

interface KnowledgeGraphViewProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

// Color palette by node type
const NODE_COLORS: Record<string, string> = {
  platform: "#6366f1",   // indigo
  module: "#10b981",     // emerald
  technology: "#f59e0b", // amber
  provider: "#8b5cf6",   // violet
  plane: "#06b6d4",      // cyan
  database: "#ef4444",   // red
  control: "#f97316",    // orange
  entity: "#64748b",     // slate
};

const NODE_RADIUS: Record<string, number> = {
  platform: 32,
  module: 22,
  technology: 18,
  provider: 18,
  plane: 18,
  database: 20,
  control: 16,
  entity: 14,
};

interface SimNode {
  id: number;
  label: string;
  nodeType: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  color: string;
}

interface SimEdge {
  source: number;
  target: number;
  label: string;
}

export default function KnowledgeGraphView({ nodes, edges }: KnowledgeGraphViewProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [simNodes, setSimNodes] = useState<SimNode[]>([]);
  const [simEdges, setSimEdges] = useState<SimEdge[]>([]);
  const [hoveredNode, setHoveredNode] = useState<SimNode | null>(null);
  const [dimensions, setDimensions] = useState({ w: 800, h: 500 });
  const frameRef = useRef<number>(0);
  const iterRef = useRef(0);

  // Initialize simulation
  useEffect(() => {
    if (nodes.length === 0) return;

    const parent = svgRef.current?.parentElement;
    const w = parent?.clientWidth ?? 800;
    const h = parent?.clientHeight ?? 500;
    setDimensions({ w, h });
    const cx = w / 2, cy = h / 2;

    // Position nodes in a circle initially
    const angleStep = (2 * Math.PI) / nodes.length;
    const initRadius = Math.min(w, h) * 0.35;

    const sn: SimNode[] = nodes.map((n, i) => ({
      id: n.id,
      label: n.label,
      nodeType: n.nodeType,
      x: cx + initRadius * Math.cos(i * angleStep),
      y: cy + initRadius * Math.sin(i * angleStep),
      vx: 0,
      vy: 0,
      r: NODE_RADIUS[n.nodeType] ?? 16,
      color: NODE_COLORS[n.nodeType] ?? "#64748b",
    }));

    const se: SimEdge[] = edges.map((e) => ({
      source: e.fromNodeId,
      target: e.toNodeId,
      label: e.relationshipType,
    }));

    setSimNodes(sn);
    setSimEdges(se);
    iterRef.current = 0;
  }, [nodes, edges]);

  // Force-directed simulation
  useEffect(() => {
    if (simNodes.length === 0) return;

    const nodeMap = new Map(simNodes.map((n) => [n.id, n]));
    const { w, h } = dimensions;
    const cx = w / 2, cy = h / 2;
    const MAX_ITER = 200;

    function tick() {
      if (iterRef.current >= MAX_ITER) return;
      iterRef.current++;

      const cooling = 1 - iterRef.current / MAX_ITER;
      const nodes = [...simNodes];

      // Repulsion (all pairs)
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[j].x - nodes[i].x;
          const dy = nodes[j].y - nodes[i].y;
          const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
          const force = (3000 * cooling) / (dist * dist);
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          nodes[i].vx -= fx;
          nodes[i].vy -= fy;
          nodes[j].vx += fx;
          nodes[j].vy += fy;
        }
      }

      // Attraction (edges)
      for (const edge of simEdges) {
        const s = nodeMap.get(edge.source);
        const t = nodeMap.get(edge.target);
        if (!s || !t) continue;
        const si = nodes.findIndex((n) => n.id === s.id);
        const ti = nodes.findIndex((n) => n.id === t.id);
        if (si < 0 || ti < 0) continue;

        const dx = nodes[ti].x - nodes[si].x;
        const dy = nodes[ti].y - nodes[si].y;
        const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
        const force = (dist - 120) * 0.01 * cooling;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        nodes[si].vx += fx;
        nodes[si].vy += fy;
        nodes[ti].vx -= fx;
        nodes[ti].vy -= fy;
      }

      // Center gravity
      for (const n of nodes) {
        n.vx += (cx - n.x) * 0.002 * cooling;
        n.vy += (cy - n.y) * 0.002 * cooling;
      }

      // Apply velocity with damping
      for (const n of nodes) {
        n.vx *= 0.6;
        n.vy *= 0.6;
        n.x += n.vx;
        n.y += n.vy;
        // Keep in bounds
        n.x = Math.max(n.r + 4, Math.min(w - n.r - 4, n.x));
        n.y = Math.max(n.r + 4, Math.min(h - n.r - 4, n.y));
      }

      setSimNodes([...nodes]);
      frameRef.current = requestAnimationFrame(tick);
    }

    frameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRef.current);
  }, [simNodes.length, dimensions]);

  const nodeById = new Map(simNodes.map((n) => [n.id, n]));

  if (nodes.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        No graph data to display
      </div>
    );
  }

  return (
    <div className="relative w-full h-full min-h-[400px]">
      <svg
        ref={svgRef}
        width="100%"
        height="100%"
        viewBox={`0 0 ${dimensions.w} ${dimensions.h}`}
        className="bg-background"
      >
        <defs>
          <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
            <polygon points="0 0, 8 3, 0 6" fill="#475569" opacity="0.6" />
          </marker>
        </defs>

        {/* Edges */}
        {simEdges.map((edge, i) => {
          const s = nodeById.get(edge.source);
          const t = nodeById.get(edge.target);
          if (!s || !t) return null;
          const dx = t.x - s.x;
          const dy = t.y - s.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const sx = s.x + (dx / dist) * s.r;
          const sy = s.y + (dy / dist) * s.r;
          const tx = t.x - (dx / dist) * t.r;
          const ty = t.y - (dy / dist) * t.r;
          const mx = (sx + tx) / 2;
          const my = (sy + ty) / 2;

          return (
            <g key={`e-${i}`}>
              <line
                x1={sx} y1={sy} x2={tx} y2={ty}
                stroke="#475569" strokeWidth={1.2} opacity={0.4}
                markerEnd="url(#arrowhead)"
              />
              <text x={mx} y={my - 4} textAnchor="middle" fontSize={8} fill="#64748b" opacity={0.7}>
                {edge.label.replace(/_/g, " ")}
              </text>
            </g>
          );
        })}

        {/* Nodes */}
        {simNodes.map((node) => (
          <g
            key={node.id}
            onMouseEnter={() => setHoveredNode(node)}
            onMouseLeave={() => setHoveredNode(null)}
            style={{ cursor: "pointer" }}
          >
            <circle
              cx={node.x} cy={node.y} r={node.r}
              fill={node.color} opacity={hoveredNode?.id === node.id ? 1 : 0.85}
              stroke={hoveredNode?.id === node.id ? "#fff" : node.color}
              strokeWidth={hoveredNode?.id === node.id ? 2.5 : 1}
            />
            <text
              x={node.x} y={node.y + node.r + 12}
              textAnchor="middle" fontSize={10} fontWeight={500}
              fill="#e2e8f0"
            >
              {node.label}
            </text>
            {/* Icon text inside circle */}
            <text
              x={node.x} y={node.y + 4}
              textAnchor="middle" fontSize={node.r > 20 ? 10 : 8} fontWeight={600}
              fill="#fff"
            >
              {node.label.length <= 4 ? node.label : node.label.slice(0, 3)}
            </text>
          </g>
        ))}
      </svg>

      {/* Hover tooltip */}
      {hoveredNode && (
        <div
          className="absolute bg-card border border-border rounded-lg shadow-lg p-3 text-xs pointer-events-none z-10"
          style={{ left: Math.min(hoveredNode.x + 20, dimensions.w - 200), top: hoveredNode.y - 30 }}
        >
          <div className="font-semibold text-sm">{hoveredNode.label}</div>
          <div className="text-muted-foreground capitalize">{hoveredNode.nodeType}</div>
        </div>
      )}

      {/* Legend */}
      <div className="absolute bottom-3 left-3 bg-card/90 border border-border rounded-lg p-2 text-[10px] space-y-1">
        {Object.entries(NODE_COLORS).map(([type, color]) => (
          <div key={type} className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
            <span className="capitalize text-muted-foreground">{type}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
