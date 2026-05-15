/**
 * Phase 24 §T-F.12 — summarizeLensRunnerRegistry lockstep.
 *
 * Coverage rollup for the runner registry: how many GRAPH_LENS_KINDS
 * have runners vs. are still placeholder. Operator dashboard's
 * "X / 8 kinds have runners" gauge.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  GRAPH_LENS_KINDS,
  registerLensRunner,
  summarizeLensRunnerRegistry,
  __resetLensRunnerRegistryForTests,
  type GraphLensKind,
  type LensRunnerFn,
} from "../../server/agent-studio/services/graph-lens/public-api.js";

const stub: LensRunnerFn = async (def) => ({
  lensId: def.id,
  kind: def.kind,
  layout: def.layout,
  producedAt: new Date(0),
  nodes: [],
  edges: [],
  truncated: false,
  hiddenNodeCount: 0,
});

beforeEach(() => {
  __resetLensRunnerRegistryForTests();
});

describe("summarizeLensRunnerRegistry (T-F.12)", () => {
  it("empty registry → 0% coverage, all kinds in missingKinds", () => {
    const s = summarizeLensRunnerRegistry();
    expect(s.totalKinds).toBe(GRAPH_LENS_KINDS.length);
    expect(s.registeredKinds).toBe(0);
    expect(s.missingKinds.length).toBe(GRAPH_LENS_KINDS.length);
    expect(s.coveragePercent).toBe(0);
  });

  it("single registration → 1 registered, rest missing", () => {
    const target: GraphLensKind = "rag";
    registerLensRunner(target, stub);
    const s = summarizeLensRunnerRegistry();
    expect(s.registeredKinds).toBe(1);
    expect(s.missingKinds.length).toBe(GRAPH_LENS_KINDS.length - 1);
    expect(s.missingKinds).not.toContain(target);
  });

  it("registering all kinds → 100% coverage, empty missingKinds", () => {
    for (const k of GRAPH_LENS_KINDS) {
      registerLensRunner(k, stub);
    }
    const s = summarizeLensRunnerRegistry();
    expect(s.registeredKinds).toBe(GRAPH_LENS_KINDS.length);
    expect(s.missingKinds.length).toBe(0);
    expect(s.coveragePercent).toBe(100);
  });

  it("coveragePercent has 1-decimal precision (8 kinds, 3 registered = 37.5%)", () => {
    if (GRAPH_LENS_KINDS.length !== 8) {
      // Test assumes 8 kinds — skip cleanly if taxonomy changes.
      return;
    }
    registerLensRunner(GRAPH_LENS_KINDS[0], stub);
    registerLensRunner(GRAPH_LENS_KINDS[1], stub);
    registerLensRunner(GRAPH_LENS_KINDS[2], stub);
    const s = summarizeLensRunnerRegistry();
    expect(s.coveragePercent).toBe(37.5);
  });

  it("registeredKinds + missingKinds.length == totalKinds", () => {
    registerLensRunner("rag", stub);
    registerLensRunner("cag", stub);
    const s = summarizeLensRunnerRegistry();
    expect(s.registeredKinds + s.missingKinds.length).toBe(s.totalKinds);
  });

  it("missingKinds preserves GRAPH_LENS_KINDS order", () => {
    // Register only the third kind; first two + remaining stay in
    // declared order.
    if (GRAPH_LENS_KINDS.length < 4) return;
    registerLensRunner(GRAPH_LENS_KINDS[2], stub);
    const s = summarizeLensRunnerRegistry();
    const expected = GRAPH_LENS_KINDS.filter(
      (k) => k !== GRAPH_LENS_KINDS[2],
    );
    expect(s.missingKinds).toEqual(expected);
  });
});
