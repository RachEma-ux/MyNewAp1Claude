/**
 * Phase 3.4 (Roadmap V3) — Stream error reconciliation invariants.
 *
 * Locks the stable-error-code contract and the AbortController
 * client-disconnect plumbing.
 *
 * Phase 1b §1 confirmed pre-Phase-3.4 only 4 of the 11 planned error
 * codes (`binding_required`, `binding_missing_model`, `cag_required`,
 * `retrieval_required`) were on the wire — and the catch-all at the
 * outer try/catch had no `code` at all. This phase makes every
 * `{type:"error"}` SSE emission carry a stable `code` discriminator.
 *
 * Source-scan invariants (cycle-7/8 doc-block + lockstep pattern):
 *   1. Every `sendEvent({type:"error", ...})` emission carries a
 *      `code:` field — no untyped errors reach the wire
 *   2. The full Phase 3.4 code set is represented in chat-stream.ts
 *   3. The catch-all defaults to `stream_failed`
 *   4. AbortController is wired to BOTH `req.on("close")` and
 *      `res.on("close")`
 *   5. `signal: abortController.signal` is threaded into both
 *      `runStreamingToolLoop` and `runPureStream`
 *   6. Both loop functions accept `signal?: AbortSignal` and check
 *      `signal?.aborted` to break cleanly
 *   7. Both loop functions return `aborted?: boolean` so the caller
 *      can branch on disconnect
 *   8. The handler emits `client_disconnected` (best-effort) when
 *      `pathResult.aborted` is true
 *   9. Phase 3.4 doc-block names Phase 7.5/8 as the future home of
 *      Model Access signal plumbing (so a future PR doesn't claim
 *      we've already done deep cancellation)
 *  10. Cleanup: handler removes its close listeners in `finally`
 *      so the request doesn't leak refs to req/res
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const CHAT_STREAM = readFileSync(
  join(process.cwd(), "server/agent-studio/chat-stream.ts"),
  "utf8",
);

const REQUIRED_ERROR_CODES = [
  // Phase 3.4 stable error codes that MUST appear on `error` events
  // emitted by chat-stream.ts. Per the roadmap §3 Phase 3.4 list,
  // some codes (tool_failed, approval_blocked, dispatcher_failed,
  // trace_write_failed, audit_write_failed) belong on `tool_end`
  // events instead of `error` events — they're tracked separately
  // and are NOT required here.
  "session_not_found",
  "draft_not_found",
  "binding_required",
  "binding_missing_model",
  "idempotency_conflict",
  "cag_required",
  "retrieval_required",
  "client_disconnected",
  "stream_failed",
];

describe("Phase 3.4 — stream error reconciliation invariants", () => {
  it("every {type:'error'} sendEvent carries a `code:` field", () => {
    // Match each `type: "error"` block (single-line OR multi-line)
    // and assert a `code:` appears within the next ~6 lines / 600
    // chars before the next `})`. This catches any future PR that
    // adds an error emission without classifying it.
    const errBlocks = CHAT_STREAM.match(
      /sendEvent\(\s*\{[\s\S]{0,400}?type:\s*["']error["'][\s\S]{0,400}?\}\)/g,
    );
    expect(errBlocks, "must find at least one error sendEvent").not.toBeNull();
    for (const block of errBlocks!) {
      expect(
        block,
        `error event without code:\n  ${block.slice(0, 200).replace(/\s+/g, " ")}`,
      ).toMatch(/code:\s*["']/);
    }
  });

  it("all Phase 3.4 error codes are present on the wire", () => {
    for (const code of REQUIRED_ERROR_CODES) {
      expect(
        CHAT_STREAM,
        `chat-stream.ts must emit '${code}' as an error code (Phase 3.4 contract)`,
      ).toMatch(new RegExp(`code:\\s*["']${code}["']`));
    }
  });

  it("the catch-all default code is `stream_failed`", () => {
    // The outer catch (line ~1571) must classify every otherwise-
    // unclassified error as stream_failed — not leave the code
    // field absent.
    expect(CHAT_STREAM).toMatch(
      /\}\s*catch\s*\([^)]*\)\s*\{[\s\S]{0,800}?code:\s*["']stream_failed["']/,
    );
  });

  it("AbortController is created at the request handler entry", () => {
    expect(CHAT_STREAM).toMatch(
      /const\s+abortController\s*=\s*new\s+AbortController\(\)/,
    );
  });

  it("AbortController is wired to req.on('close') AND res.on('close')", () => {
    expect(
      CHAT_STREAM,
      "must register req.on('close') for HTTP-level disconnect",
    ).toMatch(/req\.on\(\s*["']close["']\s*,\s*onClientDisconnect\s*\)/);
    expect(
      CHAT_STREAM,
      "must register res.on('close') for response-stream close",
    ).toMatch(/res\.on\(\s*["']close["']\s*,\s*onClientDisconnect\s*\)/);
  });

  it("signal: abortController.signal is threaded into runStreamingToolLoop", () => {
    expect(CHAT_STREAM).toMatch(
      /runStreamingToolLoop\(\{[\s\S]*?signal:\s*abortController\.signal/,
    );
  });

  it("signal: abortController.signal is threaded into runPureStream", () => {
    expect(CHAT_STREAM).toMatch(
      /runPureStream\(\{[\s\S]*?signal:\s*abortController\.signal/,
    );
  });

  it("runStreamingToolLoop accepts signal?: AbortSignal arg", () => {
    expect(CHAT_STREAM).toMatch(
      /async function runStreamingToolLoop\(args:\s*\{[\s\S]*?signal\?:\s*AbortSignal/,
    );
  });

  it("runPureStream accepts signal?: AbortSignal arg", () => {
    expect(CHAT_STREAM).toMatch(
      /async function runPureStream\(args:\s*\{[\s\S]*?signal\?:\s*AbortSignal/,
    );
  });

  it("runStreamingToolLoop checks signal.aborted at the top of each turn", () => {
    // Inside the `for (let turn = 0; ...)` loop, the first executable
    // statement (after the explanatory comment block) is the
    // `signal?.aborted` check. If aborted, the function returns
    // early with `aborted: true`. Window is generous to allow a
    // multi-line doc-comment to live between the for-statement and
    // the if-statement.
    expect(CHAT_STREAM).toMatch(
      /for\s*\(\s*let\s+turn[\s\S]{0,800}?if\s*\(\s*signal\?\.aborted\s*\)/,
    );
  });

  it("runPureStream checks signal.aborted inside the chunk loop", () => {
    expect(CHAT_STREAM).toMatch(
      /for\s+await\s*\(\s*const\s+chunk[\s\S]{0,800}?if\s*\(\s*signal\?\.aborted\s*\)/,
    );
  });

  it("both loop functions return aborted?: boolean", () => {
    // Both function return-type annotations must include the
    // `aborted?: boolean` discriminator so the caller branches.
    const matches = CHAT_STREAM.match(
      /\):\s*Promise<\{[\s\S]{0,300}?aborted\?:\s*boolean[\s\S]{0,100}?\}>/g,
    );
    expect(
      matches?.length ?? 0,
      `both runStreamingToolLoop and runPureStream must return ` +
        `{aborted?: boolean} (got ${matches?.length ?? 0}).`,
    ).toBeGreaterThanOrEqual(2);
  });

  it("handler emits client_disconnected when pathResult.aborted is true", () => {
    expect(CHAT_STREAM).toMatch(
      /pathResult\.aborted[\s\S]{0,500}?code:\s*["']client_disconnected["']/,
    );
  });

  it("Phase 3.4 doc-block names Phase 7.5/8 for Model Access signal plumbing", () => {
    // Forward-pointer to where deep cancellation lands. Catches a
    // future PR that adds Model Access signal plumbing outside that
    // phase boundary without updating the contract.
    expect(CHAT_STREAM).toMatch(/Phase 7\.5\/8/);
  });

  it("handler cleans up close listeners in finally", () => {
    expect(CHAT_STREAM).toMatch(
      /\}\s*finally\s*\{[\s\S]{0,400}?req\.off\(\s*["']close["']\s*,\s*onClientDisconnect[\s\S]{0,100}?res\.off\(\s*["']close["']\s*,\s*onClientDisconnect/,
    );
  });
});
