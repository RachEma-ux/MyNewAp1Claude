# Event Priority Model

Events are first-class but used **selectively**, not for every cross-module call.

## Priority levels

| Priority | Use cases                                                            | Delivery semantics                                |
|----------|----------------------------------------------------------------------|---------------------------------------------------|
| critical | governance freeze, DB unavailable, runtime failed, security violation | Bypass batching, dedupe by `eventId`, backpressure to bounded queue. |
| high     | handoff accepted/rejected, job failed, policy updated                | Outbox, durable, retried with exponential backoff. |
| normal   | project status changed, workflow step completed                       | Outbox, durable, batched per consumer.            |
| low      | health summaries, metrics, counters, heartbeats                       | Batched, may be lossy if subscriber is slow.      |

## Envelope

Every event carries:

- `eventId` (UUID)
- `eventType` (dotted, namespaced — e.g. `prm.method.published`)
- `sourceModule`
- `priority` (`critical` | `high` | `normal` | `low`)
- `workspaceId`
- `actorId`
- `correlationId`
- `schemaVersion` (semver)
- `payload`
- `createdAt` (ISO 8601)
- `governanceReceiptId` (optional)

## Outbox / Inbox

- Producer writes event to its **outbox** in the same DB transaction as the
  source mutation. A relay drains the outbox to the bus.
- Consumer's **inbox** records `{eventId, consumer}` to dedupe — events are
  idempotent by design.
- Failed deliveries go to the **dead-letter** table after `maxAttempts`.

## Critical-event bypass

`critical` events:
- Bypass batching.
- Dedupe by `eventId` to protect against storms.
- Subject to backpressure: if the bounded queue is full, the producer falls
  back to writing the event with `degraded=true` and emitting a warning to
  Digital HQ.

## Required code surface

- `server/platform/events/envelope.ts` — type and validator.
- `server/platform/events/outbox.ts` — `publishEvent(envelope)` (writes outbox row + in-memory dispatch).
- `server/platform/events/inbox.ts` — `recordInboxOnce(eventId, consumer)` (idempotency).
- `server/platform/events/bus.ts` — runtime fan-out, in-process subscribers,
  retry policy.

The MVP implementation runs **in-process**. The same surface can be backed by a
Redis Streams / Kafka adapter later without changing call sites.
