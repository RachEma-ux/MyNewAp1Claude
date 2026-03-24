/**
 * HR Nav Observability — Lightweight Navigation Event Tracking
 *
 * Phase 9 deliverable — minimal, privacy-safe operational signals for the HR nav.
 *
 * Tracks:
 * - Section visits (which sections are opened)
 * - Deferred item clicks (which "coming soon" items get user interest)
 * - Dead-end encounters (users hitting empty/unavailable states)
 *
 * Does NOT track:
 * - User identity or PII
 * - HR data content
 * - Session or behavioral profiling
 *
 * Events are accumulated in memory and can be flushed to console (dev)
 * or to a backend endpoint when one exists. No external telemetry.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type NavEventType =
  | "section_visit"
  | "item_click"
  | "deferred_click"
  | "dead_end"
  | "permission_denied";

export interface NavEvent {
  type: NavEventType;
  sectionId: string;
  itemId?: string;
  timestamp: number;
}

export interface NavEventSummary {
  totalEvents: number;
  sectionVisits: Record<string, number>;
  deferredClicks: Record<string, number>;
  deadEndCount: number;
  permissionDeniedCount: number;
}

// ---------------------------------------------------------------------------
// Event Buffer
// ---------------------------------------------------------------------------

const MAX_BUFFER_SIZE = 200;
const eventBuffer: NavEvent[] = [];

/**
 * Record a navigation event. Events are buffered in memory.
 * Oldest events are dropped when buffer exceeds MAX_BUFFER_SIZE.
 */
export function trackNavEvent(
  type: NavEventType,
  sectionId: string,
  itemId?: string,
): void {
  const event: NavEvent = {
    type,
    sectionId,
    itemId,
    timestamp: Date.now(),
  };

  eventBuffer.push(event);

  // Trim buffer to prevent unbounded growth
  if (eventBuffer.length > MAX_BUFFER_SIZE) {
    eventBuffer.splice(0, eventBuffer.length - MAX_BUFFER_SIZE);
  }
}

// ---------------------------------------------------------------------------
// Convenience Trackers
// ---------------------------------------------------------------------------

/** Track a section landing page visit */
export function trackSectionVisit(sectionId: string): void {
  trackNavEvent("section_visit", sectionId);
}

/** Track a click on a live nav item */
export function trackItemClick(sectionId: string, itemId: string): void {
  trackNavEvent("item_click", sectionId, itemId);
}

/** Track a click on a deferred "Coming soon" item */
export function trackDeferredClick(sectionId: string, itemId: string): void {
  trackNavEvent("deferred_click", sectionId, itemId);
}

/** Track a dead-end encounter (empty section, no accessible items) */
export function trackDeadEnd(sectionId: string): void {
  trackNavEvent("dead_end", sectionId);
}

/** Track a permission-denied navigation attempt */
export function trackPermissionDenied(sectionId: string, itemId?: string): void {
  trackNavEvent("permission_denied", sectionId, itemId);
}

// ---------------------------------------------------------------------------
// Summary & Retrieval
// ---------------------------------------------------------------------------

/** Get a summary of all buffered nav events */
export function getNavEventSummary(): NavEventSummary {
  const sectionVisits: Record<string, number> = {};
  const deferredClicks: Record<string, number> = {};
  let deadEndCount = 0;
  let permissionDeniedCount = 0;

  for (const event of eventBuffer) {
    switch (event.type) {
      case "section_visit":
        sectionVisits[event.sectionId] = (sectionVisits[event.sectionId] ?? 0) + 1;
        break;
      case "deferred_click":
        if (event.itemId) {
          deferredClicks[event.itemId] = (deferredClicks[event.itemId] ?? 0) + 1;
        }
        break;
      case "dead_end":
        deadEndCount++;
        break;
      case "permission_denied":
        permissionDeniedCount++;
        break;
    }
  }

  return {
    totalEvents: eventBuffer.length,
    sectionVisits,
    deferredClicks,
    deadEndCount,
    permissionDeniedCount,
  };
}

/** Get the raw event buffer (for dev/admin inspection) */
export function getNavEventBuffer(): readonly NavEvent[] {
  return eventBuffer;
}

/** Clear the event buffer */
export function clearNavEvents(): void {
  eventBuffer.length = 0;
}

/** Get the top N most-clicked deferred items */
export function getTopDeferredItems(n: number = 5): Array<{ itemId: string; clicks: number }> {
  const summary = getNavEventSummary();
  return Object.entries(summary.deferredClicks)
    .map(([itemId, clicks]) => ({ itemId, clicks }))
    .sort((a, b) => b.clicks - a.clicks)
    .slice(0, n);
}
