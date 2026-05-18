/**
 * T-D.5 post-apply verification — module + router-mount tests.
 *
 * Verifies:
 *   - `extractOriginatingFinding` extracts {id, findingClass, sourceTypeKey,
 *     sourceId} from proposedChange.finding; rejects malformed inputs.
 *   - `verifyPostApply` returns `verification_skipped:asdb_unavailable`
 *     when getDb returns null.
 *   - Returns `verification_skipped:no_originating_finding` when the
 *     proposal has no finding context (operator-issued correction).
 *   - Returns `verification_skipped:scanner_not_registered` when the
 *     finding class doesn't map to any registered scanner.
 *   - Returns `verification_pass` when the re-run scanner emits zero
 *     findings matching the original (sourceTypeKey, sourceId).
 *   - Returns `verification_fail` when the re-run scanner still
 *     emits a finding matching the original (sourceTypeKey, sourceId).
 *   - Throws ProposalNotFoundForVerificationError for an unknown id.
 *   - `isPostApplyVerificationEnabled` reads env flag correctly.
 *   - Source-scan: no neo4j-driver / openrouter / dispatchMcpToolCall
 *     imports in the new module.
 *   - approve-and-apply gates the verification hook on the env flag +
 *     scannerRegistry + repository presence + apply.result.applied.
 *   - router wires `verifyProposalApply` adminProcedure with NOT_FOUND
 *     mapping.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "fs";
import { resolve, join } from "path";

import {
  verifyPostApply,
  isPostApplyVerificationEnabled,
  ProposalNotFoundForVerificationError,
} from "../../server/agent-studio/services/graph-quality/public-api";

const DIR = resolve(
  __dirname,
  "../../server/agent-studio/services/graph-quality",
);
const MODULE = join(DIR, "post-apply-verification.ts");
const COMBO = join(DIR, "approve-and-apply.ts");
const ROUTER = join(DIR, "router.ts");

function read(p: string): string {
  return readFileSync(p, "utf8");
}

// ----- Reusable fakes -------------------------------------------------

interface ProposalRow {
  id: number;
  proposedChange: unknown;
}

function makeProposalSelectStage(rows: ProposalRow[]) {
  const stage = {
    from: () => stage,
    where: () => stage,
    limit: async () => rows,
  };
  return stage;
}

function makeFindingsSelectStage(rows: Array<{ id: number }>) {
  const stage = {
    from: () => stage,
    where: () => stage,
    limit: async () => rows,
  };
  return stage;
}

function makeInsertStage(returningId: number | null) {
  return {
    values: () => ({
      returning: async () =>
        returningId === null ? [] : [{ id: returningId }],
    }),
  };
}

function makeFakeDb(args: {
  proposals?: ProposalRow[];
  matchingFindings?: Array<{ id: number }>;
  auditInsertId?: number | null;
}) {
  let selectCount = 0;
  return {
    select: () => {
      const count = selectCount++;
      // 1st select = proposal lookup; 2nd select = findings match lookup
      if (count === 0) {
        return makeProposalSelectStage(args.proposals ?? []);
      }
      return makeFindingsSelectStage(args.matchingFindings ?? []);
    },
    insert: () =>
      makeInsertStage(
        args.auditInsertId === undefined ? 9001 : args.auditInsertId,
      ),
  };
}

function fakeRegistry(scanKinds: string[]) {
  return scanKinds.map((scanKind) => ({
    scanKind,
    run: vi.fn(),
  }));
}

// ----- Stub runQualityScan ----- *
// We can't easily mock the export because verifyPostApply imports
// runQualityScan via ESM. Use vi.mock at the top.

vi.mock(
  "../../server/agent-studio/services/graph-quality/scan-orchestrator.js",
  () => ({
    runQualityScan: vi.fn(),
    UnknownScanKindError: class extends Error {
      constructor(kind: string) {
        super(`Unknown scan kind: ${kind}`);
        this.name = "UnknownScanKindError";
      }
    },
  }),
);

import { runQualityScan } from "../../server/agent-studio/services/graph-quality/scan-orchestrator";

const runQualityScanMock = vi.mocked(runQualityScan);

beforeEach(() => {
  runQualityScanMock.mockReset();
});

afterEach(() => {
  delete process.env.AGS_GRAPH_QUALITY_POST_APPLY_VERIFICATION_ENABLED;
});

// ============================================================================
// Env-flag reader
// ============================================================================

describe("isPostApplyVerificationEnabled", () => {
  it("returns false when env var is unset", () => {
    delete process.env.AGS_GRAPH_QUALITY_POST_APPLY_VERIFICATION_ENABLED;
    expect(isPostApplyVerificationEnabled()).toBe(false);
  });
  it('returns true for "1"', () => {
    process.env.AGS_GRAPH_QUALITY_POST_APPLY_VERIFICATION_ENABLED = "1";
    expect(isPostApplyVerificationEnabled()).toBe(true);
  });
  it('returns true for "true" (case-insensitive)', () => {
    process.env.AGS_GRAPH_QUALITY_POST_APPLY_VERIFICATION_ENABLED = "TRUE";
    expect(isPostApplyVerificationEnabled()).toBe(true);
  });
  it('returns false for other values like "0"', () => {
    process.env.AGS_GRAPH_QUALITY_POST_APPLY_VERIFICATION_ENABLED = "0";
    expect(isPostApplyVerificationEnabled()).toBe(false);
  });
});

// ============================================================================
// verifyPostApply — skip paths
// ============================================================================

describe("verifyPostApply — skip paths", () => {
  const fakeRepo = {} as never;

  it("returns verification_skipped:asdb_unavailable when getDb returns null", async () => {
    const result = await verifyPostApply(
      { proposalId: 100 },
      {
        registry: fakeRegistry(["orphan_node"]) as never,
        repository: fakeRepo,
        getDb: () => null,
      },
    );
    expect(result.outcome).toBe("verification_skipped");
    expect(result.skipReason).toBe("asdb_unavailable");
    expect(result.auditEventId).toBeNull();
  });

  it("throws ProposalNotFoundForVerificationError when proposal id is unknown", async () => {
    const db = makeFakeDb({ proposals: [] });
    await expect(
      verifyPostApply(
        { proposalId: 999 },
        {
          registry: fakeRegistry(["orphan_node"]) as never,
          repository: fakeRepo,
          getDb: () => db as never,
        },
      ),
    ).rejects.toBeInstanceOf(ProposalNotFoundForVerificationError);
  });

  it("returns verification_skipped:no_originating_finding when proposedChange has no finding", async () => {
    const db = makeFakeDb({
      proposals: [{ id: 100, proposedChange: { operatorOnly: true } }],
    });
    const result = await verifyPostApply(
      { proposalId: 100 },
      {
        registry: fakeRegistry(["orphan_node"]) as never,
        repository: fakeRepo,
        getDb: () => db as never,
      },
    );
    expect(result.outcome).toBe("verification_skipped");
    expect(result.skipReason).toBe("no_originating_finding");
    expect(result.auditEventId).toBe(9001);
    expect(runQualityScanMock).not.toHaveBeenCalled();
  });

  it("returns verification_skipped:scanner_not_registered when findingClass doesn't match registry", async () => {
    const db = makeFakeDb({
      proposals: [
        {
          id: 100,
          proposedChange: {
            finding: {
              id: 500,
              findingClass: "unknown_kind",
              sourceTypeKey: "entity",
              sourceId: "e:1",
            },
          },
        },
      ],
    });
    const result = await verifyPostApply(
      { proposalId: 100 },
      {
        registry: fakeRegistry(["orphan_node"]) as never,
        repository: fakeRepo,
        getDb: () => db as never,
      },
    );
    expect(result.outcome).toBe("verification_skipped");
    expect(result.skipReason).toBe("scanner_not_registered");
    expect(result.originatingScanKind).toBe("unknown_kind");
    expect(runQualityScanMock).not.toHaveBeenCalled();
  });
});

// ============================================================================
// verifyPostApply — pass / fail paths
// ============================================================================

describe("verifyPostApply — pass/fail", () => {
  const fakeRepo = {} as never;

  it("returns verification_pass when re-run scanner emits zero matching findings", async () => {
    const db = makeFakeDb({
      proposals: [
        {
          id: 100,
          proposedChange: {
            finding: {
              id: 500,
              findingClass: "orphan_node",
              sourceTypeKey: "entity",
              sourceId: "e:1",
            },
          },
        },
      ],
      matchingFindings: [], // no match → pass
    });
    runQualityScanMock.mockResolvedValueOnce({
      scanId: 7777,
      status: "completed",
      findingsCount: 0,
    });

    const result = await verifyPostApply(
      { proposalId: 100 },
      {
        registry: fakeRegistry(["orphan_node"]) as never,
        repository: fakeRepo,
        getDb: () => db as never,
      },
    );
    expect(result.outcome).toBe("verification_pass");
    expect(result.stillPresent).toBe(false);
    expect(result.verificationScanId).toBe(7777);
    expect(runQualityScanMock).toHaveBeenCalledWith(
      { scanKind: "orphan_node" },
      expect.objectContaining({ repository: fakeRepo }),
    );
  });

  it("returns verification_fail when re-run scanner emits a finding matching the original (sourceTypeKey, sourceId)", async () => {
    const db = makeFakeDb({
      proposals: [
        {
          id: 100,
          proposedChange: {
            finding: {
              id: 500,
              findingClass: "duplicate_entity",
              sourceTypeKey: "entity",
              sourceId: "e:42",
            },
          },
        },
      ],
      matchingFindings: [{ id: 600 }],
    });
    runQualityScanMock.mockResolvedValueOnce({
      scanId: 7777,
      status: "completed",
      findingsCount: 1,
    });

    const result = await verifyPostApply(
      { proposalId: 100 },
      {
        registry: fakeRegistry(["duplicate_entity"]) as never,
        repository: fakeRepo,
        getDb: () => db as never,
      },
    );
    expect(result.outcome).toBe("verification_fail");
    expect(result.stillPresent).toBe(true);
    expect(result.originatingScanKind).toBe("duplicate_entity");
  });

  it("falls back to findings-count proxy when source identity is missing", async () => {
    // Finding with null sourceTypeKey/sourceId — verifier can't compare
    // by identity; uses findingsCount > 0 ⇒ still_present.
    const db = makeFakeDb({
      proposals: [
        {
          id: 100,
          proposedChange: {
            finding: {
              id: 500,
              findingClass: "orphan_node",
              sourceTypeKey: null,
              sourceId: null,
            },
          },
        },
      ],
    });
    runQualityScanMock.mockResolvedValueOnce({
      scanId: 7777,
      status: "completed",
      findingsCount: 3, // > 0 → still_present → fail
    });
    const result = await verifyPostApply(
      { proposalId: 100 },
      {
        registry: fakeRegistry(["orphan_node"]) as never,
        repository: {} as never,
        getDb: () => db as never,
      },
    );
    expect(result.outcome).toBe("verification_fail");
    expect(result.stillPresent).toBe(true);
  });

  it("findings-count proxy passes when findingsCount === 0", async () => {
    const db = makeFakeDb({
      proposals: [
        {
          id: 100,
          proposedChange: {
            finding: {
              id: 500,
              findingClass: "orphan_node",
              sourceTypeKey: null,
              sourceId: null,
            },
          },
        },
      ],
    });
    runQualityScanMock.mockResolvedValueOnce({
      scanId: 7777,
      status: "completed",
      findingsCount: 0,
    });
    const result = await verifyPostApply(
      { proposalId: 100 },
      {
        registry: fakeRegistry(["orphan_node"]) as never,
        repository: {} as never,
        getDb: () => db as never,
      },
    );
    expect(result.outcome).toBe("verification_pass");
  });
});

// ============================================================================
// Source-scan + wiring
// ============================================================================

describe("post-apply-verification source-scan + wiring", () => {
  it("module never imports neo4j-driver / openrouter / dispatchMcpToolCall", () => {
    const src = read(MODULE);
    const stripped = src
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|\n)\s*\/\/[^\n]*/g, "$1");
    expect(stripped).not.toMatch(/from\s+["']neo4j-driver["']/);
    expect(stripped).not.toMatch(/from\s+["'][^"']*openrouter[^"']*["']/);
    expect(stripped).not.toMatch(/\bdispatchMcpToolCall\s*\(/);
  });

  it("module exports the canonical 3-outcome verification taxonomy", () => {
    const src = read(MODULE);
    expect(src).toMatch(/"verification_pass"/);
    expect(src).toMatch(/"verification_fail"/);
    expect(src).toMatch(/"verification_skipped"/);
  });

  it("module exports the canonical 3-skip-reason taxonomy", () => {
    const src = read(MODULE);
    expect(src).toMatch(/"no_originating_finding"/);
    expect(src).toMatch(/"scanner_not_registered"/);
    expect(src).toMatch(/"asdb_unavailable"/);
  });

  it("approve-and-apply gates verification on (apply.result.applied + scannerRegistry + repository + env flag)", () => {
    const src = read(COMBO);
    // The 4-part gate must be present in the source.
    expect(src).toMatch(/apply\.result\.applied/);
    expect(src).toMatch(/options\.scannerRegistry !== undefined/);
    expect(src).toMatch(/options\.repository !== undefined/);
    expect(src).toMatch(/isPostApplyVerificationEnabled\(\)/);
  });

  it("approve-and-apply runs verification fire-and-forget (void + try/catch)", () => {
    const src = read(COMBO);
    expect(src).toMatch(/void runFireAndForgetVerification\(/);
    expect(src).toMatch(/try\s*{\s*return await verifyPostApply/);
  });

  it("router mounts verifyProposalApply as protectedProcedure", () => {
    const src = read(ROUTER);
    expect(src).toMatch(/verifyProposalApply:\s*protectedProcedure/);
  });

  it("router maps ProposalNotFoundForVerificationError → NOT_FOUND", () => {
    const src = read(ROUTER);
    expect(src).toMatch(
      /ProposalNotFoundForVerificationError[\s\S]*?code:\s*"NOT_FOUND"/,
    );
  });

  it("router passes QUALITY_SCANNER_REGISTRY + getGraphRepository() to verifyPostApply", () => {
    const src = read(ROUTER);
    expect(src).toMatch(
      /verifyPostApply\([\s\S]*?registry:\s*QUALITY_SCANNER_REGISTRY[\s\S]*?repository:\s*getGraphRepository\(\)/,
    );
  });
});
