/**
 * Event envelope — every event published on the bus carries this shape.
 */

import { z } from "zod";

export const EventPrioritySchema = z.enum(["critical", "high", "normal", "low"]);
export type EventPriority = z.infer<typeof EventPrioritySchema>;

export const EventEnvelopeSchema = z.object({
  eventId: z.string(),
  eventType: z.string(),
  sourceModule: z.string(),
  priority: EventPrioritySchema,
  workspaceId: z.union([z.number(), z.string(), z.null()]).optional(),
  actorId: z.union([z.number(), z.string(), z.null()]).optional(),
  correlationId: z.string(),
  schemaVersion: z.string(),
  payload: z.unknown(),
  createdAt: z.string(),
  governanceReceiptId: z.string().optional(),
});

export type EventEnvelope = z.infer<typeof EventEnvelopeSchema>;

import { randomUUID } from "crypto";

export function makeEnvelope(input: {
  eventType: string;
  sourceModule: string;
  priority?: EventPriority;
  workspaceId?: number | string | null;
  actorId?: number | string | null;
  correlationId?: string;
  schemaVersion?: string;
  payload: unknown;
  governanceReceiptId?: string;
}): EventEnvelope {
  return {
    eventId: randomUUID(),
    eventType: input.eventType,
    sourceModule: input.sourceModule,
    priority: input.priority ?? "normal",
    workspaceId: input.workspaceId ?? null,
    actorId: input.actorId ?? null,
    correlationId: input.correlationId ?? randomUUID(),
    schemaVersion: input.schemaVersion ?? "1.0.0",
    payload: input.payload,
    createdAt: new Date().toISOString(),
    governanceReceiptId: input.governanceReceiptId,
  };
}
