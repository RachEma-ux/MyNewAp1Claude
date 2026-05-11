/**
 * Phase 19 — Sync + Publish/Export strategy ADR lockstep tests.
 *
 * Two ADRs land in the same PR; each closes a different subset
 * of the Phase 19 acceptance list. These tests assert both files
 * exist and carry the sections roadmap consumers expect.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

const SYNC_PATH = join(
  process.cwd(),
  "docs/architecture/agent-studio-workspace-sync-strategy.md",
);
const PUBLISH_PATH = join(
  process.cwd(),
  "docs/architecture/agent-studio-publish-export-strategy.md",
);

describe("Phase 19 — Workspace Sync Strategy ADR", () => {
  it("ADR file exists at the canonical path", () => {
    expect(existsSync(SYNC_PATH)).toBe(true);
  });

  it("declares server-first MVP", () => {
    const src = readFileSync(SYNC_PATH, "utf8");
    expect(src).toMatch(/server-first/i);
    expect(src).toContain("Postgres");
    expect(src).toMatch(/source of truth|authoritative/i);
  });

  it("defers real-time collaboration with trigger conditions", () => {
    const src = readFileSync(SYNC_PATH, "utf8");
    expect(src).toMatch(/real-time collaboration is deferred/i);
    expect(src).toMatch(/CRDT/);
    expect(src).toMatch(/Trigger conditions/i);
  });

  it("defers offline sync with rationale", () => {
    const src = readFileSync(SYNC_PATH, "utf8");
    expect(src).toMatch(/offline sync is deferred/i);
  });

  it("documents Neo4j projection rebuild strategy", () => {
    const src = readFileSync(SYNC_PATH, "utf8");
    expect(src).toMatch(/Neo4j projection rebuild/i);
    expect(src).toMatch(/idempotent rebuild/i);
  });
});

describe("Phase 19 — Publish / Export Strategy ADR", () => {
  it("ADR file exists at the canonical path", () => {
    expect(existsSync(PUBLISH_PATH)).toBe(true);
  });

  it("defines the hybrid import/export path", () => {
    const src = readFileSync(PUBLISH_PATH, "utf8");
    expect(src).toMatch(/hybrid import\/export/i);
    expect(src).toContain("importNoteFromMarkdown");
    expect(src).toContain("exportNote");
  });

  it("defers bulk vault export, publish-shape static export, and selective export", () => {
    const src = readFileSync(PUBLISH_PATH, "utf8");
    expect(src).toMatch(/bulk vault export/i);
    expect(src).toMatch(/publish-shape static export/i);
    expect(src).toMatch(/selective export/i);
  });

  it("references the sync strategy companion ADR", () => {
    const src = readFileSync(PUBLISH_PATH, "utf8");
    expect(src).toContain("agent-studio-workspace-sync-strategy");
  });
});
