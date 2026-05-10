/**
 * H1-c8 (cycle-8 audit `/sdcard/Download/RAC_ORCHESTRATOR_AUDIT_2026-05-09.md`
 * §H1-c8) — chat-stream.ts ↔ chat.ts orchestrator-error symmetry.
 *
 * Pre-cycle-8 chat-stream.ts caught `CagRequiredError` and
 * `RetrievalRequiredError` explicitly with `instanceof` branches
 * and mapped them to distinct SSE error codes (`cag_required`,
 * `retrieval_required`). chat.ts had NO explicit catch — these
 * errors propagated to the outer generic try/catch at the binding-
 * execute boundary, where they collapsed into a generic
 * `{ ok: false, error: msg }` shape with no `code` field. The
 * non-streaming caller (a tRPC mutation) couldn't distinguish
 * "needs CAG" from "needs retrieval" from "binding broken,"
 * defeating the purpose of the structured error classes.
 *
 * Standing pattern from cycles 5/6/7: any contract that exists in
 * both chat flows must be mirrored. This test pins the symmetry via
 * source-scan parametrized over both files (cycle-7 H8-c7 shape).
 *
 * **M7-c8 update (cycle-8 §M7-c8) — discriminated-union switch.**
 * The original H1-c8 closure used per-class `instanceof` branches.
 * M7-c8 (PR-J of cycle-8) superseded that with a single
 * `instanceof OrchestrationError` check followed by a
 * `switch (err.code)` whose default branch has a TS-exhaustive
 * `_exhaustive: never` assignment. Both flows still produce the
 * SAME `code` field values (`"cag_required"` / `"retrieval_required"`)
 * — the H1-c8 invariants are preserved at the wire level — but the
 * source-scan tests below pin the NEW catch shape, not the old
 * `instanceof CagRequiredError` chain. The OrchestrationError
 * registry contract is pinned by `m7-c8-orchestration-error-registry.test.ts`;
 * this file pins the cross-flow `code` field symmetry.
 *
 * Pinned invariants (post-M7-c8):
 *   1. Both files import `OrchestrationError` (the registry base)
 *   2. Both files have an `instanceof OrchestrationError` branch
 *      followed by `switch (err.code)`
 *   3. Both flows surface `code: "cag_required"` in the
 *      `case "cag_required"` branch (load-bearing — wire-level
 *      contract that UI/SSE consumers depend on)
 *   4. Both flows surface `code: "retrieval_required"` in the
 *      `case "retrieval_required"` branch
 *   5. Both files re-throw unrecognized errors (`throw err`) at the
 *      outer scope so unexpected failures still reach the outer
 *      error handler
 *   6. chat.ts's `SendChatMessageResult.code` typedef enumerates
 *      both codes (TypeScript exhaustiveness for callers)
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const CHAT_STREAM_PATH = join(
  process.cwd(),
  "server/agent-studio/chat-stream.ts",
);
const CHAT_TS_PATH = join(
  process.cwd(),
  "server/agent-studio/services/chat.ts",
);

const sources = {
  "chat-stream.ts": readFileSync(CHAT_STREAM_PATH, "utf8"),
  "chat.ts": readFileSync(CHAT_TS_PATH, "utf8"),
};

describe("H1-c8 — chat-stream ↔ chat.ts orchestrator-error symmetry", () => {
  for (const [label, src] of Object.entries(sources)) {
    describe(label, () => {
      it("imports OrchestrationError (M7-c8 registry base)", () => {
        // Post-M7-c8: the catch keys off the registry base, not the
        // per-class instanceof chain. The base must be imported.
        expect(
          src,
          `H1-c8 + M7-c8 violated: ${label} must import ` +
            `\`OrchestrationError\` from runtime/orchestration-error.ts.`,
        ).toMatch(/OrchestrationError/);
      });

      it("uses `instanceof OrchestrationError` + `switch (err.code)`", () => {
        // Load-bearing source-scan. The single-base catch + switch is
        // what makes new orchestration codes automatically routed +
        // exhaustively checked. A regression to per-class
        // `instanceof CagRequiredError` chains would silently lose
        // both properties.
        expect(
          src,
          `H1-c8 + M7-c8 violated: ${label} must have ` +
            `\`if (err instanceof OrchestrationError) { switch (err.code) {...} }\` ` +
            `at the orchestrator call site.`,
        ).toMatch(
          /instanceof\s+OrchestrationError[\s\S]{0,500}switch\s*\(\s*err\.code\s*\)/,
        );
      });

      it("surfaces `code: \"cag_required\"` in the case branch", () => {
        // Pin the EXACT string. SSE codes (chat-stream) and result-
        // shape codes (chat.ts) MUST match so a UI that handles
        // either flow keys off the same value.
        expect(
          src,
          `H1-c8 violated: ${label} must surface ` +
            `\`code: "cag_required"\` in the \`case "cag_required"\` ` +
            `branch so the structured error code reaches the caller. ` +
            `A different string or no code field collapses the H1-c8 ` +
            `distinction.`,
        ).toMatch(
          /case\s+"cag_required"\s*:[\s\S]{0,400}code:\s*"cag_required"/,
        );
      });

      it("surfaces `code: \"retrieval_required\"` in the case branch", () => {
        expect(
          src,
          `H1-c8 violated: ${label} must surface ` +
            `\`code: "retrieval_required"\` in the ` +
            `\`case "retrieval_required"\` branch.`,
        ).toMatch(
          /case\s+"retrieval_required"\s*:[\s\S]{0,400}code:\s*"retrieval_required"/,
        );
      });

      it("re-throws unrecognized errors (`throw err`) at outer scope", () => {
        // M7-c8: there are TWO `throw err` lines now — one inside the
        // default branch (defensive — if a new code is somehow added
        // at runtime without TS catching it) and one OUTSIDE the
        // OrchestrationError instanceof check (handles non-orchestration
        // errors like binding/network failures). Both should be
        // present; the outer one is load-bearing for the cross-flow
        // contract.
        expect(
          src,
          `H1-c8 violated: ${label} catch block must \`throw err\` ` +
            `for non-OrchestrationError classes so unexpected failures ` +
            `still reach the outer error handler.`,
        ).toMatch(/throw\s+err\s*;?/);
      });

      it("source carries the H1-c8 closure marker", () => {
        expect(src).toMatch(/H1-c8\b/);
      });
    });
  }
});

describe("H1-c8 — chat.ts SendChatMessageResult.code typedef enumerates new codes", () => {
  const src = sources["chat.ts"];

  it("`code` field includes `cag_required` literal", () => {
    expect(
      src,
      "H1-c8 violated: chat.ts SendChatMessageResult.code typedef " +
        "must include `\"cag_required\"` so callers get exhaustiveness " +
        "checking on the new code rather than falling back to the " +
        "`| string` escape hatch.",
    ).toMatch(/code\?:[\s\S]{0,400}"cag_required"/);
  });

  it("`code` field includes `retrieval_required` literal", () => {
    expect(
      src,
      "H1-c8 violated: chat.ts SendChatMessageResult.code typedef " +
        "must include `\"retrieval_required\"`.",
    ).toMatch(/code\?:[\s\S]{0,400}"retrieval_required"/);
  });

  it("typedef preserves the pre-cycle-8 binding-related codes", () => {
    // Don't accidentally drop the existing codes when adding new ones.
    expect(src).toMatch(/code\?:[\s\S]{0,400}"binding_required"/);
    expect(src).toMatch(/code\?:[\s\S]{0,400}"binding_missing_model"/);
  });
});
