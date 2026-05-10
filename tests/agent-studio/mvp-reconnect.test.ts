/**
 * Phase 3.3 (Roadmap V3) — MVP reconnect invariants.
 *
 * Locks the client + server contract that prevents EventSource
 * auto-reconnect from creating duplicate user messages, duplicate
 * model spend, or duplicate tool dispatch on a network blip.
 *
 * The MVP contract (per Phase 1b §3 + Phase 3.2 + Phase 3.3):
 *  - Server makes no attempt to resume partial streams
 *  - Client suppresses browser auto-reconnect via explicit es.close()
 *    on EventSource error (`es.onerror`)
 *  - Client suppresses browser auto-reconnect on `data.type==="error"`
 *    SSE events too
 *  - Client clears partial `streamingText` and `activeTools` on
 *    error/done — persisted messages are source of truth
 *  - Client re-fetches persisted messages after error/done
 *  - `idempotency_conflict` SSE error code gets a friendly UX
 *    (not a generic red toast)
 *  - Phase 3.4 expansion is documented in the chat-stream doc-block
 *
 * Source-scan invariants. Behavioral coverage of the actual
 * disconnect+retry path is left to integration tests once a
 * Phase 3.4 SSE event-shape contract test exists.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const REPO_ROOT = process.cwd();
const FAB = readFileSync(
  join(REPO_ROOT, "client/src/modules/agent-studio/components/AgentStudioChatWindow.tsx"),
  "utf8",
);
const PAGE = readFileSync(
  join(REPO_ROOT, "client/src/modules/agent-studio/pages/AgentChatPage.tsx"),
  "utf8",
);
const CHAT_STREAM = readFileSync(
  join(REPO_ROOT, "server/agent-studio/chat-stream.ts"),
  "utf8",
);

describe("Phase 3.3 — MVP reconnect invariants", () => {
  describe("server-side", () => {
    it("chat-stream.ts carries a Phase 3.3 doc-block describing the MVP contract", () => {
      // Marker so a future audit can grep for the contract location
      // and a future PR cannot silently change the policy without
      // updating this comment.
      expect(CHAT_STREAM).toMatch(/Phase 3\.3[^.]*MVP reconnect contract/);
    });

    it("doc-block names Phase 3.4 as the place client_disconnected lands", () => {
      // Forward-pointer to the H2 fold-in. Catches a future PR that
      // implements client-disconnect outside Phase 3.4 without
      // updating the contract.
      expect(CHAT_STREAM).toMatch(/Phase 3\.4[\s\S]*?client_disconnected/);
    });
  });

  describe("client-side — FAB widget", () => {
    it("calls es.close() in es.onerror to suppress browser auto-reconnect", () => {
      expect(FAB).toMatch(
        /es\.onerror\s*=\s*\(\)\s*=>\s*\{[\s\S]*?es\.close\(\)/,
      );
    });

    it("calls es.close() inside the SSE error event branch (data.type === \"error\")", () => {
      // The SSE-payload error path also closes the connection so the
      // browser doesn't try to reconnect after a server-emitted error.
      expect(FAB).toMatch(
        /data\.type\s*===\s*["']error["']\s*\)[\s\S]{0,300}?es\.close\(\)/,
      );
    });

    it("clears streamingText + activeTools on SSE error", () => {
      // Persisted messages are the source of truth; partial in-memory
      // state must NOT be treated as authoritative.
      const errBlock = FAB.match(
        /data\.type\s*===\s*["']error["']\s*\)\s*\{[\s\S]*?\}\s*\}/,
      );
      expect(errBlock, "FAB must have an SSE error branch").not.toBeNull();
      expect(errBlock![0]).toMatch(/setStreamingText\(""\)/);
      expect(errBlock![0]).toMatch(/setActiveTools\(\[\]\)/);
    });

    it("re-fetches persisted messages after SSE error (invalidate listMessages)", () => {
      const errBlock = FAB.match(
        /data\.type\s*===\s*["']error["']\s*\)\s*\{[\s\S]*?\}\s*\}/,
      );
      expect(errBlock![0]).toMatch(
        /agentStudio\.chat\.listMessages\.invalidate/,
      );
    });

    it("discriminates on data.code === \"idempotency_conflict\" with a friendly toast", () => {
      // Generic red toast on idempotency_conflict misleads operators
      // into thinking their original request failed — when in fact
      // it's still running. Phase 3.3 mandates a `toast.info` (or
      // equivalent non-error UX).
      expect(FAB).toMatch(
        /data\.code\s*===\s*["']idempotency_conflict["'][\s\S]{0,300}?toast\.info/,
      );
    });
  });

  describe("client-side — standalone AgentChatPage", () => {
    it("imports toast for friendly idempotency_conflict UX", () => {
      expect(PAGE).toMatch(/import\s*\{\s*toast\s*\}\s*from\s*["']sonner["']/);
    });

    it("calls es.close() in es.onerror to suppress browser auto-reconnect", () => {
      expect(PAGE).toMatch(
        /es\.onerror\s*=\s*\(\)\s*=>\s*\{[\s\S]*?es\.close\(\)/,
      );
    });

    it("calls es.close() inside the SSE error event branch (data.type === \"error\")", () => {
      expect(PAGE).toMatch(
        /data\.type\s*===\s*["']error["']\s*\)[\s\S]{0,300}?es\.close\(\)/,
      );
    });

    it("clears streamingText + activeTools on SSE error", () => {
      const errBlock = PAGE.match(
        /data\.type\s*===\s*["']error["']\s*\)\s*\{[\s\S]*?\}\s*\}/,
      );
      expect(errBlock, "AgentChatPage must have an SSE error branch").not.toBeNull();
      expect(errBlock![0]).toMatch(/setStreamingText\(""\)/);
      expect(errBlock![0]).toMatch(/setActiveTools\(\[\]\)/);
    });

    it("re-fetches persisted messages after SSE error (invalidate listMessages)", () => {
      const errBlock = PAGE.match(
        /data\.type\s*===\s*["']error["']\s*\)\s*\{[\s\S]*?\}\s*\}/,
      );
      expect(errBlock![0]).toMatch(
        /agentStudio\.chat\.listMessages\.invalidate/,
      );
    });

    it("discriminates on data.code === \"idempotency_conflict\" with a friendly toast", () => {
      expect(PAGE).toMatch(
        /data\.code\s*===\s*["']idempotency_conflict["'][\s\S]{0,300}?toast\.info/,
      );
    });

    it("carries a Phase 3.3 MVP reconnect doc-block", () => {
      expect(PAGE).toMatch(/Phase 3\.3[^.]*MVP reconnect policy/);
    });
  });
});
