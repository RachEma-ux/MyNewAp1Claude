#!/usr/bin/env tsx
/**
 * check:runtime-boundaries
 *
 * Phase 4.5 of the Agent Studio Runtime Hardening Roadmap V3 — closes
 * **Definition-of-Done Gate 6 (Boundary Integrity, statically
 * enforced)**.
 *
 * Phase 1a §3 row 8 found four required static rules missing from the
 * existing boundary-lint set. This script adds them as Rules R1–R4.
 * The repo is currently clean by inspection — these rules are
 * regression-prevention, not regression-fixing.
 *
 * Rule R1 — No raw provider SDK in server/agent-studio/**
 *   Pre-cycle-29 the agent-studio runtime had a `runViaOpenAIDirect`
 *   path (chat.ts:36 doc-block records its deletion). All model
 *   execution now goes through OpenRouter Model Access. This rule
 *   forbids re-introducing a raw provider SDK by greping
 *   `import openai`, `import @anthropic-ai/sdk`, `import google-genai`
 *   under server/agent-studio/**. Allowlist: zero (the pure-clone
 *   public API of openrouter is the only acceptable model surface).
 *
 * Rule R2 — `validateRuntimeToolCall` precedes `dispatchMcpToolCall`
 *   on chat lanes. Pre-cycle-6 the chat-stream lane had a window where
 *   the validator was bypassed. The cross-flow lockstep (chat-stream
 *   ↔ chat.ts) was closed by C1-c6. This rule pins the invariant via
 *   per-file proximity check: in chat-stream.ts and chat.ts, every
 *   `dispatchMcpToolCall(` call must be preceded (in the same file) by
 *   at least one `validateRuntimeToolCall(` call. The simulation lane
 *   is intentionally exempt (Phase 1c §5 H1 — Phase 5c will close).
 *
 * Rule R3 — Direct `conn.callTool` is forbidden outside dispatcher.ts
 *   The dispatcher is the chokepoint for actual MCP transport
 *   invocation (cycle-5 L5-c5 doc-block). Direct `conn.callTool`
 *   outside `services/mcp/dispatcher.ts` would bypass the audit row
 *   write, the allowedTools check, and the governance pre/post invoke
 *   evaluation. Allowlist: dispatcher.ts itself.
 *
 * Rule R4 — `gateRuntimeDispatch` precedes `dispatchMcpToolCall` on
 *   chat lanes. Same proximity-style check as R2 but for the approval
 *   gate. C1-c6 also pinned this invariant for chat-stream/chat.ts.
 *   Simulation is intentionally exempt (same H1 as R2).
 *
 * Why a single script with 4 rules?
 *   Mirrors `check-cag-boundary.ts` (Rules A/B/C in one file). One CI
 *   step, one failure surface, one git-blame target. Adding a 5th
 *   rule is a same-file edit rather than a new script + workflow step.
 *
 * Termux note:
 *   This script is pure-surface (no Postgres, no MCP clients, no
 *   network). Runs cleanly on the user's device per the standing
 *   pattern from check-cag-boundary.ts / check-provider-key-env-
 *   boundary.ts.
 */

import { join, relative, sep } from "path";
import {
  REPO_ROOT,
  listSourceFiles,
  readFile,
  type Violation,
} from "./lib/module-graph";

// ── Rule R1 — No raw provider SDK in server/agent-studio/** ──────────────────

const FORBIDDEN_PROVIDER_SDK_PACKAGES = [
  "openai",
  "@anthropic-ai/sdk",
  "google-genai",
  "@google/generative-ai",
  "cohere-ai",
] as const;

function checkR1NoRawProviderSdk(): Violation[] {
  const violations: Violation[] = [];
  const agentStudioRoot = join(REPO_ROOT, "server/agent-studio");
  const files = listSourceFiles(agentStudioRoot);

  for (const file of files) {
    const fileRel = relative(REPO_ROOT, file).split(sep).join("/");
    // Test files in `__tests__` and `*.test.ts` may mock the SDKs
    // for failure-path tests; that's a legitimate test-only concern.
    if (fileRel.includes("__tests__") || fileRel.endsWith(".test.ts")) {
      continue;
    }
    const src = stripComments(readFile(file));
    for (const pkg of FORBIDDEN_PROVIDER_SDK_PACKAGES) {
      // Match `from "openai"`, `from "@anthropic-ai/sdk"`, etc.
      // Allow sub-paths under the SDK to be flagged too (e.g. `openai/dist/...`).
      const pattern = new RegExp(
        `(?:^|\\n)\\s*(?:import\\s[^"';]+from\\s*|export\\s[^"';]*from\\s*|require\\(\\s*)["']${pkg.replace(/[/\\^$*+?.()|[\]{}]/g, "\\$&")}(?:\/[^"']*)?["']`,
      );
      const match = src.match(pattern);
      if (match) {
        const idx = src.indexOf(match[0]);
        let line = 1;
        for (let i = 0; i < idx; i++) if (src[i] === "\n") line++;
        violations.push({
          rule: "runtime-no-raw-provider-sdk",
          file: fileRel,
          line,
          severity: "error",
          message:
            `Imports raw provider SDK "${pkg}". Per CLAUDE.md and Roadmap ` +
            `V3 Gate 6, server/agent-studio/** must route every model ` +
            `call through OpenRouter Model Access (D2). Use ` +
            `gatewayCall({ actionKey: "openRouter.modelAccess.execute" | ".stream" }).`,
        });
      }
    }
  }
  return violations;
}

// ── Helpers for proximity-style chat-lane rules ──────────────────────────────

const CHAT_LANE_FILES = [
  "server/agent-studio/chat-stream.ts",
  "server/agent-studio/services/chat.ts",
] as const;

function lineOf(src: string, idx: number): number {
  let line = 1;
  for (let i = 0; i < idx; i++) if (src[i] === "\n") line++;
  return line;
}

/**
 * Strip block-comments and line-comments from a TS/TSX source string,
 * preserving newlines so subsequent line-number computations remain
 * accurate. Necessary because doc-block prose frequently mentions
 * forbidden patterns by name (e.g., "conn.callTool" inside a
 * cycle-closure comment) and would otherwise produce false positives.
 *
 * NOT a real parser — won't strip strings, won't handle template
 * literals, won't handle nested block-comments. Sufficient for this
 * lint where the forbidden patterns are unlikely to appear inside
 * string literals in real production code.
 */
function stripComments(src: string): string {
  // Block comments — replace with same-length whitespace so byte
  // offsets line up.
  let out = src.replace(/\/\*[\s\S]*?\*\//g, (m) =>
    m.replace(/[^\n]/g, " "),
  );
  // Line comments — same approach.
  out = out.replace(/\/\/[^\n]*/g, (m) => m.replace(/[^\n]/g, " "));
  return out;
}

// ── Rule R2 — validateRuntimeToolCall precedes dispatchMcpToolCall ───────────

function checkR2ValidatorPrecedesDispatch(): Violation[] {
  const violations: Violation[] = [];
  for (const fileRel of CHAT_LANE_FILES) {
    const file = join(REPO_ROOT, fileRel);
    let src: string;
    try {
      src = stripComments(readFile(file));
    } catch {
      continue; // Lane file removed in a future refactor — not this rule's concern.
    }
    const dispatchMatches = [...src.matchAll(/dispatchMcpToolCall\s*\(/g)];
    const validatorMatches = [...src.matchAll(/validateRuntimeToolCall\s*\(/g)];
    if (dispatchMatches.length === 0) continue;
    if (validatorMatches.length === 0) {
      violations.push({
        rule: "runtime-validator-precedes-dispatch",
        file: fileRel,
        line: lineOf(src, dispatchMatches[0].index ?? 0),
        severity: "error",
        message:
          `dispatchMcpToolCall is invoked but validateRuntimeToolCall is ` +
          `never called in this file. Chat lanes MUST run the ` +
          `ProposedToolCall validator before dispatching (Roadmap V3 ` +
          `Gate 6 + cycle-6 C1-c6 lockstep).`,
      });
      continue;
    }
    // Proximity check: the FIRST validator call must come before the
    // FIRST dispatch call. This catches a future PR that reorders or
    // removes the validator from the lane.
    const firstDispatchIdx = dispatchMatches[0].index ?? 0;
    const firstValidatorIdx = validatorMatches[0].index ?? Number.MAX_SAFE_INTEGER;
    if (firstValidatorIdx > firstDispatchIdx) {
      violations.push({
        rule: "runtime-validator-precedes-dispatch",
        file: fileRel,
        line: lineOf(src, firstDispatchIdx),
        severity: "error",
        message:
          `dispatchMcpToolCall appears before validateRuntimeToolCall in ` +
          `the file. Reorder so the validator runs first (Roadmap V3 ` +
          `Gate 6).`,
      });
    }
  }
  return violations;
}

// ── Rule R3 — Direct conn.callTool forbidden outside dispatcher.ts ───────────

const DISPATCHER_REL_PATH = "server/agent-studio/services/mcp/dispatcher.ts";

function checkR3McpChokepoint(): Violation[] {
  const violations: Violation[] = [];
  const allFiles = [
    ...listSourceFiles(join(REPO_ROOT, "server")),
    ...listSourceFiles(join(REPO_ROOT, "client")),
  ];
  for (const file of allFiles) {
    const fileRel = relative(REPO_ROOT, file).split(sep).join("/");
    // The dispatcher itself IS the chokepoint — its own conn.callTool
    // calls are the legitimate ones. Test files mock conn.callTool
    // for unit coverage.
    if (fileRel === DISPATCHER_REL_PATH) continue;
    if (fileRel.includes("__tests__") || fileRel.endsWith(".test.ts")) continue;
    // mcp-manager.ts owns the connection lifecycle; it can call .callTool
    // on connections via internal probes (e.g., the `pingConnection`
    // helper). Add to the allowlist if probes ever reappear; for now
    // it's clean by inspection.
    const src = stripComments(readFile(file));
    const matches = [...src.matchAll(/\bconn\.callTool\s*\(/g)];
    for (const m of matches) {
      violations.push({
        rule: "runtime-mcp-chokepoint",
        file: fileRel,
        line: lineOf(src, m.index ?? 0),
        severity: "error",
        message:
          `conn.callTool is called outside ${DISPATCHER_REL_PATH}. The MCP ` +
          `dispatcher is the chokepoint for tool transport invocation ` +
          `(cycle-5 L5-c5). Route through dispatchMcpToolCall instead.`,
      });
    }
  }
  return violations;
}

// ── Rule R4 — gateRuntimeDispatch precedes dispatchMcpToolCall ───────────────

function checkR4ApprovalPrecedesDispatch(): Violation[] {
  const violations: Violation[] = [];
  for (const fileRel of CHAT_LANE_FILES) {
    const file = join(REPO_ROOT, fileRel);
    let src: string;
    try {
      src = readFile(file);
    } catch {
      continue;
    }
    const dispatchMatches = [...src.matchAll(/dispatchMcpToolCall\s*\(/g)];
    const gateMatches = [...src.matchAll(/gateRuntimeDispatch\s*\(/g)];
    if (dispatchMatches.length === 0) continue;
    if (gateMatches.length === 0) {
      violations.push({
        rule: "runtime-approval-precedes-dispatch",
        file: fileRel,
        line: lineOf(src, dispatchMatches[0].index ?? 0),
        severity: "error",
        message:
          `dispatchMcpToolCall is invoked but gateRuntimeDispatch is ` +
          `never called in this file. Chat lanes MUST run the approval ` +
          `gate before dispatching (Roadmap V3 Gate 6 + cycle-6 C1-c6).`,
      });
      continue;
    }
    const firstDispatchIdx = dispatchMatches[0].index ?? 0;
    const firstGateIdx = gateMatches[0].index ?? Number.MAX_SAFE_INTEGER;
    if (firstGateIdx > firstDispatchIdx) {
      violations.push({
        rule: "runtime-approval-precedes-dispatch",
        file: fileRel,
        line: lineOf(src, firstDispatchIdx),
        severity: "error",
        message:
          `dispatchMcpToolCall appears before gateRuntimeDispatch in the ` +
          `file. Reorder so the approval gate runs first (Roadmap V3 ` +
          `Gate 6).`,
      });
    }
  }
  return violations;
}

// ── Main ──────────────────────────────────────────────────────────────────────

function main(): void {
  const allViolations: Violation[] = [
    ...checkR1NoRawProviderSdk(),
    ...checkR2ValidatorPrecedesDispatch(),
    ...checkR3McpChokepoint(),
    ...checkR4ApprovalPrecedesDispatch(),
  ];

  for (const v of allViolations) {
    console.error(
      `[ERROR] ${v.rule} :: ${v.file}:${v.line}\n        ${v.message}`,
    );
  }

  if (allViolations.length > 0) {
    console.error(
      `\n${allViolations.length} runtime-boundary violation(s).`,
    );
    process.exit(1);
  }

  console.log(
    "OK — runtime boundaries pass (R1 raw-provider-SDK, R2 validator-precedes-dispatch, R3 mcp-chokepoint, R4 approval-precedes-dispatch).",
  );
  process.exit(0);
}

main();
