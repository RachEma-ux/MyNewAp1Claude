/**
 * Phase 11.5 — AsdbGraphChangeProposalAdapter unit tests.
 *
 * Drives the adapter against a minimal Drizzle-shaped DB stub. Verifies:
 *   - validate rejects empty items, oversized items, kind/item-kind
 *     mismatches (entity_merge requires entity items), and missing
 *     proposer (no user AND no agent)
 *   - evaluateGovernance auto-approves only projection_correction and
 *     requires approval for all other kinds
 *   - createProposal inserts the proposal row, then one item row per
 *     items[] entry, in order
 *   - approve / reject / withdraw insert the decision row and flip the
 *     proposal status
 *   - emitAuditEvent writes ags_graph_change_audit_events
 */

import { describe, it, expect } from "vitest";
import {
  AsdbGraphChangeProposalAdapter,
  type GraphChangeProposalAdapterDb,
} from "../../server/agent-studio/services/graph-change-proposals/adapter-asdb.js";
import type {
  GraphChangeProposalKind,
  GraphChangeProposalRequest,
} from "../../server/agent-studio/services/graph-change-proposals/public-api.js";

interface RecordedCall {
  op: "select" | "insert" | "update";
  table?: string;
  values?: unknown;
  set?: unknown;
}

class StubDb implements GraphChangeProposalAdapterDb {
  insertResultsQueue: unknown[][] = [];
  calls: RecordedCall[] = [];
  tableNames = new WeakMap<object, string>();

  registerTable(table: object, name: string): void {
    this.tableNames.set(table, name);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  select(..._args: any[]): any {
    return {
      from: () => ({
        where: () => Promise.resolve([]),
      }),
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
          then: (resolve: (v: unknown) => void) =>
            Promise.resolve(undefined).then(resolve),
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
  const promotionTables = await import(
    "../../drizzle/tables/agent-studio-graph-promotion.js"
  );
  db.registerTable(
    promotionTables.agsGraphChangeProposals,
    "ags_graph_change_proposals",
  );
  db.registerTable(
    promotionTables.agsGraphChangeProposalItems,
    "ags_graph_change_proposal_items",
  );
  db.registerTable(
    promotionTables.agsGraphChangeDecisions,
    "ags_graph_change_decisions",
  );
  db.registerTable(
    promotionTables.agsGraphChangeAuditEvents,
    "ags_graph_change_audit_events",
  );
  return { db, adapter: new AsdbGraphChangeProposalAdapter({ db }) };
}

const baseRequest: GraphChangeProposalRequest = {
  proposalKind: "create_node",
  proposedByUserId: 7,
  summary: "Add Acme Corp as a Company entity",
  confidence: "high",
  items: [
    {
      itemKind: "node",
      itemPayload: { label: "Company", name: "Acme Corp" },
      sourceEvidence: { documentId: 42, confidence: 0.92 },
    },
  ],
};

describe("AsdbGraphChangeProposalAdapter — validate", () => {
  it("rejects an empty items array", async () => {
    const { adapter } = await makeAdapter();
    const r = await adapter.validate({ ...baseRequest, items: [] });
    expect(r.ok).toBe(false);
    expect(r.errors[0]?.field).toBe("items");
  });

  it("rejects more than 50 items", async () => {
    const { adapter } = await makeAdapter();
    const big = Array.from({ length: 51 }, (_, i) => ({
      itemKind: "node",
      itemPayload: { i },
    }));
    const r = await adapter.validate({ ...baseRequest, items: big });
    expect(r.ok).toBe(false);
    expect(r.errors[0]?.message).toContain("50");
  });

  it("rejects entity_merge with non-entity items", async () => {
    const { adapter } = await makeAdapter();
    const r = await adapter.validate({
      ...baseRequest,
      proposalKind: "entity_merge",
      items: [
        { itemKind: "entity", itemPayload: { id: 1 } },
        { itemKind: "node", itemPayload: { id: 2 } }, // wrong
      ],
    });
    expect(r.ok).toBe(false);
    expect(r.errors[0]?.field).toBe("items[1].itemKind");
  });

  it("rejects entity_split with non-entity items", async () => {
    const { adapter } = await makeAdapter();
    const r = await adapter.validate({
      ...baseRequest,
      proposalKind: "entity_split",
      items: [{ itemKind: "alias", itemPayload: { id: 1 } }],
    });
    expect(r.ok).toBe(false);
  });

  it("rejects when neither user nor agent is provided", async () => {
    const { adapter } = await makeAdapter();
    const r = await adapter.validate({
      ...baseRequest,
      proposedByUserId: undefined,
      proposedByAgentId: undefined,
    });
    expect(r.ok).toBe(false);
    expect(r.errors[0]?.field).toBe("proposedBy");
  });

  it("passes with one valid item and a user proposer", async () => {
    const { adapter } = await makeAdapter();
    const r = await adapter.validate(baseRequest);
    expect(r.ok).toBe(true);
  });
});

describe("AsdbGraphChangeProposalAdapter — evaluateGovernance", () => {
  it("auto-approves projection_correction (low-risk kind)", async () => {
    const { adapter } = await makeAdapter();
    const r = await adapter.evaluateGovernance(
      { ...baseRequest, proposalKind: "projection_correction" },
      { ok: true, errors: [] },
    );
    expect(r.approved).toBe(true);
    expect(r.approvalRequired).toBe(false);
  });

  it("requires approval for every other kind", async () => {
    const { adapter } = await makeAdapter();
    const kinds: GraphChangeProposalKind[] = [
      "create_node",
      "update_node",
      "deprecate_node",
      "create_edge",
      "update_edge",
      "remove_edge",
      "entity_merge",
      "entity_split",
      "observation_correction",
      "provenance_correction",
    ];
    for (const kind of kinds) {
      const r = await adapter.evaluateGovernance(
        { ...baseRequest, proposalKind: kind },
        { ok: true, errors: [] },
      );
      expect(r.approvalRequired).toBe(true);
      expect(r.approved).toBe(false);
    }
  });

  it("returns validation_failed when input validation failed", async () => {
    const { adapter } = await makeAdapter();
    const r = await adapter.evaluateGovernance(baseRequest, {
      ok: false,
      errors: [{ field: "items", message: "empty" }],
    });
    expect(r.reason).toBe("validation_failed");
  });
});

describe("AsdbGraphChangeProposalAdapter — createProposal", () => {
  it("inserts ags_graph_change_proposals + one item row per items[]", async () => {
    const { db, adapter } = await makeAdapter();
    db.insertResultsQueue = [[{ id: 17 }], [], []];
    const r = await adapter.createProposal({
      ...baseRequest,
      items: [
        { itemKind: "node", itemPayload: { a: 1 } },
        { itemKind: "node", itemPayload: { b: 2 } },
      ],
    });
    expect(r.proposalId).toBe(17);
    const inserts = db.calls.filter((c) => c.op === "insert");
    expect(inserts[0]?.table).toBe("ags_graph_change_proposals");
    expect((inserts[0]?.values as { status: string }).status).toBe("pending");
    expect(inserts[1]?.table).toBe("ags_graph_change_proposal_items");
    expect(inserts[2]?.table).toBe("ags_graph_change_proposal_items");
    expect(
      (inserts[1]?.values as { itemPayload: Record<string, unknown> })
        .itemPayload,
    ).toEqual({ a: 1 });
    expect(
      (inserts[2]?.values as { itemPayload: Record<string, unknown> })
        .itemPayload,
    ).toEqual({ b: 2 });
  });
});

describe("AsdbGraphChangeProposalAdapter — approve / reject / withdraw", () => {
  it("approve writes decision + flips status=approved", async () => {
    const { db, adapter } = await makeAdapter();
    await adapter.approve(42, 7, "looks correct");
    const inserts = db.calls.filter((c) => c.op === "insert");
    const updates = db.calls.filter((c) => c.op === "update");
    expect(inserts[0]?.table).toBe("ags_graph_change_decisions");
    expect((inserts[0]?.values as { decision: string }).decision).toBe(
      "approve",
    );
    expect((inserts[0]?.values as { rationale?: string }).rationale).toBe(
      "looks correct",
    );
    expect(updates[0]?.table).toBe("ags_graph_change_proposals");
    expect((updates[0]?.set as { status: string }).status).toBe("approved");
  });

  it("reject writes decision + flips status=rejected", async () => {
    const { db, adapter } = await makeAdapter();
    await adapter.reject(42, 7, "duplicate");
    const inserts = db.calls.filter((c) => c.op === "insert");
    const updates = db.calls.filter((c) => c.op === "update");
    expect((inserts[0]?.values as { decision: string }).decision).toBe("reject");
    expect((updates[0]?.set as { status: string }).status).toBe("rejected");
  });

  it("withdraw writes decision + flips status=withdrawn", async () => {
    const { db, adapter } = await makeAdapter();
    await adapter.withdraw(42, 7);
    const inserts = db.calls.filter((c) => c.op === "insert");
    const updates = db.calls.filter((c) => c.op === "update");
    expect((inserts[0]?.values as { decision: string }).decision).toBe(
      "withdraw",
    );
    expect((updates[0]?.set as { status: string }).status).toBe("withdrawn");
  });
});

describe("AsdbGraphChangeProposalAdapter — emitAuditEvent", () => {
  it("inserts a row in ags_graph_change_audit_events", async () => {
    const { db, adapter } = await makeAdapter();
    await adapter.emitAuditEvent(42, "approved", { reviewer: 11 });
    const inserts = db.calls.filter((c) => c.op === "insert");
    expect(inserts[0]?.table).toBe("ags_graph_change_audit_events");
    expect((inserts[0]?.values as { eventKind: string }).eventKind).toBe(
      "approved",
    );
    expect(
      (inserts[0]?.values as { metadata: Record<string, unknown> | null })
        .metadata,
    ).toEqual({ reviewer: 11 });
  });

  it("stores metadata=null when none provided", async () => {
    const { db, adapter } = await makeAdapter();
    await adapter.emitAuditEvent(42, "noted");
    const inserts = db.calls.filter((c) => c.op === "insert");
    expect(
      (inserts[0]?.values as { metadata: Record<string, unknown> | null })
        .metadata,
    ).toBeNull();
  });
});
