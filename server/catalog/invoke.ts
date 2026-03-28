/**
 * Catalog Universal Invoke Path
 *
 * Single entry point for executing any catalog agent entry, regardless
 * of its runtime kind. The invoker:
 *
 *   1. Loads the catalog entry
 *   2. Resolves its runtime kind (llm-chat | service)
 *   3. Dispatches to the correct execution adapter
 *   4. Yields normalized CatalogExecutionEvent results
 *
 * This replaces the inline branching that was previously scattered
 * across index.ts SSE handlers and agents/stream.ts.
 *
 * Adapters:
 *   - llm-chat  → executeCatalogChatStream (execution.ts)
 *   - service   → executeServiceAgentStream (execution.ts)
 */

import { getCatalogEntryById } from "../db";
import { resolveCatalogRuntimeKind, type CatalogRuntimeKind } from "@shared/catalog-execution";
import {
  executeCatalogChatStream,
  executeServiceAgentStream,
  type CatalogExecutionEvent,
} from "./execution";

export interface CatalogInvokeInput {
  catalogEntryId: number;
  actorUserId: number;
  message: string;
  triggerSource?: string;
  conversationId?: number;
}

export interface CatalogInvokeResolution {
  runtimeKind: CatalogRuntimeKind;
  catalogEntryId: number;
  entryName: string;
}

/**
 * Resolve the runtime kind for a catalog entry without executing it.
 * Useful for UI pre-checks or routing decisions.
 */
export async function resolveInvokeTarget(
  catalogEntryId: number,
): Promise<CatalogInvokeResolution | null> {
  const entry = await getCatalogEntryById(catalogEntryId);
  if (!entry) return null;
  if (entry.entryType !== "agent") return null;

  const config = entry.config as Record<string, unknown> | null;
  const runtimeKind = resolveCatalogRuntimeKind(config);

  return {
    runtimeKind,
    catalogEntryId: entry.id,
    entryName: entry.displayName || entry.name,
  };
}

/**
 * Universal catalog invoke — the single entry point for all catalog
 * agent execution. Resolves the runtime kind and dispatches to the
 * correct adapter.
 *
 * Yields CatalogExecutionEvent (same shape for all adapters).
 */
export async function* invokeCatalogEntry(
  input: CatalogInvokeInput,
): AsyncGenerator<CatalogExecutionEvent> {
  const { catalogEntryId, actorUserId, message, triggerSource, conversationId } = input;

  // 1. Load entry and resolve runtime kind
  const entry = await getCatalogEntryById(catalogEntryId);
  if (!entry) {
    yield {
      type: "error",
      runId: 0,
      error: `Catalog entry #${catalogEntryId} not found`,
    };
    return;
  }

  if (entry.entryType !== "agent") {
    yield {
      type: "error",
      runId: 0,
      error: `Catalog entry #${catalogEntryId} is not an agent (type: ${entry.entryType})`,
    };
    return;
  }

  const config = entry.config as Record<string, unknown> | null;
  const runtimeKind = resolveCatalogRuntimeKind(config);

  // 2. Dispatch to the correct adapter
  const resolvedTrigger = triggerSource ?? `catalog_invoke`;

  switch (runtimeKind) {
    case "service":
      yield* executeServiceAgentStream({
        catalogEntryId,
        actorUserId,
        message,
        triggerSource: resolvedTrigger,
      });
      break;

    case "llm-chat":
      yield* executeCatalogChatStream({
        catalogEntryId,
        actorUserId,
        message,
        conversationId,
        triggerSource: resolvedTrigger,
      });
      break;

    default: {
      const _exhaustive: never = runtimeKind;
      yield {
        type: "error",
        runId: 0,
        error: `Unknown runtime kind: ${runtimeKind}`,
      };
    }
  }
}
