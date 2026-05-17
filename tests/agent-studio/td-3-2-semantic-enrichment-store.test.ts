/**
 * T-D.3.2 — Semantic Enrichment store wire-up.
 *
 * Behavioral test for the ASDB-backed implementation of
 * SemanticEnrichmentStore. Uses a Drizzle-shaped stub DB that records
 * insert/update calls so we can assert SQL shape without a live DB.
 *
 * Validates:
 *   - beginRun inserts an ags_semantic_enrichment_runs row with
 *     status='running' + agentKey='semantic_enrichment_agent' +
 *     startedAt set
 *   - recordProposal inserts an ags_semantic_enrichment_proposals row
 *     with status='pending' + confidence stringified + citations in
 *     sourceEvidence
 *   - recordRejectedBelowThreshold inserts with the audit sentinel
 *     status='rejected_below_threshold' + rejectionReason in payload
 *   - finishRun updates the run row with completedAt + proposalsCreated
 *     + status='completed'/'failed'
 *   - ASDB-null path throws a tagged [T-D.3.2] error
 *
 * Source-scan: store imports drizzle-orm + getAsDb + the two enrichment
 * tables; no neo4j-driver / openrouter SDK / process.env.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

import {
  createSemanticEnrichmentStore,
  type SemanticEnrichmentProposal,
} from "../../server/agent-studio/services/graph-enrichment/public-api";

const STORE_FILE = resolve(
  __dirname,
  "../../server/agent-studio/services/graph-enrichment/semantic-enrichment-store.ts",
);

function readStore(): string {
  return readFileSync(STORE_FILE, "utf8");
}

// ────────────────────────────────────────────────────────────────────
// Stub DB shaped like the slice of Drizzle the store uses:
//   db.insert(table).values(row).returning(cols?)
//   db.update(table).set(row).where(predicate)
// Records every call for assertion.
// ────────────────────────────────────────────────────────────────────

interface InsertCall {
  readonly op: "insert";
  readonly table: unknown;
  readonly values: Record<string, unknown>;
  readonly returning?: unknown;
}
interface UpdateCall {
  readonly op: "update";
  readonly table: unknown;
  readonly set: Record<string, unknown>;
}
type RecordedCall = InsertCall | UpdateCall;

function makeStubDb(returnIdSequence: number[] = [1, 2, 3, 4, 5]) {
  const calls: RecordedCall[] = [];
  let nextIdIdx = 0;
  const db = {
    insert(table: unknown) {
      return {
        values(row: Record<string, unknown>) {
          const call: InsertCall = { op: "insert", table, values: row };
          calls.push(call);
          return {
            async returning(cols: unknown) {
              (call as any).returning = cols;
              const id = returnIdSequence[nextIdIdx++] ?? 999;
              return [{ id }];
            },
            then(resolve: (v: unknown) => void) {
              // Allow `await db.insert(t).values(v)` (no .returning)
              resolve(undefined);
            },
          };
        },
      };
    },
    update(table: unknown) {
      return {
        set(row: Record<string, unknown>) {
          const call: UpdateCall = { op: "update", table, set: row };
          calls.push(call);
          return {
            where(_predicate: unknown) {
              return Promise.resolve();
            },
          };
        },
      };
    },
  };
  return { db, calls };
}

function makeProposal(
  overrides: Partial<SemanticEnrichmentProposal> = {},
): SemanticEnrichmentProposal {
  return {
    kind: "description_enrichment",
    targetTypeKey: "note",
    targetId: 42,
    proposedChange: { description: "A clearer explanation." },
    confidence: 0.91,
    rationale: "Source notes consistently describe this concept.",
    citations: [
      { noteId: 1, noteVersionId: 5, excerpt: "Concept defined here." },
    ],
    ...overrides,
  };
}

describe("T-D.3.2 — Semantic Enrichment store (behavioral)", () => {
  it("beginRun inserts ags_semantic_enrichment_runs with status=running + agentKey", async () => {
    const { db, calls } = makeStubDb([42]);
    const store = createSemanticEnrichmentStore({ db });

    const { runId, startedAt } = await store.beginRun({ workspaceId: 1 });

    expect(runId).toBe(42);
    expect(startedAt).toBeInstanceOf(Date);
    expect(calls).toHaveLength(1);
    const call = calls[0] as InsertCall;
    expect(call.op).toBe("insert");
    expect(call.values.agentKey).toBe("semantic_enrichment_agent");
    expect(call.values.status).toBe("running");
    expect(call.values.proposalsCreated).toBe(0);
    expect(call.values.startedAt).toBeInstanceOf(Date);
  });

  it("recordProposal inserts a pending proposal with stringified confidence + citations", async () => {
    const { db, calls } = makeStubDb([7]);
    const store = createSemanticEnrichmentStore({ db });

    const { proposalId } = await store.recordProposal(99, makeProposal());

    expect(proposalId).toBe(7);
    const inserts = calls.filter((c) => c.op === "insert") as InsertCall[];
    expect(inserts).toHaveLength(1);
    const row = inserts[0]!.values;
    expect(row.runId).toBe(99);
    expect(row.proposalKind).toBe("description_enrichment");
    expect(row.targetTypeKey).toBe("note");
    expect(row.targetId).toBe(42);
    expect(row.confidence).toBe("0.91");
    expect(row.status).toBe("pending");
    const payload = row.payload as Record<string, unknown>;
    expect(payload.proposedChange).toEqual({ description: "A clearer explanation." });
    expect(payload.rationale).toMatch(/Source notes/);
    const evidence = row.sourceEvidence as Record<string, unknown>;
    expect(evidence.citations).toEqual([
      { noteId: 1, noteVersionId: 5, excerpt: "Concept defined here." },
    ]);
  });

  it("recordRejectedBelowThreshold uses the audit sentinel + payload rejectionReason", async () => {
    const { db, calls } = makeStubDb();
    const store = createSemanticEnrichmentStore({ db });

    await store.recordRejectedBelowThreshold(
      99,
      makeProposal({ confidence: 0.42 }),
    );

    const inserts = calls.filter((c) => c.op === "insert") as InsertCall[];
    expect(inserts).toHaveLength(1);
    const row = inserts[0]!.values;
    expect(row.status).toBe("rejected_below_threshold");
    expect(row.confidence).toBe("0.42");
    const payload = row.payload as Record<string, unknown>;
    expect(payload.rejectionReason).toBe("below_confidence_threshold");
  });

  it("finishRun updates with completedAt + proposalsCreated + status", async () => {
    const { db, calls } = makeStubDb();
    const store = createSemanticEnrichmentStore({ db });

    const completedAt = new Date("2026-05-17T15:30:00Z");
    await store.finishRun(99, {
      proposalsCreated: 7,
      proposalsRejectedBelowThreshold: 2,
      status: "completed",
      completedAt,
    });

    const updates = calls.filter((c) => c.op === "update") as UpdateCall[];
    expect(updates).toHaveLength(1);
    expect(updates[0]!.set.completedAt).toBe(completedAt);
    expect(updates[0]!.set.proposalsCreated).toBe(7);
    expect(updates[0]!.set.status).toBe("completed");
  });

  it("recordProposal returns the inserted proposalId from .returning()", async () => {
    const { db } = makeStubDb([1, 2, 3]);
    const store = createSemanticEnrichmentStore({ db });
    const r1 = await store.recordProposal(1, makeProposal());
    const r2 = await store.recordProposal(1, makeProposal());
    expect(r1.proposalId).toBe(1);
    expect(r2.proposalId).toBe(2);
  });

  it("requireDb branch surfaces a tagged [T-D.3.2] error when ASDB is null (source-scan)", () => {
    // We cannot reliably force getAsDb() to return null in vitest
    // (DATABASE_URL_ASDB is typically set), but the error message is a
    // load-bearing operator signal — assert via source-scan that the
    // tag is present at the throw site.
    expect(readStore()).toMatch(/\[T-D\.3\.2\][\s\S]*ASDB is null/);
  });
});

describe("T-D.3.2 — Semantic Enrichment store (source-scan)", () => {
  it("imports getAsDb from ../../db/connection.js", () => {
    expect(readStore()).toMatch(
      /import\s*\{\s*getAsDb\s*\}\s*from\s*["']\.\.\/\.\.\/db\/connection\.js["']/,
    );
  });

  it("imports the two enrichment tables from drizzle/tables", () => {
    const src = readStore();
    expect(src).toMatch(/agsSemanticEnrichmentRuns/);
    expect(src).toMatch(/agsSemanticEnrichmentProposals/);
    expect(src).toMatch(
      /from\s+["']\.\.\/\.\.\/\.\.\/\.\.\/drizzle\/tables\/agent-studio-graph-quality\.js["']/,
    );
  });

  it("does NOT import agsSemanticEnrichmentDecisions (T-D.4 chain owns decisions)", () => {
    expect(readStore()).not.toMatch(/agsSemanticEnrichmentDecisions/);
  });

  it("does NOT import neo4j-driver / openrouter / process.env", () => {
    const src = readStore();
    expect(src).not.toMatch(/from\s+["']neo4j-driver["']/);
    expect(src).not.toMatch(
      /from\s+["'](?:openrouter|openai|@anthropic-ai\/sdk|@google\/generative-ai)["']/,
    );
    expect(src).not.toMatch(/process\.env\.[A-Z_]*API_KEY/);
  });

  it("no T-D.3.1 factory-throws placeholder remains", () => {
    const src = readStore();
    expect(src).not.toMatch(/\[T-D\.3\.1\][\s\S]*createSemanticEnrichmentStore/);
  });
});
