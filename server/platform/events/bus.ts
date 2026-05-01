/**
 * In-process Event Bus (MVP).
 *
 * Backed by an in-memory outbox + inbox. Subscribers register by event
 * type pattern (`prm.method.published`, `prm.*`, or `*`). Critical events
 * bypass batching; low-priority events may be batched (here: dispatched
 * on next tick).
 *
 * The same surface can be backed by a Redis Streams adapter without
 * changing call sites.
 */

import { setTimeout as wait } from "timers/promises";
import { type EventEnvelope, type EventPriority } from "./envelope";

type Subscriber = {
  pattern: string;
  consumer: string;
  handler: (env: EventEnvelope) => void | Promise<void>;
};

interface OutboxEntry {
  envelope: EventEnvelope;
  attempts: number;
  status: "pending" | "delivered" | "failed";
  lastError?: string;
}

interface InboxKey {
  eventId: string;
  consumer: string;
}

class InMemoryBus {
  private subscribers: Subscriber[] = [];
  private outbox: OutboxEntry[] = [];
  private deadLetter: OutboxEntry[] = [];
  private inbox = new Set<string>();

  subscribe(pattern: string, consumer: string, handler: Subscriber["handler"]) {
    this.subscribers.push({ pattern, consumer, handler });
  }

  unsubscribe(consumer: string) {
    this.subscribers = this.subscribers.filter((s) => s.consumer !== consumer);
  }

  async publish(env: EventEnvelope): Promise<void> {
    const entry: OutboxEntry = { envelope: env, attempts: 0, status: "pending" };
    this.outbox.push(entry);
    if (env.priority === "critical") {
      await this.dispatchCritical(entry);
    } else if (env.priority === "low") {
      // Defer to next tick to allow batching upstream.
      Promise.resolve().then(() => this.dispatch(entry).catch(() => {}));
    } else {
      await this.dispatch(entry);
    }
  }

  private inboxKey(k: InboxKey): string {
    return `${k.consumer}::${k.eventId}`;
  }

  private async dispatchCritical(entry: OutboxEntry): Promise<void> {
    const env = entry.envelope;
    const matched = this.match(env.eventType);
    for (const s of matched) {
      const key = this.inboxKey({ eventId: env.eventId, consumer: s.consumer });
      if (this.inbox.has(key)) continue;
      this.inbox.add(key);
      try {
        await s.handler(env);
      } catch {
        /* critical fan-out should not bubble */
      }
    }
    entry.status = "delivered";
  }

  private async dispatch(entry: OutboxEntry, maxAttempts = 3): Promise<void> {
    const env = entry.envelope;
    const matched = this.match(env.eventType);
    let allOk = true;
    for (const s of matched) {
      const key = this.inboxKey({ eventId: env.eventId, consumer: s.consumer });
      if (this.inbox.has(key)) continue;
      let ok = false;
      for (let attempt = 0; attempt < maxAttempts && !ok; attempt++) {
        try {
          await s.handler(env);
          this.inbox.add(key);
          ok = true;
        } catch (err) {
          entry.attempts++;
          entry.lastError = err instanceof Error ? err.message : String(err);
          if (attempt + 1 < maxAttempts) await wait(50 * (attempt + 1));
        }
      }
      if (!ok) allOk = false;
    }
    if (allOk) entry.status = "delivered";
    else {
      entry.status = "failed";
      this.deadLetter.push(entry);
    }
  }

  private match(eventType: string): Subscriber[] {
    return this.subscribers.filter((s) => {
      if (s.pattern === "*") return true;
      if (s.pattern === eventType) return true;
      if (s.pattern.endsWith(".*")) {
        const prefix = s.pattern.slice(0, -2);
        return eventType.startsWith(prefix + ".");
      }
      return false;
    });
  }

  getOutboxSnapshot() {
    return this.outbox.map((e) => ({ ...e }));
  }
  getDeadLetterSnapshot() {
    return this.deadLetter.map((e) => ({ ...e }));
  }
  reset() {
    this.subscribers = [];
    this.outbox = [];
    this.deadLetter = [];
    this.inbox.clear();
  }
}

let _bus: InMemoryBus | null = null;
function getBus(): InMemoryBus {
  if (!_bus) _bus = new InMemoryBus();
  return _bus;
}

export function publishEvent(env: EventEnvelope): Promise<void> {
  return getBus().publish(env);
}

export function subscribeEvent(
  pattern: string,
  consumer: string,
  handler: (env: EventEnvelope) => void | Promise<void>,
): void {
  getBus().subscribe(pattern, consumer, handler);
}

export function unsubscribeEvent(consumer: string): void {
  getBus().unsubscribe(consumer);
}

/** Snapshot of pending/failed events — used by Digital HQ. */
export function getEventStats() {
  const bus = getBus();
  const out = bus.getOutboxSnapshot();
  const dlq = bus.getDeadLetterSnapshot();
  return {
    outboxSize: out.length,
    pending: out.filter((e) => e.status === "pending").length,
    delivered: out.filter((e) => e.status === "delivered").length,
    failed: out.filter((e) => e.status === "failed").length,
    deadLetter: dlq.length,
  };
}

/** Test-only — clears bus state. */
export function __resetEventBusForTests(): void {
  if (_bus) _bus.reset();
  _bus = null;
}

export type { Subscriber };
