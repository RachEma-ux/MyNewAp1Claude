/**
 * Event Bus Persistence Foundation
 *
 * The current InMemoryBus delivers events synchronously and stores
 * outbox / inbox / dead-letter state in process memory. That's MVP.
 * For durability we need:
 *
 *   - Outbox  — events the bus has accepted but not yet successfully
 *               delivered to all subscribers.
 *   - Inbox   — `(consumer, dedupId)` records proving a consumer has
 *               already processed an event, so retries dedupe.
 *   - DeadLetter — events that exhausted retries.
 *   - CriticalDeadLetter — per-consumer failure trace for critical
 *                          events (no retries, but still observable).
 *
 * This file declares the storage interfaces used by future DB-backed
 * adapters and re-states the schema in
 * `migrations/event-bus/001_outbox_inbox_dlq.sql`. The default in-
 * memory implementations are in `bus.ts`; adding a Postgres adapter is
 * out of scope for this PR (no live DB to test against). The
 * interface ensures call-sites won't change when persistence lands.
 */

import type { EventEnvelope } from "./envelope";

export type OutboxStatus = "pending" | "delivered" | "failed";

export interface OutboxRecord {
  envelope: EventEnvelope;
  attempts: number;
  status: OutboxStatus;
  lastError?: string;
}

export interface DeadLetterRecord extends OutboxRecord {
  /** When the entry was moved to the DLQ. */
  movedAt?: string;
}

export interface CriticalDeadLetterRecord {
  envelope: EventEnvelope;
  consumer: string;
  error: string;
  attemptedAt: string;
}

export interface InboxRecord {
  consumer: string;
  /** dedup key — `idempotencyKey ?? eventId`. */
  dedupId: string;
  processedAt: string;
}

/**
 * Minimal storage interface every Event Bus persistence adapter must
 * satisfy. Adapters MAY add transactional semantics; the in-memory
 * fallback is naturally non-transactional.
 */
export interface EventBusStore {
  // --- outbox ---
  outboxAppend(rec: OutboxRecord): Promise<void>;
  outboxUpdateStatus(eventId: string, patch: Partial<OutboxRecord>): Promise<void>;
  outboxList(filter?: { status?: OutboxStatus }): Promise<OutboxRecord[]>;

  // --- inbox (consumer dedup) ---
  inboxHas(consumer: string, dedupId: string): Promise<boolean>;
  inboxRecord(rec: InboxRecord): Promise<void>;

  // --- dead letter ---
  deadLetterAppend(rec: DeadLetterRecord): Promise<void>;
  deadLetterList(): Promise<DeadLetterRecord[]>;

  // --- critical dead letter ---
  criticalDeadLetterAppend(rec: CriticalDeadLetterRecord): Promise<void>;
  criticalDeadLetterList(): Promise<CriticalDeadLetterRecord[]>;

  // --- maintenance ---
  reset(): Promise<void>;
}

/**
 * Foundation for a Postgres-backed event store. Throws on every call —
 * deployments that want durability provide their own implementation
 * (see `migrations/event-bus/001_outbox_inbox_dlq.sql` for the schema).
 */
export class DbEventBusStoreNotConfigured implements EventBusStore {
  private readonly msg =
    "DbEventBusStore is not configured. The default in-process bus is used; provide a Postgres-backed implementation to opt in to durability.";
  async outboxAppend(): Promise<void> {
    throw new Error(this.msg);
  }
  async outboxUpdateStatus(): Promise<void> {
    throw new Error(this.msg);
  }
  async outboxList(): Promise<OutboxRecord[]> {
    throw new Error(this.msg);
  }
  async inboxHas(): Promise<boolean> {
    throw new Error(this.msg);
  }
  async inboxRecord(): Promise<void> {
    throw new Error(this.msg);
  }
  async deadLetterAppend(): Promise<void> {
    throw new Error(this.msg);
  }
  async deadLetterList(): Promise<DeadLetterRecord[]> {
    throw new Error(this.msg);
  }
  async criticalDeadLetterAppend(): Promise<void> {
    throw new Error(this.msg);
  }
  async criticalDeadLetterList(): Promise<CriticalDeadLetterRecord[]> {
    throw new Error(this.msg);
  }
  async reset(): Promise<void> {
    throw new Error(this.msg);
  }
}
