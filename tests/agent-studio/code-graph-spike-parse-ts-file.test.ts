/**
 * Code Graph Parser Spike — T-E.2 emitter structural tests.
 *
 * Source-scan only. The actual emitter `parseTsFile` requires
 * `tree-sitter` to be installed; verifying its runtime behavior
 * happens in CI after `npm install` resolves the native dep.
 * These tests lock the source shape so the emitter can't drift
 * away from the spike doc §3 strict-subset model without tripping.
 *
 * Locked invariants:
 *   - Function signature `parseTsFile(filePath: string, source: string): CodeGraphEmit`
 *   - Node-type union exactly matches doc §3 (Repository / File /
 *     Class / Function / ApiEndpoint)
 *   - Edge-type union exactly matches doc §3 (DECLARES / IMPORTS /
 *     CALLS / EXPORTS)
 *   - tRPC ApiEndpoint detection uses the regex named in doc §3
 *   - Sample-ingest script exports `aggregate` + `summarize` for
 *     T-E.3 to import + measure separately
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

function readEmitter(): string {
  return readFileSync(
    resolve(
      __dirname,
      "../../server/agent-studio/services/code-graph/spike/parse-ts-file.ts",
    ),
    "utf8",
  );
}

function readSampleIngest(): string {
  return readFileSync(
    resolve(
      __dirname,
      "../../server/agent-studio/services/code-graph/spike/run-sample-ingest.ts",
    ),
    "utf8",
  );
}

describe("T-E.2 — Code Graph Spike emitter (parse-ts-file.ts)", () => {
  it("exports parseTsFile with (filePath, source) → CodeGraphEmit signature", () => {
    const src = readEmitter();
    expect(src).toMatch(
      /export\s+function\s+parseTsFile\s*\(\s*filePath\s*:\s*string\s*,\s*source\s*:\s*string\s*,?\s*\)\s*:\s*CodeGraphEmit/,
    );
  });

  it("CodeGraphNodeType union matches spike doc §3 (Repository / File / Class / Function / ApiEndpoint)", () => {
    const src = readEmitter();
    expect(src).toMatch(
      /export\s+type\s+CodeGraphNodeType\s*=\s*\|\s*"Repository"\s*\|\s*"File"\s*\|\s*"Class"\s*\|\s*"Function"\s*\|\s*"ApiEndpoint"\s*;/,
    );
  });

  it("CodeGraphEdgeType union matches spike doc §3 (DECLARES / IMPORTS / CALLS / EXPORTS)", () => {
    const src = readEmitter();
    expect(src).toMatch(
      /export\s+type\s+CodeGraphEdgeType\s*=\s*"DECLARES"\s*\|\s*"IMPORTS"\s*\|\s*"CALLS"\s*\|\s*"EXPORTS"\s*;/,
    );
  });

  it("tRPC ApiEndpoint detection uses Procedure.<method> regex named in doc §3", () => {
    const src = readEmitter();
    expect(src).toMatch(
      /TRPC_PROCEDURE_REGEX\s*=\s*\/Procedure\\s\*\\\.\\s\*\(input\|mutation\|query\)\\b\//,
    );
  });

  it("collectImport emits IMPORTS edge with source = file and target = raw specifier", () => {
    const src = readEmitter();
    expect(src).toMatch(
      /edges\.push\(\{\s*type:\s*"IMPORTS"\s*,\s*sourceId:\s*fileId\s*,\s*targetId:\s*target\s*\}\)/,
    );
  });

  it("collectClass emits Class node + DECLARES edge from file", () => {
    const src = readEmitter();
    expect(src).toMatch(
      /nodes\.push\(\{\s*type:\s*"Class"\s*,\s*id:\s*classId\s*,\s*label:\s*name\s*\}\)/,
    );
    expect(src).toMatch(
      /edges\.push\(\{\s*type:\s*"DECLARES"\s*,\s*sourceId:\s*fileId\s*,\s*targetId:\s*classId\s*\}\)/,
    );
  });

  it("collectCalls walks call_expression nodes and emits CALLS edges to callee names", () => {
    const src = readEmitter();
    expect(src).toMatch(/descendantsOfType\("call_expression"\)/);
    expect(src).toMatch(
      /edges\.push\(\{\s*type:\s*"CALLS"\s*,\s*sourceId:\s*enclosingFnId\s*,\s*targetId:\s*calleeName\s*,?\s*\}\)/,
    );
  });

  it("walks lexical_declaration / variable_declaration for arrow-function consts (covers `const foo = () => …`)", () => {
    const src = readEmitter();
    expect(src).toMatch(/case\s+"lexical_declaration":/);
    expect(src).toMatch(/case\s+"variable_declaration":/);
    expect(src).toMatch(/collectArrowFunctionConst\(/);
  });
});

describe("T-E.2 — Code Graph Spike sample-ingest (run-sample-ingest.ts)", () => {
  it("targets services/extensions/ per spike doc §2 sample-ingest scope", () => {
    const src = readSampleIngest();
    expect(src).toMatch(
      /SPIKE_TARGET_DIR\s*=\s*"server\/agent-studio\/services\/extensions"/,
    );
  });

  it("imports parseTsFile from sibling spike file", () => {
    const src = readSampleIngest();
    expect(src).toMatch(/from\s+["']\.\/parse-ts-file\.js["']/);
  });

  it("exports aggregate + summarize for separate measurement in T-E.3", () => {
    const src = readSampleIngest();
    expect(src).toMatch(
      /export\s+\{\s*aggregate\s*,\s*summarize\s*,\s*REPO_ROOT\s*,\s*SPIKE_TARGET_DIR\s*\}/,
    );
  });

  it("computes parse-time p50 + p95 for the T-E.4 performance gate", () => {
    const src = readSampleIngest();
    expect(src).toMatch(/quantile\(sortedMs,\s*0\.5\)/);
    expect(src).toMatch(/quantile\(sortedMs,\s*0\.95\)/);
  });

  it("does NOT import neo4j-driver (spike is parse-only; projection is T-E.3)", () => {
    const src = readSampleIngest();
    expect(src).not.toMatch(/from\s+["']neo4j-driver["']/);
  });

  it("does NOT read process.env.*_API_KEY (parsing is local-CPU per doc §5)", () => {
    const src = readSampleIngest();
    expect(src).not.toMatch(/process\.env\.[A-Z_]+_API_KEY/);
  });
});

describe("T-E.2 — package.json dep wiring", () => {
  it("tree-sitter + tree-sitter-typescript listed in devDependencies", () => {
    const pkg = JSON.parse(
      readFileSync(resolve(__dirname, "../../package.json"), "utf8"),
    );
    expect(pkg.devDependencies?.["tree-sitter"]).toBeDefined();
    expect(pkg.devDependencies?.["tree-sitter-typescript"]).toBeDefined();
  });

  it("tree-sitter NOT in production dependencies (spike-only)", () => {
    const pkg = JSON.parse(
      readFileSync(resolve(__dirname, "../../package.json"), "utf8"),
    );
    expect(pkg.dependencies?.["tree-sitter"]).toBeUndefined();
    expect(pkg.dependencies?.["tree-sitter-typescript"]).toBeUndefined();
  });
});
