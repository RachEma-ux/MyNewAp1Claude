/**
 * Event Bus Wiring — round-trip tests
 *
 * Proves the event bus contract:
 *   - publish → subscriber receives
 *   - duplicate idempotencyKey is dropped
 *   - duplicate eventId is dropped (when no idempotencyKey)
 *   - critical handler failure tracked in criticalDeadLetter
 *   - dead-letter count visible via getEventStats
 *   - low-priority events are still delivered (deferred)
 *   - wildcard pattern subscriptions match
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  __resetEventBusForTests,
  getEventStats,
  makeEnvelope,
  publishEvent,
  subscribeEvent,
  unsubscribeEvent,
} from ".";

beforeEach(() => {
  __resetEventBusForTests();
});

describe("Event Bus — round-trip", () => {
  it("delivers a published event to a matching subscriber", async () => {
    const seen: string[] = [];
    subscribeEvent("alpha.thing.happened", "consumer-1", (env) => {
      seen.push(env.eventId);
    });
    const env = makeEnvelope({
      eventType: "alpha.thing.happened",
      sourceModule: "alpha",
      payload: { x: 1 },
    });
    await publishEvent(env);
    expect(seen).toEqual([env.eventId]);
  });

  it("matches wildcard patterns", async () => {
    let count = 0;
    subscribeEvent("alpha.*", "consumer-1", () => {
      count++;
    });
    await publishEvent(
      makeEnvelope({
        eventType: "alpha.foo.changed",
        sourceModule: "alpha",
        payload: {},
      }),
    );
    await publishEvent(
      makeEnvelope({
        eventType: "alpha.bar.created",
        sourceModule: "alpha",
        payload: {},
      }),
    );
    await publishEvent(
      makeEnvelope({
        eventType: "beta.thing.happened",
        sourceModule: "beta",
        payload: {},
      }),
    );
    expect(count).toBe(2);
  });

  it("drops a duplicate idempotencyKey", async () => {
    let count = 0;
    subscribeEvent("alpha.thing.happened", "consumer-1", () => {
      count++;
    });
    const env1 = makeEnvelope({
      eventType: "alpha.thing.happened",
      sourceModule: "alpha",
      payload: { v: 1 },
      idempotencyKey: "shared-key",
    });
    await publishEvent(env1);
    const env2 = makeEnvelope({
      eventType: "alpha.thing.happened",
      sourceModule: "alpha",
      payload: { v: 2 },
      idempotencyKey: "shared-key",
    });
    await publishEvent(env2);
    expect(count).toBe(1);
  });

  it("drops a duplicate eventId when no idempotencyKey", async () => {
    let count = 0;
    subscribeEvent("alpha.thing.happened", "consumer-1", () => {
      count++;
    });
    const env = makeEnvelope({
      eventType: "alpha.thing.happened",
      sourceModule: "alpha",
      payload: { v: 1 },
    });
    await publishEvent(env);
    await publishEvent(env);
    expect(count).toBe(1);
  });

  it("delivers low-priority events (deferred)", async () => {
    let received = false;
    subscribeEvent("alpha.batch", "consumer-1", () => {
      received = true;
    });
    await publishEvent(
      makeEnvelope({
        eventType: "alpha.batch",
        sourceModule: "alpha",
        priority: "low",
        payload: {},
      }),
    );
    // Low-priority dispatches on next tick.
    await new Promise((r) => setTimeout(r, 30));
    expect(received).toBe(true);
  });

  it("tracks critical handler failure in criticalDeadLetter", async () => {
    subscribeEvent("alpha.critical", "consumer-1", () => {
      throw new Error("boom");
    });
    await publishEvent(
      makeEnvelope({
        eventType: "alpha.critical",
        sourceModule: "alpha",
        priority: "critical",
        payload: {},
      }),
    );
    const stats = getEventStats();
    expect(stats.criticalDeadLetter).toBeGreaterThanOrEqual(1);
    expect(stats.failed).toBeGreaterThanOrEqual(1);
  });

  it("delivers to sibling consumers even when one critical handler fails", async () => {
    let okCount = 0;
    subscribeEvent("alpha.critical", "bad-consumer", () => {
      throw new Error("boom");
    });
    subscribeEvent("alpha.critical", "good-consumer", () => {
      okCount++;
    });
    await publishEvent(
      makeEnvelope({
        eventType: "alpha.critical",
        sourceModule: "alpha",
        priority: "critical",
        payload: {},
      }),
    );
    expect(okCount).toBe(1);
  });

  it("getEventStats returns the expected shape", async () => {
    const stats = getEventStats();
    expect(stats).toHaveProperty("outboxSize");
    expect(stats).toHaveProperty("pending");
    expect(stats).toHaveProperty("delivered");
    expect(stats).toHaveProperty("failed");
    expect(stats).toHaveProperty("deadLetter");
    expect(stats).toHaveProperty("criticalDeadLetter");
  });

  it("unsubscribe removes a consumer", async () => {
    let count = 0;
    subscribeEvent("alpha.thing", "ephemeral", () => {
      count++;
    });
    unsubscribeEvent("ephemeral");
    await publishEvent(
      makeEnvelope({
        eventType: "alpha.thing",
        sourceModule: "alpha",
        payload: {},
      }),
    );
    expect(count).toBe(0);
  });
});
