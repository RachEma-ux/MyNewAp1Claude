/**
 * Graph Agent provenance enricher — Item 34.
 *
 * Closes the gap between the operator-facing "Why This Answer?"
 * explanation (read from `ags_graph_agent_runs` / `ags_graph_agent_steps`)
 * and the live `GraphRepository.explainNode()` / `explainPath()`
 * provenance surface.
 *
 * Two pure builders:
 *
 *   - `enrichWithGraphProvenance(nodeIds, repository, runtime)` — per
 *     node id, calls `explainNode` and packages the result into a
 *     `NodeProvenanceEnvelope` keyed on `status: "visible" | "hidden"
 *     | "not_found"`. Hidden nodes get NO label / NO provenance — the
 *     load-bearing invariant of item 34 (no leak through provenance
 *     surface).
 *
 *   - `enrichPathWithGraphProvenance(fromId, toId, repository, runtime)`
 *     — calls `explainPath` and returns either the path (with each
 *     node's provenance enriched) or a `null_path` envelope.
 *
 * The enricher does NOT call any model and does NOT mutate any graph
 * fact. All calls route through `GraphRepository` per the runtime
 * rules ("Do not bypass GraphRepository"). Permission filtering is
 * the repository's responsibility — the enricher trusts but verifies
 * by attaching the visibility marker the repo returns (an explicit
 * `null` from `explainNode` is treated as "hidden_or_missing", which
 * the enricher then disambiguates via a single `isVisibleToUser`
 * follow-up call to avoid leaking the "exists-but-hidden" vs "doesnt
 * exist" distinction in the provenance output).
 */

import type {
  GraphRepository,
  ProvenanceFields,
  RuntimeContext,
  TraversalPath,
} from "../graph/repository/types.js";

/**
 * Per-node provenance envelope returned by the enricher.
 *
 * `visible`     — node exists AND viewer is permitted; full provenance
 *                 attached
 * `hidden`      — node exists but viewer is NOT permitted; NO
 *                 provenance attached (load-bearing redaction for
 *                 item 34)
 * `not_found`   — no node with that id; reads as "not_found" from the
 *                 operator surface
 *
 * The envelope deliberately collapses "hidden" and "not_found" into
 * two distinct states (rather than a single `null`) so the
 * explanation UI can tell the operator "the answer used a hidden
 * fact" vs "the answer used a fact that has since been deleted" —
 * without leaking what the hidden fact was.
 */
export type NodeProvenanceEnvelope =
  | {
      readonly nodeId: string;
      readonly status: "visible";
      readonly typeKey: string;
      readonly label?: string;
      readonly provenance: ProvenanceFields;
    }
  | {
      readonly nodeId: string;
      readonly status: "hidden";
    }
  | {
      readonly nodeId: string;
      readonly status: "not_found";
    };

/**
 * Per-path provenance envelope returned by `enrichPathWithGraphProvenance`.
 *
 * `path`        — full path with per-node provenance attached for
 *                 visible nodes; hidden nodes appear as `hidden`
 *                 entries WITHOUT label/provenance
 * `null_path`   — no path exists from `fromId` to `toId` for this
 *                 viewer (could be no actual path OR every candidate
 *                 path crosses a hidden node — both collapse to the
 *                 same operator-visible "no path" surface)
 */
export type PathProvenanceEnvelope =
  | {
      readonly fromNodeId: string;
      readonly toNodeId: string;
      readonly status: "path";
      readonly length: number;
      readonly nodeProvenance: ReadonlyArray<NodeProvenanceEnvelope>;
      readonly cypher?: string;
      readonly cost?: number;
    }
  | {
      readonly fromNodeId: string;
      readonly toNodeId: string;
      readonly status: "null_path";
    };

/**
 * Sole entry point for per-node provenance enrichment.
 *
 * For each node id:
 *   1. Call `repository.explainNode(id, runtime)`.
 *   2. If result is non-null → envelope as `visible` with provenance.
 *   3. If result IS null → call `repository.isVisibleToUser(id, runtime)`
 *      to disambiguate hidden vs not_found.
 *
 * The two-call disambiguation is a deliberate cost — it keeps the
 * single-source-of-truth invariant (repository owns permission
 * decisions) without forcing the repository to expose a tri-state
 * return.
 */
export async function enrichWithGraphProvenance(
  nodeIds: ReadonlyArray<string>,
  repository: GraphRepository,
  runtime: RuntimeContext,
): Promise<ReadonlyArray<NodeProvenanceEnvelope>> {
  const out: NodeProvenanceEnvelope[] = [];
  for (const nodeId of nodeIds) {
    const explained = await repository.explainNode(nodeId, runtime);
    if (explained !== null) {
      out.push({
        nodeId,
        status: "visible",
        typeKey: explained.node.typeKey,
        label:
          typeof explained.properties?.label === "string"
            ? (explained.properties.label as string)
            : typeof explained.properties?.name === "string"
              ? (explained.properties.name as string)
              : undefined,
        provenance: explained.provenance,
      });
      continue;
    }
    // null from explainNode means either hidden OR not_found. The
    // repository is the source of truth — ask isVisibleToUser to
    // disambiguate.
    const visible = await repository.isVisibleToUser(nodeId, runtime);
    if (visible) {
      out.push({ nodeId, status: "not_found" });
    } else {
      out.push({ nodeId, status: "hidden" });
    }
  }
  return out;
}

/**
 * Path-level enricher. Calls `explainPath` and, for the returned
 * path's nodes, runs the per-node enricher to attach provenance to
 * each visible node (hidden ones come back without label/provenance).
 */
export async function enrichPathWithGraphProvenance(
  fromNodeId: string,
  toNodeId: string,
  repository: GraphRepository,
  runtime: RuntimeContext,
): Promise<PathProvenanceEnvelope> {
  const explained = await repository.explainPath(fromNodeId, toNodeId, runtime);
  const path = explained.path;
  if (path === null) {
    return { fromNodeId, toNodeId, status: "null_path" };
  }
  const nodeIds = path.nodes.map((n) => n.id);
  const nodeProvenance = await enrichWithGraphProvenance(
    nodeIds,
    repository,
    runtime,
  );
  return {
    fromNodeId,
    toNodeId,
    status: "path",
    length: path.length,
    nodeProvenance,
    cypher: explained.cypher,
    cost: explained.cost,
  };
}

/**
 * Helper — counts hidden nodes in an envelope array. Used by the
 * explanation UI to render a single "N hidden facts contributed to
 * this answer" banner without leaking which facts.
 */
export function countHiddenInProvenance(
  envelopes: ReadonlyArray<NodeProvenanceEnvelope>,
): number {
  let n = 0;
  for (const e of envelopes) if (e.status === "hidden") n += 1;
  return n;
}

/**
 * Helper — predicate guard for typescript-narrowing the visible case.
 * Useful for callers that want to walk only visible provenance
 * without the union-discriminator boilerplate.
 */
export function isVisibleProvenance(
  e: NodeProvenanceEnvelope,
): e is Extract<NodeProvenanceEnvelope, { status: "visible" }> {
  return e.status === "visible";
}

// Re-export shape pieces the tests + downstream callers want.
export type { GraphRepository, ProvenanceFields, RuntimeContext, TraversalPath };
