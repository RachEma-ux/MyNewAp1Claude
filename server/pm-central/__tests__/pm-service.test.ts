/**
 * PM Central — service unit tests.
 *
 * Mocks the repository, registry audit, and platform event bus.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../pm.repository", () => ({
  createProject: vi.fn(),
  getProjectById: vi.fn(),
  listProjects: vi.fn(),
  updateProject: vi.fn(),
  createPlan: vi.fn(),
  getPlanById: vi.fn(),
  listPlansByProject: vi.fn(),
  updatePlan: vi.fn(),
  createMilestone: vi.fn(),
  getMilestoneById: vi.fn(),
  listMilestonesByProject: vi.fn(),
  updateMilestone: vi.fn(),
  deleteMilestone: vi.fn(),
  createTask: vi.fn(),
  getTaskById: vi.fn(),
  listTasksByProject: vi.fn(),
  updateTask: vi.fn(),
  deleteTask: vi.fn(),
  createRisk: vi.fn(),
  getRiskById: vi.fn(),
  listRisksByProject: vi.fn(),
  updateRisk: vi.fn(),
  createIssue: vi.fn(),
  getIssueById: vi.fn(),
  listIssuesByProject: vi.fn(),
  updateIssue: vi.fn(),
  recordDecision: vi.fn(),
  listDecisionsByProject: vi.fn(),
  recordHandoff: vi.fn(),
  getHandoffById: vi.fn(),
  updateHandoff: vi.fn(),
  listPendingHandoffs: vi.fn(),
  logActivity: vi.fn().mockResolvedValue(undefined),
  summary: vi.fn(),
}));

vi.mock("../../modules/registry", () => ({
  logActivity: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../platform/events", () => ({
  publishEvent: vi.fn().mockResolvedValue(undefined),
  makeEnvelope: vi.fn((args: any) => ({ envelope: args })),
}));

import * as repo from "../pm.repository";
import { logActivity as registryLog } from "../../modules/registry";
import { publishEvent, makeEnvelope } from "../../platform/events";
import {
  createProject,
  updateProjectStatus,
  createTask,
  updateTaskStatus,
  receivePsHandoff,
  acceptHandoff,
  rejectHandoff,
  convertHandoffToProject,
} from "../pm.service";
import { PM_CENTRAL_EVENTS } from "../events";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createProject", () => {
  it("defaults priority and status, audits + emits projectCreated", async () => {
    (repo.createProject as any).mockResolvedValue({
      id: 1,
      workspaceId: 7,
      name: "X",
      status: "draft",
      priority: "normal",
      sourceModule: null,
      sourceRefId: null,
    });
    await createProject({ workspaceId: 7, name: "X" }, 3);
    expect(repo.createProject).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 7,
        name: "X",
        status: "draft",
        priority: "normal",
        createdBy: 3,
      }),
    );
    expect(registryLog).toHaveBeenCalledWith(
      expect.objectContaining({
        moduleKey: "pmCentral",
        action: "project.create",
        actorId: 3,
      }),
    );
    expect(makeEnvelope).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: PM_CENTRAL_EVENTS.projectCreated,
        sourceModule: "pmCentral",
        workspaceId: 7,
      }),
    );
    expect(publishEvent).toHaveBeenCalled();
  });
});

describe("updateProjectStatus", () => {
  it("rejects invalid transitions", async () => {
    (repo.getProjectById as any).mockResolvedValue({
      id: 1,
      workspaceId: 1,
      status: "archived",
    });
    await expect(updateProjectStatus(1, "active", 5)).rejects.toThrow(
      /Invalid/,
    );
  });

  it("emits status.changed on valid transition", async () => {
    (repo.getProjectById as any).mockResolvedValue({
      id: 1,
      workspaceId: 7,
      status: "active",
    });
    (repo.updateProject as any).mockResolvedValue({
      id: 1,
      workspaceId: 7,
      status: "completed",
    });
    await updateProjectStatus(1, "completed", 5);
    expect(makeEnvelope).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: PM_CENTRAL_EVENTS.projectStatusChanged,
        payload: expect.objectContaining({ status: "completed" }),
      }),
    );
  });
});

describe("createTask", () => {
  it("requires the parent project to exist", async () => {
    (repo.getProjectById as any).mockResolvedValue(null);
    await expect(
      createTask({ pmProjectId: 1, title: "T" }, 9),
    ).rejects.toThrow(/not found/);
  });

  it("defaults priority/status and emits taskCreated", async () => {
    (repo.getProjectById as any).mockResolvedValue({
      id: 1,
      workspaceId: 7,
    });
    (repo.createTask as any).mockResolvedValue({
      id: 11,
      pmProjectId: 1,
      status: "todo",
      assigneeUserId: null,
      priority: "normal",
    });
    await createTask({ pmProjectId: 1, title: "T" }, 9);
    expect(repo.createTask).toHaveBeenCalledWith(
      expect.objectContaining({
        pmProjectId: 1,
        status: "todo",
        priority: "normal",
        createdBy: 9,
      }),
    );
    expect(makeEnvelope).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: PM_CENTRAL_EVENTS.taskCreated,
      }),
    );
  });
});

describe("updateTaskStatus", () => {
  it("rejects todo → done (must go through in_progress)", async () => {
    (repo.getTaskById as any).mockResolvedValue({
      id: 1,
      pmProjectId: 1,
      status: "todo",
      assigneeUserId: null,
    });
    await expect(updateTaskStatus(1, "done", 5)).rejects.toThrow(/Invalid/);
  });

  it("emits status.changed on valid transition", async () => {
    (repo.getTaskById as any).mockResolvedValue({
      id: 1,
      pmProjectId: 1,
      status: "in_progress",
      assigneeUserId: 4,
    });
    (repo.updateTask as any).mockResolvedValue({
      id: 1,
      pmProjectId: 1,
      status: "done",
      assigneeUserId: 4,
    });
    (repo.getProjectById as any).mockResolvedValue({
      id: 1,
      workspaceId: 7,
    });
    await updateTaskStatus(1, "done", 5);
    expect(makeEnvelope).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: PM_CENTRAL_EVENTS.taskStatusChanged,
        payload: expect.objectContaining({ status: "done", assigneeUserId: 4 }),
      }),
    );
  });
});

describe("PS → PM handoff lifecycle", () => {
  it("receivePsHandoff records and emits handoff.received", async () => {
    (repo.recordHandoff as any).mockResolvedValue({
      id: 42,
      sourceModule: "ps",
      sourceRefId: 7,
      status: "received",
      payloadJson: {},
    });
    await receivePsHandoff(
      {
        workspaceId: 1,
        sourceModule: "ps",
        sourceProjectId: 7,
        name: "Demo",
      },
      9,
    );
    expect(repo.recordHandoff).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceModule: "ps",
        sourceRefId: 7,
        status: "received",
      }),
    );
    expect(makeEnvelope).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: PM_CENTRAL_EVENTS.handoffReceived,
      }),
    );
  });

  it("acceptHandoff transitions only from received", async () => {
    (repo.getHandoffById as any).mockResolvedValue({
      id: 42,
      sourceModule: "ps",
      sourceRefId: 7,
      status: "converted",
      payloadJson: { workspaceId: 1 },
    });
    await expect(acceptHandoff(42, 5)).rejects.toThrow(/not in 'received'/);
  });

  it("acceptHandoff sets status to accepted and emits", async () => {
    (repo.getHandoffById as any).mockResolvedValue({
      id: 42,
      sourceModule: "ps",
      sourceRefId: 7,
      status: "received",
      payloadJson: { workspaceId: 1 },
    });
    (repo.updateHandoff as any).mockResolvedValue({
      id: 42,
      sourceModule: "ps",
      sourceRefId: 7,
      status: "accepted",
      payloadJson: { workspaceId: 1 },
    });
    await acceptHandoff(42, 5);
    expect(repo.updateHandoff).toHaveBeenCalledWith(42, { status: "accepted" });
    expect(makeEnvelope).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: PM_CENTRAL_EVENTS.handoffAccepted,
      }),
    );
  });

  it("rejectHandoff stores reason in payload metadata", async () => {
    (repo.getHandoffById as any).mockResolvedValue({
      id: 42,
      sourceModule: "ps",
      status: "received",
      payloadJson: { workspaceId: 1 },
    });
    (repo.updateHandoff as any).mockResolvedValue({
      id: 42,
      status: "rejected",
      payloadJson: { workspaceId: 1, rejectionReason: "out of scope" },
    });
    await rejectHandoff(42, "out of scope", 5);
    expect(repo.updateHandoff).toHaveBeenCalledWith(
      42,
      expect.objectContaining({
        status: "rejected",
        payloadJson: expect.objectContaining({ rejectionReason: "out of scope" }),
      }),
    );
  });

  it("convertHandoffToProject creates pm_projects + links targetPmProjectId", async () => {
    (repo.getHandoffById as any).mockResolvedValue({
      id: 42,
      sourceModule: "ps",
      sourceRefId: 7,
      status: "accepted",
      targetPmProjectId: null,
      payloadJson: { workspaceId: 1, name: "Demo" },
    });
    (repo.createProject as any).mockResolvedValue({
      id: 99,
      workspaceId: 1,
      name: "Demo",
      status: "draft",
      priority: "normal",
      sourceModule: "ps",
      sourceRefId: 7,
    });
    (repo.updateHandoff as any).mockResolvedValue({
      id: 42,
      status: "converted",
      targetPmProjectId: 99,
    });
    const result = await convertHandoffToProject(42, 5);
    expect(repo.createProject).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 1,
        name: "Demo",
        sourceModule: "ps",
        sourceRefId: 7,
        sourceHandoffId: 42,
      }),
    );
    expect(repo.updateHandoff).toHaveBeenCalledWith(42, {
      status: "converted",
      targetPmProjectId: 99,
    });
    expect(result.project.id).toBe(99);
    expect(makeEnvelope).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: PM_CENTRAL_EVENTS.handoffConverted,
      }),
    );
  });

  it("convertHandoffToProject is idempotent when already converted", async () => {
    (repo.getHandoffById as any).mockResolvedValue({
      id: 42,
      status: "converted",
      targetPmProjectId: 99,
      payloadJson: { workspaceId: 1, name: "Demo" },
    });
    (repo.getProjectById as any).mockResolvedValue({
      id: 99,
      workspaceId: 1,
      name: "Demo",
      status: "draft",
    });
    const result = await convertHandoffToProject(42, 5);
    expect(repo.createProject).not.toHaveBeenCalled();
    expect(result.project.id).toBe(99);
  });
});
