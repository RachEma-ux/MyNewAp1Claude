/**
 * C1-c5 (cycle-5 audit `/sdcard/Download/MCP_DISPATCHER_AUDIT_2026-05-09.md`
 * §C1-c5) — lockstep source-scan asserting every production dispatch
 * site passes `runtimeRunId` to `dispatchMcpToolCall`.
 *
 * Pre-cycle-5: `chat-stream.ts:579` omitted `runtimeRunId`. The dispatcher's
 * `writeAuditRow()` (server/agent-studio/services/mcp/dispatcher.ts:259)
 * returns `undefined` when `runtimeRunId == null`, silently skipping the
 * `agsRuntimePolicyEvents` insert. Result: every live-chat tool dispatch
 * produced a trace row but ZERO governance-audit-ledger rows. C1-c5
 * threaded `sessionId` as `runtimeRunId` so the audit row writes; this
 * test locks the invariant so a future PR cannot silently re-introduce
 * the gap by removing the field.
 *
 * Inventory of `dispatchMcpToolCall(` call sites (cycle-5 baseline):
 *   - server/agent-studio/chat-stream.ts                  → MUST pass runtimeRunId
 *   - server/agent-studio/services/chat.ts                → MUST pass runtimeRunId
 *   - server/agent-studio/services/simulation.ts          → MUST pass runtimeRunId
 *   - server/agent-studio/services/mcp/mcp-manager.ts     → ad-hoc operator-manual-test
 *                                                            path (`source: "manual_test"`),
 *                                                            no runtimeRunId by design;
 *                                                            ALLOWLISTED below.
 *
 * If a future PR adds a new `dispatchMcpToolCall` call site, this test
 * fails. The fix is either (a) add `runtimeRunId:` to that call (production
 * path), or (b) add the file to ALLOWED_AD_HOC_FILES with documented
 * justification (operator-only ad-hoc surface, like mcp-manager's
 * testTool).
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join, sep } from "path";

const SCAN_ROOT = join(process.cwd(), "server/agent-studio");
const SKIP_DIRS = new Set([
  "__tests__", // test files don't count
  "node_modules",
]);

// Files that legitimately call `dispatchMcpToolCall` WITHOUT `runtimeRunId`.
// Add to this allowlist only with documented justification (see file header).
const ALLOWED_AD_HOC_FILES: ReadonlySet<string> = new Set([
  // Operator-facing manual-test path (`agentStudio.mcpRegistry.testTool`).
  // Source: "manual_test"; no runtime run is associated with the operator
  // click. The dispatch result IS surfaced to the operator UI; audit-ledger
  // gap is acceptable for this surface (operator initiated the test
  // themselves).
  "server/agent-studio/services/mcp/mcp-manager.ts",
]);

// File where `dispatchMcpToolCall` is *defined* (not called). The regex
// `dispatchMcpToolCall\s*\(` matches the function declaration too; exclude
// the source file from the scan so the declaration doesn't false-positive.
const DISPATCHER_DEFINITION_FILE =
  "server/agent-studio/services/mcp/dispatcher.ts";

function walkTsFiles(dir: string): string[] {
  const out: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    let stat;
    try {
      stat = statSync(full);
    } catch {
      continue;
    }
    if (stat.isDirectory()) {
      out.push(...walkTsFiles(full));
    } else if (
      stat.isFile() &&
      name.endsWith(".ts") &&
      !name.endsWith(".test.ts") &&
      !name.endsWith(".d.ts")
    ) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Find every `dispatchMcpToolCall(` invocation block in a source file
 * and check whether `runtimeRunId` appears within the call's argument
 * list. The argument list is delimited by the matching `)` of the
 * opening `(` — count parens to handle nested object literals + calls.
 */
/**
 * Replace block comments (`/* ... *\/`) and single-line comments (`// ...`)
 * with same-length whitespace so byte offsets stay aligned for accurate
 * line-number reporting. Comment matches in JSDoc (e.g. the boundary-rule
 * header in `services/graph-agent/engine.ts:7`) and inline doc refs (e.g.
 * `chat-stream.ts:1174`) would otherwise trip the dispatch-pattern regex
 * even though no real call exists there.
 */
function stripCommentsPreservingOffsets(src: string): string {
  let out = "";
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    const next = src[i + 1];
    if (ch === "/" && next === "*") {
      const end = src.indexOf("*/", i + 2);
      const stop = end === -1 ? src.length : end + 2;
      for (let k = i; k < stop; k++) {
        out += src[k] === "\n" ? "\n" : " ";
      }
      i = stop;
    } else if (ch === "/" && next === "/") {
      let k = i;
      while (k < src.length && src[k] !== "\n") {
        out += " ";
        k++;
      }
      i = k;
    } else {
      out += ch;
      i++;
    }
  }
  return out;
}

function dispatchCallSitesMissingRuntimeRunId(src: string): string[] {
  const scanSrc = stripCommentsPreservingOffsets(src);
  const violations: string[] = [];
  const callPattern = /dispatchMcpToolCall\s*\(/g;
  let match;
  while ((match = callPattern.exec(scanSrc)) !== null) {
    const startIdx = match.index;
    const openParenIdx = startIdx + match[0].length - 1;
    let depth = 1;
    let i = openParenIdx + 1;
    while (i < scanSrc.length && depth > 0) {
      const ch = scanSrc[i];
      if (ch === "(") depth++;
      else if (ch === ")") depth--;
      i++;
    }
    if (depth !== 0) continue; // unbalanced — skip
    const argBlock = scanSrc.slice(openParenIdx + 1, i - 1);
    if (!/\bruntimeRunId\b/.test(argBlock)) {
      // Capture the line number of the call for the error message.
      const lineNum = scanSrc.slice(0, startIdx).split("\n").length;
      violations.push(`line ${lineNum}`);
    }
  }
  return violations;
}

describe("dispatcher audit coverage — C1-c5 lockstep", () => {
  it("every production dispatchMcpToolCall call site passes runtimeRunId", () => {
    const files = walkTsFiles(SCAN_ROOT);
    expect(files.length).toBeGreaterThan(0);

    const violations: string[] = [];
    for (const file of files) {
      const rel = file.split(SCAN_ROOT + sep)[1]?.split(sep).join("/") ?? file;
      const repoRel = `server/agent-studio/${rel}`;
      if (ALLOWED_AD_HOC_FILES.has(repoRel)) continue;
      if (repoRel === DISPATCHER_DEFINITION_FILE) continue;

      const src = readFileSync(file, "utf8");
      if (!src.includes("dispatchMcpToolCall(")) continue;

      const missing = dispatchCallSitesMissingRuntimeRunId(src);
      for (const loc of missing) {
        violations.push(`${repoRel}:${loc}`);
      }
    }

    expect(
      violations,
      `C1-c5 violation: dispatchMcpToolCall call site(s) without runtimeRunId. ` +
        `The dispatcher's writeAuditRow() returns undefined when runtimeRunId is ` +
        `null, silently skipping the agsRuntimePolicyEvents insert. Either thread ` +
        `the runtime-run surrogate (sessionId or runtimeRun.id) into the call, ` +
        `OR add the file to ALLOWED_AD_HOC_FILES with documented justification:\n  ${violations.join("\n  ")}`,
    ).toEqual([]);
  });
});
