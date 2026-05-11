/**
 * Phase 13 — Graph Agent Lite router shape tests.
 *
 * Source-scan only. Verifies the router file declares the expected
 * tRPC procedures so the public-api surface stays stable.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const REPO_ROOT = process.cwd();

const PATHS = {
  graphAgent: join(REPO_ROOT, "server/agent-studio/services/graph-agent/router.ts"),
  vault: join(REPO_ROOT, "server/agent-studio/services/vault/router.ts"),
  promotion: join(REPO_ROOT, "server/agent-studio/services/promotion/router.ts"),
};

describe("Graph Agent Lite router", () => {
  const src = readFileSync(PATHS.graphAgent, "utf8");

  it("exports `graphAgentRouter`", () => {
    expect(src).toMatch(/export\s+const\s+graphAgentRouter\s*=\s*router/);
  });

  it("declares `health`, `run`, `explain` procedures", () => {
    expect(src).toMatch(/health:\s*protectedProcedure/);
    expect(src).toMatch(/run:\s*protectedProcedure/);
    expect(src).toMatch(/explain:\s*protectedProcedure/);
  });

  it("declares Phase 14 trace-export procedures (markdown blob + note write + prune)", () => {
    expect(src).toMatch(/exportTraceMarkdown:\s*protectedProcedure/);
    expect(src).toMatch(/exportTraceToNote:\s*protectedProcedure/);
    expect(src).toMatch(/pruneTraces:\s*governedProcedure/);
  });

  it("`run` uses GraphAgentRunInput contract", () => {
    expect(src).toMatch(/\.input\(GraphAgentRunInput\)/);
  });

  it("uses wiring factory (not direct OpenRouter / MCP imports in router)", () => {
    expect(src).toMatch(/wireGraphAgentLite/);
    expect(src).not.toMatch(/from\s+["']@anthropic-ai\/sdk["']/);
    expect(src).not.toMatch(/from\s+["']openai["']/);
  });
});

describe("Vault router", () => {
  const src = readFileSync(PATHS.vault, "utf8");

  it("exports `vaultRouter`", () => {
    expect(src).toMatch(/export\s+const\s+vaultRouter\s*=\s*router/);
  });

  it("declares MVP 1 procedures", () => {
    const expected = [
      "createVault",
      "addMember",
      "listMyVaults",
      "createNote",
      "updateNote",
      "getNote",
      "getNoteVersion",
      "listNotes",
      "search",
    ];
    for (const name of expected) {
      expect(src).toMatch(new RegExp(`${name}:\\s*protectedProcedure`));
    }
  });

  it("declares Phase 15 template procedures", () => {
    expect(src).toMatch(/createTemplate:\s*protectedProcedure/);
    expect(src).toMatch(/listTemplates:\s*protectedProcedure/);
    expect(src).toMatch(/createNoteFromTemplate:\s*protectedProcedure/);
  });

  it("declares Phase 15 Markdown import + export procedures", () => {
    expect(src).toMatch(/exportNote:\s*protectedProcedure/);
    expect(src).toMatch(/importNoteFromMarkdown:\s*protectedProcedure/);
  });

  it("declares Phase 15 attachment procedures", () => {
    expect(src).toMatch(/createAttachment:\s*protectedProcedure/);
    expect(src).toMatch(/listAttachments:\s*protectedProcedure/);
    expect(src).toMatch(/getAttachment:\s*protectedProcedure/);
    expect(src).toMatch(/linkAttachmentToNote:\s*protectedProcedure/);
    expect(src).toMatch(/unlinkAttachmentFromNote:\s*protectedProcedure/);
    expect(src).toMatch(/markAttachmentAsSourceArtifact:\s*protectedProcedure/);
  });

  it("declares Phase 16 saved-view procedures", () => {
    expect(src).toMatch(/createSavedView:\s*protectedProcedure/);
    expect(src).toMatch(/listSavedViews:\s*protectedProcedure/);
    expect(src).toMatch(/getSavedView:\s*protectedProcedure/);
    expect(src).toMatch(/updateSavedView:\s*protectedProcedure/);
    expect(src).toMatch(/deleteSavedView:\s*protectedProcedure/);
  });

  it("declares Phase 16 §5-§7 view-kind blueprint procedures", () => {
    expect(src).toMatch(/listViewKindBlueprints:\s*protectedProcedure/);
    expect(src).toMatch(/getViewKindBlueprint:\s*protectedProcedure/);
  });

  it("selects repository via env (stub vs ASDB)", () => {
    expect(src).toMatch(/AGS_VAULT_REPO/);
    expect(src).toMatch(/VaultRepositoryStub/);
    expect(src).toMatch(/AsdbVaultRepository/);
  });

  it("exposes _setVaultRepositoryForTests helper", () => {
    expect(src).toMatch(/export\s+function\s+_setVaultRepositoryForTests/);
  });
});

describe("Promotion router", () => {
  const src = readFileSync(PATHS.promotion, "utf8");

  it("exports `promotionRouter`", () => {
    expect(src).toMatch(/export\s+const\s+promotionRouter\s*=\s*router/);
  });

  it("declares submit / approve / reject / rollback procedures", () => {
    expect(src).toMatch(/submit:\s*protectedProcedure/);
    expect(src).toMatch(/approve:\s*protectedProcedure/);
    expect(src).toMatch(/reject:\s*protectedProcedure/);
    expect(src).toMatch(/rollback:\s*protectedProcedure/);
  });

  it("enumerates all 10 promotion kinds", () => {
    const expected = [
      "knowledge_unit",
      "cag_block",
      "graph_skill_pack",
      "tool_knowledge",
      "workflow",
      "policy",
      "evaluation_case",
      "runtime_investigation",
      "graph_entity",
      "temporal_observation",
    ];
    for (const k of expected) {
      expect(src).toMatch(new RegExp(`"${k}"`));
    }
  });

  it("requires explicit adapter wiring at boot", () => {
    expect(src).toMatch(/_setPromotionAdapter/);
    expect(src).toMatch(/PRECONDITION_FAILED/);
  });
});
