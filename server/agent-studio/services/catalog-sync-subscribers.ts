/**
 * Plan v3 Phase 40 — Agent Studio handler logic for catalog lifecycle events.
 *
 * The literal `subscribeEvent("aiTypes.catalog.{registered|published|deprecated}", ...)`
 * calls live in `boot.ts` so the wiring inventory regex (which only scans
 * the manifest, boot.ts, and events.ts) can pick them up statically. This
 * file owns the per-event filter, parsing, and best-effort handling so:
 *
 *   1. boot.ts stays thin (three near-identical subscriptions).
 *   2. Tests drive `processCatalogSyncEvent` with synthetic envelopes
 *      without booting the module or hitting a real bus.
 *
 * Filtering rule: only events whose `payload.sourceModule === "agentStudio"`
 * (or `payload.entryType === "agent"`, which is the legacy fallback) are
 * persisted. Provider Connections-sourced catalog rows aren't AS's concern.
 *
 * Best-effort: any failure (DB outage, malformed payload) is swallowed
 * with a `console.warn`. The subscription itself stays alive and the next
 * delivery is processed normally. This matches the rag/documents.uploaded
 * pattern in `server/rag/manifest.ts`.
 */

import type { EventEnvelope } from "../../platform/events";
import type {
  CatalogRegisteredPayload,
  CatalogPublishedPayload,
  CatalogDeprecatedPayload,
} from "../../ai-types/events";

export type CatalogSyncEventType =
  | "aiTypes.catalog.registered"
  | "aiTypes.catalog.published"
  | "aiTypes.catalog.deprecated";

export interface CatalogSyncRecorderInput {
  eventId: string;
  eventType: string;
  catalogEntryId: number;
  sourceModule: string;
  sourceRefId: number | null;
  action: string | null;
  payload: Record<string, unknown>;
}

export type CatalogSyncRecorder = (
  input: CatalogSyncRecorderInput,
) => Promise<void>;

export interface CatalogSyncLogger {
  info: (msg: string) => void;
  warn: (msg: string) => void;
}

const DEFAULT_LOGGER: CatalogSyncLogger = {
  info: (m) => console.log(m),
  warn: (m) => console.warn(m),
};

function isAgentStudioEvent(payload: any): boolean {
  return (
    payload?.sourceModule === "agentStudio" || payload?.entryType === "agent"
  );
}

function readNumberField(payload: any, field: string): number | null {
  const v = payload?.[field];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/**
 * Plan v3 Phase 40 — processes one catalog-sync event delivery.
 *
 * Returns "recorded" when a sync log row was written, "skipped_filtered"
 * when the event was for a non-AS source, "skipped_invalid" when the
 * payload was malformed, or "error" when the recorder threw. The return
 * value lets tests assert the path without scraping log lines.
 */
export async function processCatalogSyncEvent(
  eventType: CatalogSyncEventType,
  env: EventEnvelope,
  recorder: CatalogSyncRecorder,
  logger: CatalogSyncLogger = DEFAULT_LOGGER,
): Promise<"recorded" | "skipped_filtered" | "skipped_invalid" | "error"> {
  try {
    const payload = env.payload as Partial<
      CatalogRegisteredPayload &
        CatalogPublishedPayload &
        CatalogDeprecatedPayload
    >;

    if (!isAgentStudioEvent(payload)) {
      return "skipped_filtered";
    }

    const catalogEntryId = readNumberField(payload, "catalogEntryId");
    if (catalogEntryId === null) {
      logger.warn(
        `[ags-catalog-sync] ${eventType} event ${env.eventId} missing catalogEntryId; skipped`,
      );
      return "skipped_invalid";
    }

    const action =
      eventType === "aiTypes.catalog.registered"
        ? ((payload as Partial<CatalogRegisteredPayload>).action ?? null)
        : null;

    await recorder({
      eventId: env.eventId,
      eventType,
      catalogEntryId,
      sourceModule: payload.sourceModule ?? "agentStudio",
      sourceRefId: readNumberField(payload, "sourceRefId"),
      action,
      payload: payload as Record<string, unknown>,
    });

    logger.info(
      `[ags-catalog-sync] ${eventType} catalogEntryId=${catalogEntryId} agent=${
        readNumberField(payload, "sourceRefId") ?? "?"
      }${action ? ` action=${action}` : ""}`,
    );
    return "recorded";
  } catch (err) {
    logger.warn(
      `[ags-catalog-sync] ${eventType} handler failed: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    return "error";
  }
}

/**
 * Plan v3 Phase 40 — derives the "current catalog status" of an entry
 * from the latest sync-log row's eventType. Used by the export-status
 * derivation in Phase 30 and by Phase 41 reconciliation.
 */
export type AgentCatalogStatus =
  | "registered"
  | "published"
  | "deprecated"
  | "unknown";

export function deriveCatalogStatusFromEventType(
  eventType: string | null,
): AgentCatalogStatus {
  switch (eventType) {
    case "aiTypes.catalog.registered":
      return "registered";
    case "aiTypes.catalog.published":
      return "published";
    case "aiTypes.catalog.deprecated":
      return "deprecated";
    default:
      return "unknown";
  }
}
