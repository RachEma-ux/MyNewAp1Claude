/**
 * PM Central — validation lifecycle tests.
 */
import { describe, it, expect } from "vitest";
import {
  validateProjectTransition,
  validatePlanTransition,
  validateMilestoneTransition,
  validateTaskTransition,
  validateRiskTransition,
  validateIssueTransition,
} from "../pm.validation";

describe("Project lifecycle", () => {
  it("draft → active is allowed", () => {
    expect(() => validateProjectTransition("draft", "active")).not.toThrow();
  });
  it("active → blocked is allowed", () => {
    expect(() => validateProjectTransition("active", "blocked")).not.toThrow();
  });
  it("active → completed is allowed", () => {
    expect(() => validateProjectTransition("active", "completed")).not.toThrow();
  });
  it("completed → archived is the only exit", () => {
    expect(() => validateProjectTransition("completed", "archived")).not.toThrow();
    expect(() => validateProjectTransition("completed", "active")).toThrow(
      /Invalid/,
    );
  });
  it("archived is terminal", () => {
    expect(() => validateProjectTransition("archived", "active")).toThrow(/Invalid/);
  });
});

describe("Plan lifecycle", () => {
  it("draft → approved is allowed", () => {
    expect(() => validatePlanTransition("draft", "approved")).not.toThrow();
  });
  it("approved → active is allowed", () => {
    expect(() => validatePlanTransition("approved", "active")).not.toThrow();
  });
  it("active → superseded is allowed", () => {
    expect(() => validatePlanTransition("active", "superseded")).not.toThrow();
  });
  it("superseded is terminal", () => {
    expect(() => validatePlanTransition("superseded", "active")).toThrow(/Invalid/);
  });
});

describe("Milestone lifecycle", () => {
  it("pending → in_progress → completed", () => {
    expect(() => validateMilestoneTransition("pending", "in_progress")).not.toThrow();
    expect(() => validateMilestoneTransition("in_progress", "completed")).not.toThrow();
  });
  it("completed is terminal", () => {
    expect(() => validateMilestoneTransition("completed", "in_progress")).toThrow(
      /Invalid/,
    );
  });
});

describe("Task lifecycle", () => {
  it("todo → in_progress → review → done is allowed", () => {
    expect(() => validateTaskTransition("todo", "in_progress")).not.toThrow();
    expect(() => validateTaskTransition("in_progress", "review")).not.toThrow();
    expect(() => validateTaskTransition("review", "done")).not.toThrow();
  });
  it("done is terminal", () => {
    expect(() => validateTaskTransition("done", "in_progress")).toThrow(/Invalid/);
  });
  it("blocked → in_progress is allowed", () => {
    expect(() => validateTaskTransition("blocked", "in_progress")).not.toThrow();
  });
});

describe("Risk lifecycle", () => {
  it("open → mitigated → closed", () => {
    expect(() => validateRiskTransition("open", "mitigated")).not.toThrow();
    expect(() => validateRiskTransition("mitigated", "closed")).not.toThrow();
  });
  it("closed is terminal", () => {
    expect(() => validateRiskTransition("closed", "open")).toThrow(/Invalid/);
  });
});

describe("Issue lifecycle", () => {
  it("open → resolved → closed", () => {
    expect(() => validateIssueTransition("open", "resolved")).not.toThrow();
    expect(() => validateIssueTransition("resolved", "closed")).not.toThrow();
  });
  it("closed → open re-opens", () => {
    expect(() => validateIssueTransition("closed", "open")).not.toThrow();
  });
});
