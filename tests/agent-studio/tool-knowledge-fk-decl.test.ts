/**
 * M2-c5 (cycle-5 audit `/sdcard/Download/MCP_DISPATCHER_AUDIT_2026-05-09.md`
 * §M2-c5) — drizzle-level FK declaration lockstep for
 * `agsMcpToolKnowledge.knowledgeUnitId → agsKnowledgeUnits.id`.
 *
 * Pre-cycle-5: `knowledgeUnitId` was bare `integer("knowledge_unit_id")`
 * with only a doc-comment claiming "FK to ags_knowledge_units" — no
 * actual `.references()` declaration. If a knowledge unit was deleted
 * the mirror row dangled silently.
 *
 * Post-cycle-5 (PR-A, this PR): drizzle declaration now carries
 * `.references(() => agsKnowledgeUnits.id, { onDelete: "set null" })`.
 * `onDelete: "set null"` (not cascade) so the mirror row stays in
 * place when its underlying unit is removed — historic traces still
 * resolve, with the unit pointer cleared.
 *
 * Post-cycle-5 (PR-B, follow-up): operator-applied
 * `scripts/migrations/manual/ags-mcp-tool-knowledge-fk.sql` installs
 * the constraint on existing ASDB instances. Drizzle's table-by-table
 * reconciler (`server/agent-studio/db/seed.ts`) does NOT apply FK
 * constraints from declarations, so this declaration is the
 * architectural source of truth + lockstep target. Mirrors the
 * pgvector / KB partial-index pattern.
 *
 * This test asserts the FK is declared on the table — it does NOT
 * verify a live DB carries the constraint (that's the live-app
 * smoke-testing surface, deliberate per the §223/§224 lesson).
 */
import { describe, it, expect } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
import {
  agsMcpToolKnowledge,
  agsKnowledgeUnits,
} from "../../drizzle/tables/agent-studio";

describe("M2-c5 — agsMcpToolKnowledge.knowledgeUnitId carries declared FK", () => {
  it("getTableConfig(agsMcpToolKnowledge).foreignKeys includes a knowledge_unit_id → ags_knowledge_units.id reference", () => {
    const config = getTableConfig(agsMcpToolKnowledge);
    const fks = config.foreignKeys.map((fk) => {
      const ref = fk.reference();
      return {
        columns: ref.columns.map((c) => c.name),
        foreignTable: ref.foreignTable,
        foreignColumns: ref.foreignColumns.map((c) => c.name),
        onDelete: fk.onDelete,
      };
    });
    const knowledgeUnitFk = fks.find(
      (fk) =>
        fk.columns.includes("knowledge_unit_id") &&
        fk.foreignColumns.includes("id"),
    );
    expect(
      knowledgeUnitFk,
      "M2-c5 violated: agsMcpToolKnowledge.knowledgeUnitId has no " +
        "drizzle FK declaration. Add `.references(() => agsKnowledgeUnits.id, " +
        "{ onDelete: 'set null' })` to the column. The doc-comment claim " +
        "'FK to ags_knowledge_units' must match a real declaration.",
    ).toBeDefined();
    expect(knowledgeUnitFk!.foreignTable).toBe(agsKnowledgeUnits);
  });

  it("knowledge_unit_id FK uses onDelete: 'set null' (preserves mirror row when underlying unit is deleted)", () => {
    const config = getTableConfig(agsMcpToolKnowledge);
    const knowledgeUnitFk = config.foreignKeys.find((fk) => {
      const ref = fk.reference();
      return ref.columns.some((c) => c.name === "knowledge_unit_id");
    });
    expect(knowledgeUnitFk).toBeDefined();
    expect(
      knowledgeUnitFk!.onDelete,
      "M2-c5 violated: knowledge_unit_id FK must use onDelete: 'set null', " +
        "not cascade or restrict. Mirror rows hold historic-trace context " +
        "(D-NKU-6); deleting the unit must NOT delete the mirror, and the " +
        "FK must NOT block unit deletion. Setting null is the correct " +
        "lifecycle: pointer cleared, mirror remains.",
    ).toBe("set null");
  });
});
