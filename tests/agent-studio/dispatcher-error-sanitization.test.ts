/**
 * C1-c7 (cycle-7 audit `/sdcard/Download/POST_DISPATCH_AUDIT_2026-05-09.md`
 * §C1-c7) — dispatcher error-message sanitization lockstep.
 *
 * Pre-cycle-7 the dispatcher's `result.error.message` flowed verbatim
 * into 3 sinks:
 *   1. SSE `tool_end` event in `chat-stream.ts` (operator-visible)
 *   2. `agsToolCallTraces.errorMessage` column via
 *      `proposed-tool-call-runtime.ts` (durable forensic record)
 *   3. `role="tool"` LLM message-content in `chat-stream.ts` + `chat.ts`
 *      (model reasons on it + persists to `agsChatMessages.content`)
 *
 * Post-cycle-7 the dispatcher sanitizes once at the boundary; the
 * audit row keeps the RAW error for forensics; the 3 downstream
 * sinks trust the dispatcher (they do NOT re-sanitize, which would
 * be a layering violation).
 *
 * This file pins:
 *   1. Dispatcher imports the sanitizer
 *   2. Sanitizer is called at 3 result-error sites
 *   3. `auditPayload.errorMessage = message;` keeps the RAW (audit
 *      assignment happens BEFORE the sanitize call)
 *   4. The 3 downstream sinks do NOT import the sanitizer
 *      (they trust the dispatcher's result.error.message)
 *
 * Behavioral coverage (sanitizer correctness) lives in
 * `tests/agent-studio/sanitize-mcp-error-message.test.ts`.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const DISPATCHER_PATH = join(
  process.cwd(),
  "server/agent-studio/services/mcp/dispatcher.ts",
);
const CHAT_STREAM_PATH = join(
  process.cwd(),
  "server/agent-studio/chat-stream.ts",
);
const CHAT_TS_PATH = join(
  process.cwd(),
  "server/agent-studio/services/chat.ts",
);
const RUNTIME_PATH = join(
  process.cwd(),
  "server/agent-studio/services/runtime/proposed-tool-call-runtime.ts",
);

describe("C1-c7 — dispatcher imports and applies sanitizeMcpErrorMessage", () => {
  const src = readFileSync(DISPATCHER_PATH, "utf8");

  it("source carries the C1-c7 closure marker", () => {
    expect(
      src,
      "C1-c7 violated: dispatcher.ts must carry the `C1-c7` closure " +
        "marker so a future audit can trace the sanitization back to " +
        "its origin item.",
    ).toMatch(/C1-c7\b/);
  });

  it("imports sanitizeMcpErrorMessage from the dedicated module", () => {
    expect(
      src,
      "C1-c7 violated: dispatcher.ts must import sanitizeMcpErrorMessage " +
        "from `./sanitize-error-message`. Importing from elsewhere or " +
        "inlining the regex defeats the single-source-of-truth contract.",
    ).toMatch(/import\s*\{[\s\S]{0,80}sanitizeMcpErrorMessage[\s\S]{0,80}\}\s*from\s*["']\.\/sanitize-error-message["']/);
  });

  it("calls the sanitizer at least 3 times (covers all result-error sites)", () => {
    // The dispatcher has 3 result-error sites: fail() success path
    // returning structured failure, fail()'s audit-write-failure
    // catch, and the success-path's audit-write-failure catch. Each
    // must sanitize before the message reaches the result.
    const matches = src.match(/sanitizeMcpErrorMessage\s*\(/g) ?? [];
    expect(
      matches.length,
      `C1-c7 violated: dispatcher.ts must call sanitizeMcpErrorMessage ` +
        `at all 3 result-error sites (fail() return, fail() audit-` +
        `failure catch, success-path audit-failure catch). Found ` +
        `${matches.length} calls.`,
    ).toBeGreaterThanOrEqual(3);
  });
});

describe("C1-c7 — audit row preserves RAW error for forensics", () => {
  const src = readFileSync(DISPATCHER_PATH, "utf8");

  it("auditPayload.errorMessage = message; assignment is NOT sanitized", () => {
    // The audit row is operator-only and must carry the unredacted
    // error so a security investigation can see the actual context.
    // A future PR that "tightened" by sanitizing the audit too
    // would defeat the forensic purpose.
    expect(
      src,
      "C1-c7 violated: auditPayload.errorMessage must be assigned " +
        "the RAW message (no sanitize call on this line). The audit " +
        "row is the operator-only forensic record; sanitization " +
        "applies only to the returned result.error.message.",
    ).toMatch(/auditPayload\.errorMessage\s*=\s*message;/);
    // And specifically: the assignment line must NOT contain sanitize.
    const auditLine = src.match(/auditPayload\.errorMessage\s*=\s*[^;]+;/);
    expect(auditLine, "expected to find the audit assignment line").not.toBeNull();
    expect(
      auditLine![0],
      "C1-c7 violated: the auditPayload.errorMessage assignment line " +
        "must not call sanitizeMcpErrorMessage — that would scrub the " +
        "operator-only forensic record.",
    ).not.toMatch(/sanitizeMcpErrorMessage/);
  });

  it("doc-block on the import explains the audit-vs-result asymmetry", () => {
    // Future readers need to know WHY the import exists + which
    // sites it applies to. The doc-block is the discovery surface.
    expect(
      src,
      "C1-c7 violated: the sanitizer import must carry a doc-block " +
        "explaining the audit-keeps-raw / result-is-sanitized asymmetry.",
    ).toMatch(/C1-c7[\s\S]{0,800}forensics/i);
  });
});

describe("C1-c7 — downstream sinks do NOT ad-hoc re-sanitize", () => {
  // The 3 sinks consume the dispatcher's result.error.message. They
  // MUST NOT import sanitizeMcpErrorMessage themselves — that would
  // be a layering violation (multiple sanitization layers can drift
  // out of sync, and re-sanitizing an already-redacted message is a
  // no-op but signals a missing trust contract).

  it("chat-stream.ts does not import sanitizeMcpErrorMessage", () => {
    const src = readFileSync(CHAT_STREAM_PATH, "utf8");
    expect(
      src,
      "C1-c7 violated: chat-stream.ts must trust dispatcher's " +
        "sanitization. Importing sanitizeMcpErrorMessage here means " +
        "either (a) re-sanitizing already-clean text (waste + drift " +
        "risk), or (b) sanitizing some OTHER source of error text " +
        "that bypasses the dispatcher (which should be fixed at " +
        "ITS source, not here).",
    ).not.toMatch(/sanitizeMcpErrorMessage/);
  });

  it("chat.ts does not import sanitizeMcpErrorMessage", () => {
    const src = readFileSync(CHAT_TS_PATH, "utf8");
    expect(
      src,
      "C1-c7 violated: chat.ts must trust dispatcher's sanitization " +
        "(see chat-stream.ts assertion for rationale).",
    ).not.toMatch(/sanitizeMcpErrorMessage/);
  });

  it("proposed-tool-call-runtime.ts does not import sanitizeMcpErrorMessage", () => {
    const src = readFileSync(RUNTIME_PATH, "utf8");
    expect(
      src,
      "C1-c7 violated: proposed-tool-call-runtime.ts (the trace " +
        "writer orchestrator) must trust dispatcher's sanitization. " +
        "The trace's errorMessage column is fed from " +
        "dispatchResult.error.message which is already scrubbed.",
    ).not.toMatch(/sanitizeMcpErrorMessage/);
  });
});
