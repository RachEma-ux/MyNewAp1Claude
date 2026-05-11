/**
 * GraphRAG ingestion adapter — Phase 3 / Phase 12 §5.
 *
 * Two dispatch paths today:
 *
 *   - **Legacy / data-analysis stub:** when the source has no Phase 12
 *     `retrievalMethod` discriminator on `metadataJson`, the adapter
 *     returns an empty result with a structured `source_unavailable`
 *     warning, preserving the gap-report behavior. The data-analysis
 *     team's synchronous `dataAnalysis.graphrag.retrieve` contract
 *     (per `docs/evidence/agent-studio-rac/GRAPHRAG_CONTRACT_GAP_REPORT.md`)
 *     will replace this branch once it lands.
 *   - **Native GraphRetrievalRouter dispatch (Phase 12 §5):** when the
 *     source carries `metadataJson.retrievalMethod ∈ {local, global,
 *     traversal, text2cypher, algorithm}`, the adapter resolves the
 *     active `GraphRepository` via `getGraphRepository()`, hands the
 *     request to a `GraphRetrievalRouter`, and maps the returned
 *     `ContextBlockOutput[]` to `RacRetrievalChunk[]` so the executor
 *     and downstream filter/citation passes see uniform shape across
 *     all source types.
 *
 * Filters: the adapter mines `request.filters` for the optional
 * `seedNodeId` / `templateKey` / `templateParameters` / `generatedCypher`
 * / `maxDepth` / `maxResults` fields the router needs. Missing fields
 * pass through to the router which short-circuits to an empty result
 * with a `rejectionReason` — the executor records the warning so
 * operators can debug the misconfiguration without faked output.
 */

import type {
  RacIngestionAdapter,
  RacIndexValidationResult,
  RacIngestionPreview,
  RacRetrievalChunk,
  RacRetrievalHealth,
  RacRetrievalRequest,
  RacRetrievalResult,
} from "./types";
import {
  GRAPHRAG_RETRIEVAL_METHODS,
  methodToReservedMode,
  type GraphragRetrievalMethod,
} from "../planner-mode";

const SOURCE_UNAVAILABLE_REASON =
  "graphrag_public_retrieve_contract_missing — see docs/evidence/agent-studio-rac/GRAPHRAG_CONTRACT_GAP_REPORT.md";

function isGraphragMethod(value: unknown): value is GraphragRetrievalMethod {
  return (
    typeof value === "string" &&
    (GRAPHRAG_RETRIEVAL_METHODS as readonly string[]).includes(value)
  );
}

function readFilterString(
  filters: Record<string, unknown> | undefined,
  key: string,
): string | undefined {
  if (!filters) return undefined;
  const v = filters[key];
  return typeof v === "string" ? v : undefined;
}

function readFilterNumber(
  filters: Record<string, unknown> | undefined,
  key: string,
): number | undefined {
  if (!filters) return undefined;
  const v = filters[key];
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

/**
 * Map a `ContextBlockOutput` from the router to a `RacRetrievalChunk`
 * so the executor and filter passes can consume it uniformly. The
 * content is a stable JSON serialization of the block's payload — the
 * router's safety filter has already stripped `governanceStatus !==
 * "active"` rows, so what remains is safe to surface.
 *
 * Score (Phase 12 §6 — hop-distance hybrid ranking):
 *   - When `payload.hopDistance` is present (set by the router for
 *     `graphrag_local` / `hybrid_*_graphrag` paths via BFS from
 *     `seedNodeId`), score = `1 / (1 + hopDistance)`. Seed itself
 *     scores 1.0; 1-hop neighbors 0.5; 2-hop 0.333; etc.
 *   - When absent (template / subgraph results, `graphrag_global`
 *     sample, algorithm placeholder), score falls back to 1.0 —
 *     caller-side ranking has no graph-distance signal to use anyway.
 */
function blockToChunk(
  block: {
    id: string;
    sourceKind: string;
    sourceId: string;
    sourceVersionId?: string;
    payload: Record<string, unknown>;
    citation: { sourceKind: string; sourceId: string; sourceVersionId?: string };
  },
  resolvedSkill?: {
    readonly packKey: string;
    readonly templateKey: string;
    readonly reason: string;
  },
): RacRetrievalChunk {
  const hopRaw = block.payload["hopDistance"];
  const hopDistance =
    typeof hopRaw === "number" && Number.isFinite(hopRaw) && hopRaw >= 0
      ? hopRaw
      : undefined;
  const score = hopDistance !== undefined ? 1 / (1 + hopDistance) : 1;
  return {
    content: JSON.stringify(block.payload),
    score,
    citation: `[${block.citation.sourceKind}:${block.citation.sourceId}${
      block.citation.sourceVersionId
        ? "§" + block.citation.sourceVersionId
        : ""
    }]`,
    sourceChunkId: block.id,
    metadata: {
      sourceKind: block.sourceKind,
      sourceId: block.sourceId,
      sourceVersionId: block.sourceVersionId,
      hopDistance,
      resolvedSkillPack: resolvedSkill?.packKey,
      resolvedSkillTemplate: resolvedSkill?.templateKey,
    },
  };
}

async function dispatchToRouter(
  input: RacRetrievalRequest,
  method: GraphragRetrievalMethod,
): Promise<RacRetrievalResult> {
  const start = Date.now();
  const { getGraphRepository } = await import(
    "../../graph/repository"
  );
  const { GraphRetrievalRouter } = await import(
    "../../graph/retrieval/retrieval-router"
  );
  const { createRuntimeUsageRecorder } = await import(
    "../../graph-skill/public-api"
  );
  const repo = getGraphRepository();
  const router = new GraphRetrievalRouter(repo, {
    recordRuntimeUsage: createRuntimeUsageRecorder(),
  });
  const filters = input.filters as Record<string, unknown> | undefined;

  // Phase 12.5 §3 — pass-through eligibility / packTemplates /
  // preferTemplateKeys when the caller stuffed them into `filters`.
  // Loose typing on the request side (filters: Record<string,
  // unknown>) means we accept whatever shape the caller supplied and
  // the router validates internally.
  const eligibility = filters?.eligibility as
    | Parameters<typeof router.retrieve>[0]["eligibility"]
    | undefined;
  const packTemplates = filters?.packTemplates as
    | Parameters<typeof router.retrieve>[0]["packTemplates"]
    | undefined;
  const preferRaw = filters?.preferTemplateKeys;
  const preferTemplateKeys = Array.isArray(preferRaw)
    ? (preferRaw as ReadonlyArray<string>)
    : undefined;

  const result = await router.retrieve({
    mode: methodToReservedMode(method),
    query: input.query,
    seedNodeId: readFilterString(filters, "seedNodeId"),
    templateKey: readFilterString(filters, "templateKey"),
    templateParameters: filters?.templateParameters as
      | Record<string, unknown>
      | undefined,
    generatedCypher: readFilterString(filters, "generatedCypher"),
    maxDepth: readFilterNumber(filters, "maxDepth"),
    maxResults: readFilterNumber(filters, "maxResults") ?? input.topK,
    eligibility,
    packTemplates,
    preferTemplateKeys,
    runtime: {
      workspaceId: input.workspaceId,
      // userId / role / allowedWorkspaces are propagated by future
      // executor work; the router currently uses them only for
      // governance-status filtering inside the safety filter, which
      // defaults conservatively when absent.
    },
  });

  const warnings: string[] = [];
  if (result.rejectionReason) {
    warnings.push(
      `graphrag_router_rejected: source=${input.sourceId} method=${method} reason=${result.rejectionReason}`,
    );
  }
  if (result.truncated) {
    warnings.push(
      `graphrag_router_truncated: source=${input.sourceId} method=${method}`,
    );
  }
  for (const evt of result.safetyEvents) {
    warnings.push(
      `graphrag_safety_event: block=${evt.blockId} reason=${evt.reason}`,
    );
  }
  // Phase 12.5 §3 — surface the resolved Skill Pack in the trace so
  // operators can answer "why did this template fire?" without diffing
  // eligibility output. Stamped on every chunk's metadata + emitted as
  // a structured warning line.
  if (result.resolvedSkill) {
    warnings.push(
      `graphrag_resolved_skill: source=${input.sourceId} pack=${result.resolvedSkill.packKey} template=${result.resolvedSkill.templateKey} reason=${result.resolvedSkill.reason}`,
    );
  }

  return {
    chunks: result.contextBlocks.map((b) =>
      blockToChunk(b, result.resolvedSkill),
    ),
    latencyMs: Date.now() - start,
    warnings,
  };
}

export const graphragAdapter: RacIngestionAdapter = {
  async search(input: RacRetrievalRequest): Promise<RacRetrievalResult> {
    // Phase 12 §5 — when the source carries a recognized retrievalMethod
    // discriminator, dispatch to the native GraphRetrievalRouter against
    // the active GraphRepository. Otherwise fall back to the legacy
    // gap-report stub.
    if (isGraphragMethod(input.retrievalMethod)) {
      return dispatchToRouter(input, input.retrievalMethod);
    }
    const start = Date.now();
    const methodTag = input.retrievalMethod
      ? ` method=${input.retrievalMethod}`
      : "";
    return {
      chunks: [],
      latencyMs: Date.now() - start,
      warnings: [
        `source_unavailable: source=${input.sourceId} type=graph_index${methodTag} — ${SOURCE_UNAVAILABLE_REASON}`,
      ],
    };
  },

  async health(): Promise<RacRetrievalHealth> {
    return {
      status: "unavailable",
      reason: SOURCE_UNAVAILABLE_REASON,
    };
  },

  async validateIndex(input: {
    workspaceId: number;
    sourceId: number;
  }): Promise<RacIndexValidationResult> {
    return {
      ok: false,
      reason: "source_unavailable",
      details: {
        sourceId: input.sourceId,
        workspaceId: input.workspaceId,
        gap: SOURCE_UNAVAILABLE_REASON,
      },
    };
  },

  async preview(): Promise<RacIngestionPreview> {
    return {
      sampleChunks: [],
      warnings: [SOURCE_UNAVAILABLE_REASON],
    };
  },
};
