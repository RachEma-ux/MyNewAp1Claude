/**
 * T-G.2.2 — Code Graph parser wired against tree-sitter.
 *
 * Source-scan test that locks the production shape of
 * `server/agent-studio/services/code-graph/parser/` after T-G.2.2:
 *
 *   - `tree-sitter-emitter.ts` exists, imports tree-sitter +
 *     tree-sitter-typescript, and emits canonical lower-snake-case
 *     typeKeys (`file`, `class`, `function`, `api_endpoint` /
 *     `imports`, `calls`, `declares`).
 *   - `code-graph-parser.ts` factory delegates to the emitter and
 *     catches parser-internal failures, surfacing them as
 *     `ParseError` rows (T-E.5 carry-forward).
 *   - The factory file itself does NOT import tree-sitter (the
 *     native binding is isolated to the emitter so callers without
 *     it can still compile against the surface).
 *
 * Why source-scan and not behavioral:
 *   - `tree-sitter` is a native dep that doesn't build on every
 *     dev environment (e.g., Termux). CI exercises the real
 *     parsing path; the source-scan here is the boundary +
 *     wiring lock.
 *
 * Behavioral correctness of the spike's strict-subset emitter
 * shape is already proven by the T-E measurement transcripts at
 * `docs/implementation/agent-studio-code-graph-parser-spike-measurement-2026-05-17.md`.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

const repoRoot = resolve(__dirname, "../..");
const parserDir = resolve(
  repoRoot,
  "server/agent-studio/services/code-graph/parser",
);

function read(rel: string): string {
  return readFileSync(resolve(parserDir, rel), "utf8");
}

describe("T-G.2.2 — Code Graph parser wired against tree-sitter", () => {
  it("tree-sitter-emitter.ts exists alongside the factory", () => {
    expect(existsSync(resolve(parserDir, "tree-sitter-emitter.ts"))).toBe(true);
    expect(existsSync(resolve(parserDir, "code-graph-parser.ts"))).toBe(true);
  });

  it("tree-sitter-emitter.ts imports tree-sitter + tree-sitter-typescript", () => {
    const src = read("tree-sitter-emitter.ts");
    expect(src).toMatch(/import\s+Parser[\s\S]*from\s+["']tree-sitter["']/);
    expect(src).toMatch(/import\s+TypeScript\s+from\s+["']tree-sitter-typescript["']/);
  });

  it("tree-sitter-emitter.ts exports emitFromTypeScriptSource(filePath, source)", () => {
    const src = read("tree-sitter-emitter.ts");
    expect(src).toMatch(
      /export\s+function\s+emitFromTypeScriptSource\(\s*filePath:\s*string,\s*source:\s*string,?\s*\):\s*TreeSitterEmitResult/,
    );
  });

  it("emitter uses canonical lower-snake-case node typeKeys (file/class/function/api_endpoint)", () => {
    const src = read("tree-sitter-emitter.ts");
    expect(src).toMatch(/typeKey:\s*"file"/);
    expect(src).toMatch(/typeKey:\s*"class"/);
    // function / api_endpoint are written as a typed union literal
    expect(src).toMatch(/"function"\s*\|\s*"api_endpoint"/);
    // Negative: spike's PascalCase typeKeys MUST be gone
    expect(src).not.toMatch(/typeKey:\s*"File"/);
    expect(src).not.toMatch(/typeKey:\s*"Function"/);
  });

  it("emitter uses canonical lower-snake-case edge typeKeys (imports/calls/declares)", () => {
    const src = read("tree-sitter-emitter.ts");
    expect(src).toMatch(/edgeTypeKey:\s*"imports"/);
    expect(src).toMatch(/edgeTypeKey:\s*"calls"/);
    expect(src).toMatch(/edgeTypeKey:\s*"declares"/);
    // Negative: spike's SCREAMING_SNAKE_CASE edge types MUST be gone
    expect(src).not.toMatch(/edgeTypeKey:\s*"IMPORTS"/);
    expect(src).not.toMatch(/edgeTypeKey:\s*"DECLARES"/);
  });

  it("emitter drops the spike's EXPORTS edge type (not in production 10-edge taxonomy)", () => {
    const src = read("tree-sitter-emitter.ts");
    expect(src).not.toMatch(/edgeTypeKey:\s*"exports"/i);
    expect(src).not.toMatch(/type:\s*"EXPORTS"/);
  });

  it("emitter detects tRPC procedures via Procedure.{input|mutation|query} regex", () => {
    const src = read("tree-sitter-emitter.ts");
    expect(src).toMatch(/TRPC_PROCEDURE_REGEX[\s\S]*Procedure[\s\S]*input\|mutation\|query/);
  });

  it("code-graph-parser.ts factory file does NOT import tree-sitter directly", () => {
    const src = read("code-graph-parser.ts");
    expect(src).not.toMatch(/from\s+["']tree-sitter["']/);
    expect(src).not.toMatch(/from\s+["']tree-sitter-typescript["']/);
  });

  it("code-graph-parser.ts factory delegates to emitFromTypeScriptSource", () => {
    const src = read("code-graph-parser.ts");
    expect(src).toMatch(/import\s*\{\s*emitFromTypeScriptSource\s*\}\s*from\s+["']\.\/tree-sitter-emitter\.js["']/);
    expect(src).toMatch(/emitFromTypeScriptSource\(filePath,\s*source\)/);
  });

  it("factory wraps the emitter in try/catch + returns ParseError on throw (T-E.5 tolerance)", () => {
    const src = read("code-graph-parser.ts");
    expect(src).toMatch(/try\s*\{[\s\S]*emitFromTypeScriptSource[\s\S]*\}\s*catch/);
    expect(src).toMatch(/reason:\s*ParseError\["reason"\]/);
    expect(src).toMatch(/"file_too_large"|"parser_internal_error"/);
  });

  it("factory placeholder string from T-G.2.1 is GONE (regression guard)", () => {
    const src = read("code-graph-parser.ts");
    expect(src).not.toMatch(
      /CodeGraphParser is the T-G\.2\.1 interface contract only/,
    );
  });
});
