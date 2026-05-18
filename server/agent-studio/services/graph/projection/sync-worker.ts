/**
 * Graph Projection Sync Worker.
 *
 * Phase 1.7 / 7.5. Consumes domain events emitted by vault / promotion /
 * runtime trace services, resolves source records, computes target Neo4j
 * operations, and applies them via GraphRepository.
 *
 * ADR: docs/architecture/agent-studio-graph-projection-sync.md
 */

import type {
  GraphRepository,
  NodeIdentity,
  EdgeIdentity,
  ProjectionWrite,
  ProvenanceFields,
} from "../repository/index.js";
import {
  buildCanvasReferenceProjection,
  buildCanvasReferenceRemoval,
} from "../../canvas/projection.js";
import { recordFailureStateEvent } from "../../failure-states/observability-bridge.js";

export type ProjectionEvent =
  | { kind: "note.created"; payload: { noteId: number; vaultId: number; slug: string; title: string; versionId: number } }
  // `note.updated` shares the `note.created` payload shape — the
  // sync-worker upserts the new NoteVersion node + VERSION_OF edge
  // against the (already-existing) Note node. previousVersionId is
  // not needed: Neo4j upsert is idempotent.
  | { kind: "note.updated"; payload: { noteId: number; vaultId: number; slug: string; title: string; versionId: number } }
  | { kind: "note.version_created"; payload: { noteId: number; versionId: number; version: number } }
  | { kind: "note.deleted"; payload: { noteId: number } }
  | { kind: "wikilink.changed"; payload: { sourceNoteId: number; sourceVersionId: number; targetSlug: string; targetNoteId: number | null } }
  | { kind: "entity.detected"; payload: { entityId: number; label: string; entityType: string } }
  | { kind: "entity.merged"; payload: { primaryEntityId: number; mergedEntityId: number } }
  | { kind: "entity.split"; payload: { sourceEntityId: number; resultingEntityIds: number[] } }
  | { kind: "promotion.approved"; payload: { promotionId: number; promotionKind: string; noteId: number; noteVersionId: number; targetAssetId: number } }
  | { kind: "promotion.rolled_back"; payload: { promotionId: number } }
  | { kind: "runtime_trace.created"; payload: { runtimeRunId: number } }
  | { kind: "decision_trace.created"; payload: { decisionTraceId: number; runtimeRunId: number } }
  | { kind: "policy.updated"; payload: { policyId: number; version: string } }
  | { kind: "tool_schema.changed"; payload: { toolId: string; version: string } }
  | { kind: "graph_correction.approved"; payload: { proposalId: number } }
  | { kind: "semantic_enrichment.approved"; payload: { proposalId: number } }
  | { kind: "kgra.build_completed"; payload: { buildId: string } }
  // V1+ Phase 17-β (2026-05-13): canvas → note projection edge.
  // PR-V1-5 (#752) shipped canvas data model + listNoteReferencesForCanvas
  // (source-side); this event drives the projection side via
  // buildCanvasReferenceProjection().
  | { kind: "canvas.note_reference_changed"; payload: { canvasId: number; canvasNodeId: number; referencedNoteId: number } }
  | { kind: "canvas.note_reference_removed"; payload: { canvasNodeId: number } }
  // Phase 24 — Bases MVP (T-F.2). Bases become first-class graph
  // nodes; rows hang off via OF_BASE; optional ROW_OF_NOTE edge
  // when the row links back to a vault note (`noteId`).
  | { kind: "base.created"; payload: { baseId: number; workspaceId: number | null; vaultId: number | null; slug: string; name: string } }
  | { kind: "base.updated"; payload: { baseId: number; workspaceId: number | null; vaultId: number | null; slug: string; name: string } }
  | { kind: "base.deleted"; payload: { baseId: number } }
  | { kind: "base.row_changed"; payload: { rowId: number; baseId: number; noteId: number | null } }
  | { kind: "base.row_removed"; payload: { rowId: number } };

export interface ProjectionJobResult {
  readonly eventKind: ProjectionEvent["kind"];
  readonly status: "completed" | "failed";
  readonly writes: number;
  readonly errors: string[];
  readonly durationMs: number;
}

export interface ProjectionSyncWorkerOptions {
  readonly repository: GraphRepository;
}

export class ProjectionSyncWorker {
  constructor(private readonly options: ProjectionSyncWorkerOptions) {}

  async handle(event: ProjectionEvent): Promise<ProjectionJobResult> {
    const startedAt = Date.now();
    const writes = this.buildWrites(event);
    const result = await this.options.repository.applyProjectionJob(writes);
    const status: "completed" | "failed" =
      result.errors.length === 0 ? "completed" : "failed";

    // T-I.5 batch B — bridge projection-sync failures to the Phase 22
    // closed-taxonomy emission surface. Only fires on `status="failed"`;
    // partial-success jobs (some writes succeeded + at least one
    // error) still emit, because the projection is now in an
    // inconsistent state. Fire-and-forget; observability writes never
    // propagate.
    if (status === "failed") {
      void recordFailureStateEvent({
        failureState: "projection_sync_failed",
        sourceKind: "graph-projection-sync-worker",
        sourceId: event.kind,
        errorMessage: `Projection sync failed for ${event.kind}: ${result.errors.length} error(s)`,
        metadata: {
          eventKind: event.kind,
          errorCount: result.errors.length,
          firstError: result.errors[0]?.error ?? null,
          writes:
            result.nodesCreated +
            result.nodesUpdated +
            result.edgesCreated +
            result.edgesUpdated,
          durationMs: Date.now() - startedAt,
        },
      }).catch(() => {
        // Fail-soft.
      });
    }

    return {
      eventKind: event.kind,
      status,
      writes: result.nodesCreated + result.nodesUpdated + result.edgesCreated + result.edgesUpdated,
      errors: result.errors.map((e) => e.error),
      durationMs: Date.now() - startedAt,
    };
  }

  /**
   * Builds the projection writes for a given event.
   * Pure function — no I/O. Phase 7.5 expands as more event kinds wire up.
   */
  buildWrites(event: ProjectionEvent): ProjectionWrite[] {
    const provenance = (sourceType: string, sourceId: string, lineageStatus: ProvenanceFields["lineageStatus"]): ProvenanceFields => ({
      sourceType,
      sourceId,
      lineageStatus,
      governanceStatus: "active",
    });

    switch (event.kind) {
      case "note.created": {
        const { noteId, slug, title, versionId } = event.payload;
        const noteNode: NodeIdentity & { properties: Record<string, unknown>; provenance: ProvenanceFields } = {
          typeKey: "Note",
          id: `note:${noteId}`,
          sourceId: String(noteId),
          properties: { slug, title },
          provenance: provenance("vault_note", String(noteId), "asserted"),
        };
        const versionNode: NodeIdentity & { properties: Record<string, unknown>; provenance: ProvenanceFields } = {
          typeKey: "NoteVersion",
          id: `note_version:${versionId}`,
          sourceId: String(versionId),
          sourceVersionId: String(versionId),
          properties: { version: 1 },
          provenance: provenance("vault_note_version", String(versionId), "asserted"),
        };
        const versionOf: EdgeIdentity & { properties: Record<string, unknown>; provenance: ProvenanceFields } = {
          typeKey: "VERSION_OF",
          id: `version_of:${versionId}`,
          sourceNode: { typeKey: "NoteVersion", id: versionNode.id },
          targetNode: { typeKey: "Note", id: noteNode.id },
          properties: {},
          provenance: provenance("vault_note_version", String(versionId), "derived"),
        };
        return [
          { kind: "upsert_node", node: noteNode },
          { kind: "upsert_node", node: versionNode },
          { kind: "upsert_edge", edge: versionOf },
        ];
      }
      case "note.updated": {
        // Upsert the new NoteVersion + VERSION_OF edge against the
        // existing Note node. Old NoteVersion rows persist for audit;
        // a future GC pass can prune them. The Note node properties
        // (slug + title) re-upsert too — title rename should
        // propagate to the graph.
        const { noteId, slug, title, versionId } = event.payload;
        const noteNode: NodeIdentity & { properties: Record<string, unknown>; provenance: ProvenanceFields } = {
          typeKey: "Note",
          id: `note:${noteId}`,
          sourceId: String(noteId),
          properties: { slug, title },
          provenance: provenance("vault_note", String(noteId), "asserted"),
        };
        const versionNode: NodeIdentity & { properties: Record<string, unknown>; provenance: ProvenanceFields } = {
          typeKey: "NoteVersion",
          id: `note_version:${versionId}`,
          sourceId: String(versionId),
          sourceVersionId: String(versionId),
          properties: {},
          provenance: provenance("vault_note_version", String(versionId), "asserted"),
        };
        const versionOf: EdgeIdentity & { properties: Record<string, unknown>; provenance: ProvenanceFields } = {
          typeKey: "VERSION_OF",
          id: `version_of:${versionId}`,
          sourceNode: { typeKey: "NoteVersion", id: versionNode.id },
          targetNode: { typeKey: "Note", id: noteNode.id },
          properties: {},
          provenance: provenance("vault_note_version", String(versionId), "derived"),
        };
        return [
          { kind: "upsert_node", node: noteNode },
          { kind: "upsert_node", node: versionNode },
          { kind: "upsert_edge", edge: versionOf },
        ];
      }
      case "note.deleted": {
        // Delete the Note node. Neo4j `DETACH DELETE` cascades to
        // attached NoteVersion nodes + LINKS_TO / VERSION_OF edges,
        // keeping the graph free of orphans. Postgres remains the
        // authoritative record of the soft-delete; the graph mirror
        // is purged hard because graph-time semantics are "is this
        // edge live?", not "was it ever asserted?".
        const { noteId } = event.payload;
        return [{
          kind: "delete_node",
          node: {
            typeKey: "Note",
            id: `note:${noteId}`,
            sourceId: String(noteId),
            properties: {},
            provenance: provenance("vault_note", String(noteId), "asserted"),
          },
        }];
      }
      case "wikilink.changed": {
        const { sourceVersionId, targetSlug, targetNoteId } = event.payload;
        if (targetNoteId == null) return [];
        const edge: EdgeIdentity & { properties: Record<string, unknown>; provenance: ProvenanceFields } = {
          typeKey: "LINKS_TO",
          id: `links_to:${sourceVersionId}:${targetSlug}`,
          sourceNode: { typeKey: "NoteVersion", id: `note_version:${sourceVersionId}` },
          targetNode: { typeKey: "Note", id: `note:${targetNoteId}` },
          properties: { targetSlug },
          provenance: provenance("vault_wikilink", `${sourceVersionId}:${targetSlug}`, "derived"),
        };
        return [{ kind: "upsert_edge", edge }];
      }
      case "runtime_trace.created": {
        const { runtimeRunId } = event.payload;
        return [{
          kind: "upsert_node",
          node: {
            typeKey: "RuntimeTrace",
            id: `runtime_trace:${runtimeRunId}`,
            sourceId: String(runtimeRunId),
            properties: {},
            provenance: provenance("runtime_run", String(runtimeRunId), "derived"),
          },
        }];
      }
      case "canvas.note_reference_changed": {
        const { canvasId, canvasNodeId, referencedNoteId } = event.payload;
        return buildCanvasReferenceProjection({
          canvasId,
          canvasNodeId,
          referencedNoteId,
        });
      }
      case "canvas.note_reference_removed": {
        const { canvasNodeId } = event.payload;
        return buildCanvasReferenceRemoval({ canvasNodeId });
      }
      // ── Phase 24 — Bases MVP (T-F.2) ─────────────────────────────
      case "base.created":
      case "base.updated": {
        const { baseId, slug, name } = event.payload;
        return [{
          kind: "upsert_node",
          node: {
            typeKey: "Base",
            id: `base:${baseId}`,
            sourceId: String(baseId),
            properties: { slug, name },
            provenance: provenance("ags_base", String(baseId), "asserted"),
          },
        }];
      }
      case "base.deleted": {
        const { baseId } = event.payload;
        return [{
          kind: "delete_node",
          node: {
            typeKey: "Base",
            id: `base:${baseId}`,
            sourceId: String(baseId),
            properties: {},
            provenance: provenance("ags_base", String(baseId), "asserted"),
          },
        }];
      }
      case "base.row_changed": {
        const { rowId, baseId, noteId } = event.payload;
        const rowNode: NodeIdentity & { properties: Record<string, unknown>; provenance: ProvenanceFields } = {
          typeKey: "BaseRow",
          id: `base_row:${rowId}`,
          sourceId: String(rowId),
          properties: { baseId },
          provenance: provenance("ags_base_row", String(rowId), "asserted"),
        };
        const ofBase: EdgeIdentity & { properties: Record<string, unknown>; provenance: ProvenanceFields } = {
          typeKey: "OF_BASE",
          id: `of_base:${rowId}`,
          sourceNode: { typeKey: "BaseRow", id: rowNode.id },
          targetNode: { typeKey: "Base", id: `base:${baseId}` },
          properties: {},
          provenance: provenance("ags_base_row", String(rowId), "derived"),
        };
        const writes: ProjectionWrite[] = [
          { kind: "upsert_node", node: rowNode },
          { kind: "upsert_edge", edge: ofBase },
        ];
        // Optional row-to-note edge. When noteId is null, the row is
        // a free-standing record without note ancestry; no edge.
        if (noteId != null) {
          writes.push({
            kind: "upsert_edge",
            edge: {
              typeKey: "ROW_OF_NOTE",
              id: `row_of_note:${rowId}`,
              sourceNode: { typeKey: "BaseRow", id: rowNode.id },
              targetNode: { typeKey: "Note", id: `note:${noteId}` },
              properties: {},
              provenance: provenance("ags_base_row", String(rowId), "derived"),
            },
          });
        }
        return writes;
      }
      case "base.row_removed": {
        const { rowId } = event.payload;
        return [{
          kind: "delete_node",
          node: {
            typeKey: "BaseRow",
            id: `base_row:${rowId}`,
            sourceId: String(rowId),
            properties: {},
            provenance: provenance("ags_base_row", String(rowId), "asserted"),
          },
        }];
      }
      case "promotion.approved": {
        const { noteId, noteVersionId, targetAssetId, promotionKind } = event.payload;
        const promotedToTypeKey =
          promotionKind === "cag_block" ? "CAGBlock" :
          promotionKind === "graph_skill_pack" ? "GraphSkillPack" :
          promotionKind === "tool_knowledge" ? "MCPTool" :
          promotionKind === "policy" ? "Policy" :
          promotionKind === "workflow" ? "Workflow" : "KnowledgeUnit";
        return [{
          kind: "upsert_edge",
          edge: {
            typeKey: "PROMOTED_TO",
            id: `promoted_to:${noteId}:${promotionKind}:${targetAssetId}`,
            sourceNode: { typeKey: "Note", id: `note:${noteId}` },
            targetNode: { typeKey: promotedToTypeKey, id: `${promotedToTypeKey.toLowerCase()}:${targetAssetId}` },
            properties: { noteVersionId },
            provenance: provenance("promotion", `${noteId}:${promotionKind}`, "asserted"),
          },
        }];
      }
      default:
        return [];
    }
  }
}
