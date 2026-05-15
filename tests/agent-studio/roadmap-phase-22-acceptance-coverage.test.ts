/**
 * Roadmap Phase 22 acceptance criteria lockstep.
 *
 * Asserts the roadmap doc's Phase 22 acceptance checklist reflects
 * the actual shipped LIVE emissions. When a new emission lands, this
 * test forces the roadmap checkbox + artifact-reference to be
 * updated.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const roadmapPath = resolve(
  __dirname,
  "../../docs/implementation/agent-studio-native-graph-workspace-roadmap.md",
);

describe("Roadmap Phase 22 acceptance lockstep", () => {
  const roadmap = readFileSync(roadmapPath, "utf8");

  it("references the 2026-05-15 emission burst artifact", () => {
    expect(roadmap).toContain(
      "agent-studio-failure-state-emission-burst-2026-05-15.md",
    );
  });

  it("Neo4j degraded acceptance is checked + cites #1014", () => {
    expect(roadmap).toMatch(
      /\[x\]\s+Neo4j degraded[\s\S]{0,200}#1014/,
    );
  });

  it("Projection sync failure acceptance is checked + cites #1025 + #1015", () => {
    expect(roadmap).toMatch(
      /\[x\]\s+Projection sync failure[\s\S]{0,300}#1025[\s\S]{0,200}#1015/,
    );
  });

  it("Promotion validation errors acceptance is checked + cites #1027", () => {
    expect(roadmap).toMatch(
      /\[x\]\s+Promotion validation errors[\s\S]{0,200}#1027/,
    );
  });

  it("Background job status acceptance is checked + notes count-pin blocker", () => {
    expect(roadmap).toMatch(/\[x\]\s+Background job status/);
    expect(roadmap).toContain("count-pin blocker");
  });

  it("Graph Agent explanation panel acceptance is checked + cites #1023", () => {
    expect(roadmap).toMatch(
      /\[x\]\s+Graph Agent explanation panel[\s\S]{0,200}#1023/,
    );
  });

  it("Conflict resolution UI acceptance remains unchecked + names the blocker", () => {
    expect(roadmap).toMatch(/\[ \]\s+Conflict resolution UI/);
    expect(roadmap).toContain("`note_conflict` detection-first deferred");
  });

  it("references the closed-taxonomy contract path", () => {
    expect(roadmap).toContain("services/failure-states/contracts.ts");
  });

  it("references the emission bridge path", () => {
    expect(roadmap).toContain("services/failure-states/observability-bridge.ts");
  });

  it("references the per-state audit doc path", () => {
    expect(roadmap).toContain(
      "agent-studio-phase-22-failure-state-emission-audit.md",
    );
  });
});
