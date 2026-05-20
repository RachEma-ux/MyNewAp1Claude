/**
 * TraceGraphView — Product Work items 23 + 24 graph visualization.
 *
 * Pure-SVG radial node-link diagram for the `impact_runtime` and
 * `impact_governance` trace templates. The seed id (the operator-
 * entered runtime_run_id) sits at the origin; each row in the
 * template's `rows` payload becomes one satellite node connected by
 * an edge back to the seed.
 *
 * The rows come back as `{ impacted, edge }` — a Neo4j node plus
 * the last relationship in the matched path. We accept the rows as
 * `Record<string, unknown>[]` so the same component can be reused
 * verbatim for both runtime and decision projections (and any other
 * `impact_*` template that follows the same `RETURN DISTINCT
 * impacted, last(r) AS edge` shape).
 *
 * Why a hand-rolled SVG instead of reusing LocalGraphCanvas:
 *   - LocalGraphCanvas is built around the `localGraph` tRPC payload
 *     (typed nodes + edges with d3-force layout). The trace payload
 *     is shaped differently (single fan-out, last-edge only) and
 *     adapting the canvas would have leaked trace-specific shape
 *     through its props.
 *   - The trace surfaces don't benefit from drag/pan/minimap. A
 *     bounded radial layout fits ≤ 200 nodes (template maxResults)
 *     cleanly in the panel without animation cost.
 *   - Zero new runtime deps; the LocalGraphCanvas reuse-first
 *     principle (per its doc-block) is preserved by NOT reaching
 *     into it.
 */

import React, { useMemo } from "react";

export interface TraceGraphViewProps {
  /** Seed node id rendered at the center (the operator's runtime_run_id). */
  readonly seedId: string;
  /** Rows from `runImpactTemplate` — each `{ impacted, edge }`. */
  readonly rows: ReadonlyArray<Record<string, unknown>>;
  /** Test id prefix used to scope node/edge selectors per panel. */
  readonly testIdPrefix: string;
  /** Viewport size in CSS pixels. Defaults to a panel-friendly square. */
  readonly size?: number;
}

interface ImpactedNode {
  readonly id: string;
  readonly label: string;
  readonly relationshipType: string | null;
}

/**
 * Extract a display string from a Neo4j-shaped value. Production
 * payloads serialize nodes/relationships as plain objects with
 * `properties` + `labels` keys; defensively fall back to JSON when
 * the shape doesn't match.
 */
function extractImpactedNode(
  raw: unknown,
  edgeRaw: unknown,
  fallbackKey: string,
): ImpactedNode {
  let id = fallbackKey;
  let label = fallbackKey;
  let relationshipType: string | null = null;

  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    // Common Neo4j-driver shapes: { identity, labels, properties }
    // OR our flat projection: { id, name, ... }
    const props = (obj.properties ?? obj) as Record<string, unknown>;
    if (typeof props.id === "string" || typeof props.id === "number") {
      id = String(props.id);
    } else if (typeof obj.identity === "string" || typeof obj.identity === "number") {
      id = String(obj.identity);
    }
    if (typeof props.name === "string") label = props.name;
    else if (typeof props.title === "string") label = props.title;
    else if (typeof props.slug === "string") label = props.slug;
    else if (typeof props.id === "string") label = props.id;
    else label = id;
  }

  if (edgeRaw && typeof edgeRaw === "object") {
    const edge = edgeRaw as Record<string, unknown>;
    if (typeof edge.type === "string") relationshipType = edge.type;
  }

  return { id, label, relationshipType };
}

export default function TraceGraphView({
  seedId,
  rows,
  testIdPrefix,
  size = 320,
}: TraceGraphViewProps): React.ReactElement {
  // Normalize every row into a stable ImpactedNode. We dedupe by id
  // because `RETURN DISTINCT impacted` is the contract but the
  // current driver can occasionally serialize duplicates under
  // edge re-projection — belt-and-suspenders.
  const impactedNodes = useMemo<ReadonlyArray<ImpactedNode>>(() => {
    const seen = new Set<string>();
    const out: ImpactedNode[] = [];
    rows.forEach((row, idx) => {
      const impacted = row.impacted ?? row;
      const edge = row.edge;
      const node = extractImpactedNode(impacted, edge, `row-${idx}`);
      if (seen.has(node.id)) return;
      seen.add(node.id);
      out.push(node);
    });
    return out;
  }, [rows]);

  const cx = size / 2;
  const cy = size / 2;
  // Leave a 30px ring of padding so node labels don't clip the edge
  // of the SVG viewport. The seed sits at cx/cy; the radius is the
  // distance satellites are placed from the center.
  const radius = Math.max(40, size / 2 - 40);
  const total = impactedNodes.length;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={`Trace graph for ${seedId} with ${total} impacted ${total === 1 ? "node" : "nodes"}`}
      data-testid={`${testIdPrefix}-graph`}
      data-impacted-count={total}
      className="bg-gray-50 rounded border"
    >
      {/* Edges first so nodes render on top. */}
      {impactedNodes.map((node, i) => {
        const theta = (i / Math.max(total, 1)) * Math.PI * 2 - Math.PI / 2;
        const x = cx + radius * Math.cos(theta);
        const y = cy + radius * Math.sin(theta);
        return (
          <line
            key={`edge-${node.id}-${i}`}
            data-testid={`${testIdPrefix}-graph-edge-${i}`}
            data-edge-type={node.relationshipType ?? ""}
            x1={cx}
            y1={cy}
            x2={x}
            y2={y}
            stroke="#9ca3af"
            strokeWidth={1}
          />
        );
      })}

      {/* Seed node — rendered after edges so it sits on top. */}
      <g data-testid={`${testIdPrefix}-graph-seed`}>
        <circle cx={cx} cy={cy} r={18} fill="#2563eb" stroke="#1e40af" strokeWidth={2} />
        <text
          x={cx}
          y={cy + 32}
          textAnchor="middle"
          className="text-[10px] fill-gray-700 font-mono"
        >
          {seedId.length > 20 ? `${seedId.slice(0, 18)}…` : seedId}
        </text>
      </g>

      {/* Impacted satellite nodes. */}
      {impactedNodes.map((node, i) => {
        const theta = (i / Math.max(total, 1)) * Math.PI * 2 - Math.PI / 2;
        const x = cx + radius * Math.cos(theta);
        const y = cy + radius * Math.sin(theta);
        return (
          <g
            key={`node-${node.id}-${i}`}
            data-testid={`${testIdPrefix}-graph-node-${i}`}
            data-node-id={node.id}
          >
            <circle cx={x} cy={y} r={10} fill="#10b981" stroke="#047857" strokeWidth={1.5} />
            <text
              x={x}
              y={y + 22}
              textAnchor="middle"
              className="text-[9px] fill-gray-700"
            >
              {node.label.length > 16 ? `${node.label.slice(0, 14)}…` : node.label}
            </text>
            {node.relationshipType && (
              <text
                x={(cx + x) / 2}
                y={(cy + y) / 2 - 4}
                textAnchor="middle"
                className="text-[8px] fill-gray-500"
              >
                {node.relationshipType}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
