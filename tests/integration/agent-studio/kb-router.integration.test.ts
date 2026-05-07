/**
 * Follow-up §B (deferred from review-polish PRs #218–#221) — DB-backed
 * e2e for the kb-router tRPC surface + migration 0042 index coverage.
 *
 * Two distinct concerns are covered together because both require a
 * live ASDB:
 *
 *   1. **kb-router endpoints**: `listUnits` / `getUnit` / `getProvenance`
 *      / `listFreshnessCounts` against real KB rows. Verifies the
 *      workspace-membership gate added in PR #219 actually denies
 *      non-members (FORBIDDEN), and that workspace-scoped queries do
 *      not leak rows from a sibling workspace.
 *
 *   2. **migration 0042 index utilization**: confirms the partial
 *      composite index `idx_ags_knowledge_units_active_listing` is
 *      created with the `WHERE archived_at IS NULL` clause from
 *      `drizzle/0042_kb_listing_index.sql`, AND that the listUnits
 *      query plan picks it when seqscan is disabled (the planner picks
 *      seqscan for small tables regardless of index quality, so
 *      `SET enable_seqscan = off` is required to make the assertion
 *      stable across data sizes).
 *
 * Behavior + skip semantics match B1/B2/B3.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { getAsDb } from "../../../server/agent-studio/db/connection";
import { getDb } from "../../../server/db/connection";
import {
  agsKnowledgeUnits,
  agsProvenanceRecords,
} from "../../../drizzle/tables/agent-studio";
import {
  users,
  workspaces,
  workspaceMembers,
} from "../../../drizzle/tables/users";
import { kbRouter } from "../../../server/agent-studio/api/kb-router";

const hasDb = (): boolean =>
  Boolean(process.env.DATABASE_URL || process.env.DATABASE_URL_ASDB);

describe.skipIf(!hasDb())(
  "§B-followup — kb-router tRPC + migration 0042 index (live ASDB)",
  () => {
    // Sentinel IDs in the 999_xxx range, like B1/B2/B3.
    const MEMBER_USER_ID = 999_220;
    const NONMEMBER_USER_ID = 999_221;
    const WORKSPACE_ID = 999_220;
    const SIBLING_WORKSPACE_ID = 999_221; // separate workspace; member user is NOT in it
    const SOURCE_ID_A = 999_220;
    const SOURCE_ID_B = 999_221;

    let provenanceId: number;
    let siblingProvenanceId: number;
    const insertedUnitIds: number[] = [];
    const insertedProvenanceIds: number[] = [];

    beforeAll(async () => {
      const main = getDb();
      const asdb = getAsDb();
      if (!main || !asdb) return;

      // Idempotent seed — re-runs of the suite must not collide.
      await main
        .insert(users)
        .values([
          { id: MEMBER_USER_ID, openId: `kbr-member-${MEMBER_USER_ID}`, name: "kbr member" },
          {
            id: NONMEMBER_USER_ID,
            openId: `kbr-nonmember-${NONMEMBER_USER_ID}`,
            name: "kbr nonmember",
          },
        ])
        .onConflictDoNothing();
      await main
        .insert(workspaces)
        .values([
          {
            id: WORKSPACE_ID,
            name: "kbr test ws",
            ownerId: MEMBER_USER_ID,
            status: "active",
          },
          {
            id: SIBLING_WORKSPACE_ID,
            name: "kbr sibling ws",
            ownerId: NONMEMBER_USER_ID,
            status: "active",
          },
        ])
        .onConflictDoNothing();
      await main
        .insert(workspaceMembers)
        .values([
          { workspaceId: WORKSPACE_ID, userId: MEMBER_USER_ID, role: "admin" },
          {
            workspaceId: SIBLING_WORKSPACE_ID,
            userId: NONMEMBER_USER_ID,
            role: "admin",
          },
        ])
        .onConflictDoNothing();

      // ASDB seed — provenance row first (FK target), then 4 units in
      // workspace A (3 fresh + 1 stale + 1 archived) + 1 unit in
      // workspace B (cross-workspace leak guard).
      const [prov] = await asdb
        .insert(agsProvenanceRecords)
        .values({
          workspaceId: WORKSPACE_ID,
          sourceConnectorKey: "test",
          parserKey: "text",
          normalizerKey: "text-passthrough",
          rawArtifactHash: "a".repeat(64),
        })
        .returning({ id: agsProvenanceRecords.id });
      provenanceId = prov.id;
      insertedProvenanceIds.push(provenanceId);

      const [siblingProv] = await asdb
        .insert(agsProvenanceRecords)
        .values({
          workspaceId: SIBLING_WORKSPACE_ID,
          sourceConnectorKey: "test",
          parserKey: "text",
          normalizerKey: "text-passthrough",
          rawArtifactHash: "b".repeat(64),
        })
        .returning({ id: agsProvenanceRecords.id });
      siblingProvenanceId = siblingProv.id;
      insertedProvenanceIds.push(siblingProvenanceId);

      const baseUnit = (
        over: Partial<typeof agsKnowledgeUnits.$inferInsert>,
      ): typeof agsKnowledgeUnits.$inferInsert => ({
        workspaceId: WORKSPACE_ID,
        sourceId: SOURCE_ID_A,
        unitType: "text",
        contentText: "kb-router test unit",
        contentHash: "c".repeat(64),
        provenanceId,
        permissionContext: { inheritFromSource: true },
        freshnessState: "fresh",
        ...over,
      });

      const inserted = await asdb
        .insert(agsKnowledgeUnits)
        .values([
          baseUnit({ contentHash: "c".repeat(64) }),
          baseUnit({ contentHash: "d".repeat(64) }),
          baseUnit({ sourceId: SOURCE_ID_B, contentHash: "e".repeat(64) }),
          baseUnit({ contentHash: "f".repeat(64), freshnessState: "stale" }),
          baseUnit({
            contentHash: "0".repeat(64),
            archivedAt: new Date(),
          }),
          baseUnit({
            workspaceId: SIBLING_WORKSPACE_ID,
            provenanceId: siblingProvenanceId,
            contentHash: "1".repeat(64),
          }),
        ])
        .returning({ id: agsKnowledgeUnits.id });
      for (const r of inserted) insertedUnitIds.push(r.id);
    });

    afterAll(async () => {
      const main = getDb();
      const asdb = getAsDb();
      if (asdb) {
        if (insertedUnitIds.length > 0) {
          await asdb
            .delete(agsKnowledgeUnits)
            .where(inArray(agsKnowledgeUnits.id, insertedUnitIds));
        }
        if (insertedProvenanceIds.length > 0) {
          await asdb
            .delete(agsProvenanceRecords)
            .where(inArray(agsProvenanceRecords.id, insertedProvenanceIds));
        }
      }
      if (main) {
        await main
          .delete(workspaceMembers)
          .where(inArray(workspaceMembers.userId, [MEMBER_USER_ID, NONMEMBER_USER_ID]));
        await main
          .delete(workspaces)
          .where(inArray(workspaces.id, [WORKSPACE_ID, SIBLING_WORKSPACE_ID]));
        await main
          .delete(users)
          .where(inArray(users.id, [MEMBER_USER_ID, NONMEMBER_USER_ID]));
      }
    });

    function memberCaller() {
      return kbRouter.createCaller({
        user: {
          id: MEMBER_USER_ID,
          openId: `kbr-member-${MEMBER_USER_ID}`,
          name: "kbr member",
          role: "admin",
        },
      } as any);
    }

    function nonmemberCaller() {
      return kbRouter.createCaller({
        user: {
          id: NONMEMBER_USER_ID,
          openId: `kbr-nonmember-${NONMEMBER_USER_ID}`,
          name: "kbr nonmember",
          role: "admin",
        },
      } as any);
    }

    describe("listUnits", () => {
      it("returns active units for a workspace member", async () => {
        const rows = await memberCaller().listUnits({ workspaceId: WORKSPACE_ID });
        expect(rows.length).toBeGreaterThanOrEqual(4); // 4 active in workspace A
        for (const r of rows) {
          expect(r.workspaceId).toBe(WORKSPACE_ID);
          expect(r.archivedAt).toBeNull();
        }
      });

      it("filters by sourceId", async () => {
        const rows = await memberCaller().listUnits({
          workspaceId: WORKSPACE_ID,
          sourceId: SOURCE_ID_B,
        });
        for (const r of rows) {
          expect(r.sourceId).toBe(SOURCE_ID_B);
        }
        expect(rows.length).toBeGreaterThanOrEqual(1);
      });

      it("includeArchived=true surfaces the archived row", async () => {
        const without = await memberCaller().listUnits({ workspaceId: WORKSPACE_ID });
        const withArchived = await memberCaller().listUnits({
          workspaceId: WORKSPACE_ID,
          includeArchived: true,
        });
        expect(withArchived.length).toBeGreaterThan(without.length);
      });

      it("does NOT leak units from a sibling workspace", async () => {
        const rows = await memberCaller().listUnits({ workspaceId: WORKSPACE_ID });
        for (const r of rows) {
          expect(r.workspaceId).toBe(WORKSPACE_ID);
        }
      });

      it("workspace-membership gate denies non-member callers (FORBIDDEN)", async () => {
        // Non-member tries to list a workspace they don't belong to.
        await expect(
          nonmemberCaller().listUnits({ workspaceId: WORKSPACE_ID }),
        ).rejects.toMatchObject({
          code: "FORBIDDEN",
        } as Partial<TRPCError>);
      });
    });

    describe("getUnit", () => {
      it("returns the unit when scoped correctly", async () => {
        const id = insertedUnitIds[0];
        const row = await memberCaller().getUnit({ workspaceId: WORKSPACE_ID, unitId: id });
        expect(row.id).toBe(id);
      });

      it("404s when the unit belongs to a different workspace", async () => {
        // Last seeded unit is in SIBLING_WORKSPACE_ID; querying it under WORKSPACE_ID must NOT_FOUND.
        const siblingUnitId = insertedUnitIds[insertedUnitIds.length - 1];
        await expect(
          memberCaller().getUnit({
            workspaceId: WORKSPACE_ID,
            unitId: siblingUnitId,
          }),
        ).rejects.toMatchObject({ code: "NOT_FOUND" } as Partial<TRPCError>);
      });
    });

    describe("getProvenance", () => {
      it("returns the row when scoped correctly", async () => {
        const row = await memberCaller().getProvenance({
          workspaceId: WORKSPACE_ID,
          provenanceId,
        });
        expect(row.id).toBe(provenanceId);
        expect(row.workspaceId).toBe(WORKSPACE_ID);
      });

      it("404s when the provenance belongs to a different workspace", async () => {
        await expect(
          memberCaller().getProvenance({
            workspaceId: WORKSPACE_ID,
            provenanceId: siblingProvenanceId,
          }),
        ).rejects.toMatchObject({ code: "NOT_FOUND" } as Partial<TRPCError>);
      });
    });

    describe("listFreshnessCounts", () => {
      it("groups active units by freshnessState (excludes archived)", async () => {
        const rows = await memberCaller().listFreshnessCounts({ workspaceId: WORKSPACE_ID });
        const byState = Object.fromEntries(
          rows.map((r) => [r.freshnessState, r.count] as const),
        );
        // 3 fresh + 1 stale = 4 active (the archived row is excluded).
        expect(byState["fresh"]).toBeGreaterThanOrEqual(3);
        expect(byState["stale"]).toBeGreaterThanOrEqual(1);
      });
    });

    describe("migration 0042 — partial composite index", () => {
      it("is registered in pg_indexes WITH the partial WHERE clause", async () => {
        const asdb = getAsDb()!;
        const rows = (await asdb.execute(
          sql`SELECT indexdef FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_ags_knowledge_units_active_listing'`,
        )) as unknown as Array<{ indexdef: string }>;
        // drizzle-orm's neon-style execute returns `{ rows: [...] }` on
        // some adapters and a plain array on others; normalize.
        const flat = Array.isArray(rows) ? rows : (rows as any).rows ?? [];
        expect(flat.length).toBe(1);
        const def = flat[0].indexdef as string;
        expect(def).toMatch(/workspace_id/);
        expect(def).toMatch(/source_id/);
        expect(def).toMatch(/freshness_state/);
        // The WHERE-clause assertion is the load-bearing one — it's
        // exactly what the Drizzle declaration cannot express, so the
        // SQL-migration-only path is the only way to keep it.
        expect(def).toMatch(/WHERE \(?archived_at IS NULL\)?/i);
      });

      it("is selected by the planner for the listUnits query shape (with seqscan disabled)", async () => {
        const asdb = getAsDb()!;
        // The planner picks seqscan on small tables regardless of
        // index quality. Disable it for this connection only — we want
        // to assert the index is *eligible* for the query, not that
        // it's the cheapest plan at our seed size.
        await asdb.execute(sql`SET LOCAL enable_seqscan = off`);
        const rows = (await asdb.execute(
          sql`EXPLAIN (FORMAT TEXT) SELECT id FROM ags_knowledge_units WHERE workspace_id = ${WORKSPACE_ID} AND source_id = ${SOURCE_ID_A} AND archived_at IS NULL ORDER BY id DESC LIMIT 50`,
        )) as unknown as Array<Record<string, unknown>>;
        const flat = Array.isArray(rows) ? rows : (rows as any).rows ?? [];
        const planText = flat
          .map((r) => Object.values(r)[0] as string)
          .join("\n");
        expect(planText).toMatch(/idx_ags_knowledge_units_active_listing/);
      });
    });
  },
);
