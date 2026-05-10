/**
 * Phase 11 — AsdbPromotionAdapter unit tests.
 *
 * Drives the adapter against a minimal Drizzle-shaped DB stub. Verifies:
 *   - validate flags missing notes / wrong-version / duplicate active
 *     promotion
 *   - evaluateGovernance routes high-risk kinds to approval and
 *     low-risk kinds to auto-approve
 *   - createDraft / activateVersion / rollback / emitProjectionEvent
 *     write the expected rows to the right tables
 *
 * The stub records every insert/update/select call so assertions can
 * inspect the shape of writes.
 */

import { describe, it, expect } from "vitest";
import {
  AsdbPromotionAdapter,
  type PromotionAdapterDb,
} from "../../server/agent-studio/services/promotion/adapter-asdb.js";
import type { PromotionRequest } from "../../server/agent-studio/services/promotion/lifecycle.js";

interface RecordedCall {
  op: "select" | "insert" | "update";
  table?: string;
  values?: unknown;
  set?: unknown;
}

class StubDb implements PromotionAdapterDb {
  selectResultsQueue: unknown[][] = [];
  insertResultsQueue: unknown[][] = [];
  calls: RecordedCall[] = [];
  // For Drizzle's `pgTable` returns an object — we identify by reference
  // through a side-channel WeakMap maintained by the test.
  tableNames = new WeakMap<object, string>();

  registerTable(table: object, name: string): void {
    this.tableNames.set(table, name);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  select(..._args: any[]): any {
    return {
      from: (table: object) => {
        const tableName = this.tableNames.get(table) ?? "unknown";
        this.calls.push({ op: "select", table: tableName });
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        const that = this;
        const rows = that.selectResultsQueue.shift() ?? [];
        const thennable: any = {
          where: () => thennable,
          limit: () => thennable,
          orderBy: () => thennable,
          then: (resolve: (v: unknown[]) => void) => Promise.resolve(rows).then(resolve),
        };
        return thennable;
      },
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  insert(table: object): any {
    const tableName = this.tableNames.get(table) ?? "unknown";
    return {
      values: (vals: unknown) => {
        this.calls.push({ op: "insert", table: tableName, values: vals });
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        const that = this;
        const rows = that.insertResultsQueue.shift() ?? [];
        const thennable: any = {
          returning: () => Promise.resolve(rows),
          then: (resolve: (v: unknown) => void) => Promise.resolve(undefined).then(resolve),
        };
        return thennable;
      },
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  update(table: object): any {
    const tableName = this.tableNames.get(table) ?? "unknown";
    return {
      set: (vals: unknown) => {
        this.calls.push({ op: "update", table: tableName, set: vals });
        return {
          where: () => Promise.resolve(undefined),
        };
      },
    };
  }
}

async function makeAdapter() {
  const db = new StubDb();
  // Register table refs so the recorder can name them.
  // (Imports are loaded inside so the ESM resolver does not spin them up
  // until the test runs.)
  const promotionTables = await import(
    "../../drizzle/tables/agent-studio-graph-promotion.js"
  );
  const vaultTables = await import(
    "../../drizzle/tables/agent-studio-vault.js"
  );
  db.registerTable(promotionTables.agsNotePromotions, "ags_note_promotions");
  db.registerTable(
    promotionTables.agsNotePromotionVersions,
    "ags_note_promotion_versions",
  );
  db.registerTable(
    promotionTables.agsNotePromotionDecisions,
    "ags_note_promotion_decisions",
  );
  db.registerTable(
    promotionTables.agsNotePromotionAuditEvents,
    "ags_note_promotion_audit_events",
  );
  db.registerTable(vaultTables.agsVaultNotes, "ags_vault_notes");
  db.registerTable(vaultTables.agsVaultNoteVersions, "ags_vault_note_versions");

  return { db, adapter: new AsdbPromotionAdapter({ db }) };
}

const baseRequest: PromotionRequest = {
  noteId: 1,
  noteVersionId: 10,
  promotionKind: "cag_block",
  initiatedByUserId: 7,
};

describe("AsdbPromotionAdapter — validate", () => {
  it("rejects when note row missing", async () => {
    const { db, adapter } = await makeAdapter();
    db.selectResultsQueue = [[], [{ id: 10, noteId: 1 }], []];
    const r = await adapter.validate(baseRequest);
    expect(r.ok).toBe(false);
    expect(r.errors[0]?.field).toBe("noteId");
  });

  it("rejects when note governance is non-active", async () => {
    const { db, adapter } = await makeAdapter();
    db.selectResultsQueue = [
      [{ id: 1, governanceStatus: "archived" }],
      [{ id: 10, noteId: 1 }],
      [],
    ];
    const r = await adapter.validate(baseRequest);
    expect(r.ok).toBe(false);
    expect(r.errors[0]?.message).toContain("archived");
  });

  it("rejects when version belongs to a different note", async () => {
    const { db, adapter } = await makeAdapter();
    db.selectResultsQueue = [
      [{ id: 1, governanceStatus: "active" }],
      [{ id: 10, noteId: 99 }], // mismatched
      [],
    ];
    const r = await adapter.validate(baseRequest);
    expect(r.ok).toBe(false);
    expect(r.errors[0]?.field).toBe("noteVersionId");
  });

  it("rejects when an active promotion already exists for kind+version", async () => {
    const { db, adapter } = await makeAdapter();
    db.selectResultsQueue = [
      [{ id: 1, governanceStatus: "active" }],
      [{ id: 10, noteId: 1 }],
      [{ id: 5, status: "in_review" }],
    ];
    const r = await adapter.validate(baseRequest);
    expect(r.ok).toBe(false);
    expect(r.errors[0]?.field).toBe("promotionKind");
  });

  it("passes when note + version exist and no active duplicate", async () => {
    const { db, adapter } = await makeAdapter();
    db.selectResultsQueue = [
      [{ id: 1, governanceStatus: "active" }],
      [{ id: 10, noteId: 1 }],
      [],
    ];
    const r = await adapter.validate(baseRequest);
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
  });
});

describe("AsdbPromotionAdapter — evaluateGovernance", () => {
  it("auto-approves cag_block (low-risk kind)", async () => {
    const { adapter } = await makeAdapter();
    const r = await adapter.evaluateGovernance(baseRequest, { ok: true, errors: [] });
    expect(r.approved).toBe(true);
    expect(r.approvalRequired).toBe(false);
  });

  it("requires approval for policy (high-risk kind)", async () => {
    const { adapter } = await makeAdapter();
    const r = await adapter.evaluateGovernance(
      { ...baseRequest, promotionKind: "policy" },
      { ok: true, errors: [] },
    );
    expect(r.approved).toBe(false);
    expect(r.approvalRequired).toBe(true);
  });

  it("requires approval for graph_skill_pack and tool_knowledge", async () => {
    const { adapter } = await makeAdapter();
    for (const kind of ["graph_skill_pack", "tool_knowledge"] as const) {
      const r = await adapter.evaluateGovernance(
        { ...baseRequest, promotionKind: kind },
        { ok: true, errors: [] },
      );
      expect(r.approvalRequired).toBe(true);
    }
  });

  it("returns validation_failed when input validation failed", async () => {
    const { adapter } = await makeAdapter();
    const r = await adapter.evaluateGovernance(baseRequest, {
      ok: false,
      errors: [{ field: "noteId", message: "missing" }],
    });
    expect(r.approved).toBe(false);
    expect(r.reason).toBe("validation_failed");
  });
});

describe("AsdbPromotionAdapter — createDraft", () => {
  it("inserts ags_note_promotions and audit event with returned id", async () => {
    const { db, adapter } = await makeAdapter();
    db.insertResultsQueue = [[{ id: 42 }], []];

    const r = await adapter.createDraft(baseRequest);
    expect(r.promotionId).toBe(42);

    const inserts = db.calls.filter((c) => c.op === "insert");
    expect(inserts[0]?.table).toBe("ags_note_promotions");
    expect((inserts[0]?.values as { status: string }).status).toBe("pending");
    expect(inserts[1]?.table).toBe("ags_note_promotion_audit_events");
    expect((inserts[1]?.values as { eventKind: string }).eventKind).toBe(
      "draft_created",
    );
  });
});

describe("AsdbPromotionAdapter — activateVersion", () => {
  it("inserts a new active version, deactivates prior, writes decision, flips status=approved", async () => {
    const { db, adapter } = await makeAdapter();
    // 1st select: existing versions for this promotion -> 1 prior
    db.selectResultsQueue = [[{ id: 1 }]];
    // 1st insert returning: new version row id
    db.insertResultsQueue = [[{ id: 99 }]];

    const r = await adapter.activateVersion(42, 7);
    expect(r.versionId).toBe(99);

    const updates = db.calls.filter((c) => c.op === "update");
    const inserts = db.calls.filter((c) => c.op === "insert");

    // First update: deactivate prior active versions
    expect(updates[0]?.table).toBe("ags_note_promotion_versions");
    expect((updates[0]?.set as { active: boolean }).active).toBe(false);

    // First insert: new version row, version label = v2 (1 prior + 1)
    expect(inserts[0]?.table).toBe("ags_note_promotion_versions");
    const versionRow = inserts[0]?.values as {
      promotionId: number;
      version: string;
      active: boolean;
    };
    expect(versionRow.version).toBe("v2");
    expect(versionRow.active).toBe(true);

    // Decision row insert
    expect(inserts[1]?.table).toBe("ags_note_promotion_decisions");
    expect((inserts[1]?.values as { decision: string }).decision).toBe(
      "approve",
    );

    // Final update: status flip on ags_note_promotions
    expect(updates[1]?.table).toBe("ags_note_promotions");
    expect((updates[1]?.set as { status: string }).status).toBe("approved");
  });
});

describe("AsdbPromotionAdapter — rollback", () => {
  it("requires at least 2 versions", async () => {
    const { db, adapter } = await makeAdapter();
    db.selectResultsQueue = [[{ id: 1, active: true, createdAt: new Date() }]];
    await expect(adapter.rollback(42, 7)).rejects.toThrow(/requires >= 2 versions/);
  });

  it("deactivates current, reactivates prior, writes decision + status=rolled_back", async () => {
    const { db, adapter } = await makeAdapter();
    db.selectResultsQueue = [
      [
        { id: 99, active: true, createdAt: new Date("2026-05-10T12:00:00Z") },
        { id: 50, active: false, createdAt: new Date("2026-05-09T12:00:00Z") },
      ],
    ];

    const r = await adapter.rollback(42, 7);
    expect(r.activatedVersionId).toBe(50);

    const updates = db.calls.filter((c) => c.op === "update");
    expect(updates[0]?.table).toBe("ags_note_promotion_versions");
    expect((updates[0]?.set as { active: boolean }).active).toBe(false);
    expect(updates[1]?.table).toBe("ags_note_promotion_versions");
    expect((updates[1]?.set as { active: boolean }).active).toBe(true);
    expect(updates[2]?.table).toBe("ags_note_promotions");
    expect((updates[2]?.set as { status: string }).status).toBe("rolled_back");

    const inserts = db.calls.filter((c) => c.op === "insert");
    expect(inserts[0]?.table).toBe("ags_note_promotion_decisions");
    expect((inserts[0]?.values as { decision: string }).decision).toBe(
      "rollback",
    );
  });
});

describe("AsdbPromotionAdapter — emitProjectionEvent", () => {
  it("inserts an audit row tagged projection.<status>", async () => {
    const { db, adapter } = await makeAdapter();
    await adapter.emitProjectionEvent(42, "approved");
    const inserts = db.calls.filter((c) => c.op === "insert");
    expect(inserts[0]?.table).toBe("ags_note_promotion_audit_events");
    expect((inserts[0]?.values as { eventKind: string }).eventKind).toBe(
      "projection.approved",
    );
  });
});
