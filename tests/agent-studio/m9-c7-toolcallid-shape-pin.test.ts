/**
 * M9-c7 (cycle-7 audit `/sdcard/Download/POST_DISPATCH_AUDIT_2026-05-09.md`
 * §M9-c7) — chat-history toolCallId persistence-shape lockstep.
 *
 * Pre-cycle-7 chat-stream.ts and services/chat.ts each had inline
 * code that read tool-role messages out of
 * `agsChatMessages.toolPayload` via:
 *
 *   const tp = (m.toolPayload ?? null) as any;
 *   { ..., toolCallId: tp?.toolCallId ?? "" }
 *
 * The empty-string fallback masked a silent-corruption risk: if a
 * future persistence-side refactor renamed the field
 * (`toolCallId → callId`, or moved it under a nested envelope), the
 * read would silently coerce the missing field to `""` — which the
 * OpenAI / Anthropic tool-loop protocol treats as a separate
 * (zero-id) tool slot, leading to either model refusal,
 * hallucinated linkage, or stale-result joining.
 *
 * Post-cycle-7 the canonical shape lives in
 * `services/runtime/chat-history-shape.ts` (single source of truth).
 * Both flows still do their inline `?? ""` extraction for in-flight
 * session compatibility, but the lockstep below pins:
 *
 *   1. Both flows carry the M9-c7 closure marker on the read site.
 *   2. The 5+ writer sites in BOTH files use the canonical
 *      `{ toolCallId, name }` shape literally (catches a future PR
 *      that renames `toolCallId → callId` on the writer side).
 *   3. The `reconstructToolHistoryMessage` helper actually round-
 *      trips a synthetic message whose toolPayload matches the
 *      writer's shape exactly (catches a future PR that drifts the
 *      reader-side extraction or the contract typedef).
 *   4. The strict helper REFUSES to fabricate a toolCallId when the
 *      persisted shape is missing the field — null return, not
 *      empty-string fabrication.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { reconstructToolHistoryMessage } from "../../server/agent-studio/services/runtime/chat-history-shape";

const CHAT_STREAM_PATH = join(
  process.cwd(),
  "server/agent-studio/chat-stream.ts",
);
const CHAT_TS_PATH = join(
  process.cwd(),
  "server/agent-studio/services/chat.ts",
);
const SHAPE_HELPER_PATH = join(
  process.cwd(),
  "server/agent-studio/services/runtime/chat-history-shape.ts",
);

// ─────────────────────────────────────────────────────────────────────
// 1. Closure markers on all three files
// ─────────────────────────────────────────────────────────────────────

describe("M9-c7 — closure markers", () => {
  for (const [label, path] of [
    ["chat-stream.ts", CHAT_STREAM_PATH],
    ["chat.ts", CHAT_TS_PATH],
    ["chat-history-shape.ts", SHAPE_HELPER_PATH],
  ] as const) {
    it(`${label} carries the M9-c7 closure marker`, () => {
      const src = readFileSync(path, "utf8");
      expect(
        src,
        `M9-c7 violated: ${label} must carry the M9-c7 closure ` +
          `marker so a future audit can trace the toolCallId-shape ` +
          `pin back to its origin item.`,
      ).toMatch(/M9-c7\b/);
    });
  }
});

// ─────────────────────────────────────────────────────────────────────
// 2. Writer-side: both files use the canonical {toolCallId, name}
//    literal at every persistence site for tool-role rows.
// ─────────────────────────────────────────────────────────────────────

describe("M9-c7 — writer sites use canonical { toolCallId, name } shape", () => {
  for (const [label, path] of [
    ["chat-stream.ts", CHAT_STREAM_PATH],
    ["chat.ts", CHAT_TS_PATH],
  ] as const) {
    it(`${label} has at least 4 writer sites for { toolCallId, name }`, () => {
      // The two flows write tool-role rows at multiple branches
      // (validator-rejected, approval-denied, pending, dispatch-ok,
      // dispatch-error). Each branch persists its own toolPayload.
      // A future PR that introduces a 6th branch and forgets to
      // include toolCallId would silently break the read path —
      // the count assertion catches the most obvious drift; the
      // shape regex below catches subtle drift.
      const src = readFileSync(path, "utf8");
      const matches =
        src.match(/toolPayload:\s*\{\s*toolCallId:[^}]*name:/g) ?? [];
      expect(
        matches.length,
        `M9-c7 violated: ${label} has ${matches.length} writer sites ` +
          `using \`toolPayload: { toolCallId: ..., name: ... }\` — ` +
          `expected at least 4. If you added a new tool-result write ` +
          `branch, ensure it uses the canonical shape; if you removed ` +
          `one, verify the read path still has data to reconstruct.`,
      ).toBeGreaterThanOrEqual(4);
    });

    it(`${label} writer sites list 'toolCallId' BEFORE 'name' (canonical key order)`, () => {
      // Key order is observability-only (JSON deserializes
      // unordered) but a consistent literal makes grep-for-the-
      // shape work without noise. The regex above already enforces
      // this; this assertion documents the intent.
      const src = readFileSync(path, "utf8");
      // Reverse-order shape `{ name: ..., toolCallId: ... }` would
      // not match the canonical regex above. If both happen we're
      // fine functionally; if the canonical form disappears we lose
      // the lockstep grep-ability.
      const reverse =
        src.match(/toolPayload:\s*\{\s*name:[^}]*toolCallId:/g) ?? [];
      const canonical =
        src.match(/toolPayload:\s*\{\s*toolCallId:[^}]*name:/g) ?? [];
      expect(
        canonical.length,
        `M9-c7 violated: ${label} should consistently use the ` +
          `\`{ toolCallId, name }\` key order so a single grep finds ` +
          `every write site. Found ${canonical.length} canonical and ` +
          `${reverse.length} reversed.`,
      ).toBeGreaterThan(reverse.length);
    });
  }
});

// ─────────────────────────────────────────────────────────────────────
// 3. Reader-side: both files extract via tp?.toolCallId (the legacy
//    in-flight-compat path) AND carry the M9-c7 doc-block on the
//    extraction site.
// ─────────────────────────────────────────────────────────────────────

describe("M9-c7 — reader sites carry the M9-c7 doc-block + extraction", () => {
  for (const [label, path] of [
    ["chat-stream.ts", CHAT_STREAM_PATH],
    ["chat.ts", CHAT_TS_PATH],
  ] as const) {
    it(`${label} reader site references the chat-history-shape helper`, () => {
      // The doc-block must point at the canonical helper so future
      // refactors discover the full M9-c7 contract. The actual
      // import of the helper is deferred (in-flight-compat); the
      // doc-reference is what makes the discovery surface work.
      const src = readFileSync(path, "utf8");
      expect(
        src,
        `M9-c7 violated: ${label} reader-site doc-block must ` +
          `reference \`runtime/chat-history-shape.ts\` so a future ` +
          `refactor finds the canonical contract before re-doing the ` +
          `inline extraction.`,
      ).toMatch(/runtime\/chat-history-shape/);
    });

    it(`${label} reader-site extracts via tp?.toolCallId (legacy in-flight compat)`, () => {
      const src = readFileSync(path, "utf8");
      expect(
        src,
        `M9-c7 violated: ${label} must keep the \`tp?.toolCallId\` ` +
          `extraction at the read site for in-flight session ` +
          `compatibility. Strict-mode adoption (return null on missing) ` +
          `is a future migration; current contract is "fall back to ` +
          `empty string but log via the lockstep" so existing sessions ` +
          `don't suddenly break.`,
      ).toMatch(/tp\?\.toolCallId/);
    });
  }
});

// ─────────────────────────────────────────────────────────────────────
// 4. Round-trip: synthetic write → strict read produces the same
//    toolCallId. Catches reader-side drift.
// ─────────────────────────────────────────────────────────────────────

describe("M9-c7 — round-trip via reconstructToolHistoryMessage", () => {
  it("reads back toolCallId from a row whose toolPayload matches the writer's shape", () => {
    // Construct a row with the EXACT shape the 5 writer sites
    // produce: `{ toolCallId, name }`. If a future PR drifts either
    // the writer's literal OR the reader's extraction key, this
    // round-trip breaks.
    const writerSideShape = {
      toolCallId: "call_abc123",
      name: "search",
    };
    const row = {
      role: "tool" as const,
      content: "the result",
      toolPayload: writerSideShape,
    };
    const msg = reconstructToolHistoryMessage(row);
    expect(msg).not.toBeNull();
    expect(msg!.role).toBe("tool");
    expect(msg!.content).toBe("the result");
    expect(msg!.toolCallId).toBe("call_abc123");
  });

  it("returns null when the persisted row has no toolCallId (drift detection)", () => {
    // The strict helper REFUSES to fabricate an empty-string
    // toolCallId. This is the M9-c7 fix: pre-cycle-7 the inline
    // `?? ""` fallback hid the corruption; the strict helper makes
    // it visible (caller decides whether to drop or surface).
    const row = {
      role: "tool" as const,
      content: "the result",
      toolPayload: { name: "search" }, // toolCallId missing!
    };
    expect(reconstructToolHistoryMessage(row)).toBeNull();
  });

  it("returns null when toolPayload is null entirely", () => {
    const row = {
      role: "tool" as const,
      content: "x",
      toolPayload: null,
    };
    expect(reconstructToolHistoryMessage(row)).toBeNull();
  });

  it("returns null when toolCallId is the empty string (post-corruption row)", () => {
    // If a row was written under the broken pre-cycle-7 fallback
    // path (some upstream defaulted to empty string), the strict
    // helper still refuses to round-trip it. Same reason: the
    // empty string violates the protocol downstream.
    const row = {
      role: "tool" as const,
      content: "x",
      toolPayload: { toolCallId: "", name: "search" },
    };
    expect(reconstructToolHistoryMessage(row)).toBeNull();
  });

  it("returns null for non-tool roles (helper is single-purpose)", () => {
    expect(
      reconstructToolHistoryMessage({
        role: "user",
        content: "hi",
        toolPayload: { toolCallId: "x", name: "y" },
      }),
    ).toBeNull();
    expect(
      reconstructToolHistoryMessage({
        role: "assistant",
        content: "hi",
        toolPayload: { toolCallId: "x", name: "y" },
      }),
    ).toBeNull();
  });

  it("returns null when toolCallId is non-string (typescript escape via 'as any' on persisted JSON)", () => {
    // Persisted JSON is stringly-typed; nothing prevents a
    // misbehaving writer from storing a number. The helper's
    // `typeof === "string"` guard is the runtime trap.
    const row = {
      role: "tool" as const,
      content: "x",
      toolPayload: { toolCallId: 42 as unknown as string, name: "search" },
    };
    expect(reconstructToolHistoryMessage(row)).toBeNull();
  });
});
