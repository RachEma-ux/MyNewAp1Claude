/**
 * PM Central — repository surface test.
 *
 * The repository talks to a live PMDB; full integration tests would
 * need a real database. Here we only assert the documented function
 * surface — drift here would silently break the service.
 */
import { describe, it, expect } from "vitest";
import * as repo from "../pm.repository";

const EXPECTED_EXPORTS = [
  "createProject",
  "getProjectById",
  "listProjects",
  "updateProject",
  "createPlan",
  "getPlanById",
  "listPlansByProject",
  "updatePlan",
  "createMilestone",
  "getMilestoneById",
  "listMilestonesByProject",
  "updateMilestone",
  "deleteMilestone",
  "createTask",
  "getTaskById",
  "listTasksByProject",
  "updateTask",
  "deleteTask",
  "createRisk",
  "getRiskById",
  "listRisksByProject",
  "updateRisk",
  "createIssue",
  "getIssueById",
  "listIssuesByProject",
  "updateIssue",
  "recordDecision",
  "listDecisionsByProject",
  "recordHandoff",
  "getHandoffById",
  "updateHandoff",
  "listPendingHandoffs",
  "logActivity",
  "summary",
  "pingDb",
] as const;

describe("pm.repository surface", () => {
  for (const fn of EXPECTED_EXPORTS) {
    it(`exports ${fn} as a function`, () => {
      expect(typeof (repo as any)[fn]).toBe("function");
    });
  }
});
