/**
 * Phase 12.5 §5 — Graph Skill Pack runtime-usage recorder tests.
 *
 * Covers the factory exported from
 * `server/agent-studio/services/graph-skill/runtime-usage.ts` that
 * wires the §4 router-side `GraphRetrievalUsageRecorder` port to an
 * ASDB write against `ags_graph_skill_runtime_usages`.
 *
 * Tests use an injected fake DB (no real Postgres) so they run in the
 * standard vitest unit pool.
 *
 * Covered behaviors:
 *   - Resolves `packKey` (skillKey) → latest `pack_version_id`
 *   - Inserts one usage row per fired event
 *   - Skips when `runtimeRunId` is missing (FK column is NOT NULL)
 *   - Skips when ASDB is unavailable (getDb returns null)
 *   - Skips when pack version cannot be resolved (unknown skillKey)
 *   - Caches version-id lookups across calls (single SELECT)
 *   - Honors cache TTL (re-queries after expiry)
 */

import { describe, it, expect, vi } from "vitest";
import { createRuntimeUsageRecorder } from "../../server/agent-studio/services/graph-skill/runtime-usage";

type DrizzleSelectChain = {
  from: () => DrizzleSelectChain;
  innerJoin: () => DrizzleSelectChain;
  where: () => DrizzleSelectChain;
  orderBy: () => DrizzleSelectChain;
  limit: (n: number) => Promise<{ versionId: number }[]>;
};

interface FakeDb {
  insert: ReturnType<typeof vi.fn>;
  select: ReturnType<typeof vi.fn>;
}

// drizzle's `eq()` returns an opaque condition object, so the fake
// can't decode the skillKey from outside. Tests instead use the
// "active key" side-channel pattern: set the key before invoking the
// recorder, the fake returns whatever rows were registered for that
// key. Mirrors the drizzle-fake pattern used elsewhere in the repo's
// unit suites.
function makeKeyAwareDb(
  versionRowsByKey: Record<string, { versionId: number }[]>,
): { db: FakeDb; insertedValues: Record<string, unknown>[]; selectCallCount: () => number; setActiveKey: (k: string) => void } {
  let activeKey: string | undefined;
  const insertedValues: Record<string, unknown>[] = [];
  let selectCalls = 0;

  const select = vi.fn(() => {
    selectCalls += 1;
    const chain: DrizzleSelectChain = {
      from: () => chain,
      innerJoin: () => chain,
      where: () => chain,
      orderBy: () => chain,
      limit: async () => (activeKey ? versionRowsByKey[activeKey] ?? [] : []),
    };
    return chain;
  });

  const insert = vi.fn(() => ({
    values: async (vals: Record<string, unknown>) => {
      insertedValues.push(vals);
    },
  }));

  return {
    db: { insert, select },
    insertedValues,
    selectCallCount: () => selectCalls,
    setActiveKey: (k) => {
      activeKey = k;
    },
  };
}

describe("createRuntimeUsageRecorder — Phase 12.5 §5", () => {
  it("resolves packKey to latest pack_version_id and inserts a usage row", async () => {
    const { db, insertedValues, setActiveKey } = makeKeyAwareDb({
      "pack-a": [{ versionId: 7 }],
    });
    setActiveKey("pack-a");
    const recorder = createRuntimeUsageRecorder({
      getDb: () => db as never,
    });
    await recorder({
      packKey: "pack-a",
      templateKey: "tpl-x",
      reason: "first_template_in_top_pack",
      mode: "graphrag_traversal",
      runtimeRunId: 42,
      workspaceId: 9,
    });
    expect(insertedValues).toEqual([
      { packVersionId: 7, runtimeRunId: 42, queryTemplateRunIds: null },
    ]);
  });

  it("skips silently when runtimeRunId is undefined (FK target unavailable)", async () => {
    const { db, insertedValues, selectCallCount } = makeKeyAwareDb({
      "pack-a": [{ versionId: 7 }],
    });
    const recorder = createRuntimeUsageRecorder({
      getDb: () => db as never,
    });
    await recorder({
      packKey: "pack-a",
      templateKey: "tpl-x",
      reason: "first_template_in_top_pack",
      mode: "graphrag_traversal",
      // runtimeRunId omitted
    });
    expect(insertedValues).toHaveLength(0);
    // Should not even attempt the version-id lookup.
    expect(selectCallCount()).toBe(0);
  });

  it("skips silently when ASDB connection is unavailable", async () => {
    const recorder = createRuntimeUsageRecorder({
      getDb: () => null as never,
    });
    // Should not throw and should not attempt any work.
    await expect(
      recorder({
        packKey: "pack-a",
        templateKey: "tpl-x",
        reason: "first_template_in_top_pack",
        mode: "graphrag_traversal",
        runtimeRunId: 42,
      }),
    ).resolves.toBeUndefined();
  });

  it("skips insert when pack version cannot be resolved (unknown skillKey)", async () => {
    const { db, insertedValues, setActiveKey } = makeKeyAwareDb({
      "known-pack": [{ versionId: 3 }],
    });
    setActiveKey("missing-pack"); // no rows registered for this key
    const recorder = createRuntimeUsageRecorder({
      getDb: () => db as never,
    });
    await recorder({
      packKey: "missing-pack",
      templateKey: "tpl-x",
      reason: "first_template_in_top_pack",
      mode: "graphrag_traversal",
      runtimeRunId: 42,
    });
    expect(insertedValues).toHaveLength(0);
  });

  it("caches version-id lookups across calls for the same packKey", async () => {
    const { db, insertedValues, selectCallCount, setActiveKey } = makeKeyAwareDb({
      "pack-a": [{ versionId: 11 }],
    });
    setActiveKey("pack-a");
    const recorder = createRuntimeUsageRecorder({
      getDb: () => db as never,
    });

    for (let i = 0; i < 3; i++) {
      await recorder({
        packKey: "pack-a",
        templateKey: "tpl-x",
        reason: "first_template_in_top_pack",
        mode: "graphrag_traversal",
        runtimeRunId: 100 + i,
      });
    }

    expect(insertedValues).toHaveLength(3);
    expect(insertedValues.map((v) => v.runtimeRunId)).toEqual([100, 101, 102]);
    // Only one SELECT despite three inserts — cache hit on calls 2/3.
    expect(selectCallCount()).toBe(1);
  });

  it("re-queries pack-version after cache TTL expires", async () => {
    const { db, selectCallCount, setActiveKey } = makeKeyAwareDb({
      "pack-a": [{ versionId: 11 }],
    });
    setActiveKey("pack-a");
    const recorder = createRuntimeUsageRecorder({
      getDb: () => db as never,
      cacheTtlMs: 1, // 1ms TTL
    });

    await recorder({
      packKey: "pack-a",
      templateKey: "tpl-x",
      reason: "first_template_in_top_pack",
      mode: "graphrag_traversal",
      runtimeRunId: 1,
    });
    await new Promise((r) => setTimeout(r, 5));
    await recorder({
      packKey: "pack-a",
      templateKey: "tpl-x",
      reason: "first_template_in_top_pack",
      mode: "graphrag_traversal",
      runtimeRunId: 2,
    });

    // Cache expired between calls → two SELECTs.
    expect(selectCallCount()).toBe(2);
  });

  it("caches negative resolution (missing pack) so repeat misses don't re-query", async () => {
    const { db, selectCallCount, setActiveKey } = makeKeyAwareDb({
      // no rows registered
    });
    setActiveKey("ghost");
    const recorder = createRuntimeUsageRecorder({
      getDb: () => db as never,
    });

    for (let i = 0; i < 3; i++) {
      await recorder({
        packKey: "ghost",
        templateKey: "tpl-x",
        reason: "first_template_in_top_pack",
        mode: "graphrag_traversal",
        runtimeRunId: 100 + i,
      });
    }

    // Negative result is cached: still one SELECT total.
    expect(selectCallCount()).toBe(1);
  });
});
