/**
 * T-G.1.η — Institutional Memory Lens: seventh projector-backed node
 * type (`inst_document`) wired through the lens runner.
 *
 * Replication of the α-shell pattern. Same acceptance shape:
 *   1. Legacy runner shape preserved when `documents` is undefined or [].
 *   2. When supplied, emits one `inst_document` per row with stable
 *      id + label + meta.
 *   3. Permission gate applies uniformly to inst_document.
 *   4. typeKey aligns with closed taxonomy entry `document` mapped to
 *      `ags_vault_notes` per source-mapping.
 *   5. Node id prefix `document:` is unique vs prior prefixes.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

import {
  buildInstitutionalMemoryLensSnapshot,
  type GraphLensDefinition,
  type InstitutionalMemoryLensAgentRow,
  type InstitutionalMemoryLensDocumentRow,
  type InstitutionalMemoryLensReadResult,
  type InstitutionalMemoryLensWorkflowRow,
  type LensRunnerViewerContext,
} from "../../server/agent-studio/services/graph-lens/public-api";

import {
  INSTITUTIONAL_MEMORY_NODE_TYPES,
  INSTITUTIONAL_MEMORY_SOURCE_MAPPING,
} from "../../server/agent-studio/services/institutional-memory/public-api";

const NOW = new Date("2026-05-17T23:00:00Z");
const T = new Date("2026-05-17T00:00:00Z");
const T_UPDATED = new Date("2026-05-17T10:00:00Z");

const VIEWER: LensRunnerViewerContext = { workspaceId: 1, userId: 42 };
const VIEWER_ANON: LensRunnerViewerContext = { workspaceId: 1, userId: null };

function makeDef(): GraphLensDefinition {
  return {
    id: "inst_test_eta",
    kind: "institutional_memory",
    label: "Institutional Memory",
    layout: "force_directed",
    governanceScope: "workspace_members",
  };
}

function makeAgent(
  overrides: Partial<InstitutionalMemoryLensAgentRow> = {},
): InstitutionalMemoryLensAgentRow {
  return {
    id: 1,
    name: "agent-one",
    internalKey: "agent_one",
    ownerId: 11,
    domain: "ops",
    visibility: "workspace",
    lifecycleState: "active",
    agentClass: "primary",
    createdAt: T,
    ...overrides,
  };
}

function makeWorkflow(
  overrides: Partial<InstitutionalMemoryLensWorkflowRow> = {},
): InstitutionalMemoryLensWorkflowRow {
  return {
    id: 100,
    name: "Nightly KB rebuild",
    description: null,
    createdAt: T,
    ...overrides,
  };
}

function makeDocument(
  overrides: Partial<InstitutionalMemoryLensDocumentRow> = {},
): InstitutionalMemoryLensDocumentRow {
  return {
    id: 5000,
    vaultId: 1,
    title: "Runbook: Nightly KB rebuild",
    slug: "runbook-nightly-kb-rebuild",
    governanceStatus: "active",
    currentVersionId: 3,
    createdByUserId: 42,
    createdAt: T,
    updatedAt: T_UPDATED,
    ...overrides,
  };
}

describe("T-G.1.η — InstitutionalMemoryLens emits inst_document nodes", () => {
  it("legacy runner shape preserved when documents is undefined", () => {
    const read: InstitutionalMemoryLensReadResult = {
      agents: [makeAgent()],
      truncated: false,
    };
    const snap = buildInstitutionalMemoryLensSnapshot({
      def: makeDef(),
      viewer: VIEWER,
      read,
      now: NOW,
    });
    const typeKeys = new Set(snap.nodes.map((n) => n.typeKey));
    expect(typeKeys.has("inst_document")).toBe(false);
  });

  it("legacy shape preserved when documents is empty array", () => {
    const read: InstitutionalMemoryLensReadResult = {
      agents: [makeAgent()],
      documents: [],
      truncated: false,
    };
    const snap = buildInstitutionalMemoryLensSnapshot({
      def: makeDef(),
      viewer: VIEWER,
      read,
      now: NOW,
    });
    expect(snap.nodes.find((n) => n.typeKey === "inst_document")).toBeUndefined();
  });

  it("emits one inst_document per row with stable id + label + meta", () => {
    const read: InstitutionalMemoryLensReadResult = {
      agents: [],
      documents: [
        makeDocument({ id: 5000, title: "Runbook A" }),
        makeDocument({
          id: 5001,
          title: "Runbook B",
          governanceStatus: "archived",
          currentVersionId: null,
          createdByUserId: null,
        }),
      ],
      truncated: false,
    };
    const snap = buildInstitutionalMemoryLensSnapshot({
      def: makeDef(),
      viewer: VIEWER,
      read,
      now: NOW,
    });
    const docs = snap.nodes.filter((n) => n.typeKey === "inst_document");
    expect(docs.length).toBe(2);
    expect(docs[0]!.id).toBe("document:5000");
    expect(docs[0]!.label).toBe("Runbook A");
    expect(docs[0]!.visible).toBe(true);
    expect(docs[0]!.meta).toMatchObject({
      documentId: 5000,
      vaultId: 1,
      title: "Runbook A",
      slug: "runbook-nightly-kb-rebuild",
      governanceStatus: "active",
      currentVersionId: 3,
      createdByUserId: 42,
      createdAt: T.toISOString(),
      updatedAt: T_UPDATED.toISOString(),
    });
    expect(docs[1]!.id).toBe("document:5001");
    expect(docs[1]!.meta).toMatchObject({
      title: "Runbook B",
      governanceStatus: "archived",
      currentVersionId: null,
      createdByUserId: null,
    });
  });

  it("co-emits with legacy + workflow (proves prefix uniqueness with shared raw id)", () => {
    const read: InstitutionalMemoryLensReadResult = {
      agents: [makeAgent({ id: 900, ownerId: 900, domain: "900" })],
      workflows: [makeWorkflow({ id: 900 })],
      documents: [makeDocument({ id: 900 })],
      truncated: false,
    };
    const snap = buildInstitutionalMemoryLensSnapshot({
      def: makeDef(),
      viewer: VIEWER,
      read,
      now: NOW,
    });
    const ids = new Set(snap.nodes.map((n) => n.id));
    expect(ids).toEqual(
      new Set([
        "agent:900",
        "user:900",
        "domain:900",
        "workflow:900",
        "document:900",
      ]),
    );
  });

  it("anonymous viewer gets visible:false inst_document contributing to hiddenNodeCount", () => {
    const read: InstitutionalMemoryLensReadResult = {
      agents: [makeAgent({ id: 1, ownerId: 11, domain: "ops" })],
      documents: [makeDocument({ id: 5000 }), makeDocument({ id: 5001 })],
      truncated: false,
    };
    const snap = buildInstitutionalMemoryLensSnapshot({
      def: makeDef(),
      viewer: VIEWER_ANON,
      read,
      now: NOW,
    });
    const docs = snap.nodes.filter((n) => n.typeKey === "inst_document");
    expect(docs.length).toBe(2);
    for (const n of docs) {
      expect(n.visible).toBe(false);
      expect(n.label).toBeUndefined();
      expect(n.meta).toBeUndefined();
    }
    // 1 inst_owner + 1 inst_domain + 1 inst_agent + 2 inst_document = 5 hidden
    expect(snap.hiddenNodeCount).toBe(5);
  });

  it("typeKey `inst_document` aligns with closed taxonomy + source mapping", () => {
    expect((INSTITUTIONAL_MEMORY_NODE_TYPES as readonly string[])).toContain(
      "document",
    );
    expect(INSTITUTIONAL_MEMORY_SOURCE_MAPPING.document.sourceTable).toBe(
      "ags_vault_notes",
    );
  });
});

// ──────────────────────────────────────────────────────────────────
// Source-scan integrity — protects against silent rename drift
// ──────────────────────────────────────────────────────────────────

describe("T-G.1.η source-scan integrity", () => {
  it("runner file names the new typeKey, prefix, and read shape", () => {
    const file = readFileSync(
      resolve(
        __dirname,
        "../../server/agent-studio/services/graph-lens/runners/institutional-memory-lens-runner.ts",
      ),
      "utf-8",
    );
    expect(file).toContain('"inst_document"');
    expect(file).toContain('"document:"');
    expect(file).toContain("InstitutionalMemoryLensDocumentRow");
    expect(file).toContain("documents?:");
  });
});
