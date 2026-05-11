/**
 * Operator dashboard composite query.
 *
 * Single-round-trip payload for the agent studio operator UI. Bundles:
 *   - `graphQuality`: getGraphQualityStats() — finding/scan/run counts +
 *     14-day findings trend (PR #503)
 *   - `observability`: getWorkspaceObservabilityStats() — error_events
 *     + background_jobs + notifications aggregates (PR #494)
 *   - `unread`: countUnreadNotifications(userId) — per-user unread badge
 *     count (PR #499)
 *
 * Composition is parallel (Promise.all) — the underlying queries are
 * independent SQL aggregations. If userId is missing (unauthenticated
 * caller), the unread block is the zero-state instead of an error so
 * the dashboard renders the public-data half without failure.
 *
 * This is purely a fan-out composition. The three underlying services
 * remain individually exposed via the existing routers; cache
 * invalidation can target a single sub-tree without re-fetching the
 * combined payload.
 */

import {
  getGraphQualityStats,
  type GraphQualityStats,
} from "./stats.js";
import {
  getWorkspaceObservabilityStats,
  countUnreadNotifications,
  type WorkspaceObservabilityStats,
  type UnreadNotificationCount,
} from "../workspace-observability/public-api.js";

export interface OperatorDashboardPayload {
  readonly graphQuality: GraphQualityStats;
  readonly observability: WorkspaceObservabilityStats;
  readonly unread: UnreadNotificationCount;
}

export interface OperatorDashboardOptions {
  readonly getGraphQualityStats?: typeof getGraphQualityStats;
  readonly getWorkspaceObservabilityStats?: typeof getWorkspaceObservabilityStats;
  readonly countUnreadNotifications?: typeof countUnreadNotifications;
}

const EMPTY_UNREAD: UnreadNotificationCount = { total: 0, byKind: {} };

export async function getOperatorDashboard(
  userId: number | null | undefined,
  options: OperatorDashboardOptions = {},
): Promise<OperatorDashboardPayload> {
  const gqs = options.getGraphQualityStats ?? getGraphQualityStats;
  const obs =
    options.getWorkspaceObservabilityStats ?? getWorkspaceObservabilityStats;
  const cun = options.countUnreadNotifications ?? countUnreadNotifications;

  const [graphQuality, observability, unread] = await Promise.all([
    gqs(),
    obs(),
    userId != null ? cun(userId) : Promise.resolve(EMPTY_UNREAD),
  ]);
  return { graphQuality, observability, unread };
}
