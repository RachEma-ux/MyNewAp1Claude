/**
 * Phase 3.1 (Roadmap V3) — SSE heartbeat invariant test.
 *
 * Locks the periodic SSE keepalive that prevents proxies, reverse
 * proxies, and mobile networks from dropping idle long-running
 * streams. Phase 1b §1 confirmed the pre-Phase-3.1 baseline emitted
 * **zero** keepalive bytes during idle periods.
 *
 * The heartbeat must:
 *  1. Use SSE comment syntax (`:` prefix, NOT a `data:` event), so the
 *     client's `es.onmessage` handler is not invoked. EventSource
 *     ignores comment-only frames per the WHATWG spec.
 *  2. Use a fixed interval declared as a named constant
 *     (`SSE_HEARTBEAT_INTERVAL_MS`) at the top of `setupSse` so a
 *     future PR cannot silently change the cadence without surfacing
 *     in code review.
 *  3. Clear the interval on `res.on("close")` so closed connections
 *     don't leak intervals (Node's setInterval would otherwise keep
 *     the timer alive forever).
 *  4. Guard `res.write` with `res.writable` to avoid the race where
 *     the interval fires between the response ending and the close
 *     event firing.
 *  5. Call `heartbeat.unref()` so the interval doesn't keep the
 *     process alive on shutdown.
 *
 * Source-scan rather than behavioral mocking because the chat-stream
 * test surface is HTTP/SSE-shaped and the existing cycle-7/8 tests
 * (h6-c7, h7-c7, m5-c7, etc.) all use this pattern. End-to-end
 * coverage of the actual byte stream is left to integration tests
 * once a Phase 3.4 SSE event-shape contract test exists.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const CHAT_STREAM_PATH = join(
  process.cwd(),
  "server/agent-studio/chat-stream.ts",
);

describe("Phase 3.1 — SSE heartbeat invariants", () => {
  const src = readFileSync(CHAT_STREAM_PATH, "utf8");

  it("declares SSE_HEARTBEAT_INTERVAL_MS as a named constant", () => {
    expect(
      src,
      "chat-stream.ts must declare the heartbeat cadence as a named " +
        "constant so future changes show up in code review. Inline " +
        "magic numbers in setInterval(...) are not OK.",
    ).toMatch(/const\s+SSE_HEARTBEAT_INTERVAL_MS\s*=\s*\d[\d_]*\s*;/);
  });

  it("emits the heartbeat as an SSE comment (':' prefix, not 'data:')", () => {
    // Comment-frame syntax: lines starting with `:` are ignored by
    // EventSource clients. Phase 3.1's heartbeat MUST use this
    // syntax — otherwise it would invoke `es.onmessage` and confuse
    // the client which discriminates on `data.type`.
    expect(
      src,
      "chat-stream.ts must emit heartbeat using SSE comment syntax " +
        "(`: heartbeat ...\\n\\n`). Using `data:` would deliver the " +
        "frame to es.onmessage and confuse the client.",
    ).toMatch(/res\.write\(`:\s+heartbeat[^`]*`\)/);
  });

  it("setInterval uses SSE_HEARTBEAT_INTERVAL_MS (not a magic number)", () => {
    // Permissive across the multi-line arrow body — the invariant is
    // "the cadence argument is the named constant, not a literal."
    expect(src).toMatch(
      /setInterval\([\s\S]*?,\s*SSE_HEARTBEAT_INTERVAL_MS\)/,
    );
  });

  it("clears the heartbeat interval on res.on('close')", () => {
    expect(
      src,
      "chat-stream.ts must call clearInterval on the heartbeat handle " +
        "when the response closes. Otherwise closed connections leak " +
        "intervals.",
    ).toMatch(/res\.on\(["']close["'][\s\S]*?=>\s*clearInterval\([a-zA-Z_]+\)/);
  });

  it("guards res.write with res.writable to avoid the close-race", () => {
    // Required for both the heartbeat and the sendEvent function: if
    // the response has ended (e.g. catch-all error path called
    // res.end()) and the heartbeat interval fires before the close
    // event clears it, writing throws ERR_STREAM_WRITE_AFTER_END.
    const writableGuards = src.match(/if\s*\(\s*!res\.writable\s*\)\s*return/g) ?? [];
    expect(
      writableGuards.length,
      `chat-stream.ts must guard res.write with !res.writable in BOTH ` +
        `the heartbeat callback AND the sendEvent function (got ${writableGuards.length}).`,
    ).toBeGreaterThanOrEqual(2);
  });

  it("calls heartbeat.unref() so the interval doesn't block shutdown", () => {
    // Node's setInterval returns a Timeout that ref's the event loop
    // by default. unref() releases the ref so the heartbeat alone
    // can't prevent process exit.
    expect(src).toMatch(/heartbeat\.unref\?\.\(\)/);
  });

  it("setupSse still returns the SseSend signature (no breaking caller change)", () => {
    expect(src).toMatch(/function\s+setupSse\s*\(res:\s*Response\)\s*:\s*SseSend\s*\{/);
  });
});
