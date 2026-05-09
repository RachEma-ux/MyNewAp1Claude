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
 * Pinned invariants:
 *   1. Both files import `CagRequiredError` + `RetrievalRequiredError`
 *   2. Both files have an explicit `instanceof CagRequiredError` branch
 *   3. Both files have an explicit `instanceof RetrievalRequiredError`
 *      branch
 *   4. Both branches surface a `code` field with the matching string
 *      (`"cag_required"` / `"retrieval_required"`) — the load-bearing
 *      assertion; a future PR that "simplified" by dropping the code
 *      field would silently restore the pre-cycle-8 collapse
 *   5. Both files re-throw unrecognized errors (`throw err`) so the
 *     outer try/catch still handles unexpected failures uniformly
 *   6. chat.ts's `SendChatMessageResult.code` typedef enumerates the
 *      new codes (typescript exhaustiveness for callers)
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
      it("imports both error classes", () => {
        expect(
          src,
          `H1-c8 violated: ${label} must import \`CagRequiredError\`. ` +
            `Without the import, the instanceof branch can't compile.`,
        ).toMatch(/CagRequiredError/);
        expect(
          src,
          `H1-c8 violated: ${label} must import \`RetrievalRequiredError\`. ` +
            `Without the import, the instanceof branch can't compile.`,
        ).toMatch(/RetrievalRequiredError/);
      });

      it("has an explicit `instanceof CagRequiredError` branch", () => {
        // The load-bearing source-scan. A future PR that removed the
        // catch (or replaced it with a generic `error.name === ...`
        // string compare) would silently change the error shape.
        expect(
          src,
          `H1-c8 violated: ${label} must have an explicit ` +
            `\`if (err instanceof CagRequiredError)\` branch around ` +
            `the orchestrator call site. The instanceof check is what ` +
            `preserves the structured error type across the catch.`,
        ).toMatch(/instanceof\s+CagRequiredError/);
      });

      it("has an explicit `instanceof RetrievalRequiredError` branch", () => {
        expect(
          src,
          `H1-c8 violated: ${label} must have an explicit ` +
            `\`if (err instanceof RetrievalRequiredError)\` branch.`,
        ).toMatch(/instanceof\s+RetrievalRequiredError/);
      });

      it("surfaces `code: \"cag_required\"` in the CAG branch", () => {
        // Pin the EXACT string. SSE codes (chat-stream) and result-
        // shape codes (chat.ts) MUST match so a UI that handles
        // either flow keys off the same value.
        expect(
          src,
          `H1-c8 violated: ${label} must surface ` +
            `\`code: "cag_required"\` in the CagRequiredError branch ` +
            `so the structured error code reaches the caller (UI / SSE ` +
            `consumer). A different string or no code field collapses ` +
            `the H1-c8 distinction.`,
        ).toMatch(
          /instanceof\s+CagRequiredError[\s\S]{0,400}code:\s*"cag_required"/,
        );
      });

      it("surfaces `code: \"retrieval_required\"` in the retrieval branch", () => {
        expect(
          src,
          `H1-c8 violated: ${label} must surface ` +
            `\`code: "retrieval_required"\` in the ` +
            `RetrievalRequiredError branch.`,
        ).toMatch(
          /instanceof\s+RetrievalRequiredError[\s\S]{0,400}code:\s*"retrieval_required"/,
        );
      });

      it("re-throws unrecognized errors (`throw err`)", () => {
        // The outer try/catch at the call boundary still handles
        // unexpected failures uniformly. Without the re-throw, a
        // future bug in the orchestrator that throws an unknown error
        // class would be silently swallowed.
        expect(
          src,
          `H1-c8 violated: ${label} catch block must \`throw err\` ` +
            `for unrecognized error classes so unexpected failures ` +
            `still reach the outer error handler.`,
        ).toMatch(
          /instanceof\s+RetrievalRequiredError[\s\S]{0,500}throw\s+err/,
        );
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
