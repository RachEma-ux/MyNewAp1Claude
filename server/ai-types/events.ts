/**
 * AI Types — Event Catalog
 *
 * AI Types emits events through `publishEvent(makeEnvelope({...}))` with
 * `sourceModule: "aiTypes"`. The catalog lifecycle namespace covers the three
 * state-transition events Stage 10 subscribers (Agent Studio, Provider
 * Connections) need to react to:
 *
 *   - registered  — Phase 39: a catalog entry was created or updated through
 *                   `aiTypes.catalog.register` (canonical write path).
 *   - published   — flips a draft to published; emitted by `publishCatalogEntry`.
 *   - deprecated  — supersedes a published entry.
 *
 * Events are emitted *after* the DB write succeeds. A failed publish must not
 * roll back the catalog row — the catalog state is the source of truth and
 * events are downstream notifications. The emit call site wraps `publishEvent`
 * in a try/catch and logs the failure via `console.warn`.
 */

export const AI_TYPES_EVENTS = {
  catalogRegistered: "aiTypes.catalog.registered",
  catalogPublished: "aiTypes.catalog.published",
  catalogDeprecated: "aiTypes.catalog.deprecated",
} as const;
export type AiTypesEventType =
  (typeof AI_TYPES_EVENTS)[keyof typeof AI_TYPES_EVENTS];

/** Manifest-facing flat list (literal strings — required by check:event-wiring). */
export const AI_TYPES_EVENT_NAMES: AiTypesEventType[] = [
  "aiTypes.catalog.registered",
  "aiTypes.catalog.published",
  "aiTypes.catalog.deprecated",
];

/**
 * Phase 39 — payload for `aiTypes.catalog.registered`.
 *
 * Carries the full identity of the catalog row plus the actor context so
 * downstream subscribers (Agent Studio export status reconciliation,
 * Provider Connections binding refresh) can act without a follow-up
 * read. Field semantics:
 *
 *   - catalogEntryId: row id of the catalog_entries write target.
 *   - entryType: the domain type of the entry ("agent" | "llm" | "model"
 *     | "provider" | "bot").
 *   - sourceModule: the module that initiated the register (e.g.
 *     "agentStudio", "providerConnections"). Identifies the *origin* of
 *     the write, distinct from `sourceType` which is the source-of-record
 *     row kind. Falls back to a derived value when the caller does not
 *     pass one explicitly (see `deriveSourceModule` in register.ts).
 *   - sourceRefId: source-of-record reference. For domain-backed entries,
 *     this is the row's numeric `sourceId` (mirrors the legacy contract).
 *     For self-registered system agents (Phase 37 — `sourceType:
 *     "self_registered_agent"`), this is the `sourceName` string (the
 *     `AGENT_CATALOG_ID` constant). Named differently from `sourceId`
 *     here to match the cross-module event vocabulary.
 *   - activeSourceVersionId: pinned source version id (Phase 23 column),
 *     null when the source has no versioning concept yet.
 *   - initiatedByUserId: the user who started the upstream flow. For
 *     direct API calls, equals `performedByActorId`.
 *   - performedByActorId: the actor that executed the register call —
 *     a human user id by default, but may be a system actor id when
 *     called from a backfill or scheduled task.
 *   - performedByActorType: "user" | "system".
 *   - workspaceId: optional workspace context; null for app-scoped entries.
 *   - correlationId: optional pre-existing correlation id from the
 *     upstream flow. The envelope generates one when omitted.
 *   - registeredAt: ISO-8601 timestamp of the emit (set by the emitter,
 *     not the row's createdAt — the latter may differ when the register
 *     path is an update).
 *   - action: "created" | "updated" — mirror of the result.action field
 *     so subscribers can distinguish the two.
 */
export interface CatalogRegisteredPayload {
  catalogEntryId: number;
  entryType: string;
  sourceModule: string;
  /**
   * Source-of-record reference. Numeric for domain-backed entries
   * (sourceId); string for Phase 37 self-registered system agents
   * (sourceName). See ADR `docs/architecture/ai-types/PMT_NAME_BASED_IDENTITY.md`.
   */
  sourceRefId: number | string;
  activeSourceVersionId: number | null;
  initiatedByUserId: number | null;
  performedByActorId: number | null;
  performedByActorType: "user" | "system";
  workspaceId: number | null;
  correlationId: string | null;
  registeredAt: string;
  action: "created" | "updated";
}

/**
 * Plan v3 Phase 40 — payload contract for `aiTypes.catalog.published`.
 *
 * Phase 39 only emitted `registered`. The `published`/`deprecated` events
 * are declared but not yet emitted from the publishing service; defining
 * the payload here gives downstream subscribers (Agent Studio, Provider
 * Connections) a typed contract to bind against ahead of the producer
 * being wired in a follow-up phase.
 */
export interface CatalogPublishedPayload {
  catalogEntryId: number;
  publishBundleId: number | null;
  versionLabel: string | null;
  /** Module that originally registered the entry (mirrors registered.sourceModule). */
  sourceModule: string;
  /** Source-of-record row id (mirrors registered.sourceRefId). */
  sourceRefId: number | null;
  performedByActorId: number | null;
  performedByActorType: "user" | "system";
  workspaceId: number | null;
  publishedAt: string;
}

/** Plan v3 Phase 40 — payload contract for `aiTypes.catalog.deprecated`. */
export interface CatalogDeprecatedPayload {
  catalogEntryId: number;
  /** Reason code or free-form note from the deprecation flow. */
  reason: string | null;
  sourceModule: string;
  sourceRefId: number | null;
  performedByActorId: number | null;
  performedByActorType: "user" | "system";
  workspaceId: number | null;
  deprecatedAt: string;
}
