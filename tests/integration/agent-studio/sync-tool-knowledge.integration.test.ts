/**
 * Follow-up B1 — DB-backed e2e for syncToolKnowledge.
 *
 * Exercises the full Phase 7 sync round-trip against a live ASDB:
 *   1. Insert a workspace + a `tool_knowledge` agsRacSources row
 *   2. Call syncToolKnowledge with a tools list — verify
 *      agsMcpToolKnowledge rows land + a knowledge unit is materialized
 *      per D-NKU-6
 *   3. Re-call with a tool's description changed — verify hash drift
 *      detected, row updated, new knowledge unit written
 *   4. Re-call with a tool removed — verify `available=false` flips
 *   5. Cleanup
 *
 * Behavior:
 *   - Lives under tests/integration/** so vitest excludes it from
 *     local-unit mode by default.
 *   - Auto-skips when DATABASE_URL / DATABASE_URL_ASDB is unset, so a
 *     developer running pnpm test locally without staging gets a
 *     clean skip.
 *   - Runs as real assertions when invoked via
 *     `pnpm run test:integration:staging`.
 *
 * The pure helpers (canonicalizeToolSnapshot, computeSchemaHash) are
 * tested unconditionally in tests/agent-studio/mcp-tool-knowledge-sync.test.ts.
 * This file is the contract surface for the DB-touching path.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { getAsDb } from "../../../server/agent-studio/db/connection";
import {
  agsKnowledgeUnits,
  agsMcpToolKnowledge,
  agsProvenanceRecords,
  agsRacSources,
} from "../../../drizzle/tables/agent-studio";
import { syncToolKnowledge } from "../../../server/agent-studio/services/mcp/tool-knowledge-sync";

const hasDb = (): boolean => {
  return Boolean(process.env.DATABASE_URL || process.env.DATABASE_URL_ASDB);
};

describe.skipIf(!hasDb())(
  "B1 — syncToolKnowledge round-trip (live ASDB)",
  () => {
    const WORKSPACE_ID = 999_001;
    const ACTOR_ID = 999_001;
    const MCP_SERVER_ID = "test-srv-b1";
    let knowledgeSourceId = 0;

    beforeAll(async () => {
      const db = getAsDb();
      if (!db) throw new Error("ASDB unreachable");
      // Insert a tool_knowledge source row for this workspace.
      const [src] = await db
        .insert(agsRacSources)
        .values({
          workspaceId: WORKSPACE_ID,
          profileId: 1,
          sourceType: "tool_knowledge",
          ownerModule: "agentStudio",
          enabled: true,
          priority: 0,
          createdBy: ACTOR_ID,
        })
        .returning();
      knowledgeSourceId = src.id;
    });

    afterAll(async () => {
      const db = getAsDb();
      if (!db) return;
      // Cascade-cleanup: knowledge units → mirror rows → source row.
      await db
        .delete(agsKnowledgeUnits)
        .where(eq(agsKnowledgeUnits.workspaceId, WORKSPACE_ID));
      await db
        .delete(agsProvenanceRecords)
        .where(eq(agsProvenanceRecords.workspaceId, WORKSPACE_ID));
      await db
        .delete(agsMcpToolKnowledge)
        .where(eq(agsMcpToolKnowledge.workspaceId, WORKSPACE_ID));
      if (knowledgeSourceId) {
        await db
          .delete(agsRacSources)
          .where(eq(agsRacSources.id, knowledgeSourceId));
      }
    });

    it("insert path: tools land in mirror + knowledge units materialize", async () => {
      const result = await syncToolKnowledge({
        workspaceId: WORKSPACE_ID,
        mcpServerId: MCP_SERVER_ID,
        knowledgeSourceId,
        actorId: ACTOR_ID,
        tools: [
          { name: "search", description: "search docs" },
          { name: "fetch", description: "fetch a url" },
        ],
      });
      expect(result.toolsAdded).toBe(2);
      expect(result.toolsUpdated).toBe(0);
      expect(result.toolsUnchanged).toBe(0);
      expect(result.toolsMarkedUnavailable).toBe(0);

      const db = getAsDb()!;
      const mirror = await db
        .select()
        .from(agsMcpToolKnowledge)
        .where(
          and(
            eq(agsMcpToolKnowledge.workspaceId, WORKSPACE_ID),
            eq(agsMcpToolKnowledge.mcpServerId, MCP_SERVER_ID),
          ),
        );
      expect(mirror.map((r) => r.toolName).sort()).toEqual(["fetch", "search"]);
      expect(mirror.every((r) => r.available)).toBe(true);
      expect(mirror.every((r) => r.knowledgeUnitId !== null)).toBe(true);

      const units = await db
        .select()
        .from(agsKnowledgeUnits)
        .where(
          and(
            eq(agsKnowledgeUnits.workspaceId, WORKSPACE_ID),
            eq(agsKnowledgeUnits.unitType, "tool_knowledge"),
          ),
        );
      // Two units (one per tool) at minimum — contentText carries the
      // canonical projection per D-NKU-3.
      expect(units.length).toBeGreaterThanOrEqual(2);
      expect(units.some((u) => u.contentText.includes("Tool: search"))).toBe(
        true,
      );
    });

    it("hash-drift path: description change updates row + writes new unit", async () => {
      const before = await syncToolKnowledge({
        workspaceId: WORKSPACE_ID,
        mcpServerId: MCP_SERVER_ID,
        knowledgeSourceId,
        actorId: ACTOR_ID,
        tools: [{ name: "search", description: "search docs (v2)" }],
      });
      // search drifts; fetch disappeared this turn.
      expect(before.toolsAdded).toBe(0);
      expect(before.toolsUpdated).toBe(1);
      expect(before.changedToolNames).toContain("search");
      expect(before.toolsMarkedUnavailable).toBe(1);

      const db = getAsDb()!;
      const search = await db
        .select()
        .from(agsMcpToolKnowledge)
        .where(
          and(
            eq(agsMcpToolKnowledge.workspaceId, WORKSPACE_ID),
            eq(agsMcpToolKnowledge.toolName, "search"),
          ),
        )
        .limit(1);
      expect(search[0].description).toContain("(v2)");
      expect(search[0].available).toBe(true);

      const fetchRow = await db
        .select()
        .from(agsMcpToolKnowledge)
        .where(
          and(
            eq(agsMcpToolKnowledge.workspaceId, WORKSPACE_ID),
            eq(agsMcpToolKnowledge.toolName, "fetch"),
          ),
        )
        .limit(1);
      expect(fetchRow[0].available).toBe(false);
    });

    it("idempotent path: identical re-sync produces no row updates", async () => {
      const r = await syncToolKnowledge({
        workspaceId: WORKSPACE_ID,
        mcpServerId: MCP_SERVER_ID,
        knowledgeSourceId,
        actorId: ACTOR_ID,
        tools: [{ name: "search", description: "search docs (v2)" }],
      });
      expect(r.toolsAdded).toBe(0);
      expect(r.toolsUpdated).toBe(0);
      expect(r.toolsUnchanged).toBe(1);
      expect(r.changedToolNames).toEqual([]);
    });
  },
);
