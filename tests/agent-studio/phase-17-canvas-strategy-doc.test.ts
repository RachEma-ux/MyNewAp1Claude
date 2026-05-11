/**
 * Phase 17 — Canvas strategy ADR lockstep test.
 *
 * The Phase 17 acceptance list calls for a strategy document.
 * This test asserts the document exists at the canonical path
 * and carries the sections roadmap consumers expect. Catches
 * accidental deletion / move during refactors.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

const PATH = join(
  process.cwd(),
  "docs/architecture/agent-studio-canvas-strategy.md",
);

describe("Phase 17 — Canvas Strategy ADR", () => {
  it("ADR file exists at the canonical path", () => {
    expect(existsSync(PATH)).toBe(true);
  });

  it("declares MVP alternatives covering graph + table + tree views", () => {
    const src = readFileSync(PATH, "utf8");
    expect(src).toMatch(/MVP alternative/i);
    expect(src).toMatch(/Graph view/i);
    expect(src).toMatch(/Saved views/i);
    expect(src).toMatch(/Decision-trace/i);
  });

  it("declares Canvas as not MVP-blocking + scheduled after core stability", () => {
    const src = readFileSync(PATH, "utf8");
    expect(src).toMatch(/not MVP-blocking/i);
    expect(src).toMatch(/(after|scheduled).*(core|workspace).*(stab)/i);
  });

  it("defines the future Canvas data model (3-table schema)", () => {
    const src = readFileSync(PATH, "utf8");
    expect(src).toContain("ags_canvases");
    expect(src).toContain("ags_canvas_elements");
    expect(src).toContain("ags_canvas_edges");
  });

  it("references existing native-graph-workspace docs", () => {
    const src = readFileSync(PATH, "utf8");
    expect(src).toContain("agent-studio-native-graph-workspace");
    expect(src).toContain(
      "agent-studio-graph-repository-and-backend-strategy",
    );
  });
});
