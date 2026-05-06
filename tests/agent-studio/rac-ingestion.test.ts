/**
 * RAC Phase 3 — ingestion adapter + dispatcher tests.
 *
 * Three surfaces exercised here (per `RAC_EXECUTION_PLAN.md` §P3 tests):
 *
 *   1. Embedding-binding resolution
 *      - falls back to the workspace default when the source row has
 *        NULL embedding refs (D-EMB-4)
 *      - fails closed when neither row-level nor workspace-default
 *        is available (D-EMB-5)
 *   2. Gap-shaped adapter behaviour
 *      - graphragAdapter returns a structured `source_unavailable`
 *        warning until the public retrieve contract lands
 *      - localPgvectorAdapter returns `pgvector_not_initialized`
 *        until the conditional D-RET-4 migration ships
 *   3. Boundary check survives the credential resolver extension
 *      - `scripts/check-provider-credential-resolver-boundary.ts`
 *        still exits 0 with the new ingestion path on the allow-list
 */

import { describe, it, expect } from "vitest";
import { spawnSync } from "child_process";
import { join } from "path";
import {
  resolveEmbeddingBinding,
  EmbeddingProviderUnavailableError,
  graphragAdapter,
  localPgvectorAdapter,
  pickAdapter,
} from "../../server/agent-studio/services/rac/ingestion";
import type {
  RacSource,
  RacWorkspaceEmbeddingDefault,
} from "../../server/agent-studio/services/rac/sources";

const baseSource: Pick<
  RacSource,
  | "id"
  | "workspaceId"
  | "embeddingProviderConnectionId"
  | "embeddingModelRef"
  | "embeddingModelDim"
> = {
  id: 42,
  workspaceId: 7,
  embeddingProviderConnectionId: null,
  embeddingModelRef: null,
  embeddingModelDim: null,
};

const wsDefault: RacWorkspaceEmbeddingDefault = {
  workspaceId: 7,
  embeddingProviderConnectionId: 100,
  embeddingModelRef: "text-embedding-3-small",
  embeddingModelDim: 1536,
  createdBy: 1,
  createdAt: new Date("2026-05-06"),
  updatedAt: new Date("2026-05-06"),
};

// ── Embedding-binding resolution (D-EMB-4 + D-EMB-5) ─────────────────

describe("resolveEmbeddingBinding", () => {
  it("uses the source row when all three embedding fields are non-null (D-EMB-1)", () => {
    const r = resolveEmbeddingBinding(
      {
        ...baseSource,
        embeddingProviderConnectionId: 200,
        embeddingModelRef: "voyage-3",
        embeddingModelDim: 1024,
      },
      wsDefault,
    );
    expect(r.providerConnectionId).toBe(200);
    expect(r.modelRef).toBe("voyage-3");
    expect(r.dim).toBe(1024);
    expect(r.resolvedFrom).toBe("source");
  });

  it("falls back to the workspace default when the source row has NULL refs (D-EMB-4)", () => {
    const r = resolveEmbeddingBinding(baseSource, wsDefault);
    expect(r.providerConnectionId).toBe(100);
    expect(r.modelRef).toBe("text-embedding-3-small");
    expect(r.dim).toBe(1536);
    expect(r.resolvedFrom).toBe("workspace_default");
  });

  it("fails closed when neither source nor workspace default is set (D-EMB-5)", () => {
    expect(() => resolveEmbeddingBinding(baseSource, null)).toThrow(
      EmbeddingProviderUnavailableError,
    );
  });

  it("partial source-level refs still fall back to workspace default (no silent merge)", () => {
    // Two of three set: still ambiguous, fall back rather than silently
    // pretend the source row is complete.
    const r = resolveEmbeddingBinding(
      {
        ...baseSource,
        embeddingProviderConnectionId: 200,
        embeddingModelRef: "voyage-3",
        // dim is still null
      },
      wsDefault,
    );
    expect(r.resolvedFrom).toBe("workspace_default");
  });
});

// ── Adapter dispatcher ───────────────────────────────────────────────

describe("pickAdapter", () => {
  it("returns the graphrag adapter for source_type=graph_index", () => {
    expect(pickAdapter("graph_index")).toBe(graphragAdapter);
  });

  it("returns the local-pgvector adapter for source_type=vector_index", () => {
    expect(pickAdapter("vector_index")).toBe(localPgvectorAdapter);
  });

  it("returns null for in-process source types", () => {
    for (const t of [
      "cag_pack",
      "memory",
      "workspace_context",
      "project_context",
      "tool_result_context",
      "manual_context",
    ]) {
      expect(pickAdapter(t)).toBeNull();
    }
  });

  it("returns null for source types pending P4 wiring (document_collection / external_connector)", () => {
    expect(pickAdapter("document_collection")).toBeNull();
    expect(pickAdapter("external_connector")).toBeNull();
  });

  it("returns null for unknown source types (default-deny)", () => {
    expect(pickAdapter("not_a_real_type")).toBeNull();
  });
});

// ── GraphRAG adapter — gap-shaped per GRAPHRAG_CONTRACT_GAP_REPORT ───

describe("graphragAdapter", () => {
  it("search returns empty + structured source_unavailable warning", async () => {
    const out = await graphragAdapter.search({
      workspaceId: 7,
      sourceId: 42,
      query: "anything",
      topK: 5,
    });
    expect(out.chunks).toEqual([]);
    expect(out.warnings.some((w) => /source_unavailable/.test(w))).toBe(true);
    expect(out.warnings.some((w) => /graphrag_public_retrieve_contract_missing/.test(w))).toBe(true);
  });

  it("health returns unavailable + reason pointer to gap report", async () => {
    const h = await graphragAdapter.health();
    expect(h.status).toBe("unavailable");
    expect(h.reason).toMatch(/GRAPHRAG_CONTRACT_GAP_REPORT/);
  });

  it("validateIndex returns ok=false with source_unavailable", async () => {
    const v = await graphragAdapter.validateIndex!({ workspaceId: 7, sourceId: 42 });
    expect(v.ok).toBe(false);
    expect(v.reason).toBe("source_unavailable");
  });
});

// ── Local pgvector adapter — production singleton without ASDB ───────

describe("localPgvectorAdapter (production singleton)", () => {
  // The production singleton wires `getAsDb()` directly. In the test
  // env ASDB is not initialized, so `getDb()` returns null and the
  // adapter reports `asdb_unavailable`. The richer engine-state
  // matrix (extension absent / column absent / dim mismatch / etc.)
  // is exercised in `pgvector-adapter.test.ts` via injected fakes
  // per D-PARSE-PGVECTOR-3.
  it("search returns asdb_unavailable when AS-DB is not configured", async () => {
    const out = await localPgvectorAdapter.search({
      workspaceId: 7,
      sourceId: 99,
      query: "anything",
      topK: 5,
    });
    expect(out.chunks).toEqual([]);
    expect(
      out.warnings.some((w) => /asdb_unavailable|pgvector_extension/.test(w)),
    ).toBe(true);
  });

  it("health returns unavailable when ASDB or extension is missing", async () => {
    const h = await localPgvectorAdapter.health();
    expect(h.status).toBe("unavailable");
    expect(h.reason).toMatch(/pgvector_extension_not_installed/);
  });
});

// ── Provider-credential-resolver boundary still passes ───────────────

describe("provider-credential-resolver boundary — survives RAC P3 extension", () => {
  it("script exits 0 on the live tree with rac/ingestion on the allow-list", () => {
    const scriptPath = join(
      process.cwd(),
      "scripts/check-provider-credential-resolver-boundary.ts",
    );
    const result = spawnSync("pnpm", ["exec", "tsx", scriptPath], {
      encoding: "utf8",
      timeout: 60_000,
      cwd: process.cwd(),
    });
    expect(
      result.status,
      `stdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
    ).toBe(0);
    expect(result.stdout).toContain("provider-credential-resolver boundary check passed");
  });
});
