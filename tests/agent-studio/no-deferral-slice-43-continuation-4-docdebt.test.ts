/**
 * Continuation-4 doc-debt sweep — source-scan test.
 *
 * Slice 43 of the no-deferral continuation-4 catalogue (2026-05-19).
 * Asserts the closed-by-successor markers identified in the post-
 * slice-41 re-audit have been rewritten to status-neutral language.
 *
 * The api/router.ts:3076 (T-D.5.β/.γ) marker is intentionally not
 * swept here — slice 44 ships the T-D.5.γ runner mutation + the
 * accompanying doc-block edit.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(__dirname, "..", "..");

function read(rel: string): string {
  return readFileSync(join(REPO_ROOT, rel), "utf8");
}

describe("no-deferral slice 43 — continuation-4 doc-debt sweep", () => {
  it("chat-stream.ts no longer claims tool-call streaming is deferred", () => {
    const src = read("server/agent-studio/chat-stream.ts");
    expect(src).not.toContain(
      "Tool-call streaming on Model Access is\n * deferred to a future phase that adds tool-call streaming to the\n * Model Access stream contract",
    );
    // Successor named: streamEvents() (slice 39).
    expect(src).toContain("`streamEvents()`");
    expect(src).toContain("no-deferral slice 39");
  });

  it("api/router.ts T-D.3.β note rewritten — semantic-enrichment read surface", () => {
    const src = read("server/agent-studio/api/router.ts");
    expect(src).not.toContain(
      "Recent-runs + per-run drill-in deferred to\n  // T-D.3.β",
    );
    expect(src).toContain(
      "T-D.3.β (recent-runs + per-run drill-in) shipped in the",
    );
    // Successor file exists.
    expect(
      existsSync(
        join(
          REPO_ROOT,
          "server/agent-studio/services/graph-enrichment/semantic-enrichment-router.ts",
        ),
      ),
    ).toBe(true);
  });

  it("workspace-default-bindings.ts no longer claims LR-XX are deferred", () => {
    const src = read("server/agent-studio/workspace-default-bindings.ts");
    expect(src).not.toContain(
      "consumed by the 4\n * deferred Phase 29 caller migrations",
    );
    expect(src).toContain("shipped in Phase 29.4-29.6");
    // Each successor file is named.
    expect(src).toContain("server/embeddings/service.ts");
    expect(src).toContain("server/documents/processor.ts");
    expect(src).toContain("server/operators/provider-hub.ts");
    expect(src).toContain("server/chat/stream.ts");
  });

  it("realtime-doc-websocket-bridge.ts no longer claims auth-cookie resolver is deferred", () => {
    const src = read(
      "server/agent-studio/services/vault/realtime-doc-websocket-bridge.ts",
    );
    expect(src).not.toContain(
      'Auth-cookie resolver\n  // lands in a follow-up PR (see ADR §"Explicitly out of scope")',
    );
    expect(src).toContain("createDefaultGetUserIdFromUpgradeRequest");
    expect(src).toContain("realtime-doc-default-getuserid.ts");
    // Successor file exists.
    expect(
      existsSync(
        join(
          REPO_ROOT,
          "server/agent-studio/services/vault/realtime-doc-default-getuserid.ts",
        ),
      ),
    ).toBe(true);
  });

  it("each rewritten doc-block describes what the code does today", () => {
    // chat-stream's rewrite must name the architectural decision
    // (chat-stream stays on execute) — verifies slice 40's load-bearing
    // pattern carried forward.
    const chatStream = read("server/agent-studio/chat-stream.ts");
    expect(chatStream).toContain("FULL\n * `toolCalls` set before the next turn");

    // realtime-doc's rewrite names the test-mode fallback intent.
    const realtime = read(
      "server/agent-studio/services/vault/realtime-doc-websocket-bridge.ts",
    );
    expect(realtime).toContain("Test-mode fallback only");
    expect(realtime).toContain("fails closed");
  });
});
