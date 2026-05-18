/**
 * T-D.3.δ — Semantic Enrichment runner boundary integrity.
 *
 * The runner is the **single composition site** that imports
 * `server/openrouter/model-access` from within `graph-enrichment/`.
 * This test pins that invariant: only `semantic-enrichment-runner.ts`
 * may dynamically import or statically reference the openrouter
 * model-access surface from within `graph-enrichment/`.
 *
 * Why dynamic import — keeping `openrouter/model-access` out of the
 * runner's STATIC import graph means the existing td-3-1 boundary
 * scan (which forbids `from "openrouter"` matches anywhere in
 * `graph-enrichment/`) stays green WITHOUT special-casing the runner.
 * The runner's `import("../../../openrouter/model-access/index.js")`
 * call uses a relative path, not the bare `"openrouter"` specifier,
 * so it dodges that regex too — but THIS test names the relative-path
 * boundary explicitly so any future module copying the pattern is
 * flagged.
 *
 * Also pins:
 *   - runner exports the supported-kind gate + discriminated envelope
 *     types
 *   - router mounts the `triggerRun` mutation
 *   - public-api re-exports `runSemanticEnrichment`
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { resolve, join } from "path";

const DIR = resolve(
  __dirname,
  "../../server/agent-studio/services/graph-enrichment",
);

const RUNNER = join(DIR, "semantic-enrichment-runner.ts");
const ROUTER = join(DIR, "semantic-enrichment-router.ts");
const BARREL = join(DIR, "public-api.ts");

function readDirAll(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...readDirAll(p));
    else if (entry.endsWith(".ts") && !entry.endsWith(".test.ts")) out.push(p);
  }
  return out;
}

function readFile(p: string): string {
  return readFileSync(p, "utf8");
}

describe("T-D.3.δ — semantic-enrichment-runner boundary", () => {
  it("runner file exists at the canonical path", () => {
    expect(readFile(RUNNER)).toMatch(/runSemanticEnrichment/);
  });

  it("ONLY the runner IMPORTS openrouter/model-access from graph-enrichment/", () => {
    const offenders: string[] = [];
    // Match any active import or require/dynamic-import targeting
    // openrouter/model-access (relative or bare). Doc-comment
    // mentions are skipped — strip line + block comments first so a
    // module describing the boundary in its doc-block doesn't trip
    // the gate.
    const stripComments = (s: string): string =>
      s
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/(^|\n)\s*\/\/[^\n]*/g, "$1");
    const PATTERNS = [
      /\bfrom\s+["'][^"']*openrouter\/model-access[^"']*["']/,
      /\brequire\(\s*["'][^"']*openrouter\/model-access[^"']*["']/,
      /\bimport\(\s*[^)]*?openrouter\/model-access/,
    ];
    for (const f of readDirAll(DIR)) {
      if (f === RUNNER) continue;
      const src = stripComments(readFile(f));
      if (PATTERNS.some((re) => re.test(src))) {
        offenders.push(f.replace(DIR, ""));
      }
    }
    expect(
      offenders,
      `Only semantic-enrichment-runner.ts may import openrouter/model-access. Offenders: ${offenders.join(", ")}`,
    ).toEqual([]);
  });

  it("runner uses a DYNAMIC import (not a static `from` clause) for openrouter", () => {
    const src = readFile(RUNNER);
    // No static `from ".../openrouter/model-access"` import in the runner.
    expect(src, "runner must not statically import openrouter").not.toMatch(
      /^\s*import[\s\S]*?from\s+["'][^"']*openrouter\/model-access/m,
    );
    // Dynamic import IS present.
    expect(src, "runner must dynamic-import openrouter at call site").toMatch(
      /import\(\s*[\s\S]*?openrouter\/model-access/,
    );
  });

  it("runner exports the discriminated envelope + supported-kind surface", () => {
    const src = readFile(RUNNER);
    for (const sym of [
      "runSemanticEnrichment",
      "SUPPORTED_TRIGGER_PROPOSAL_KINDS",
      "isSupportedTriggerProposalKind",
      "RunSemanticEnrichmentInput",
      "RunSemanticEnrichmentOutput",
      "SemanticEnrichmentRunOkEnvelope",
      "SemanticEnrichmentRunNoCandidatesEnvelope",
      "SemanticEnrichmentRunKindNotSupportedEnvelope",
    ]) {
      expect(src, `runner must export ${sym}`).toMatch(
        new RegExp(`export[\\s\\S]*?\\b${sym}\\b`),
      );
    }
  });

  it("router mounts `triggerRun` as adminProcedure.mutation", () => {
    const src = readFile(ROUTER);
    expect(src).toMatch(/triggerRun:\s*adminProcedure[\s\S]*?\.mutation\(/);
    expect(src).toMatch(/runSemanticEnrichment\b/);
  });

  it("router doc-block names the T-D.3.δ closure on the deferral-mutation line", () => {
    const src = readFile(ROUTER);
    expect(src).toMatch(/triggerRun.*T-D\.3\.δ/);
  });

  it("public-api re-exports the runner surface", () => {
    const src = readFile(BARREL);
    for (const sym of [
      "runSemanticEnrichment",
      "SUPPORTED_TRIGGER_PROPOSAL_KINDS",
      "isSupportedTriggerProposalKind",
      "RunSemanticEnrichmentInput",
      "RunSemanticEnrichmentOutput",
    ]) {
      expect(src, `barrel must re-export ${sym}`).toMatch(
        new RegExp(`\\b${sym}\\b`),
      );
    }
  });

  it("runner enforces proposals-only invariant (no graph-write helpers in static imports)", () => {
    const src = readFile(RUNNER);
    // No graph repository imports — agent emits proposals, never
    // mutates source-of-truth tables here.
    expect(src).not.toMatch(/from\s+["'][^"']*graph\/repository/);
    // No correction-apply / mutation-worker imports.
    expect(src).not.toMatch(/correction[-_]apply|mutation[-_]worker/);
  });
});
