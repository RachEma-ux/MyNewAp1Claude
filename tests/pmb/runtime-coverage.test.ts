/**
 * Plan v3 Phase 44 — runtime test coverage attestation.
 *
 * The EXECUTION_CHECKLIST Phase 44 lists ten runtime concerns that must
 * have working test coverage:
 *
 *   1. provider/model binding creation
 *   2. model access execution (with mock provider)
 *   3. Agent Studio test run with binding
 *   4. Agent Studio Expert chat path
 *   5. export candidate listing
 *   6. AI Types import
 *   7. catalog entry creation
 *   8. duplicate prevention
 *   9. event sync
 *  10. reconciliation
 *
 * Most of these already have rich coverage in module-local test files
 * landed across Phases 11–41. Phase 44 doesn't duplicate that work —
 * it codifies the *spec* by asserting each canonical test file exists,
 * is non-empty, and contains at least one named test case for the
 * concern. This catches the regression where someone deletes a
 * coverage file or strips its tests; the loud failure is the wake-up.
 *
 * Each entry below documents:
 *   - the EXECUTION_CHECKLIST line
 *   - the canonical test file
 *   - a marker string the file MUST contain (test name, describe label,
 *     or a function name unique to the concern). The marker is checked
 *     verbatim, so the test fails fast if a future PR renames the
 *     concept without updating this attestation.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync, statSync } from "fs";
import { join } from "path";

const REPO_ROOT = process.cwd();

interface CoverageSpec {
  /** EXECUTION_CHECKLIST concern this entry attests. */
  concern: string;
  /** Canonical test file (relative to repo root) that owns the coverage. */
  file: string;
  /**
   * Strings the file must contain. Use describe labels, test names, or
   * unique function references — they pin the file's intent without
   * being too brittle.
   */
  markers: string[];
}

const COVERAGE_SPEC: CoverageSpec[] = [
  {
    concern: "Phase 44.1 — provider/model binding creation",
    file: "server/agent-studio/bindings.test.ts",
    markers: ["upsertAgentProviderBinding", "binding_v1"],
  },
  {
    concern: "Phase 44.2 — model access execution with mock provider",
    file: "server/openrouter/model-access/execute.test.ts",
    markers: ["execute(", "ModelAccessResult"],
  },
  {
    concern: "Phase 44.3 — Agent Studio test run with binding",
    file: "server/agent-studio/services/test-run-binding.test.ts",
    markers: ["test-run", "binding"],
  },
  {
    concern: "Phase 44.4 — Agent Studio Expert chat path",
    file: "server/agent-studio/services/chat-binding.test.ts",
    markers: ["chat", "binding"],
  },
  {
    concern: "Phase 44.5 — export candidate listing",
    file: "server/agent-studio/services/export-catalog.test.ts",
    markers: ["listExportCandidates", "buildExportCandidate"],
  },
  {
    concern: "Phase 44.6 — AI Types import from Agent Studio",
    file: "server/ai-types/import-from-agent-studio.test.ts",
    markers: [
      "listImportableAgentStudioCandidates",
      "importAgentStudioCandidate",
    ],
  },
  {
    concern: "Phase 44.7 — catalog entry creation (canonical write path)",
    file: "server/ai-types/register.test.ts",
    markers: ["registerCatalogEntry", "creates a new catalog entry"],
  },
  {
    concern: "Phase 44.8 — duplicate prevention (legacy import classifier + register guard)",
    file: "server/ai-types/legacy-import.test.ts",
    markers: ["checkDuplicateLegacyImport", "would_duplicate_legacy"],
  },
  {
    concern:
      "Phase 44.9 — event sync (catalog.registered emitted from register, AS subscriber records sync log)",
    file: "server/agent-studio/services/catalog-sync-subscribers.test.ts",
    markers: ["processCatalogSyncEvent", "aiTypes.catalog.registered"],
  },
  {
    concern: "Phase 44.10 — reconciliation (bulk drift scan + per-row legacy override)",
    file: "server/agent-studio/services/export-catalog.test.ts",
    markers: [
      "reconcileExportCatalogSync",
      "missing_registered",
      "reconcileCandidateImports",
    ],
  },
];

function read(p: string): string {
  return readFileSync(join(REPO_ROOT, p), "utf8");
}

describe("Phase 44 — runtime test coverage attestation", () => {
  for (const spec of COVERAGE_SPEC) {
    describe(spec.concern, () => {
      it(`canonical test file exists at ${spec.file}`, () => {
        const abs = join(REPO_ROOT, spec.file);
        expect(existsSync(abs), `${spec.file} missing`).toBe(true);
        const size = statSync(abs).size;
        // Empty stub files don't count.
        expect(size, `${spec.file} is empty`).toBeGreaterThan(200);
      });

      for (const marker of spec.markers) {
        it(`contains marker "${marker}"`, () => {
          const src = read(spec.file);
          expect(src, `${spec.file} missing marker "${marker}"`).toContain(
            marker,
          );
        });
      }
    });
  }

  it("the canonical Phase 44 register-emit test exists for event sync (Phase 39 emit side)", () => {
    // Event sync has two halves: the AI Types emit path (Phase 39) and
    // the AS subscribe/record path (Phase 40). The COVERAGE_SPEC entry
    // above pins the AS side (catalog-sync-subscribers.test.ts);
    // this assertion pins the emit side.
    const src = read("server/ai-types/register.test.ts");
    expect(src).toContain("aiTypes.catalog.registered");
    expect(src).toContain("Phase 39");
  });

  it("Phase 44.10 reconciliation: catalog-side reconcileLegacyImport is also covered", () => {
    // Two reconciliation flows:
    //  - bulk sync drift (Phase 41, reconcileExportCatalogSync) — pinned above
    //  - per-row legacy unresolved override (Phase 24, reconcileLegacyImport)
    // The latter lives in legacy-import.test.ts.
    const src = read("server/ai-types/legacy-import.test.ts");
    expect(src).toContain("reconcileLegacyImport");
  });
});
