/**
 * PRM — Event types
 *
 * Names of events emitted by PRM. Use the platform Event Bus envelope
 * shape (`server/platform/events/envelope.ts`) when publishing.
 */

export const PRM_EVENTS = {
  methodPublished: "prm.method.published",
  methodDeprecated: "prm.method.deprecated",
} as const;

/**
 * Renamed from `PrmEventType` to avoid collision with the pre-existing
 * `PrmEventType` in `prm.types.ts` (which categorises PRM domain events).
 * This type names the cross-module bus event identifiers.
 */
export type PrmBusEventType = (typeof PRM_EVENTS)[keyof typeof PRM_EVENTS];

export interface PrmMethodPublishedPayload {
  methodId: number;
  key: string;
  name: string;
  version?: string;
}

export interface PrmMethodDeprecatedPayload {
  methodId: number;
  key: string;
  reason?: string;
}
