/**
 * Plan v3 Phase 27 — `computeExportGovernanceVerdict` tests.
 *
 * Tests run the real `evaluateGovernance` against a fake repo so the
 * verdict's blocker list and underlyingVerdict shape are honest, then
 * assert export-specific gates (lifecycle_published, published_version,
 * agent_exists) plus computedBy / computedAt / receiptId carriage.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const getCurrentDraftMock = vi.fn();
const listToolBindingsMock = vi.fn();
const listMemoryConfigsMock = vi.fn();
const getAgentByIdMock = vi.fn();

vi.mock("../repository", () => ({
  getCurrentDraft: (...a: any[]) => getCurrentDraftMock(...a),
  listToolBindings: (...a: any[]) => listToolBindingsMock(...a),
  listMemoryConfigs: (...a: any[]) => listMemoryConfigsMock(...a),
  getAgentById: (...a: any[]) => getAgentByIdMock(...a),
}));

import { computeExportGovernanceVerdict } from "./governance-adapter";

beforeEach(() => {
  getCurrentDraftMock.mockReset();
  listToolBindingsMock.mockReset();
  listMemoryConfigsMock.mockReset();
  getAgentByIdMock.mockReset();
});

const cleanDraft = {
  id: 10,
  governancePolicy: {
    auditRequired: true,
    killSwitchEnabled: true,
    budgetCeiling: 100,
    confidenceThreshold: 0.8,
  },
};
const publishedAgent = {
  id: 1,
  lifecycleState: "published",
  publishedVersionId: 7,
};

function setHappyPath() {
  getCurrentDraftMock.mockResolvedValue(cleanDraft);
  listToolBindingsMock.mockResolvedValue([]);
  listMemoryConfigsMock.mockResolvedValue([]);
  getAgentByIdMock.mockResolvedValue(publishedAgent);
}

describe("computeExportGovernanceVerdict — Phase 27", () => {
  it("cleared verdict when no blockers + agent published with version", async () => {
    setHappyPath();
    const r = await computeExportGovernanceVerdict({
      agentId: 1,
      computedBy: "user:42",
      now: () => new Date("2026-05-04T12:00:00Z"),
    });

    expect(r.status).toBe("cleared");
    expect(r.blockers).toEqual([]);
    expect(r.computedBy).toBe("user:42");
    expect(r.computedAt).toBe("2026-05-04T12:00:00.000Z");
    expect(r.receiptId).toBeNull();
    expect(r.underlyingVerdict.verdict).toBe("pass");
  });

  it("propagates governance blockers (no current draft → blocker)", async () => {
    getCurrentDraftMock.mockResolvedValue(undefined);
    listToolBindingsMock.mockResolvedValue([]);
    listMemoryConfigsMock.mockResolvedValue([]);
    getAgentByIdMock.mockResolvedValue(publishedAgent);

    const r = await computeExportGovernanceVerdict({
      agentId: 1,
      computedBy: "system:export-catalog",
    });

    expect(r.status).toBe("blocked");
    const rules = r.blockers.map((b) => b.rule);
    expect(rules).toContain("draft.exists");
  });

  it("propagates destructive-tool blocker", async () => {
    getCurrentDraftMock.mockResolvedValue(cleanDraft);
    listToolBindingsMock.mockResolvedValue([
      {
        toolName: "shell-exec",
        allowedActions: ["delete-file"],
        requiresApproval: false,
        auditRequired: true,
      },
    ]);
    listMemoryConfigsMock.mockResolvedValue([]);
    getAgentByIdMock.mockResolvedValue(publishedAgent);

    const r = await computeExportGovernanceVerdict({
      agentId: 1,
      computedBy: "user:42",
    });

    expect(r.status).toBe("blocked");
    const rules = r.blockers.map((b) => b.rule);
    expect(rules).toContain("tool.destructive_no_approval");
  });

  it("adds export.lifecycle_published + export.published_version when agent is draft", async () => {
    getCurrentDraftMock.mockResolvedValue(cleanDraft);
    listToolBindingsMock.mockResolvedValue([]);
    listMemoryConfigsMock.mockResolvedValue([]);
    getAgentByIdMock.mockResolvedValue({
      id: 1,
      lifecycleState: "draft",
      publishedVersionId: null,
    });

    const r = await computeExportGovernanceVerdict({
      agentId: 1,
      computedBy: "user:42",
    });

    expect(r.status).toBe("blocked");
    const ruleNames = r.blockers.map((b) => b.rule);
    expect(ruleNames).toContain("export.lifecycle_published");
    expect(ruleNames).toContain("export.published_version");
  });

  it("adds export.agent_exists when agent missing", async () => {
    getCurrentDraftMock.mockResolvedValue(cleanDraft);
    listToolBindingsMock.mockResolvedValue([]);
    listMemoryConfigsMock.mockResolvedValue([]);
    getAgentByIdMock.mockResolvedValue(null);

    const r = await computeExportGovernanceVerdict({
      agentId: 999,
      computedBy: "user:42",
    });

    expect(r.status).toBe("blocked");
    expect(r.blockers.find((b) => b.rule === "export.agent_exists")?.message)
      .toBe("Agent 999 does not exist.");
  });

  it("forwards receiptId when caller provides one", async () => {
    setHappyPath();
    const r = await computeExportGovernanceVerdict({
      agentId: 1,
      computedBy: "system:export-catalog",
      receiptId: "rcpt-abc-123",
    });

    expect(r.receiptId).toBe("rcpt-abc-123");
  });

  it("blockers are sorted by rule for stable diffs", async () => {
    getCurrentDraftMock.mockResolvedValue(undefined); // → "draft.exists" blocker
    listToolBindingsMock.mockResolvedValue([]);
    listMemoryConfigsMock.mockResolvedValue([]);
    getAgentByIdMock.mockResolvedValue({
      id: 1,
      lifecycleState: "draft", // → export.lifecycle_published + export.published_version
      publishedVersionId: null,
    });

    const r = await computeExportGovernanceVerdict({
      agentId: 1,
      computedBy: "user:42",
    });

    const rules = r.blockers.map((b) => b.rule);
    // Alphabetical: draft.exists < export.lifecycle_published < export.published_version
    expect(rules).toEqual([
      "draft.exists",
      "export.lifecycle_published",
      "export.published_version",
    ]);
  });

  it("getAgentById throwing is non-fatal (treated as missing)", async () => {
    getCurrentDraftMock.mockResolvedValue(cleanDraft);
    listToolBindingsMock.mockResolvedValue([]);
    listMemoryConfigsMock.mockResolvedValue([]);
    getAgentByIdMock.mockRejectedValue(new Error("DB unavailable"));

    const r = await computeExportGovernanceVerdict({
      agentId: 1,
      computedBy: "user:42",
    });

    expect(r.status).toBe("blocked");
    expect(r.blockers.some((b) => b.rule === "export.agent_exists")).toBe(true);
  });
});
