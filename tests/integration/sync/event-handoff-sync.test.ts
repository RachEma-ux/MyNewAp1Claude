/**
 * End-to-end synchronization invariants — Phase 10 of the
 * production-readiness verification report.
 *
 * Tier 1 / step 6 of the remediation plan: "Run the Phase 10 E2E
 * sync suite — verify event emit/consume across modules, handoff
 * acceptors, and gateway routing under load."
 *
 * The report flagged Phase 10 as BLOCKED with no artifact. This
 * file is the deterministic floor: it asserts that
 *   - the cross-module event bus accepts a publish and delivers
 *     to a subscriber after the publish promise resolves,
 *   - multiple subscribers each receive a fanout copy,
 *   - unsubscribed consumers stop receiving events,
 *   - wildcard patterns match the eventType namespace.
 *
 * What it does NOT assert: load behaviour, durability across a
 * crash, or end-to-end Postgres outbox commit. Those need a
 * populated DB plus a load harness — a staging-environment
 * concern, not a test-file concern.
 *
 * Behaviour:
 *   - tests/integration/** → excluded from local-unit mode by
 *     the vitest config exclude rule.
 *   - The in-memory bus has no infra dependency; the suite runs
 *     unconditionally in staging-integration mode.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  __resetEventBusForTests,
  publishEvent,
  subscribeEvent,
  unsubscribeEvent,
  makeEnvelope,
} from "../../../server/platform/events";

beforeEach(() => {
  __resetEventBusForTests();
});

describe("E2E sync — event bus emit / consume", () => {
  it("publishEvent → subscribed handler receives the envelope", async () => {
    const seen: string[] = [];
    subscribeEvent("__sync_test__.ping", "phase10-consumer-1", (env) => {
      seen.push(env.eventId);
    });
    try {
      const env = makeEnvelope({
        eventType: "__sync_test__.ping",
        sourceModule: "platform",
        payload: { msg: "hello" },
      });
      await publishEvent(env);
      expect(seen).toEqual([env.eventId]);
    } finally {
      unsubscribeEvent("phase10-consumer-1");
    }
  });

  it("multiple subscribers each receive a fanout copy", async () => {
    const a: string[] = [];
    const b: string[] = [];
    subscribeEvent("__sync_test__.fanout", "phase10-consumer-a", (env) => {
      a.push(env.eventId);
    });
    subscribeEvent("__sync_test__.fanout", "phase10-consumer-b", (env) => {
      b.push(env.eventId);
    });
    try {
      const env = makeEnvelope({
        eventType: "__sync_test__.fanout",
        sourceModule: "platform",
        payload: { id: 7 },
      });
      await publishEvent(env);
      expect(a).toEqual([env.eventId]);
      expect(b).toEqual([env.eventId]);
    } finally {
      unsubscribeEvent("phase10-consumer-a");
      unsubscribeEvent("phase10-consumer-b");
    }
  });

  it("unsubscribed consumers stop receiving events", async () => {
    const calls: string[] = [];
    subscribeEvent("__sync_test__.unsub", "phase10-unsub", (env) => {
      calls.push(env.eventId);
    });
    unsubscribeEvent("phase10-unsub");
    await publishEvent(
      makeEnvelope({
        eventType: "__sync_test__.unsub",
        sourceModule: "platform",
        payload: {},
      }),
    );
    expect(calls).toEqual([]);
  });

  it("wildcard subscription matches the eventType namespace", async () => {
    let count = 0;
    subscribeEvent("__sync_test__.*", "phase10-wild", () => {
      count++;
    });
    try {
      await publishEvent(
        makeEnvelope({
          eventType: "__sync_test__.foo",
          sourceModule: "platform",
          payload: {},
        }),
      );
      await publishEvent(
        makeEnvelope({
          eventType: "__sync_test__.bar",
          sourceModule: "platform",
          payload: {},
        }),
      );
      await publishEvent(
        makeEnvelope({
          eventType: "__other_namespace__.foo",
          sourceModule: "platform",
          payload: {},
        }),
      );
      expect(count).toBe(2);
    } finally {
      unsubscribeEvent("phase10-wild");
    }
  });

  it("idempotencyKey deduplication holds end-to-end", async () => {
    let count = 0;
    subscribeEvent("__sync_test__.idem", "phase10-idem", () => {
      count++;
    });
    try {
      const env1 = makeEnvelope({
        eventType: "__sync_test__.idem",
        sourceModule: "platform",
        payload: { v: 1 },
        idempotencyKey: "phase10-shared",
      });
      const env2 = makeEnvelope({
        eventType: "__sync_test__.idem",
        sourceModule: "platform",
        payload: { v: 2 },
        idempotencyKey: "phase10-shared",
      });
      await publishEvent(env1);
      await publishEvent(env2);
      expect(count).toBe(1);
    } finally {
      unsubscribeEvent("phase10-idem");
    }
  });
});

describe("E2E sync — envelope shape", () => {
  it("makeEnvelope populates required fields", () => {
    const env = makeEnvelope({
      eventType: "test.shape",
      sourceModule: "platform",
      payload: { ok: true },
    });
    expect(env.eventType).toBe("test.shape");
    expect(env.sourceModule).toBe("platform");
    expect(env.payload).toEqual({ ok: true });
    expect(env.eventId).toBeDefined();
    expect(env.createdAt).toBeDefined();
    expect(env.correlationId).toBeDefined();
  });
});
