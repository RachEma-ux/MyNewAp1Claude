/**
 * executeTemplate (postgres backend) — source-scan integrity.
 *
 * Slice 6 of the no-deferral catalogue (2026-05-19). Replaces the
 * stub `{ rows: [], truncated: false, durationMs: 0, templateVersion: "1.0" }`
 * with a real lookup against `ags_query_templates` + parameterized
 * SQL execution via the underlying pg pool.
 *
 * Locks:
 * - Lookup by `templateKey`; prefer `graphBackend="postgres"` variant.
 * - Require `readOnly=true` on the row (defense-in-depth).
 * - Resolve positional bind args from `parameter_schema.ordered`
 *   (falls back to sorted Object.keys for legacy rows).
 * - Use the drizzle `$client.query(text, values)` escape hatch for
 *   positional binding (drizzle `sql.raw` doesn't bind).
 * - Clamp result count at template.maxResults.
 *
 * Source-scan pattern — no DB, no boot.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const REPO_PATH = join(
  process.cwd(),
  "server/agent-studio/services/graph/repository/postgres-graph-repository-asdb.ts",
);

describe("AsdbPostgresGraphRepository.executeTemplate — source-scan", () => {
  const src = readFileSync(REPO_PATH, "utf8");
  const start = src.indexOf("async executeTemplate(");
  expect(start).toBeGreaterThan(-1);
  const afterStart = src.indexOf("\n  async ", start + 1);
  const end = afterStart === -1 ? src.length : afterStart;
  const method = src.slice(start, end);

  it("no longer ships the empty-rows stub", () => {
    expect(method).not.toMatch(
      /return\s*\{\s*rows:\s*\[\],\s*truncated:\s*false,\s*durationMs:\s*0,\s*templateVersion:\s*["']1\.0["']\s*\}/,
    );
  });

  it("looks up the template in ags_query_templates by templateKey", () => {
    expect(src).toMatch(
      /from\s+["'][^"']*agent-studio-graph-skill[^"']*["']/,
    );
    expect(method).toMatch(/agsQueryTemplates/);
    expect(method).toMatch(/eq\(agsQueryTemplates\.templateKey, input\.templateKey\)/);
  });

  it("prefers a postgres-backend variant; legacy rows fall through", () => {
    expect(method).toMatch(/candidates\.find\(\(t\) => t\.graphBackend === ["']postgres["']\)/);
    expect(method).toMatch(/\?\?\s*candidates\[0\]/);
  });

  it("throws with operator-actionable error on missing template", () => {
    expect(method).toMatch(/not found in ags_query_templates/);
  });

  it("rejects templates not configured for the postgres backend", () => {
    expect(method).toMatch(/is bound to backend "/);
    expect(method).toMatch(/graph_backend='postgres'/);
  });

  it("requires readOnly = true (defense-in-depth)", () => {
    expect(method).toMatch(/if \(!template\.readOnly\)/);
    expect(method).toMatch(/mutating templates are forbidden/);
  });

  it("resolves bind args from parameter_schema.ordered then alphabetical fallback", () => {
    expect(method).toMatch(/schema\.ordered/);
    expect(method).toMatch(/Object\.keys\(input\.parameters \?\? \{\}\)\.sort\(\)/);
  });

  it("uses the underlying pg client for positional binding", () => {
    expect(method).toMatch(/\$client\?\:/);
    expect(method).toMatch(/client\.query\(template\.cypherBody, values\)/);
  });

  it("surfaces an operator-actionable error if $client is unavailable", () => {
    expect(method).toMatch(/drizzle\.\$client not exposed/);
  });

  it("clamps result count at template.maxResults and reports truncated", () => {
    expect(method).toMatch(/rows\.slice\(0, maxResults\)/);
    expect(method).toMatch(/truncated:\s*rows\.length > maxResults/);
  });

  it("computes durationMs from startedAt -> Date.now()", () => {
    expect(method).toMatch(/const startedAt = Date\.now\(\)/);
    expect(method).toMatch(/durationMs:\s*Date\.now\(\) - startedAt/);
  });
});
