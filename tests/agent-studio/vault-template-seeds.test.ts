/**
 * Phase 15 §3-§11 — blessed vault template seed-data tests.
 *
 * Covers the shape of `DEFAULT_VAULT_TEMPLATES` from
 * `services/vault/seed-default-templates.ts`. Pure data tests; no DB
 * required.
 *
 * The seeder runner (`db/seed-vault-template-rows.ts`) is covered
 * indirectly via the §1 `createTemplate` tests — its only role is
 * iterating the seed array and accounting inserted vs already-
 * existing rows.
 */

import { describe, it, expect } from "vitest";
import { DEFAULT_VAULT_TEMPLATES } from "../../server/agent-studio/services/vault/seed-default-templates";

const EXPECTED_KEYS = [
  "basic_note",
  "agent_skill",
  "cag_block",
  "graph_skill_pack",
  "tool_knowledge",
  "workflow",
  "policy",
  "runtime_investigation",
  "evaluation_case",
  "graph_correction_proposal",
  "decision_record",
] as const;

describe("DEFAULT_VAULT_TEMPLATES — Phase 15 §3-§11", () => {
  it("registers the 11 blessed templates by templateKey", () => {
    const keys = DEFAULT_VAULT_TEMPLATES.map((t) => t.templateKey).sort();
    const expected = [...EXPECTED_KEYS].sort();
    expect(keys).toEqual(expected);
  });

  it("every template has a non-empty name and contentMd", () => {
    for (const t of DEFAULT_VAULT_TEMPLATES) {
      expect(t.name.length).toBeGreaterThan(0);
      expect(t.contentMd.length).toBeGreaterThan(0);
    }
  });

  it("every template has frontmatterDefaults with a `kind` field", () => {
    for (const t of DEFAULT_VAULT_TEMPLATES) {
      expect(t.frontmatterDefaults).toBeDefined();
      expect(typeof t.frontmatterDefaults?.kind).toBe("string");
    }
  });

  it("templateKey values are unique", () => {
    const keys = DEFAULT_VAULT_TEMPLATES.map((t) => t.templateKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("graph_skill_pack template surfaces Cypher template keys + source-note FK fields", () => {
    const gsp = DEFAULT_VAULT_TEMPLATES.find(
      (t) => t.templateKey === "graph_skill_pack",
    );
    expect(gsp).toBeDefined();
    expect(gsp!.contentMd).toContain("{{templateKeys}}");
    expect(gsp!.contentMd).toContain("{{sourceNoteId}}");
    expect(gsp!.contentMd).toContain("{{sourceNoteVersion}}");
  });

  it("runtime_investigation template surfaces runtimeRunId for trace cross-linking", () => {
    const ri = DEFAULT_VAULT_TEMPLATES.find(
      (t) => t.templateKey === "runtime_investigation",
    );
    expect(ri).toBeDefined();
    expect(ri!.contentMd).toContain("{{runtimeRunId}}");
  });

  it("decision_record template surfaces ADR-shape sections", () => {
    const dr = DEFAULT_VAULT_TEMPLATES.find(
      (t) => t.templateKey === "decision_record",
    );
    expect(dr).toBeDefined();
    expect(dr!.contentMd).toContain("## Status");
    expect(dr!.contentMd).toContain("## Context");
    expect(dr!.contentMd).toContain("## Decision");
    expect(dr!.contentMd).toContain("## Consequences");
  });
});
