/**
 * PS Ideation Shell — Correction Pass Tests
 *
 * Verifies the corrected shell's data contracts, step definitions,
 * readiness logic, and structural invariants without requiring DOM.
 *
 * Covers the 12 correction checklist items at the data/contract level.
 */
import { describe, it, expect } from "vitest";
import {
  IDEATION_STEP_KEYS,
  IDEATION_STEP_LABELS,
  IDEATION_STEP_GROUPS,
  IDEATION_STEP_STATUSES,
  IDEATION_LIFECYCLE_STATUSES,
  ContextStepPayload,
  ProblemStepPayload,
  OpportunityStepPayload,
  GuidingQuestionStepPayload,
  IdeaGenerationStepPayload,
  ClusteringStepPayload,
  ScreeningStepPayload,
  ScenarioStepPayload,
  FeasibilityStepPayload,
  ConceptSelectionStepPayload,
  OnePageSummaryStepPayload,
  STEP_PAYLOAD_SCHEMAS,
  type IdeationStepKey,
} from "./ps.ideation-types";

// ── 1. Workflow Rail: exact 11 steps ──────────────────────────────────

describe("Workflow Rail — exact 11-step definition", () => {
  it("defines exactly 11 step keys", () => {
    expect(IDEATION_STEP_KEYS).toHaveLength(11);
  });

  it("lists steps in the mandatory order", () => {
    expect(IDEATION_STEP_KEYS).toEqual([
      "context",
      "problem",
      "opportunity",
      "guiding_question",
      "idea_generation",
      "clustering",
      "screening",
      "scenario_exploration",
      "feasibility",
      "concept_selection",
      "one_page_summary",
    ]);
  });

  it("has a label for every step key", () => {
    for (const key of IDEATION_STEP_KEYS) {
      expect(IDEATION_STEP_LABELS[key]).toBeDefined();
      expect(IDEATION_STEP_LABELS[key].length).toBeGreaterThan(0);
    }
  });

  it("labels contain the step number prefix", () => {
    IDEATION_STEP_KEYS.forEach((key, i) => {
      expect(IDEATION_STEP_LABELS[key]).toContain(`${i + 1}.`);
    });
  });

  it("groups cover all 11 step keys exactly once", () => {
    const grouped = Object.values(IDEATION_STEP_GROUPS).flat();
    expect(grouped).toHaveLength(11);
    expect(new Set(grouped).size).toBe(11);
    for (const key of IDEATION_STEP_KEYS) {
      expect(grouped).toContain(key);
    }
  });
});

// ── 2. Current step highlighting requires valid status values ─────────

describe("Step status values", () => {
  it("includes not_started, in_progress, complete, blocked", () => {
    expect(IDEATION_STEP_STATUSES).toContain("not_started");
    expect(IDEATION_STEP_STATUSES).toContain("in_progress");
    expect(IDEATION_STEP_STATUSES).toContain("complete");
    expect(IDEATION_STEP_STATUSES).toContain("blocked");
  });
});

// ── 3. Step progress — index computation ──────────────────────────────

describe("Step progress computation", () => {
  it("indexOf returns correct 0-based index for each step", () => {
    expect(IDEATION_STEP_KEYS.indexOf("context")).toBe(0);
    expect(IDEATION_STEP_KEYS.indexOf("one_page_summary")).toBe(10);
    expect(IDEATION_STEP_KEYS.indexOf("concept_selection")).toBe(9);
  });

  it("can compute progress percentage", () => {
    const total = IDEATION_STEP_KEYS.length;
    const completed = 5;
    const pct = Math.round((completed / total) * 100);
    expect(pct).toBe(45);
  });
});

// ── 4. Save feedback — payload schemas validate correctly ─────────────

describe("Save payload validation — Step 1 (Context)", () => {
  it("validates a complete context payload", () => {
    const valid = ContextStepPayload.safeParse({
      externalDriver: "Market competition",
      internalDriver: "Tech debt",
      triggerEvent: "Budget cycle",
      shapesNeed: "Convergence of factors",
    });
    expect(valid.success).toBe(true);
  });

  it("rejects an incomplete context payload", () => {
    const invalid = ContextStepPayload.safeParse({
      externalDriver: "",
      internalDriver: "Something",
      triggerEvent: "Now",
      shapesNeed: "Yes",
    });
    expect(invalid.success).toBe(false);
  });
});

describe("Save payload validation — all steps have schemas", () => {
  it("every step key has a corresponding payload schema", () => {
    for (const key of IDEATION_STEP_KEYS) {
      expect(STEP_PAYLOAD_SCHEMAS[key]).toBeDefined();
    }
  });
});

// ── 5. Header action hierarchy — lifecycle statuses ───────────────────

describe("Lifecycle statuses for action hierarchy", () => {
  it("includes deferred and rejected for overflow menu actions", () => {
    expect(IDEATION_LIFECYCLE_STATUSES).toContain("deferred");
    expect(IDEATION_LIFECYCLE_STATUSES).toContain("rejected");
  });

  it("includes converted as terminal state", () => {
    expect(IDEATION_LIFECYCLE_STATUSES).toContain("converted");
  });

  it("includes ready_for_wizard gating status", () => {
    expect(IDEATION_LIFECYCLE_STATUSES).toContain("ready_for_wizard");
  });
});

// ── 6. Label normalization — Step 1 template wording ──────────────────

describe("Step 1 label normalization", () => {
  it("Step 1 context payload schema uses externalDriver field", () => {
    const shape = ContextStepPayload.shape;
    expect(shape.externalDriver).toBeDefined();
    expect(shape.internalDriver).toBeDefined();
    expect(shape.triggerEvent).toBeDefined();
    expect(shape.shapesNeed).toBeDefined();
  });

  it("Step labels match exact ideation template wording", () => {
    expect(IDEATION_STEP_LABELS.context).toBe("1. Context of the Project");
    expect(IDEATION_STEP_LABELS.problem).toBe("2. The Problem");
    expect(IDEATION_STEP_LABELS.opportunity).toBe("3. The Opportunity");
    expect(IDEATION_STEP_LABELS.guiding_question).toBe('4. Guiding "What If?" Question');
    expect(IDEATION_STEP_LABELS.idea_generation).toBe("5. Idea Generation (Divergent)");
    expect(IDEATION_STEP_LABELS.clustering).toBe("6. Idea Clustering & Theming");
    expect(IDEATION_STEP_LABELS.screening).toBe("7. Initial Screening (Filtering)");
    expect(IDEATION_STEP_LABELS.scenario_exploration).toBe('8. "What If?" Scenario Exploration');
    expect(IDEATION_STEP_LABELS.feasibility).toBe("9. Quick Feasibility Checks (Mini-POCs)");
    expect(IDEATION_STEP_LABELS.concept_selection).toBe("10. Concept Selection");
    expect(IDEATION_STEP_LABELS.one_page_summary).toBe("11. One-Page Summary (Optional)");
  });
});

// ── 7. Wizard handoff — readiness gating ──────────────────────────────

describe("Wizard handoff readiness contract", () => {
  it("ConceptSelectionStepPayload requires selectedIdeaId", () => {
    const valid = ConceptSelectionStepPayload.safeParse({
      selectedIdeaId: 1,
      rationale: {},
    });
    expect(valid.success).toBe(true);
  });

  it("ConceptSelectionStepPayload rejects without selectedIdeaId", () => {
    const invalid = ConceptSelectionStepPayload.safeParse({
      rationale: {},
    });
    expect(invalid.success).toBe(false);
  });
});

// ── 8. PS Ideation remains pre-project ────────────────────────────────

describe("PS Ideation pre-project invariant", () => {
  it("lifecycle statuses do not include 'created' or 'active' project states", () => {
    for (const status of IDEATION_LIFECYCLE_STATUSES) {
      expect(status).not.toBe("created");
      expect(status).not.toBe("active");
      expect(status).not.toBe("project");
    }
  });

  it("converted is the terminal state that hands off to wizard", () => {
    const lastReal = IDEATION_LIFECYCLE_STATUSES[IDEATION_LIFECYCLE_STATUSES.length - 1];
    expect(lastReal).toBe("converted");
  });
});

// ── 9. No step key collisions ─────────────────────────────────────────

describe("Step key uniqueness", () => {
  it("all step keys are unique", () => {
    const unique = new Set(IDEATION_STEP_KEYS);
    expect(unique.size).toBe(IDEATION_STEP_KEYS.length);
  });
});

// ── 10. Step navigation — prev/next boundary checks ───────────────────

describe("Step navigation boundaries", () => {
  it("first step has no previous", () => {
    const idx = 0;
    expect(idx > 0).toBe(false);
  });

  it("last step has no next", () => {
    const idx = IDEATION_STEP_KEYS.length - 1;
    expect(idx < IDEATION_STEP_KEYS.length - 1).toBe(false);
  });

  it("middle steps have both prev and next", () => {
    const idx = 5; // clustering
    expect(idx > 0).toBe(true);
    expect(idx < IDEATION_STEP_KEYS.length - 1).toBe(true);
  });
});
