/**
 * RAC Phase 1A — CAG store unit tests.
 *
 * Mocks the ASDB connection so the store is exercised end-to-end
 * without a real Postgres. Mocks return cloned snapshots (per the
 * lesson from PR #160) so callers can't observe internal mutations
 * through a captured reference.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── In-memory mock DB ─────────────────────────────────────────────────

type Pack = {
  id: number;
  workspaceId: number;
  agentId: number;
  agentDraftId: number;
  catalogEntryId: number | null;
  packType: string;
  packVersion: number;
  status: "fresh" | "stale" | "archived" | "invalid";
  contentJson: Record<string, unknown>;
  compressedPrompt: string | null;
  tokenEstimate: number | null;
  sourceManifestJson: Record<string, unknown>;
  sourceHashesJson: Record<string, string>;
  injectionPolicyJson: Record<string, unknown> | null;
  riskSummaryJson: Record<string, unknown> | null;
  createdBy: number;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date | null;
  lastUsedAt: Date | null;
};

type Event = {
  id: number;
  workspaceId: number;
  agentDraftId: number;
  packId: number | null;
  eventType: string;
  eventSeverity: string;
  reason: string | null;
  oldHash: string | null;
  newHash: string | null;
  runtimeRunId: number | null;
  actorType: string | null;
  sourceType: string | null;
  packVersion: number | null;
  createdBy: number | null;
  createdAt: Date;
  metadataJson: Record<string, unknown> | null;
};

let _packs: Pack[] = [];
let _events: Event[] = [];
let _nextPackId = 1;
let _nextEventId = 1;

// Build a fluent chain that mimics drizzle's API. Each terminal method
// returns a fresh array of *cloned* rows so the caller never holds a
// reference into our internal store.
function fakeQueryFromTable(table: any) {
  if (table?.__name === "ags_cag_capability_packs") {
    return _packs.map((p) => ({ ...p }));
  }
  if (table?.__name === "ags_cag_pack_events") {
    return _events.map((e) => ({ ...e }));
  }
  return [];
}

function makeSelect() {
  let _table: any = null;
  let _wheres: ((row: any) => boolean)[] = [];
  let _orderKey: string | null = null;
  let _orderDir: "asc" | "desc" = "asc";
  let _limit: number | null = null;

  const chain: any = {
    from(table: any) {
      _table = table;
      return chain;
    },
    where(predicate: any) {
      // We pass our own "predicate" objects from the eq()/and() mocks below.
      _wheres.push(predicate);
      return chain;
    },
    orderBy(spec: any) {
      _orderKey = spec.key;
      _orderDir = spec.dir;
      return chain;
    },
    limit(n: number) {
      _limit = n;
      return chain;
    },
    then(resolve: any) {
      let rows = fakeQueryFromTable(_table);
      for (const w of _wheres) rows = rows.filter(w);
      if (_orderKey) {
        const k = _orderKey;
        const dir = _orderDir;
        rows.sort((a, b) => {
          const av = a[k];
          const bv = b[k];
          const cmp = av < bv ? -1 : av > bv ? 1 : 0;
          return dir === "desc" ? -cmp : cmp;
        });
      }
      if (_limit != null) rows = rows.slice(0, _limit);
      // Return cloned rows (snapshot semantics)
      resolve(rows.map((r: any) => ({ ...r })));
    },
  };
  return chain;
}

function makeInsert(table: any) {
  let _values: any = null;
  let _executed = false;

  function doInsert() {
    if (_executed) return [];
    _executed = true;
    if (table?.__name === "ags_cag_capability_packs") {
      const now = new Date();
      const row: Pack = {
        id: _nextPackId++,
        workspaceId: _values.workspaceId,
        agentId: _values.agentId,
        agentDraftId: _values.agentDraftId,
        catalogEntryId: _values.catalogEntryId ?? null,
        packType: _values.packType ?? "capability_v1",
        packVersion: _values.packVersion ?? 1,
        status: _values.status ?? "fresh",
        contentJson: _values.contentJson,
        compressedPrompt: _values.compressedPrompt ?? null,
        tokenEstimate: _values.tokenEstimate ?? null,
        sourceManifestJson: _values.sourceManifestJson,
        sourceHashesJson: _values.sourceHashesJson,
        injectionPolicyJson: _values.injectionPolicyJson ?? null,
        riskSummaryJson: _values.riskSummaryJson ?? null,
        createdBy: _values.createdBy,
        createdAt: now,
        updatedAt: now,
        expiresAt: _values.expiresAt ?? null,
        lastUsedAt: null,
      };
      _packs.push(row);
      return [{ ...row }];
    }
    if (table?.__name === "ags_cag_pack_events") {
      const now = new Date();
      const row: Event = {
        id: _nextEventId++,
        workspaceId: _values.workspaceId,
        agentDraftId: _values.agentDraftId,
        packId: _values.packId ?? null,
        eventType: _values.eventType,
        eventSeverity: _values.eventSeverity ?? "info",
        reason: _values.reason ?? null,
        oldHash: _values.oldHash ?? null,
        newHash: _values.newHash ?? null,
        runtimeRunId: _values.runtimeRunId ?? null,
        actorType: _values.actorType ?? null,
        sourceType: _values.sourceType ?? null,
        packVersion: _values.packVersion ?? null,
        createdBy: _values.createdBy ?? null,
        createdAt: now,
        metadataJson: _values.metadataJson ?? null,
      };
      _events.push(row);
      return [{ ...row }];
    }
    return [];
  }

  const valuesResult: any = {
    returning() {
      return Promise.resolve(doInsert());
    },
    then(resolve: any) {
      doInsert();
      resolve(undefined);
    },
  };

  return {
    values(v: any) {
      _values = v;
      return valuesResult;
    },
  };
}

function makeUpdate(table: any) {
  let _set: any = null;
  let _wheres: any[] = [];
  let _returning: Record<string, any> | null = null;
  const matched: any[] = [];
  function applyUpdates(): any[] {
    matched.length = 0;
    if (table?.__name !== "ags_cag_capability_packs") return matched;
    for (const p of _packs) {
      if (_wheres.every((w) => w(p))) {
        // Resolve `sql` sentinels in the set. Only one shape is
        // exercised today (`useCount + 1`); any new shape needs an
        // explicit branch here.
        const resolved: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(_set)) {
          if (v && typeof v === "object" && (v as any).__sql) {
            const expr = ((v as any).strings as string[]).join("?");
            if (k === "useCount" && /\+\s*1\s*$/.test(expr)) {
              resolved[k] = (p.useCount ?? 0) + 1;
            } else {
              throw new Error(`fake-DB: unsupported sql sentinel for ${k}: ${expr}`);
            }
          } else {
            resolved[k] = v;
          }
        }
        Object.assign(p, resolved);
        matched.push(p);
      }
    }
    return matched;
  }
  return {
    set(v: any) {
      _set = v;
      return this;
    },
    where(p: any) {
      _wheres.push(p);
      return this;
    },
    returning(spec: Record<string, any>) {
      _returning = spec;
      return {
        then(resolve: any) {
          const rows = applyUpdates();
          const projected = rows.map((row) => {
            const out: Record<string, unknown> = {};
            for (const k of Object.keys(_returning!)) out[k] = row[k];
            return out;
          });
          resolve(projected);
        },
      };
    },
    then(resolve: any) {
      applyUpdates();
      resolve(undefined);
    },
  };
}

const fakeDb = {
  select() {
    return makeSelect();
  },
  insert(table: any) {
    return makeInsert(table);
  },
  update(table: any) {
    return makeUpdate(table);
  },
};

// ── drizzle helper mocks ──────────────────────────────────────────────

vi.mock("drizzle-orm", () => ({
  eq: (col: any, val: any) => (row: any) => row[col.__field] === val,
  and: (...preds: any[]) => (row: any) => preds.every((p) => p(row)),
  desc: (col: any) => ({ key: col.__field, dir: "desc" as const }),
  // Sentinel for `sql` template helper. The fake-DB executor below
  // recognizes this shape and applies the increment manually.
  sql: (strings: TemplateStringsArray, ...values: any[]) => ({
    __sql: true,
    strings: Array.from(strings),
    values,
  }),
}));

// ── Schema mock — minimal: just the column references ─────────────────

vi.mock("../../../../drizzle/tables/agent-studio", () => {
  const mkCol = (name: string) => ({ __field: name });
  return {
    agsCagCapabilityPacks: {
      __name: "ags_cag_capability_packs",
      id: mkCol("id"),
      workspaceId: mkCol("workspaceId"),
      agentId: mkCol("agentId"),
      agentDraftId: mkCol("agentDraftId"),
      catalogEntryId: mkCol("catalogEntryId"),
      packVersion: mkCol("packVersion"),
      status: mkCol("status"),
    },
    agsCagPackEvents: {
      __name: "ags_cag_pack_events",
      id: mkCol("id"),
      workspaceId: mkCol("workspaceId"),
      agentDraftId: mkCol("agentDraftId"),
      packId: mkCol("packId"),
      createdAt: mkCol("createdAt"),
    },
  };
});

// ── DB connection mock ────────────────────────────────────────────────

vi.mock("../../db/connection", () => ({
  getAsDb: () => fakeDb,
}));

// Imports happen AFTER mocks (vi.mock is hoisted)
import {
  createPack,
  getLatestPack,
  listPacks,
  getPackById,
  markPackStale,
  markPackUsed,
  listPacksForAgent,
} from "./store";
import { listPackEvents, listEventsByPack } from "./events";
import { hashJsonStable } from "./hashing";

// ── Tests ─────────────────────────────────────────────────────────────

beforeEach(() => {
  _packs = [];
  _events = [];
  _nextPackId = 1;
  _nextEventId = 1;
});

describe("CAG store — Phase 1A", () => {
  const baseManifest = [
    { sourceType: "agent_draft", refId: "1", hash: "h1" },
    { sourceType: "mcp_snapshot", refId: "srv-1", hash: "h2" },
  ];

  const baseInput = {
    workspaceId: 2,
    agentId: 1,
    agentDraftId: 1,
    contentJson: { identity: "Agent Studio Expert", role: "advisor" },
    sourceManifest: baseManifest,
    createdBy: 1,
  };

  it("creates first pack at version 1 and writes a pack_created event", async () => {
    const r = await createPack(baseInput);
    expect(r.reused).toBe(false);
    expect(r.pack.packVersion).toBe(1);
    expect(r.pack.status).toBe("fresh");
    expect(r.pack.workspaceId).toBe(2);

    const events = await listPackEvents(1);
    expect(events).toHaveLength(1);
    expect(events[0].eventType).toBe("pack_created");
    expect(events[0].packId).toBe(r.pack.id);
    expect(events[0].newHash).toBeTruthy();
  });

  it("idempotent re-create with same hashes returns existing pack and emits no event", async () => {
    const first = await createPack(baseInput);
    const second = await createPack(baseInput);

    expect(second.reused).toBe(true);
    expect(second.pack.id).toBe(first.pack.id);
    expect(second.pack.packVersion).toBe(1);

    const events = await listPackEvents(1);
    expect(events).toHaveLength(1); // only the first create's event
  });

  it("re-create with different hashes increments packVersion", async () => {
    await createPack(baseInput);
    const second = await createPack({
      ...baseInput,
      sourceManifest: [
        { sourceType: "agent_draft", refId: "1", hash: "h1-changed" },
        { sourceType: "mcp_snapshot", refId: "srv-1", hash: "h2" },
      ],
    });

    expect(second.reused).toBe(false);
    expect(second.pack.packVersion).toBe(2);

    const all = await listPacks(1);
    expect(all).toHaveLength(2);
    expect(all[0].packVersion).toBe(2); // newest first
    expect(all[1].packVersion).toBe(1);
  });

  it("getLatestPack returns the highest version row", async () => {
    await createPack(baseInput);
    await createPack({
      ...baseInput,
      sourceManifest: [{ sourceType: "x", refId: "y", hash: "h-new" }],
    });

    const latest = await getLatestPack(1);
    expect(latest).not.toBeNull();
    expect(latest!.packVersion).toBe(2);
  });

  it("workspace isolation: getPackById from a different workspace returns null", async () => {
    const r = await createPack(baseInput); // ws=2

    const fromOtherWs = await getPackById(99, r.pack.id);
    expect(fromOtherWs).toBeNull();

    const fromCorrectWs = await getPackById(2, r.pack.id);
    expect(fromCorrectWs).not.toBeNull();
    expect(fromCorrectWs!.id).toBe(r.pack.id);
  });

  it("listPacksForAgent only returns packs in the requested workspace", async () => {
    await createPack(baseInput); // ws=2 ag=1 draft=1
    await createPack({
      ...baseInput,
      workspaceId: 3,
      agentId: 1,
      agentDraftId: 2,
      sourceManifest: [{ sourceType: "x", refId: "y", hash: "h-other-ws" }],
    });

    const ws2Packs = await listPacksForAgent(2, 1);
    expect(ws2Packs).toHaveLength(1);
    expect(ws2Packs[0].workspaceId).toBe(2);

    const ws3Packs = await listPacksForAgent(3, 1);
    expect(ws3Packs).toHaveLength(1);
    expect(ws3Packs[0].workspaceId).toBe(3);
  });

  it("markPackStale flips status and writes pack_marked_stale event", async () => {
    const r = await createPack(baseInput);

    await markPackStale(r.pack.id, "source_drift", 1);

    const after = await getLatestPack(1);
    expect(after!.status).toBe("stale");

    const events = await listPackEvents(1);
    const stale = events.find((e) => e.eventType === "pack_marked_stale");
    expect(stale).toBeTruthy();
    expect(stale!.reason).toBe("source_drift");
    expect(stale!.eventSeverity).toBe("warn");
  });

  it("markPackStale is idempotent on already-stale packs (no duplicate event)", async () => {
    const r = await createPack(baseInput);
    await markPackStale(r.pack.id, "first", 1);
    await markPackStale(r.pack.id, "second", 1);

    const events = await listPackEvents(1);
    const staleEvents = events.filter((e) => e.eventType === "pack_marked_stale");
    expect(staleEvents).toHaveLength(1);
    expect(staleEvents[0].reason).toBe("first");
  });

  it("markPackStale on archived pack throws", async () => {
    const r = await createPack(baseInput);
    // Manually flip to archived (no public archive function in this phase)
    _packs[0].status = "archived";

    await expect(markPackStale(r.pack.id, "x", 1)).rejects.toThrow(/pack_archived/);
  });

  it("markPackUsed atomically increments useCount + bumps lastUsedAt", async () => {
    // D-CAG-RECON-2: counter must advance on every resolve. The
    // resolver previously called the lastUsedAt-only `touchPackLastUsed`
    // helper, leaving the counter pinned at 0; that wiring was fixed
    // and the helper removed.
    const r = await createPack(baseInput);
    expect(r.pack.lastUsedAt).toBeNull();
    expect(r.pack.useCount).toBe(0);

    const after1 = await markPackUsed(r.pack.id);
    expect(after1).toBe(1);
    const after2 = await markPackUsed(r.pack.id);
    expect(after2).toBe(2);

    const refreshed = await getLatestPack(1);
    expect(refreshed!.lastUsedAt).toBeInstanceOf(Date);
    expect(refreshed!.useCount).toBe(2);
    expect(refreshed!.status).toBe("fresh");
  });

  it("listEventsByPack scopes by both workspace and pack id", async () => {
    const r = await createPack(baseInput);
    await markPackStale(r.pack.id, "drift", 1);

    const correct = await listEventsByPack(2, r.pack.id);
    expect(correct).toHaveLength(2); // pack_created + pack_marked_stale

    const wrongWs = await listEventsByPack(99, r.pack.id);
    expect(wrongWs).toHaveLength(0);
  });

  it("hashJsonStable produces stable output regardless of object key order", () => {
    const a = { foo: 1, bar: 2 };
    const b = { bar: 2, foo: 1 };
    expect(hashJsonStable(a)).toBe(hashJsonStable(b));
  });
});
