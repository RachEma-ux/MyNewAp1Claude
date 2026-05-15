/**
 * GraphRAG Retrieval Router.
 *
 * Phase 12. Registers as a new RetrievalPlanItem source type in the
 * existing RAC planner. Does NOT replace `server/agent-studio/services/rac/`.
 *
 * Flow:
 *   1. Receive retrieval request from RAC planner.
 *   2. Inspect intent + Graph Skill Pack eligibility.
 *   3. Choose template / Text2Cypher / hybrid path.
 *   4. Execute via GraphRepository (read-only).
 *   5. Apply permission filter (already pushdown'd or app-side).
 *   6. Apply context safety filter.
 *   7. Assemble citations.
 *   8. Return context blocks.
 *
 * ADR: docs/architecture/agent-studio-graphrag-retrieval-router.md
 */

import type {
  EdgeIdentity,
  GraphRepository,
  NodeIdentity,
  RuntimeContext,
} from "../repository/index.js";
import { filterContextBlocks, type ContextBlockInput, type FilterResult } from "./safety-filter.js";
import { validateCypherReadOnly } from "./text2cypher-validator.js";
import { recordFailureStateEvent } from "../../failure-states/observability-bridge.js";
import {
  selectTemplateForEligiblePacks,
  type EligibilityResult,
  type PackTemplateMap,
} from "../../graph-skill/public-api.js";

/**
 * Phase 12 §6 — BFS hop distance from `seedNodeId` across the given
 * `edges`. Edges are treated as undirected (a 1-hop neighbor is "close"
 * regardless of edge direction). Disconnected nodes get `Infinity` so
 * the caller can decide whether to keep them at a tail score or drop
 * them. Pure function — exported for unit testing.
 */
export function computeHopDistances(
  seedNodeId: string,
  nodes: ReadonlyArray<NodeIdentity>,
  edges: ReadonlyArray<EdgeIdentity>,
): Map<string, number> {
  const distances = new Map<string, number>();
  for (const n of nodes) distances.set(n.id, Number.POSITIVE_INFINITY);
  if (!distances.has(seedNodeId)) {
    // Seed isn't in the node set — return all-infinity (caller decides
    // how to score). This matches what callers see when localGraph
    // returns 0 nodes (which is itself an empty-result path the router
    // already short-circuits, but the helper stays usable in either
    // direction so unit tests can call it standalone).
    return distances;
  }
  distances.set(seedNodeId, 0);
  // Adjacency list (undirected).
  const adj = new Map<string, Set<string>>();
  for (const n of nodes) adj.set(n.id, new Set());
  for (const e of edges) {
    const a = e.sourceNode.id;
    const b = e.targetNode.id;
    if (!adj.has(a)) adj.set(a, new Set());
    if (!adj.has(b)) adj.set(b, new Set());
    adj.get(a)!.add(b);
    adj.get(b)!.add(a);
  }
  // Standard BFS.
  const queue: string[] = [seedNodeId];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    const curDist = distances.get(cur) ?? 0;
    for (const nb of adj.get(cur) ?? []) {
      const prev = distances.get(nb);
      if (prev === undefined || curDist + 1 < prev) {
        distances.set(nb, curDist + 1);
        queue.push(nb);
      }
    }
  }
  return distances;
}

export type RetrievalMode =
  | "graphrag_local"
  | "graphrag_global"
  | "graphrag_traversal"
  | "graphrag_text2cypher"
  | "graphrag_algorithm"
  | "hybrid_cag_graphrag"
  | "hybrid_rac_graphrag";

export interface GraphRetrievalInput {
  readonly mode: RetrievalMode;
  readonly query: string;
  readonly seedNodeId?: string;
  readonly templateKey?: string;
  readonly templateParameters?: Record<string, unknown>;
  readonly generatedCypher?: string;
  readonly maxDepth?: number;
  readonly maxResults?: number;
  readonly runtime: RuntimeContext;
  /**
   * Phase 12.5 §2 — optional Skill Pack eligibility output. When set
   * AND `templateKey` is absent, the router calls
   * `selectTemplateForEligiblePacks` to resolve a templateKey from the
   * highest-ranked eligible pack. Ignored when `templateKey` is
   * already supplied (caller explicit choice wins).
   */
  readonly eligibility?: EligibilityResult;
  readonly packTemplates?: PackTemplateMap;
  readonly preferTemplateKeys?: ReadonlyArray<string>;
  /**
   * Phase 12.5 §4 — runtime-run id threaded from the orchestrator so
   * the usage recorder can FK back to `ags_runtime_runs`. Optional —
   * direct router callers (tests, simulation harness) typically omit it.
   */
  readonly runtimeRunId?: number;
}

/**
 * Phase 12.5 §4 — runtime-usage recorder port. Fired by the router
 * after a successful template execution that came from a resolved
 * Skill Pack (i.e., `resolvedSkill` is set on the output). Caller
 * (chat-stream / simulation orchestrator) is responsible for resolving
 * `packKey` → `packVersionId` and writing the
 * `ags_graph_skill_runtime_usages` row; the router itself stays
 * stateless and DB-free.
 *
 * Errors thrown from the recorder are swallowed and emitted as a
 * `safetyEvents`-shaped trace breadcrumb. A flaky usage write must
 * not fail the retrieval call.
 */
export interface GraphRetrievalUsageEvent {
  readonly packKey: string;
  readonly templateKey: string;
  readonly reason: "first_template_in_top_pack" | "preferred_key_matched";
  readonly mode: RetrievalMode;
  readonly runtimeRunId?: number;
  readonly workspaceId?: number;
  /**
   * Phase 12.5 §12 — the audit row ids the template-run recorder
   * (§11) wrote during this retrieval call. The usage recorder
   * persists them on `ags_graph_skill_runtime_usages
   * .query_template_run_ids` so the per-usage row points back at the
   * specific template-execution audit rows that produced its result.
   *
   * Empty array when the §11 recorder isn't wired OR didn't write
   * (no template executed, or ASDB unavailable, or templateKey
   * unresolved).
   */
  readonly queryTemplateRunIds?: number[];
}

export type GraphRetrievalUsageRecorder = (
  event: GraphRetrievalUsageEvent,
) => void | Promise<void>;

/**
 * Phase 12.5 §11 — query-template-run audit port. Fired by the router
 * around every `repository.executeTemplate(...)` call. Caller
 * (chat-stream / simulation orchestrator) is responsible for resolving
 * `templateKey` → `templateId` (and optionally `templateVersionId`)
 * and writing the `ags_query_template_runs` row.
 *
 * Errors thrown from the recorder are swallowed and emitted as a
 * synthetic `safetyEvents` breadcrumb so a flaky audit write never
 * fails the retrieval call. Same fail-safe contract as
 * `GraphRetrievalUsageRecorder`.
 */
export interface QueryTemplateRunEvent {
  readonly templateKey: string;
  readonly parameters: Record<string, unknown>;
  readonly status: "success" | "error";
  readonly resultCount?: number;
  readonly durationMs: number;
  readonly errorMessage?: string;
  readonly userId?: number;
  /** Same FK as `ags_query_template_runs.retrieval_run_id`. */
  readonly retrievalRunId?: number;
}

/**
 * Phase 12.5 §12 — recorder may return the inserted
 * `ags_query_template_runs` row id so the §4 usage recorder can
 * thread it into the usage row's `query_template_run_ids` JSON
 * column. Return value is best-effort: `undefined` / `null` mean
 * "no row was written" (ASDB unavailable, unknown templateKey, or
 * the recorder is fire-and-forget by design); the usage recorder
 * tolerates an empty array.
 */
export type QueryTemplateRunRecorder = (
  event: QueryTemplateRunEvent,
) =>
  | void
  | number
  | null
  | Promise<void | number | null>;

/**
 * Phase 12.5 §13 — pre-execution gate for registered query templates.
 *
 * Called by the router before `repository.executeTemplate(...)` is
 * invoked. The gate enforces operator-defined constraints on the
 * `ags_query_templates` row — `read_only`, `allowed_roles`,
 * `risk_level` — so the router can deny a template execution before
 * any Cypher hits the backend.
 *
 * Returning `{ allowed: false, reason }` makes the router short-
 * circuit and surface a `template_gate_denied_<reason>` on the
 * `rejectionReason` of the retrieval output. The §11 audit recorder
 * is NOT fired in this case — no template ran, so there's no run row
 * to write.
 *
 * Optional. When omitted, the router runs templates without the
 * additional gate (matches the pre-§13 behavior).
 */
export interface TemplateExecutionGateInput {
  readonly templateKey: string;
  readonly runtime: RuntimeContext;
}

export type TemplateExecutionGateDecision =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly reason: string };

export type TemplateExecutionGate = (
  input: TemplateExecutionGateInput,
) => TemplateExecutionGateDecision | Promise<TemplateExecutionGateDecision>;

export interface GraphRetrievalRouterOptions {
  readonly recordRuntimeUsage?: GraphRetrievalUsageRecorder;
  readonly recordQueryTemplateRun?: QueryTemplateRunRecorder;
  readonly templateExecutionGate?: TemplateExecutionGate;
}

export interface GraphRetrievalOutput {
  readonly mode: RetrievalMode;
  readonly contextBlocks: FilterResult["blocks"];
  readonly safetyEvents: FilterResult["events"];
  readonly citations: Array<{ sourceKind: string; sourceId: string; sourceVersionId?: string }>;
  readonly truncated: boolean;
  readonly durationMs: number;
  readonly rejectionReason?: string;
  /**
   * Phase 12.5 §3 — when the router resolved a `templateKey` from
   * eligibility output (rather than the caller supplying one directly),
   * record which pack + reason produced the choice. Useful for trace
   * surfacing and "why did this template fire?" debugging. Undefined
   * when the caller supplied `templateKey` directly OR when no template
   * was selected at all.
   */
  readonly resolvedSkill?: {
    readonly packKey: string;
    readonly templateKey: string;
    readonly reason: "first_template_in_top_pack" | "preferred_key_matched";
  };
}

export class GraphRetrievalRouter {
  private readonly recordRuntimeUsage?: GraphRetrievalUsageRecorder;
  private readonly recordQueryTemplateRun?: QueryTemplateRunRecorder;
  private readonly templateExecutionGate?: TemplateExecutionGate;

  constructor(
    private readonly repository: GraphRepository,
    options: GraphRetrievalRouterOptions = {},
  ) {
    this.recordRuntimeUsage = options.recordRuntimeUsage;
    this.recordQueryTemplateRun = options.recordQueryTemplateRun;
    this.templateExecutionGate = options.templateExecutionGate;
  }

  /**
   * Phase 12.5 §11 — wrap `repository.executeTemplate(...)` with an
   * audit recorder. Records exactly one `ags_query_template_runs` row
   * per call (success or error). Errors from the recorder itself are
   * swallowed and surfaced as a synthetic safety event by the caller
   * — a flaky audit write must not fail the retrieval call.
   *
   * Phase 12.5 §12 — when the recorder returns a numeric row id,
   * surface it so the caller can thread it into the §4 usage event.
   */
  private async executeTemplateAudited(
    input: GraphRetrievalInput,
    templateKey: string,
    parameters: Record<string, unknown>,
  ): Promise<{
    result: Awaited<ReturnType<GraphRepository["executeTemplate"]>>;
    auditError?: unknown;
    templateRunId?: number;
  }> {
    const startedAt = Date.now();
    let auditError: unknown;
    let templateRunId: number | undefined;
    try {
      const result = await this.repository.executeTemplate({
        templateKey,
        parameters,
        runtime: input.runtime,
      });
      if (this.recordQueryTemplateRun) {
        try {
          const ret = this.recordQueryTemplateRun({
            templateKey,
            parameters,
            status: "success",
            resultCount: result.rows.length,
            durationMs: Date.now() - startedAt,
            userId: input.runtime.userId,
            retrievalRunId: input.runtimeRunId,
          });
          if (typeof ret === "number") {
            templateRunId = ret;
          } else if (ret && typeof (ret as Promise<unknown>).then === "function") {
            const awaited = await (ret as Promise<unknown>).catch(() => undefined);
            if (typeof awaited === "number") templateRunId = awaited;
          }
        } catch (err) {
          auditError = err;
        }
      }
      return { result, auditError, templateRunId };
    } catch (executeErr) {
      // Audit even on failure so operators can see the templates that
      // misfired, then rethrow so the retrieval surface still reports
      // the actual error. The error-path return id (if any) is not
      // threaded into the usage event because the usage event only
      // fires on the success path.
      if (this.recordQueryTemplateRun) {
        try {
          const ret = this.recordQueryTemplateRun({
            templateKey,
            parameters,
            status: "error",
            durationMs: Date.now() - startedAt,
            errorMessage:
              executeErr instanceof Error
                ? executeErr.message
                : String(executeErr),
            userId: input.runtime.userId,
            retrievalRunId: input.runtimeRunId,
          });
          if (ret && typeof (ret as Promise<unknown>).then === "function") {
            (ret as Promise<unknown>).catch(() => {
              // Swallow async audit failures on the error path.
            });
          }
        } catch {
          // Audit failure on error path is swallowed — the original
          // executeTemplate error is the operator-actionable signal.
        }
      }
      throw executeErr;
    }
  }

  async retrieve(input: GraphRetrievalInput): Promise<GraphRetrievalOutput> {
    const startedAt = Date.now();

    // Text2Cypher guardrail
    if (input.mode === "graphrag_text2cypher") {
      if (!input.generatedCypher) {
        return this.emptyResult(input.mode, startedAt, "no_cypher_provided");
      }
      const validation = validateCypherReadOnly(input.generatedCypher);
      if (!validation.ok) {
        // Manual narrow — `strictNullChecks: false` in tsconfig.json
        // prevents the discriminated-union narrowing from kicking in,
        // so we use `in` to surface `reason` safely.
        const reason = "reason" in validation ? validation.reason : "unknown";
        return this.emptyResult(input.mode, startedAt, `text2cypher_${reason}`);
      }
    }

    let rawBlocks: ContextBlockInput[] = [];
    let truncated = false;
    let resolvedSkill: GraphRetrievalOutput["resolvedSkill"];
    // Phase 12.5 §11 — collect sync throws from the audit recorder so
    // we can surface them as synthetic safety events at the end of the
    // call. Async rejections are fire-and-forget (logged inside the
    // helper) and don't reach this list.
    const auditEvents: unknown[] = [];
    // Phase 12.5 §12 — collect successful template-run row ids so the
    // §4 usage recorder can persist them in
    // `ags_graph_skill_runtime_usages.query_template_run_ids`.
    const templateRunIds: number[] = [];

    switch (input.mode) {
      case "graphrag_local": {
        if (!input.seedNodeId) {
          return this.emptyResult(input.mode, startedAt, "no_seed_node");
        }
        const r = await this.repository.localGraph(
          input.seedNodeId,
          { maxDepth: input.maxDepth ?? 2, maxResults: input.maxResults ?? 50 },
          input.runtime,
        );
        truncated = r.truncated;
        const distances = computeHopDistances(
          input.seedNodeId,
          r.nodes,
          r.edges,
        );
        rawBlocks = r.nodes.map((n) =>
          this.nodeToBlock(n, distances.get(n.id)),
        );
        break;
      }
      case "graphrag_global": {
        const r = await this.repository.globalGraphSample(
          { maxDepth: 1, maxResults: input.maxResults ?? 50 },
          input.runtime,
        );
        truncated = r.truncated;
        rawBlocks = r.nodes.map((n) => this.nodeToBlock(n));
        break;
      }
      case "graphrag_traversal":
      case "graphrag_text2cypher": {
        // Phase 12.5 §2-§3: when the caller didn't supply a templateKey
        // directly but did provide eligibility output, resolve one
        // from the highest-ranked eligible Skill Pack and record the
        // resolution in `resolvedSkill` for trace surfacing.
        let resolvedKey: string | undefined = input.templateKey;
        if (!resolvedKey) {
          const resolution = this.resolveFromEligibility(input);
          if (resolution) {
            resolvedKey = resolution.templateKey;
            resolvedSkill = resolution;
          }
        }
        if (resolvedKey) {
          // Phase 12.5 §13 — pre-execution gate. The gate is the only
          // place that loads `ags_query_templates.read_only` /
          // `allowed_roles` / `risk_level` and decides whether to
          // proceed. Failures short-circuit the call with a structured
          // rejection reason so the operator can see why the template
          // didn't fire.
          if (this.templateExecutionGate) {
            const decision = await Promise.resolve(
              this.templateExecutionGate({
                templateKey: resolvedKey,
                runtime: input.runtime,
              }),
            );
            if (!decision.allowed) {
              // `strictNullChecks: false` blocks discriminated-union
              // narrowing here — see project_native_graph_workspace_phase_12.md
              // for the running list of `in`-check workarounds in this
              // file.
              const reason =
                "reason" in decision ? decision.reason : "unknown";
              return this.emptyResult(
                input.mode,
                startedAt,
                `template_gate_denied_${reason}`,
              );
            }
          }
          const { result: r, auditError, templateRunId } =
            await this.executeTemplateAudited(
              input,
              resolvedKey,
              input.templateParameters ?? {},
            );
          if (auditError) auditEvents.push(auditError);
          if (typeof templateRunId === "number") templateRunIds.push(templateRunId);
          truncated = r.truncated;
          rawBlocks = r.rows.map((row, i) => this.rowToBlock(`${resolvedKey}:${i}`, row));
        }
        break;
      }
      case "graphrag_algorithm": {
        // Phase 13.5 wires real algorithm invocation through GraphAlgorithmRepository.
        break;
      }
      case "hybrid_cag_graphrag":
      case "hybrid_rac_graphrag": {
        // Wires into existing RAC planner; this router supplies the graph slice.
        if (input.seedNodeId) {
          const r = await this.repository.localGraph(
            input.seedNodeId,
            { maxDepth: input.maxDepth ?? 2, maxResults: input.maxResults ?? 25 },
            input.runtime,
          );
          truncated = r.truncated;
          const distances = computeHopDistances(
            input.seedNodeId,
            r.nodes,
            r.edges,
          );
          rawBlocks = r.nodes.map((n) =>
            this.nodeToBlock(n, distances.get(n.id)),
          );
        }
        break;
      }
    }

    const filtered = filterContextBlocks(rawBlocks, input.runtime);
    const citations = filtered.blocks.map((b) => b.citation);

    // T-I.5 batch A — bridge safety-filter pruning to the Phase 22
    // closed-taxonomy emission surface. One event per retrieval call
    // (NOT per blocked block) — per-block emission would be too noisy
    // for the dashboard. Fire-and-forget; observability writes never
    // propagate into the retrieval return value.
    if (filtered.events.length > 0) {
      const reasonCounts: Record<string, number> = {};
      for (const e of filtered.events) {
        reasonCounts[e.reason] = (reasonCounts[e.reason] ?? 0) + 1;
      }
      void recordFailureStateEvent({
        failureState: "retrieval_safety_filter_blocked_content",
        sourceKind: "retrieval-router",
        sourceId: input.runtimeRunId ?? null,
        errorMessage: `Safety filter pruned ${filtered.events.length} block(s)`,
        metadata: {
          blockedCount: filtered.events.length,
          totalCandidates: rawBlocks.length,
          reasonCounts,
          mode: input.mode,
          workspaceId: input.runtime.workspaceId,
        },
      }).catch(() => {
        // Fail-soft.
      });
    }

    // Phase 12.5 §4 — fire the runtime-usage recorder when the request
    // produced output via a resolved Skill Pack. Errors from the
    // recorder are swallowed and surfaced as a synthetic safety event
    // so the retrieval call never fails because of a usage-log issue.
    const safetyEvents = [...filtered.events];

    // Phase 12.5 §11 — surface sync audit-recorder throws as safety
    // events so operators can debug a misconfigured audit pipeline
    // without losing the retrieval result.
    for (const _ of auditEvents) {
      safetyEvents.push({
        blockId: "__template_run_audit__",
        reason: "missing_citation",
        details: { note: "graphrag_template_run_recorder_threw" },
      });
    }

    if (resolvedSkill && filtered.blocks.length > 0 && this.recordRuntimeUsage) {
      try {
        const maybePromise = this.recordRuntimeUsage({
          packKey: resolvedSkill.packKey,
          templateKey: resolvedSkill.templateKey,
          reason: resolvedSkill.reason,
          mode: input.mode,
          runtimeRunId: input.runtimeRunId,
          workspaceId: input.runtime.workspaceId,
          queryTemplateRunIds: templateRunIds.length > 0 ? [...templateRunIds] : undefined,
        });
        // Fire-and-forget if Promise — don't block the retrieval call.
        if (maybePromise && typeof (maybePromise as Promise<void>).catch === "function") {
          (maybePromise as Promise<void>).catch(() => {
            // Swallow async recorder failures silently. Sync surface
            // already records a safety event for sync throws.
          });
        }
      } catch {
        safetyEvents.push({
          blockId: "__recorder__",
          reason: "missing_citation",
          details: { note: "graphrag_runtime_usage_recorder_threw" },
        });
      }
    }

    return {
      mode: input.mode,
      contextBlocks: filtered.blocks,
      safetyEvents,
      citations,
      truncated,
      durationMs: Date.now() - startedAt,
      ...(resolvedSkill ? { resolvedSkill } : {}),
    };
  }

  private nodeToBlock(
    n: NodeIdentity,
    hopDistance?: number,
  ): ContextBlockInput {
    const payload: Record<string, unknown> = { node: n };
    if (hopDistance !== undefined && Number.isFinite(hopDistance)) {
      payload.hopDistance = hopDistance;
    }
    return {
      id: n.id,
      kind: "text",
      sourceKind: n.typeKey,
      sourceId: n.sourceId ?? n.id,
      sourceVersionId: n.sourceVersionId,
      governanceStatus: "active",
      payload,
    };
  }

  private rowToBlock(id: string, row: Record<string, unknown>): ContextBlockInput {
    return {
      id,
      kind: "graph_subgraph",
      sourceKind: "cypher_template",
      sourceId: id,
      governanceStatus: "active",
      payload: row,
    };
  }

  /**
   * Phase 12.5 §2 / §3 — resolve a templateKey from eligibility output
   * and report which pack + reason produced the choice. Requires BOTH
   * `eligibility` and `packTemplates` to be present; either alone is a
   * no-op so partial wiring doesn't silently change semantics.
   */
  private resolveFromEligibility(
    input: GraphRetrievalInput,
  ): { packKey: string; templateKey: string; reason: "first_template_in_top_pack" | "preferred_key_matched" } | undefined {
    if (!input.eligibility || !input.packTemplates) return undefined;
    const r = selectTemplateForEligiblePacks({
      eligibility: input.eligibility,
      packTemplates: input.packTemplates,
      preferTemplateKeys: input.preferTemplateKeys,
    });
    if (!r) return undefined;
    return {
      packKey: r.pack.skillKey,
      templateKey: r.templateKey,
      reason: r.reason,
    };
  }

  private emptyResult(mode: RetrievalMode, startedAt: number, reason: string): GraphRetrievalOutput {
    return {
      mode,
      contextBlocks: [],
      safetyEvents: [],
      citations: [],
      truncated: false,
      durationMs: Date.now() - startedAt,
      rejectionReason: reason,
    };
  }
}
