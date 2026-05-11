/**
 * Phase 27 — Neo4j Enterprise/Aura upgrade paths + production
 * operations ADR lockstep tests.
 *
 * Three ADRs land in the same PR; together they close all 7
 * Phase 27 acceptance criteria. These tests assert each file
 * exists and carries the sections the acceptance list calls for.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

const ENTERPRISE_PATH = join(
  process.cwd(),
  "docs/architecture/agent-studio-neo4j-enterprise-upgrade-path.md",
);
const AURA_PATH = join(
  process.cwd(),
  "docs/architecture/agent-studio-neo4j-aura-upgrade-path.md",
);
const OPS_PATH = join(
  process.cwd(),
  "docs/architecture/agent-studio-graph-production-operations.md",
);

describe("Phase 27 — Neo4j Enterprise Upgrade Path ADR", () => {
  it("ADR file exists", () => {
    expect(existsSync(ENTERPRISE_PATH)).toBe(true);
  });

  it("documents CE limitations and upgrade triggers", () => {
    const src = readFileSync(ENTERPRISE_PATH, "utf8");
    expect(src).toMatch(/Community Edition limitations/i);
    expect(src).toMatch(/No high availability/i);
    expect(src).toMatch(/When to upgrade to Enterprise/i);
  });

  it("documents the upgrade procedure + rollback", () => {
    const src = readFileSync(ENTERPRISE_PATH, "utf8");
    expect(src).toMatch(/Upgrade procedure/i);
    expect(src).toMatch(/Rollback procedure/i);
  });
});

describe("Phase 27 — Neo4j Aura Upgrade Path ADR", () => {
  it("ADR file exists", () => {
    expect(existsSync(AURA_PATH)).toBe(true);
  });

  it("documents tier selection + upgrade procedure", () => {
    const src = readFileSync(AURA_PATH, "utf8");
    expect(src).toMatch(/Aura tier selection/i);
    expect(src).toMatch(/AuraDB/);
    expect(src).toMatch(/Upgrade procedure/i);
  });
});

describe("Phase 27 — Graph Production Operations ADR", () => {
  it("ADR file exists", () => {
    expect(existsSync(OPS_PATH)).toBe(true);
  });

  it("documents per-backend backup/restore strategy", () => {
    const src = readFileSync(OPS_PATH, "utf8");
    expect(src).toMatch(/Backup \/ restore strategy/i);
    expect(src).toMatch(/Community Edition/i);
    expect(src).toMatch(/Enterprise/i);
    expect(src).toMatch(/Aura/i);
  });

  it("documents per-backend auth/RBAC strategy", () => {
    const src = readFileSync(OPS_PATH, "utf8");
    expect(src).toMatch(/Auth \/ RBAC strategy/i);
    expect(src).toMatch(/Database-level auth complements/i);
  });

  it("documents monitoring + on-call discipline", () => {
    const src = readFileSync(OPS_PATH, "utf8");
    expect(src).toMatch(/Monitoring/i);
    expect(src).toMatch(/On-call discipline/i);
  });
});
