/**
 * Phase 12.5 §8 — Graph Skill tRPC sub-router tests.
 *
 * Validates the thin `graphSkillRouter` wrapper around
 * `services/graph-skill/usage-query.ts`. The underlying helper is
 * unit-tested in `graph-skill-usage-query.test.ts`; this file covers
 * the router-level concerns:
 *
 *   - Input validation (Zod schema rejects bad payloads)
 *   - Service-call passthrough (router forwards args to helper)
 *   - Output shape (returned rows match the documented surface)
 *   - Error mapping (helper throws → INTERNAL_SERVER_ERROR)
 *   - 90-day cap on `sinceMs` (governance / cost guardrail)
 *   - 500-row cap on `limit` (cost guardrail)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const hoisted = vi.hoisted(() => {
  class AsdbUnavailableErrorMock extends Error {
    constructor() {
      super("ASDB connection unavailable");
      this.name = "AsdbUnavailableError";
    }
  }
  class DuplicateVersionErrorMock extends Error {
    constructor(skillKey: string, version: string) {
      super(`pack "${skillKey}" already has a version labeled "${version}"`);
      this.name = "DuplicateVersionError";
    }
  }
  class PackNotFoundErrorMock extends Error {
    constructor(skillKey: string) {
      super(`Graph Skill Pack with skillKey="${skillKey}" not found`);
      this.name = "PackNotFoundError";
    }
  }
  class SourceNoteVersionNotFoundErrorMock extends Error {
    constructor(id: number) {
      super(`ags_vault_note_versions row with id=${id} does not exist`);
      this.name = "SourceNoteVersionNotFoundError";
    }
  }
  return {
    listUsageCountsMock: vi.fn(),
    createPackMock: vi.fn(),
    publishVersionMock: vi.fn(),
    listPackVersionsMock: vi.fn(),
    AsdbUnavailableErrorMock,
    DuplicateVersionErrorMock,
    PackNotFoundErrorMock,
    SourceNoteVersionNotFoundErrorMock,
  };
});

const {
  listUsageCountsMock,
  createPackMock,
  publishVersionMock,
  listPackVersionsMock,
  AsdbUnavailableErrorMock,
  DuplicateVersionErrorMock,
  PackNotFoundErrorMock,
  SourceNoteVersionNotFoundErrorMock,
} = hoisted;

vi.mock("../../server/agent-studio/services/graph-skill/public-api", () => ({
  listUsageCounts: (input: unknown) => hoisted.listUsageCountsMock(input),
  createPack: (input: unknown) => hoisted.createPackMock(input),
  publishVersion: (input: unknown) => hoisted.publishVersionMock(input),
  listPackVersions: (input: unknown) => hoisted.listPackVersionsMock(input),
  AsdbUnavailableError: hoisted.AsdbUnavailableErrorMock,
  DuplicateVersionError: hoisted.DuplicateVersionErrorMock,
  PackNotFoundError: hoisted.PackNotFoundErrorMock,
  SourceNoteVersionNotFoundError: hoisted.SourceNoteVersionNotFoundErrorMock,
}));

// The standalone sub-router caller passes a bare procedure name as
// `opts.path` (e.g. "createPack") rather than the full
// "agentStudio.graphSkill.createPack" the registry expects. Mock the
// governance middleware so the input-validation + service-error
// mapping path can be exercised; the *registry* shape is verified
// separately by the governance-coverage audit
// (`tests/governance/governance-coverage.test.ts`) which walks
// ACTION_KEY_MAP at the source level.
vi.mock("../../server/governance/requireGovernedAction", () => ({
  requireGovernedAction: async () => ({
    allowed: true,
    receiptId: "test-receipt",
    gateResult: { allowed: true },
  }),
}));

import { graphSkillRouter } from "../../server/agent-studio/api/graph-skill-router";

function makeCaller() {
  return graphSkillRouter.createCaller({
    user: { id: 1, openId: "test-user", name: "Test", role: "admin" },
  } as any);
}

beforeEach(() => {
  listUsageCountsMock.mockReset();
  createPackMock.mockReset();
  publishVersionMock.mockReset();
  listPackVersionsMock.mockReset();
});

describe("graphSkillRouter.listUsageCounts — Phase 12.5 §8", () => {
  it("forwards args verbatim to listUsageCounts() and returns mapped rows", async () => {
    const sample = {
      skillKey: "pack-a",
      packId: 1,
      packVersionId: 7,
      version: "1.0.0",
      count: 42,
      latestUsedAt: new Date("2026-05-10T18:00:00Z"),
    };
    listUsageCountsMock.mockResolvedValueOnce([sample]);

    const result = await makeCaller().listUsageCounts({
      skillKey: "pack-a",
      sinceMs: 60_000,
      limit: 10,
    });

    expect(listUsageCountsMock).toHaveBeenCalledWith({
      skillKey: "pack-a",
      sinceMs: 60_000,
      limit: 10,
    });
    expect(result.rows).toEqual([sample]);
  });

  it("forwards an empty payload as undefined args (service uses defaults)", async () => {
    listUsageCountsMock.mockResolvedValueOnce([]);
    await makeCaller().listUsageCounts({});
    expect(listUsageCountsMock).toHaveBeenCalledWith({
      skillKey: undefined,
      sinceMs: undefined,
      limit: undefined,
    });
  });

  it("returns empty rows array when service returns []", async () => {
    listUsageCountsMock.mockResolvedValueOnce([]);
    const result = await makeCaller().listUsageCounts({});
    expect(result).toEqual({ rows: [] });
  });

  it("wraps service errors as INTERNAL_SERVER_ERROR", async () => {
    listUsageCountsMock.mockRejectedValueOnce(new Error("db down"));
    await expect(makeCaller().listUsageCounts({})).rejects.toThrow(
      /graph-skill usage counts failed: db down/,
    );
  });

  it("rejects sinceMs > 90 days (cost guardrail)", async () => {
    const ninetyOneDays = 91 * 24 * 60 * 60 * 1000;
    await expect(
      makeCaller().listUsageCounts({ sinceMs: ninetyOneDays }),
    ).rejects.toThrow();
    expect(listUsageCountsMock).not.toHaveBeenCalled();
  });

  it("accepts sinceMs at exactly 90 days", async () => {
    const ninetyDays = 90 * 24 * 60 * 60 * 1000;
    listUsageCountsMock.mockResolvedValueOnce([]);
    await makeCaller().listUsageCounts({ sinceMs: ninetyDays });
    expect(listUsageCountsMock).toHaveBeenCalledWith(
      expect.objectContaining({ sinceMs: ninetyDays }),
    );
  });

  it("rejects limit > 500 (cost guardrail)", async () => {
    await expect(
      makeCaller().listUsageCounts({ limit: 501 }),
    ).rejects.toThrow();
    expect(listUsageCountsMock).not.toHaveBeenCalled();
  });

  it("rejects non-positive limit (Zod schema)", async () => {
    await expect(
      makeCaller().listUsageCounts({ limit: 0 }),
    ).rejects.toThrow();
    await expect(
      makeCaller().listUsageCounts({ limit: -1 }),
    ).rejects.toThrow();
    expect(listUsageCountsMock).not.toHaveBeenCalled();
  });

  it("rejects empty skillKey (Zod min(1))", async () => {
    await expect(
      makeCaller().listUsageCounts({ skillKey: "" }),
    ).rejects.toThrow();
    expect(listUsageCountsMock).not.toHaveBeenCalled();
  });

  it("rejects skillKey > 100 chars (Zod max(100))", async () => {
    await expect(
      makeCaller().listUsageCounts({ skillKey: "x".repeat(101) }),
    ).rejects.toThrow();
    expect(listUsageCountsMock).not.toHaveBeenCalled();
  });
});

describe("graphSkillRouter.listPackVersions — Phase 12.5 §10", () => {
  it("forwards args and maps service rows to the wire shape", async () => {
    listPackVersionsMock.mockResolvedValueOnce([
      {
        id: 100,
        version: "1.0.0",
        createdAt: new Date("2026-05-10"),
        hasSourceNoteRef: true,
      },
    ]);
    const r = await makeCaller().listPackVersions({ skillKey: "p", limit: 5 });
    expect(listPackVersionsMock).toHaveBeenCalledWith({
      skillKey: "p",
      limit: 5,
    });
    expect(r.rows).toEqual([
      {
        id: 100,
        version: "1.0.0",
        createdAt: new Date("2026-05-10"),
        hasSourceNoteRef: true,
      },
    ]);
  });

  it("wraps service errors as INTERNAL_SERVER_ERROR", async () => {
    listPackVersionsMock.mockRejectedValueOnce(new Error("nope"));
    await expect(
      makeCaller().listPackVersions({ skillKey: "p" }),
    ).rejects.toThrow(/graph-skill listPackVersions failed: nope/);
  });
});

describe("graphSkillRouter.createPack — Phase 12.5 §10", () => {
  it("forwards args verbatim and returns service result", async () => {
    createPackMock.mockResolvedValueOnce({
      id: 7,
      skillKey: "p",
      name: "Pack",
      created: true,
    });
    const r = await makeCaller().createPack({
      skillKey: "p",
      name: "Pack",
      description: "desc",
    });
    expect(createPackMock).toHaveBeenCalledWith({
      skillKey: "p",
      name: "Pack",
      description: "desc",
      domain: undefined,
      supportedNodeTypeKeys: undefined,
      supportedEdgeTypeKeys: undefined,
      riskLevel: undefined,
      approvalRequired: undefined,
    });
    expect(r).toEqual({ id: 7, skillKey: "p", name: "Pack", created: true });
  });

  it("rejects skillKey with uppercase or invalid chars", async () => {
    await expect(
      makeCaller().createPack({ skillKey: "Bad Key", name: "X" }),
    ).rejects.toThrow();
    await expect(
      makeCaller().createPack({ skillKey: "bad/slash", name: "X" }),
    ).rejects.toThrow();
    expect(createPackMock).not.toHaveBeenCalled();
  });

  it("rejects empty name", async () => {
    await expect(
      makeCaller().createPack({ skillKey: "p", name: "" }),
    ).rejects.toThrow();
    expect(createPackMock).not.toHaveBeenCalled();
  });

  it("rejects unknown riskLevel value", async () => {
    await expect(
      makeCaller().createPack({
        skillKey: "p",
        name: "P",
        riskLevel: "critical" as never,
      }),
    ).rejects.toThrow();
    expect(createPackMock).not.toHaveBeenCalled();
  });

  it("maps AsdbUnavailableError to SERVICE_UNAVAILABLE", async () => {
    createPackMock.mockRejectedValueOnce(new AsdbUnavailableErrorMock());
    await expect(
      makeCaller().createPack({ skillKey: "p", name: "P" }),
    ).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
  });

  it("wraps unknown errors as INTERNAL_SERVER_ERROR", async () => {
    createPackMock.mockRejectedValueOnce(new Error("boom"));
    await expect(
      makeCaller().createPack({ skillKey: "p", name: "P" }),
    ).rejects.toThrow(/graph-skill createPack failed: boom/);
  });
});

describe("graphSkillRouter.publishVersion — Phase 12.5 §10", () => {
  it("forwards args verbatim and returns service result", async () => {
    publishVersionMock.mockResolvedValueOnce({
      id: 100,
      packId: 7,
      version: "1.0.0",
    });
    const r = await makeCaller().publishVersion({
      skillKey: "p",
      version: "1.0.0",
      manifest: { foo: "bar" },
      changelog: "first cut",
    });
    expect(publishVersionMock).toHaveBeenCalledWith({
      skillKey: "p",
      version: "1.0.0",
      manifest: { foo: "bar" },
      changelog: "first cut",
      sourceNoteVersionId: undefined,
    });
    expect(r).toEqual({ id: 100, packId: 7, version: "1.0.0" });
  });

  it("rejects version strings with disallowed chars", async () => {
    await expect(
      makeCaller().publishVersion({
        skillKey: "p",
        version: "1.0 beta",
        manifest: {},
      }),
    ).rejects.toThrow();
    expect(publishVersionMock).not.toHaveBeenCalled();
  });

  it("rejects empty manifest as not-an-object via the schema constraint? — accepts {} as a valid empty object", async () => {
    // Empty objects are legal — the schema says `z.record(z.string(), z.unknown())`, not `.nonempty()`.
    publishVersionMock.mockResolvedValueOnce({ id: 1, packId: 7, version: "1.0" });
    await makeCaller().publishVersion({
      skillKey: "p",
      version: "1.0",
      manifest: {},
    });
    expect(publishVersionMock).toHaveBeenCalled();
  });

  it("maps PackNotFoundError to NOT_FOUND", async () => {
    publishVersionMock.mockRejectedValueOnce(new PackNotFoundErrorMock("ghost"));
    await expect(
      makeCaller().publishVersion({
        skillKey: "ghost",
        version: "1.0",
        manifest: {},
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("maps DuplicateVersionError to CONFLICT", async () => {
    publishVersionMock.mockRejectedValueOnce(
      new DuplicateVersionErrorMock("p", "1.0"),
    );
    await expect(
      makeCaller().publishVersion({
        skillKey: "p",
        version: "1.0",
        manifest: {},
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("Phase 12.5 §14 — maps SourceNoteVersionNotFoundError to BAD_REQUEST", async () => {
    publishVersionMock.mockRejectedValueOnce(
      new SourceNoteVersionNotFoundErrorMock(99),
    );
    await expect(
      makeCaller().publishVersion({
        skillKey: "p",
        version: "1.0",
        manifest: {},
        sourceNoteVersionId: 99,
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("maps AsdbUnavailableError to SERVICE_UNAVAILABLE", async () => {
    publishVersionMock.mockRejectedValueOnce(new AsdbUnavailableErrorMock());
    await expect(
      makeCaller().publishVersion({
        skillKey: "p",
        version: "1.0",
        manifest: {},
      }),
    ).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
  });

  it("wraps unknown errors as INTERNAL_SERVER_ERROR", async () => {
    publishVersionMock.mockRejectedValueOnce(new Error("boom"));
    await expect(
      makeCaller().publishVersion({
        skillKey: "p",
        version: "1.0",
        manifest: {},
      }),
    ).rejects.toThrow(/graph-skill publishVersion failed: boom/);
  });
});
