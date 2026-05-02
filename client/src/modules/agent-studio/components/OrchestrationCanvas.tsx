/**
 * AI Agent Studio — Orchestration Canvas
 *
 * Lightweight SVG visualization of the workflow graph for an agent draft.
 * Reads nodes + edges from `agentStudio.workflows.get` and lays them out
 * using the stored positionX/positionY (or a simple auto-layout fallback
 * when positions are zero).
 *
 * Phase-5+ replacement target: React Flow / D3-flow for interactive editing.
 * For now this is read-only — node creation happens via the workflow form.
 */

interface Node {
  id?: number;
  nodeKey: string;
  nodeType: string;
  label?: string | null;
  positionX?: number | null;
  positionY?: number | null;
}

interface Edge {
  id?: number;
  fromNodeKey: string;
  toNodeKey: string;
  label?: string | null;
}

interface Props {
  nodes: Node[];
  edges: Edge[];
  width?: number;
  height?: number;
}

const NODE_WIDTH = 120;
const NODE_HEIGHT = 40;

function nodeColor(nodeType: string): string {
  switch (nodeType) {
    case "start":
      return "#10b981"; // emerald
    case "end":
      return "#64748b"; // slate
    case "tool":
      return "#3b82f6"; // blue
    case "decision":
      return "#eab308"; // yellow
    case "approval":
      return "#f97316"; // orange
    case "handoff":
      return "#a855f7"; // purple
    default:
      return "#6366f1"; // indigo
  }
}

/** Auto-layout when positions are unset (or all zero). */
function autoLayout(nodes: Node[]): Map<string, { x: number; y: number }> {
  const map = new Map<string, { x: number; y: number }>();
  if (nodes.length === 0) return map;
  // Simple horizontal flow with vertical staggering
  const cols = Math.ceil(Math.sqrt(nodes.length));
  nodes.forEach((n, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    map.set(n.nodeKey, {
      x: 40 + col * (NODE_WIDTH + 60),
      y: 40 + row * (NODE_HEIGHT + 40),
    });
  });
  return map;
}

export default function OrchestrationCanvas({
  nodes,
  edges,
  width = 800,
  height = 360,
}: Props) {
  const allZero = nodes.every(
    (n) => (n.positionX ?? 0) === 0 && (n.positionY ?? 0) === 0
  );
  const layout = allZero
    ? autoLayout(nodes)
    : new Map(
        nodes.map((n) => [
          n.nodeKey,
          { x: n.positionX ?? 0, y: n.positionY ?? 0 },
        ])
      );

  if (nodes.length === 0) {
    return (
      <div className="border-2 border-dashed rounded p-6 text-center text-[10px] text-muted-foreground">
        No workflow nodes yet. Add nodes via the workflow form on the left.
      </div>
    );
  }

  return (
    <div className="border rounded bg-muted/10 overflow-auto">
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="block"
      >
        <defs>
          <marker
            id="ags-arrow"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#94a3b8" />
          </marker>
        </defs>

        {/* Edges */}
        {edges.map((e, i) => {
          const from = layout.get(e.fromNodeKey);
          const to = layout.get(e.toNodeKey);
          if (!from || !to) return null;
          const x1 = from.x + NODE_WIDTH / 2;
          const y1 = from.y + NODE_HEIGHT / 2;
          const x2 = to.x + NODE_WIDTH / 2;
          const y2 = to.y + NODE_HEIGHT / 2;
          const midX = (x1 + x2) / 2;
          const midY = (y1 + y2) / 2;
          return (
            <g key={`edge-${i}`}>
              <line
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke="#94a3b8"
                strokeWidth="1.5"
                markerEnd="url(#ags-arrow)"
              />
              {e.label && (
                <text
                  x={midX}
                  y={midY - 4}
                  fontSize="9"
                  textAnchor="middle"
                  fill="#94a3b8"
                >
                  {e.label}
                </text>
              )}
            </g>
          );
        })}

        {/* Nodes */}
        {nodes.map((n) => {
          const pos = layout.get(n.nodeKey);
          if (!pos) return null;
          const fill = nodeColor(n.nodeType);
          return (
            <g key={n.nodeKey} transform={`translate(${pos.x},${pos.y})`}>
              <rect
                width={NODE_WIDTH}
                height={NODE_HEIGHT}
                rx="6"
                ry="6"
                fill={fill}
                fillOpacity="0.15"
                stroke={fill}
                strokeWidth="1.5"
              />
              <text
                x={NODE_WIDTH / 2}
                y={NODE_HEIGHT / 2 - 2}
                fontSize="11"
                fontWeight="600"
                textAnchor="middle"
                dominantBaseline="middle"
                fill={fill}
              >
                {n.label ?? n.nodeKey}
              </text>
              <text
                x={NODE_WIDTH / 2}
                y={NODE_HEIGHT / 2 + 12}
                fontSize="8"
                textAnchor="middle"
                dominantBaseline="middle"
                fill="#94a3b8"
              >
                {n.nodeType}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
