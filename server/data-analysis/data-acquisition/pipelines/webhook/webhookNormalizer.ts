/**
 * Webhook pipeline — event normalizer.
 *
 * Maps a raw webhook delivery into `data_acquisition_webhook_events`
 * row shape. Signature validation is delegated to `signatureVerifier`.
 */

import type { InsertDataAcquisitionWebhookEvent } from "../../../../../drizzle/schema";

export interface RawWebhookDelivery {
  provider?: string;
  eventType?: string;
  deliveryId?: string;
  signatureValid?: boolean;
  payload?: Record<string, unknown>;
  receivedAt?: string | number | Date;
}

export function normalizeWebhookDelivery(
  itemId: number,
  raw: RawWebhookDelivery,
): InsertDataAcquisitionWebhookEvent {
  return {
    itemId,
    provider: raw.provider ?? null,
    eventType: raw.eventType ?? null,
    deliveryId: raw.deliveryId ?? null,
    signatureValid: raw.signatureValid ?? null,
    payloadJson: raw.payload ?? null,
    receivedAt: raw.receivedAt ? new Date(raw.receivedAt) : null,
  };
}
