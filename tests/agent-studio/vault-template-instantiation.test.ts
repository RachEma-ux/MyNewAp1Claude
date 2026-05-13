// Vault template-instantiation ledger unit tests.
//
// V1+ Phase 15-α. Covers:
//   - `computeTemplateDigest()` purity / determinism / sensitivity
//   - service-layer fall-through when ASDB is unavailable
//   - record + list helpers no-op shape (live-ASDB persistence
//     belongs to the integration suite, V1.5 scope)
//   - source-scan boundary: no graph mutation imports, no raw env
//     reads in the service body.

import { describe, expect, it, vi } from "vitest";

vi.mock("../../server/agent-studio/db/connection.js", () => ({
  getAsDb: () => null,
}));

import {
  computeTemplateDigest,
  countDistinctDigestsForTemplate,
  listInstantiationsByNote,
  listInstantiationsByTemplate,
  recordTemplateInstantiation,
} from "../../server/agent-studio/services/vault/template-instantiations.js";

describe("computeTemplateDigest (pure)", () => {
  it("returns sha256 hex (64 chars)", () => {
    const d = computeTemplateDigest("hello");
    expect(d).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic for the same input", () => {
    const a = computeTemplateDigest("# Heading\n\nbody");
    const b = computeTemplateDigest("# Heading\n\nbody");
    expect(a).toBe(b);
  });

  it("changes when content changes (single char)", () => {
    const a = computeTemplateDigest("# Heading\n\nbody");
    const b = computeTemplateDigest("# Heading\n\nbody!");
    expect(a).not.toBe(b);
  });

  it("differs for empty vs whitespace input", () => {
    expect(computeTemplateDigest("")).not.toBe(computeTemplateDigest(" "));
  });

  it("matches the canonical sha256 hex of the input bytes (sanity)", () => {
    // sha256("a") canonical hex.
    expect(computeTemplateDigest("a")).toBe(
      "ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb",
    );
  });
});

describe("template-instantiation service (ASDB unavailable fall-through)", () => {
  it("recordTemplateInstantiation returns null when no DB", async () => {
    const result = await recordTemplateInstantiation({
      templateId: 1,
      noteId: 2,
      templateVersionDigest: computeTemplateDigest("x"),
    });
    expect(result).toBeNull();
  });

  it("listInstantiationsByTemplate returns [] when no DB", async () => {
    expect(await listInstantiationsByTemplate(1)).toEqual([]);
  });

  it("listInstantiationsByNote returns [] when no DB", async () => {
    expect(await listInstantiationsByNote(1)).toEqual([]);
  });

  it("countDistinctDigestsForTemplate returns 0 when no DB", async () => {
    expect(await countDistinctDigestsForTemplate(1)).toBe(0);
  });
});

describe("template-instantiation service — hard-rule boundary scan", () => {
  it("service body must NOT reference process.env.*_API_KEY", async () => {
    const { readFileSync } = await import("node:fs");
    const path = await import("node:path");
    const src = readFileSync(
      path.join(
        __dirname,
        "..",
        "..",
        "server/agent-studio/services/vault/template-instantiations.ts",
      ),
      "utf8",
    );
    const code = src
      .split("\n")
      .filter((l) => !/^\s*\*?\s*\/\//.test(l) && !/^\s*\*/.test(l))
      .join("\n");
    expect(/process\.env\.[A-Z_]+_API_KEY/.exec(code)).toBeNull();
  });

  it("service body must NOT import neo4j-driver or any graph repository", async () => {
    const { readFileSync } = await import("node:fs");
    const path = await import("node:path");
    const src = readFileSync(
      path.join(
        __dirname,
        "..",
        "..",
        "server/agent-studio/services/vault/template-instantiations.ts",
      ),
      "utf8",
    );
    expect(src).not.toMatch(/from\s+["']neo4j-driver["']/);
    expect(src).not.toMatch(/services\/graph\/repository/);
  });

  it("router.ts createNoteFromTemplate calls recordTemplateInstantiation", async () => {
    const { readFileSync } = await import("node:fs");
    const path = await import("node:path");
    const src = readFileSync(
      path.join(
        __dirname,
        "..",
        "..",
        "server/agent-studio/services/vault/router.ts",
      ),
      "utf8",
    );
    // Importer:
    expect(src).toMatch(
      /import\s*\{[^}]*recordTemplateInstantiation[^}]*\}\s*from\s*["'][^"']*template-instantiations/,
    );
    // Caller — the actual invocation inside the mutation body.
    expect(src).toMatch(/recordTemplateInstantiation\s*\(/);
  });
});
