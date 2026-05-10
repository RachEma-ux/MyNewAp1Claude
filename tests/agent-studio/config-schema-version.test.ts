/**
 * Phase 6 (Roadmap V3) — runtime config schema versioning.
 *
 * Locks the validator + stamper helpers + the write-boundary wiring
 * in `repository.updateDraft`. Pure-surface unit tests for the
 * helpers; source-scan invariants for the wiring (no DB, no network).
 *
 * The 9 governed config blocks live on `agsAgentDrafts` as jsonb:
 *   memoryConfig, knowledgeConfig, workflowConfig, governancePolicy,
 *   runtimeConfig, simulationDefaults, providerConfig, scheduleConfig,
 *   statusLineConfig.
 *
 * The Phase 6 contract:
 *   - Existing unstamped rows are tolerated (treated as 1.0.0
 *     implicit) so no DB migration is required.
 *   - Writes through `updateDraft` reject any block carrying an
 *     unsupported `schemaVersion` and stamp every present block.
 *   - The stamp is idempotent — re-writing an already-stamped block
 *     preserves the existing version.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  RUNTIME_CONFIG_SCHEMA_VERSION,
  RUNTIME_CONFIG_BLOCK_NAMES,
  SUPPORTED_RUNTIME_CONFIG_VERSIONS,
  validateConfigSchemaVersion,
  stampConfigSchemaVersion,
  assertConfigSchemaVersion,
} from "../../server/agent-studio/services/runtime/config-schema-version";

const REPO_ROOT = process.cwd();
const REPOSITORY = readFileSync(
  join(REPO_ROOT, "server/agent-studio/repository.ts"),
  "utf8",
);
const SCHEMA_FILE = readFileSync(
  join(REPO_ROOT, "drizzle/tables/agent-studio.ts"),
  "utf8",
);

describe("Phase 6 — config schema version contract", () => {
  describe("constants", () => {
    it("RUNTIME_CONFIG_SCHEMA_VERSION starts at 1.0.0", () => {
      expect(RUNTIME_CONFIG_SCHEMA_VERSION).toBe("1.0.0");
    });

    it("SUPPORTED_RUNTIME_CONFIG_VERSIONS contains the canonical version", () => {
      expect(SUPPORTED_RUNTIME_CONFIG_VERSIONS.has("1.0.0")).toBe(true);
    });

    it("RUNTIME_CONFIG_BLOCK_NAMES enumerates exactly 9 blocks (matches the agsAgentDrafts jsonb columns)", () => {
      // The roadmap §6 lists 9 blocks. Lock the count + each name so a
      // future PR that adds a 10th jsonb column to agsAgentDrafts
      // forces an explicit decision: include in Phase 6 enforcement
      // (add here) or document an exemption.
      expect(RUNTIME_CONFIG_BLOCK_NAMES).toHaveLength(9);
      expect([...RUNTIME_CONFIG_BLOCK_NAMES].sort()).toEqual(
        [
          "governancePolicy",
          "knowledgeConfig",
          "memoryConfig",
          "providerConfig",
          "runtimeConfig",
          "scheduleConfig",
          "simulationDefaults",
          "statusLineConfig",
          "workflowConfig",
        ].sort(),
      );
    });

    it("each governed block exists as a jsonb column on agsAgentDrafts", () => {
      // Source-scan: catches a future schema rename that drifts from
      // the runtime contract. If `governancePolicy` becomes
      // `governance_policy_v2`, this test fails with a useful message.
      for (const name of RUNTIME_CONFIG_BLOCK_NAMES) {
        // Drizzle declarations look like `governancePolicy: jsonb("governance_policy")`
        const re = new RegExp(`\\b${name}\\s*:\\s*jsonb\\(`);
        expect(SCHEMA_FILE).toMatch(re);
      }
    });
  });

  describe("validateConfigSchemaVersion", () => {
    it("missing schemaVersion is tolerated (existing-row backward compat)", () => {
      // Pre-Phase-6 rows have unstamped blocks. Treating missing as
      // 1.0.0 implicit lets the runtime read them without a one-shot
      // DB migration. They get stamped on next write.
      expect(validateConfigSchemaVersion({ rule: "x" })).toEqual({ ok: true });
    });

    it("explicit 1.0.0 passes", () => {
      expect(
        validateConfigSchemaVersion({ schemaVersion: "1.0.0", rule: "x" }),
      ).toEqual({ ok: true });
    });

    it("unsupported version rejected with structured reason", () => {
      const r = validateConfigSchemaVersion({ schemaVersion: "2.0.0" });
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.reason).toBe("schema_version_unsupported");
        expect(r.observedVersion).toBe("2.0.0");
      }
    });

    it("non-string schemaVersion rejected", () => {
      const r = validateConfigSchemaVersion({ schemaVersion: 1.0 });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toBe("schema_version_wrong_type");
    });

    it("non-object block rejected (null / array / primitive)", () => {
      expect(validateConfigSchemaVersion(null).ok).toBe(false);
      expect(validateConfigSchemaVersion([1, 2]).ok).toBe(false);
      expect(validateConfigSchemaVersion("oops").ok).toBe(false);
    });
  });

  describe("stampConfigSchemaVersion", () => {
    it("adds schemaVersion when missing", () => {
      const stamped = stampConfigSchemaVersion({ rule: "x" });
      expect(stamped.schemaVersion).toBe("1.0.0");
      expect(stamped.rule).toBe("x");
    });

    it("preserves a valid existing schemaVersion (idempotent)", () => {
      // Locks idempotency — re-stamping doesn't bump version. A future
      // 1.1.0 ship would require this test to be updated to match the
      // new canonical version, which is the intended forcing function.
      const stamped = stampConfigSchemaVersion({
        schemaVersion: "1.0.0",
        rule: "x",
      });
      expect(stamped.schemaVersion).toBe("1.0.0");
    });

    it("overwrites an unsupported existing schemaVersion (defensive)", () => {
      // If a block somehow arrives with a stale "2.0.0" stamp (data
      // corruption, bad seed) the stamper rewrites it to the canonical
      // version. The write-boundary's assertion catches the same case
      // FIRST in production — this is a belt-and-suspenders behavior.
      const stamped = stampConfigSchemaVersion({
        schemaVersion: "2.0.0",
        rule: "x",
      } as Record<string, unknown>);
      expect(stamped.schemaVersion).toBe("1.0.0");
    });

    it("treats null / undefined as empty object", () => {
      expect(stampConfigSchemaVersion(null).schemaVersion).toBe("1.0.0");
      expect(stampConfigSchemaVersion(undefined).schemaVersion).toBe("1.0.0");
    });

    it("does not mutate the input object", () => {
      const input: Record<string, unknown> = { rule: "x" };
      stampConfigSchemaVersion(input);
      expect(input).toEqual({ rule: "x" });
    });
  });

  describe("assertConfigSchemaVersion", () => {
    it("returns void on valid input", () => {
      expect(() =>
        assertConfigSchemaVersion(
          { schemaVersion: "1.0.0" },
          "governancePolicy",
        ),
      ).not.toThrow();
    });

    it("throws with stable error token on unsupported version", () => {
      // Forensics grep `[config_schema_schema_version_unsupported]`
      // in error messages to find rejected writes.
      expect(() =>
        assertConfigSchemaVersion(
          { schemaVersion: "9.9.9" },
          "providerConfig",
        ),
      ).toThrow(/\[config_schema_schema_version_unsupported\]/);
    });

    it("error message names the offending block", () => {
      expect(() =>
        assertConfigSchemaVersion({ schemaVersion: "9.9.9" }, "memoryConfig"),
      ).toThrow(/memoryConfig/);
    });
  });

  describe("write boundary wiring (repository.updateDraft)", () => {
    it("imports the schema-version module via dynamic import", () => {
      // Dynamic import keeps `updateDraft` lazy — the schema-version
      // module isn't pulled in unless a draft write actually happens.
      // Source-scan locks the import path so a future module move
      // doesn't break the wiring silently.
      expect(REPOSITORY).toMatch(
        /import\(["']\.\/services\/runtime\/config-schema-version["']\)/,
      );
    });

    it("calls assertConfigSchemaVersion before stampConfigSchemaVersion", () => {
      // Order matters: assert FIRST so an unsupported version throws
      // before the stamper would silently overwrite it. Catches a
      // future refactor that flips the order and turns the assertion
      // into a no-op.
      const assertIdx = REPOSITORY.indexOf("assertConfigSchemaVersion(");
      const stampIdx = REPOSITORY.indexOf("stampConfigSchemaVersion(");
      expect(assertIdx).toBeGreaterThan(0);
      expect(stampIdx).toBeGreaterThan(0);
      expect(assertIdx).toBeLessThan(stampIdx);
    });

    it("iterates over RUNTIME_CONFIG_BLOCK_NAMES (single source of truth)", () => {
      // The wiring loops through the canonical block-name list rather
      // than hard-coding 9 separate `if (patch.governancePolicy …)`
      // checks. A future block addition is automatically covered by
      // appending to the array — no repository.ts edit needed.
      expect(REPOSITORY).toMatch(
        /for\s*\(\s*const\s+\w+\s+of\s+RUNTIME_CONFIG_BLOCK_NAMES\s*\)/,
      );
    });

    it("stamps every present block (Phase 6 contract)", () => {
      // Lock the spread that merges stamped blocks back into safePatch.
      // A refactor that drops this spread would silently disable
      // stamping for all writes.
      expect(REPOSITORY).toMatch(
        /safePatch\s*=\s*\{\s*\.\.\.safePatch,\s*\.\.\.stamped\s*\}/,
      );
    });
  });
});
