/**
 * Workforce Assignment Bridge — Unit Tests
 *
 * Tests lifecycle state machines, enforcement rules, authority resolution,
 * and validation logic. Does not require database — tests pure logic.
 */

import { describe, it, expect } from "vitest";
import {
  validateRequestTransition,
  validateAssignmentTransition,
  REQUEST_TRANSITIONS,
  ASSIGNMENT_TRANSITIONS,
} from "../lifecycle";
import { preventRequesterSelfApproval } from "../enforcement";
import { resolveAssignmentAuthority } from "../authority";

// ============================================================================
// Request Lifecycle Tests
// ============================================================================

describe("Request Lifecycle", () => {
  it("allows draft → requested transition", () => {
    const result = validateRequestTransition("draft", "requested");
    expect(result.from).toBe("draft");
    expect(result.to).toBe("requested");
  });

  it("allows draft → cancelled transition", () => {
    const result = validateRequestTransition("draft", "cancelled");
    expect(result.to).toBe("cancelled");
  });

  it("allows requested → under_hr_review transition", () => {
    const result = validateRequestTransition("requested", "under_hr_review");
    expect(result.to).toBe("under_hr_review");
  });

  it("allows under_hr_review → candidate_proposed transition", () => {
    const result = validateRequestTransition("under_hr_review", "candidate_proposed");
    expect(result.to).toBe("candidate_proposed");
  });

  it("allows candidate_proposed → pending_approval transition", () => {
    const result = validateRequestTransition("candidate_proposed", "pending_approval");
    expect(result.to).toBe("pending_approval");
  });

  it("allows pending_approval → approved transition", () => {
    const result = validateRequestTransition("pending_approval", "approved");
    expect(result.to).toBe("approved");
  });

  it("allows pending_approval → rejected transition", () => {
    const result = validateRequestTransition("pending_approval", "rejected");
    expect(result.to).toBe("rejected");
  });

  it("blocks illegal jump: draft → approved", () => {
    expect(() => validateRequestTransition("draft", "approved")).toThrow(
      /Illegal request transition: draft → approved/,
    );
  });

  it("blocks illegal jump: draft → under_hr_review", () => {
    expect(() => validateRequestTransition("draft", "under_hr_review")).toThrow(
      /Illegal request transition/,
    );
  });

  it("blocks illegal jump: requested → approved (skips HR review)", () => {
    expect(() => validateRequestTransition("requested", "approved")).toThrow(
      /Illegal request transition: requested → approved/,
    );
  });

  it("blocks illegal jump: approved → draft (terminal status)", () => {
    expect(() => validateRequestTransition("approved", "draft")).toThrow(
      /Illegal request transition: approved → draft/,
    );
  });

  it("blocks illegal jump: rejected → approved (terminal status)", () => {
    expect(() => validateRequestTransition("rejected", "approved")).toThrow(
      /Illegal request transition/,
    );
  });

  it("blocks invalid source status", () => {
    expect(() => validateRequestTransition("bogus", "draft")).toThrow(
      /Invalid request status: bogus/,
    );
  });

  it("blocks invalid target status", () => {
    expect(() => validateRequestTransition("draft", "bogus")).toThrow(
      /Invalid target request status: bogus/,
    );
  });

  it("all terminal states have no outgoing transitions", () => {
    expect(REQUEST_TRANSITIONS.approved).toEqual([]);
    expect(REQUEST_TRANSITIONS.rejected).toEqual([]);
    expect(REQUEST_TRANSITIONS.cancelled).toEqual([]);
  });

  it("cancellation is available from all non-terminal states", () => {
    const nonTerminal = ["draft", "requested", "under_hr_review", "candidate_proposed", "pending_approval"] as const;
    for (const status of nonTerminal) {
      expect(REQUEST_TRANSITIONS[status]).toContain("cancelled");
    }
  });
});

// ============================================================================
// Assignment Lifecycle Tests
// ============================================================================

describe("Assignment Lifecycle", () => {
  it("allows pending → active transition", () => {
    const result = validateAssignmentTransition("pending", "active");
    expect(result.to).toBe("active");
  });

  it("allows active → released transition", () => {
    const result = validateAssignmentTransition("active", "released");
    expect(result.to).toBe("released");
  });

  it("allows active → completed transition", () => {
    const result = validateAssignmentTransition("active", "completed");
    expect(result.to).toBe("completed");
  });

  it("allows pending → cancelled transition", () => {
    const result = validateAssignmentTransition("pending", "cancelled");
    expect(result.to).toBe("cancelled");
  });

  it("blocks illegal jump: pending → completed (must go through active)", () => {
    expect(() => validateAssignmentTransition("pending", "completed")).toThrow(
      /Illegal assignment transition: pending → completed/,
    );
  });

  it("blocks illegal jump: released → active (terminal status)", () => {
    expect(() => validateAssignmentTransition("released", "active")).toThrow(
      /Illegal assignment transition/,
    );
  });

  it("all terminal states have no outgoing transitions", () => {
    expect(ASSIGNMENT_TRANSITIONS.released).toEqual([]);
    expect(ASSIGNMENT_TRANSITIONS.completed).toEqual([]);
    expect(ASSIGNMENT_TRANSITIONS.cancelled).toEqual([]);
  });
});

// ============================================================================
// Enforcement Tests
// ============================================================================

describe("Enforcement — Separation of Duties", () => {
  it("blocks self-approval (requester = approver)", () => {
    expect(() => preventRequesterSelfApproval(42, 42)).toThrow(
      /Separation of duties violation/,
    );
  });

  it("allows different requester and approver", () => {
    expect(() => preventRequesterSelfApproval(42, 99)).not.toThrow();
  });
});

// ============================================================================
// Authority Resolution Tests (Temporary)
// ============================================================================

describe("Temporary Authority Resolution", () => {
  it("resolves authority for admin role", () => {
    const result = resolveAssignmentAuthority({
      actorId: 1,
      actorRole: "admin",
      employeeId: 10,
      projectId: 100,
    });
    expect(result.resolved).toBe(true);
    expect(result.source).toBe("transitional");
    expect(result.level).toBe("role_based");
    expect(result.warning).toBeUndefined();
    expect(result.chain._transitional).toBe(true);
  });

  it("resolves authority for hrbp role", () => {
    const result = resolveAssignmentAuthority({
      actorId: 2,
      actorRole: "hrbp",
      employeeId: 10,
      projectId: 100,
    });
    expect(result.resolved).toBe(true);
    expect(result.source).toBe("transitional");
  });

  it("does not resolve authority for regular user", () => {
    const result = resolveAssignmentAuthority({
      actorId: 3,
      actorRole: "user",
      employeeId: 10,
      projectId: 100,
    });
    expect(result.resolved).toBe(false);
    expect(result.warning).toContain("does not have authority");
  });

  it("does not resolve authority for employee role", () => {
    const result = resolveAssignmentAuthority({
      actorId: 4,
      actorRole: "employee",
      employeeId: 10,
      projectId: 100,
    });
    expect(result.resolved).toBe(false);
  });

  it("all authority records are marked transitional", () => {
    const result = resolveAssignmentAuthority({
      actorId: 1,
      actorRole: "admin",
      employeeId: 10,
      projectId: 100,
    });
    expect(result.chain._transitional).toBe(true);
    expect(result.chain._omDependency).toContain("Organization Management module not yet implemented");
  });
});
