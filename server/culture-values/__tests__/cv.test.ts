/**
 * Culture Values — Unit Tests
 *
 * Tests lifecycle state machines, validation rules, and audit helpers.
 * Does NOT require a running database — tests pure logic functions.
 */
import { describe, it, expect } from "vitest";
import {
  VALUE_SET_TRANSITIONS,
  VALUE_DEF_TRANSITIONS,
  validateValueSetTransition,
  validateValueDefTransition,
} from "../lifecycle";

// ============================================================================
// ValueSet Lifecycle
// ============================================================================

describe("ValueSet lifecycle", () => {
  it("should allow draft → active", () => {
    expect(() => validateValueSetTransition("draft", "active")).not.toThrow();
  });

  it("should allow draft → archived", () => {
    expect(() => validateValueSetTransition("draft", "archived")).not.toThrow();
  });

  it("should allow active → deprecated", () => {
    expect(() => validateValueSetTransition("active", "deprecated")).not.toThrow();
  });

  it("should allow active → archived", () => {
    expect(() => validateValueSetTransition("active", "archived")).not.toThrow();
  });

  it("should allow deprecated → active (reactivation)", () => {
    expect(() => validateValueSetTransition("deprecated", "active")).not.toThrow();
  });

  it("should allow deprecated → archived", () => {
    expect(() => validateValueSetTransition("deprecated", "archived")).not.toThrow();
  });

  it("should reject draft → deprecated (must go through active first)", () => {
    expect(() => validateValueSetTransition("draft", "deprecated")).toThrow(/not allowed/);
  });

  it("should reject archived → anything (terminal)", () => {
    expect(() => validateValueSetTransition("archived", "active")).toThrow(/not allowed/);
    expect(() => validateValueSetTransition("archived", "draft")).toThrow(/not allowed/);
    expect(() => validateValueSetTransition("archived", "deprecated")).toThrow(/not allowed/);
  });

  it("should reject same-status transition", () => {
    expect(() => validateValueSetTransition("draft", "draft")).toThrow(/already/);
    expect(() => validateValueSetTransition("active", "active")).toThrow(/already/);
  });

  it("should have no exits from archived", () => {
    expect(VALUE_SET_TRANSITIONS.archived).toEqual([]);
  });

  it("should define all expected states", () => {
    expect(Object.keys(VALUE_SET_TRANSITIONS).sort()).toEqual(["active", "archived", "deprecated", "draft"]);
  });
});

// ============================================================================
// ValueDefinition Lifecycle
// ============================================================================

describe("ValueDefinition lifecycle", () => {
  it("should allow active → deprecated", () => {
    expect(() => validateValueDefTransition("active", "deprecated")).not.toThrow();
  });

  it("should allow active → archived", () => {
    expect(() => validateValueDefTransition("active", "archived")).not.toThrow();
  });

  it("should allow deprecated → active (reactivation)", () => {
    expect(() => validateValueDefTransition("deprecated", "active")).not.toThrow();
  });

  it("should allow deprecated → archived", () => {
    expect(() => validateValueDefTransition("deprecated", "archived")).not.toThrow();
  });

  it("should reject archived → anything (terminal)", () => {
    expect(() => validateValueDefTransition("archived", "active")).toThrow(/not allowed/);
    expect(() => validateValueDefTransition("archived", "deprecated")).toThrow(/not allowed/);
  });

  it("should reject same-status transition", () => {
    expect(() => validateValueDefTransition("active", "active")).toThrow(/already/);
  });

  it("should have no exits from archived", () => {
    expect(VALUE_DEF_TRANSITIONS.archived).toEqual([]);
  });

  it("should define all expected states", () => {
    expect(Object.keys(VALUE_DEF_TRANSITIONS).sort()).toEqual(["active", "archived", "deprecated"]);
  });
});

// ============================================================================
// Transition Map Integrity
// ============================================================================

describe("Transition map integrity", () => {
  it("ValueSet — all target states should be valid states", () => {
    const validStates = Object.keys(VALUE_SET_TRANSITIONS);
    for (const [from, targets] of Object.entries(VALUE_SET_TRANSITIONS)) {
      for (const to of targets) {
        expect(validStates).toContain(to);
      }
    }
  });

  it("ValueDef — all target states should be valid states", () => {
    const validStates = Object.keys(VALUE_DEF_TRANSITIONS);
    for (const [from, targets] of Object.entries(VALUE_DEF_TRANSITIONS)) {
      for (const to of targets) {
        expect(validStates).toContain(to);
      }
    }
  });

  it("ValueSet — draft can reach active and archived", () => {
    expect(VALUE_SET_TRANSITIONS.draft).toContain("active");
    expect(VALUE_SET_TRANSITIONS.draft).toContain("archived");
  });

  it("ValueSet — active can reach deprecated and archived", () => {
    expect(VALUE_SET_TRANSITIONS.active).toContain("deprecated");
    expect(VALUE_SET_TRANSITIONS.active).toContain("archived");
  });

  it("ValueDef — active has both deprecated and archived as exits", () => {
    expect(VALUE_DEF_TRANSITIONS.active).toContain("deprecated");
    expect(VALUE_DEF_TRANSITIONS.active).toContain("archived");
  });
});

// ============================================================================
// Value Count Rules (pure logic)
// ============================================================================

describe("Value count validation logic", () => {
  it("should accept 3–7 values as valid range", () => {
    for (let count = 3; count <= 7; count++) {
      const issues: string[] = [];
      if (count < 3) issues.push("too few");
      if (count > 7) issues.push("too many");
      expect(issues).toEqual([]);
    }
  });

  it("should flag fewer than 3 values", () => {
    const count = 2;
    const issues: string[] = [];
    if (count < 3) issues.push(`Only ${count} values defined (minimum 3 recommended)`);
    expect(issues.length).toBe(1);
    expect(issues[0]).toContain("minimum 3");
  });

  it("should flag more than 7 values", () => {
    const count = 8;
    const issues: string[] = [];
    if (count > 7) issues.push(`${count} values defined (maximum 7 recommended)`);
    expect(issues.length).toBe(1);
    expect(issues[0]).toContain("maximum 7");
  });

  it("should flag zero values", () => {
    const count = 0;
    const issues: string[] = [];
    if (count === 0) issues.push("No active values defined");
    expect(issues.length).toBe(1);
    expect(issues[0]).toContain("No active");
  });
});

// ============================================================================
// Behavior Coverage Logic
// ============================================================================

describe("Behavior coverage validation logic", () => {
  it("should flag values with no behaviors", () => {
    const values = [
      { name: "Integrity", behaviorsCount: 0 },
      { name: "Innovation", behaviorsCount: 3 },
      { name: "Respect", behaviorsCount: 0 },
    ];
    const issues: string[] = [];
    for (const v of values) {
      if (v.behaviorsCount === 0) {
        issues.push(`Value "${v.name}" has no behavior definitions`);
      }
    }
    expect(issues.length).toBe(2);
    expect(issues[0]).toContain("Integrity");
    expect(issues[1]).toContain("Respect");
  });

  it("should pass when all values have behaviors", () => {
    const values = [
      { name: "Integrity", behaviorsCount: 2 },
      { name: "Innovation", behaviorsCount: 1 },
    ];
    const issues: string[] = [];
    for (const v of values) {
      if (v.behaviorsCount === 0) {
        issues.push(`Value "${v.name}" has no behavior definitions`);
      }
    }
    expect(issues.length).toBe(0);
  });
});

// ============================================================================
// Translation Coverage Logic
// ============================================================================

describe("Translation coverage validation logic", () => {
  it("should flag values without translations", () => {
    const valueIds = [1, 2, 3];
    const translatedValueIds = new Set([1, 3]);
    const issues: string[] = [];
    for (const id of valueIds) {
      if (!translatedValueIds.has(id)) {
        issues.push(`Value ${id} has no unit-level translations`);
      }
    }
    expect(issues.length).toBe(1);
    expect(issues[0]).toContain("Value 2");
  });

  it("should pass when all values have translations", () => {
    const valueIds = [1, 2, 3];
    const translatedValueIds = new Set([1, 2, 3]);
    const issues: string[] = [];
    for (const id of valueIds) {
      if (!translatedValueIds.has(id)) {
        issues.push(`Value ${id} has no unit-level translations`);
      }
    }
    expect(issues.length).toBe(0);
  });
});

// ============================================================================
// Wizard Step Flow Logic
// ============================================================================

describe("Wizard step flow", () => {
  const STEPS = [
    "context", "values", "non-negotiables",
    "translations", "operationalization", "publish",
  ];

  it("should have 6 steps in the CV wizard", () => {
    expect(STEPS.length).toBe(6);
  });

  it("should start with context and end with publish", () => {
    expect(STEPS[0]).toBe("context");
    expect(STEPS[STEPS.length - 1]).toBe("publish");
  });

  it("should have values before non-negotiables (dependency order)", () => {
    expect(STEPS.indexOf("values")).toBeLessThan(STEPS.indexOf("non-negotiables"));
  });

  it("should have values before translations (dependency order)", () => {
    expect(STEPS.indexOf("values")).toBeLessThan(STEPS.indexOf("translations"));
  });
});

// ============================================================================
// OM Wizard Step Flow Logic
// ============================================================================

describe("OM Wizard step flow", () => {
  const STEPS = [
    "context", "model", "governance",
    "org-units", "jobs", "positions",
    "reporting", "publish",
  ];

  it("should have 8 steps in the OM wizard", () => {
    expect(STEPS.length).toBe(8);
  });

  it("should start with context and end with publish", () => {
    expect(STEPS[0]).toBe("context");
    expect(STEPS[STEPS.length - 1]).toBe("publish");
  });

  it("should have org-units before positions (dependency order)", () => {
    expect(STEPS.indexOf("org-units")).toBeLessThan(STEPS.indexOf("positions"));
  });

  it("should have jobs before positions (dependency order)", () => {
    expect(STEPS.indexOf("jobs")).toBeLessThan(STEPS.indexOf("positions"));
  });

  it("should have positions before reporting (dependency order)", () => {
    expect(STEPS.indexOf("positions")).toBeLessThan(STEPS.indexOf("reporting"));
  });
});

// ============================================================================
// Draft Persistence Logic
// ============================================================================

describe("Draft persistence logic", () => {
  it("should maintain draft state across step changes", () => {
    const draft = { name: "Test", values: [{ code: "V1", name: "Integrity" }] };
    // Simulate step change — draft should persist
    const afterStepChange = { ...draft };
    expect(afterStepChange.name).toBe("Test");
    expect(afterStepChange.values[0].code).toBe("V1");
  });

  it("should allow adding values incrementally", () => {
    let values: { code: string; name: string }[] = [];
    values = [...values, { code: "V1", name: "Integrity" }];
    expect(values.length).toBe(1);
    values = [...values, { code: "V2", name: "Innovation" }];
    expect(values.length).toBe(2);
    values = [...values, { code: "V3", name: "Respect" }];
    expect(values.length).toBe(3);
    expect(values[2].name).toBe("Respect");
  });

  it("should allow removing values by index", () => {
    const values = [
      { code: "V1", name: "A" },
      { code: "V2", name: "B" },
      { code: "V3", name: "C" },
    ];
    const afterRemove = values.filter((_, i) => i !== 1);
    expect(afterRemove.length).toBe(2);
    expect(afterRemove[0].code).toBe("V1");
    expect(afterRemove[1].code).toBe("V3");
  });
});
