import { describe, expect, it } from "vitest";

import {
  archiveReleaseAuditRef,
  deleteReleaseAuditRef,
  listReleaseAuditRefsArchivalCandidates,
  RELEASE_AUDIT_REFS_MIN_RETENTION_MS,
} from "./release-audit-refs-archival";

describe("release-audit-refs archival — 7-year floor", () => {
  it("throws when minRetentionMs is below the 7-year floor", async () => {
    await expect(
      listReleaseAuditRefsArchivalCandidates({ minRetentionMs: 1000 }),
    ).rejects.toThrow(/7-year floor/);
  });

  it("throws when minRetentionMs is below 7y by 1ms", async () => {
    await expect(
      listReleaseAuditRefsArchivalCandidates({
        minRetentionMs: RELEASE_AUDIT_REFS_MIN_RETENTION_MS - 1,
      }),
    ).rejects.toThrow(/7-year floor/);
  });

  it("returns empty when ASDB is null but minRetentionMs is valid", async () => {
    const result = await listReleaseAuditRefsArchivalCandidates(
      { minRetentionMs: RELEASE_AUDIT_REFS_MIN_RETENTION_MS },
      { getDb: () => null as unknown as ReturnType<typeof import("../db/connection").getAsDb> },
    );
    expect(result).toEqual([]);
  });

  it("accepts minRetentionMs equal to the 7-year floor", async () => {
    const result = await listReleaseAuditRefsArchivalCandidates(
      { minRetentionMs: RELEASE_AUDIT_REFS_MIN_RETENTION_MS },
      { getDb: () => null as unknown as ReturnType<typeof import("../db/connection").getAsDb> },
    );
    expect(result).toEqual([]);
  });
});

describe("release-audit-refs archival — archive action", () => {
  it("throws when complianceApprovalRef is empty", async () => {
    await expect(
      archiveReleaseAuditRef({
        id: 1,
        complianceApprovalRef: "",
        archivedBy: 1,
        reason: "test",
      }),
    ).rejects.toThrow(/complianceApprovalRef is required/);
  });

  it("throws when complianceApprovalRef is whitespace-only", async () => {
    await expect(
      archiveReleaseAuditRef({
        id: 1,
        complianceApprovalRef: "   ",
        archivedBy: 1,
        reason: "test",
      }),
    ).rejects.toThrow(/complianceApprovalRef is required/);
  });

  it("throws when reason is empty", async () => {
    await expect(
      archiveReleaseAuditRef({
        id: 1,
        complianceApprovalRef: "TICKET-123",
        archivedBy: 1,
        reason: "",
      }),
    ).rejects.toThrow(/reason is required/);
  });

  it("returns archived:false when ASDB is null", async () => {
    const result = await archiveReleaseAuditRef(
      { id: 1, complianceApprovalRef: "TICKET-123", archivedBy: 1, reason: "test" },
      { getDb: () => null as unknown as ReturnType<typeof import("../db/connection").getAsDb> },
    );
    expect(result).toEqual({ archived: false, id: 1, archivedAt: null });
  });
});

describe("release-audit-refs archival — deletion blocked by policy", () => {
  it("deleteReleaseAuditRef always throws", async () => {
    await expect(
      deleteReleaseAuditRef({
        id: 1,
        complianceApprovalRef: "TICKET-123",
        deletedBy: 1,
      }),
    ).rejects.toThrow(/blocked by policy/);
  });

  it("error message names the compliance team's external workflow", async () => {
    try {
      await deleteReleaseAuditRef({
        id: 1,
        complianceApprovalRef: "TICKET-123",
        deletedBy: 1,
      });
      expect.fail("deleteReleaseAuditRef should have thrown");
    } catch (e) {
      expect((e as Error).message).toMatch(/compliance team's external deletion workflow/);
    }
  });
});
