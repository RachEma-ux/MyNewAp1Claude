/**
 * Workspace Lifecycle Tests — Canonical 9-status lifecycle
 *
 * Tests:
 *   1. Status classification (executable, readable, published, deleted, setup-mutable)
 *   2. Allowed transitions (success path, failure path, end-of-life path)
 *   3. Transition validation (invalid transitions rejected)
 *   4. Publication logic (WS List vs WS Catalog)
 */

import { describe, it, expect } from "vitest";
import {
  isWorkspaceExecutable,
  isWorkspaceReadable,
  isWorkspacePublished,
  isWorkspaceDeleted,
  isWorkspaceSetupMutable,
  isTransitionAllowed,
  getAllowedTransitions,
  validateTransition,
  LIFECYCLE_TRANSITIONS,
} from "./workspace-lifecycle";
import type { WorkspaceStatus } from "../../drizzle/tables/users";

describe("Workspace Lifecycle", () => {
  // =========================================================================
  // Status Classification
  // =========================================================================

  describe("isWorkspaceExecutable", () => {
    it("returns true only for active", () => {
      expect(isWorkspaceExecutable("active")).toBe(true);
      expect(isWorkspaceExecutable("draft")).toBe(false);
      expect(isWorkspaceExecutable("published")).toBe(false);
      expect(isWorkspaceExecutable("approved")).toBe(false);
      expect(isWorkspaceExecutable("archived")).toBe(false);
      expect(isWorkspaceExecutable("deleted")).toBe(false);
    });
  });

  describe("isWorkspaceReadable", () => {
    it("returns true for all statuses except deleted", () => {
      const readableStatuses: WorkspaceStatus[] = [
        "draft", "ready_for_review", "under_review", "approved",
        "published", "active", "rejected", "archived",
      ];
      for (const s of readableStatuses) {
        expect(isWorkspaceReadable(s)).toBe(true);
      }
      expect(isWorkspaceReadable("deleted")).toBe(false);
    });
  });

  describe("isWorkspacePublished", () => {
    it("returns true for published and active", () => {
      expect(isWorkspacePublished("published")).toBe(true);
      expect(isWorkspacePublished("active")).toBe(true);
      expect(isWorkspacePublished("approved")).toBe(false);
      expect(isWorkspacePublished("draft")).toBe(false);
      expect(isWorkspacePublished("archived")).toBe(false);
    });
  });

  describe("isWorkspaceDeleted", () => {
    it("returns true only for deleted", () => {
      expect(isWorkspaceDeleted("deleted")).toBe(true);
      expect(isWorkspaceDeleted("archived")).toBe(false);
      expect(isWorkspaceDeleted("active")).toBe(false);
    });
  });

  describe("isWorkspaceSetupMutable", () => {
    it("returns true for draft, ready_for_review, rejected", () => {
      expect(isWorkspaceSetupMutable("draft")).toBe(true);
      expect(isWorkspaceSetupMutable("ready_for_review")).toBe(true);
      expect(isWorkspaceSetupMutable("rejected")).toBe(true);
      expect(isWorkspaceSetupMutable("active")).toBe(false);
      expect(isWorkspaceSetupMutable("archived")).toBe(false);
    });
  });

  // =========================================================================
  // Lifecycle Transitions
  // =========================================================================

  describe("isTransitionAllowed", () => {
    it("allows success path: draft → ready_for_review → under_review → approved → published → active", () => {
      expect(isTransitionAllowed("draft", "ready_for_review")).toBe(true);
      expect(isTransitionAllowed("ready_for_review", "under_review")).toBe(true);
      expect(isTransitionAllowed("under_review", "approved")).toBe(true);
      expect(isTransitionAllowed("approved", "published")).toBe(true);
      expect(isTransitionAllowed("published", "active")).toBe(true);
    });

    it("allows failure path: under_review → rejected → archived", () => {
      expect(isTransitionAllowed("under_review", "rejected")).toBe(true);
      expect(isTransitionAllowed("rejected", "archived")).toBe(true);
    });

    it("allows end-of-life path: active → archived → deleted", () => {
      expect(isTransitionAllowed("active", "archived")).toBe(true);
      expect(isTransitionAllowed("archived", "deleted")).toBe(true);
    });

    it("allows return to draft from rejected and archived", () => {
      expect(isTransitionAllowed("rejected", "draft")).toBe(true);
      expect(isTransitionAllowed("archived", "draft")).toBe(true);
    });

    it("blocks skipping approved → active (must go through published)", () => {
      expect(isTransitionAllowed("approved", "active")).toBe(false);
    });

    it("blocks draft → active directly", () => {
      expect(isTransitionAllowed("draft", "active")).toBe(false);
    });

    it("blocks deleted → anything", () => {
      expect(isTransitionAllowed("deleted", "draft")).toBe(false);
      expect(isTransitionAllowed("deleted", "active")).toBe(false);
      expect(isTransitionAllowed("deleted", "archived")).toBe(false);
    });

    it("blocks active → published (no backwards lifecycle)", () => {
      expect(isTransitionAllowed("active", "published")).toBe(false);
    });
  });

  describe("getAllowedTransitions", () => {
    it("returns correct transitions for each status", () => {
      expect(getAllowedTransitions("draft")).toContain("ready_for_review");
      expect(getAllowedTransitions("draft")).toContain("deleted");
      expect(getAllowedTransitions("under_review")).toContain("approved");
      expect(getAllowedTransitions("under_review")).toContain("rejected");
      expect(getAllowedTransitions("deleted")).toEqual([]);
    });
  });

  describe("validateTransition", () => {
    it("returns target status for valid transitions", () => {
      expect(validateTransition("draft", "ready_for_review")).toBe("ready_for_review");
      expect(validateTransition("published", "active")).toBe("active");
    });

    it("throws for invalid transitions", () => {
      expect(() => validateTransition("draft", "active")).toThrow();
      expect(() => validateTransition("deleted", "draft")).toThrow();
      expect(() => validateTransition("approved", "active")).toThrow();
    });
  });

  // =========================================================================
  // Publication Separation
  // =========================================================================

  describe("Publication vs Execution distinction", () => {
    it("published workspace is visible but NOT executable", () => {
      expect(isWorkspacePublished("published")).toBe(true);
      expect(isWorkspaceExecutable("published")).toBe(false);
    });

    it("active workspace is both visible and executable", () => {
      expect(isWorkspacePublished("active")).toBe(true);
      expect(isWorkspaceExecutable("active")).toBe(true);
    });

    it("approved is neither published nor executable", () => {
      expect(isWorkspacePublished("approved")).toBe(false);
      expect(isWorkspaceExecutable("approved")).toBe(false);
    });
  });

  // =========================================================================
  // Lifecycle Completeness
  // =========================================================================

  describe("All statuses have defined transitions", () => {
    const ALL_STATUSES: WorkspaceStatus[] = [
      "draft", "ready_for_review", "under_review", "approved",
      "published", "active", "rejected", "archived", "deleted",
    ];

    it("every status has an entry in LIFECYCLE_TRANSITIONS", () => {
      for (const status of ALL_STATUSES) {
        expect(LIFECYCLE_TRANSITIONS).toHaveProperty(status);
      }
    });

    it("no transition targets a non-existent status", () => {
      for (const [, targets] of Object.entries(LIFECYCLE_TRANSITIONS)) {
        for (const target of targets) {
          expect(ALL_STATUSES).toContain(target);
        }
      }
    });
  });
});
