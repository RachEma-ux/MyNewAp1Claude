/**
 * L2-c7 + L3-c7 + L4-c7 (cycle-7 audit
 * `/sdcard/Download/POST_DISPATCH_AUDIT_2026-05-09.md`) — sub-arc PR-H.
 *
 * Three small post-dispatch closures bundled by file boundary:
 *   - L2-c7: SSE result-size known limitation — doc-block at
 *     `chat-stream.ts` tool_end emit site documenting why no
 *     truncation cap lives there (folded into H2-c7's outputSchema
 *     follow-up).
 *   - L3-c7: OAuth token refresh lifecycle — doc-block at the
 *     dispatcher's Phase 19a header documenting that mid-call
 *     refresh is not supported and expiry surfaces as
 *     `transport_http_error` (M8-c7).
 *   - L4-c7: explicit `resultTruncated: boolean` flag on the audit
 *     payload — replaces the implicit "…[truncated]" sentinel
 *     string that external readers had to grep for.
 *
 * The lockstep below pins each:
 *   - Closure markers on chat-stream.ts (L2) + dispatcher.ts (L3+L4)
 *     + dispatcher-types.ts (L4 type)
 *   - L2 doc-block names the H2-c7 follow-up + the durable-message-
 *     store mitigation (so a future PR doesn't think the limitation
 *     is unrecognized).
 *   - L3 doc-block names the `McpAuthRequiredError` flow + that
 *     mid-call refresh is intentionally absent (catches a future PR
 *     that adds silent refresh without updating the latency model).
 *   - L4: McpDispatchAuditPayload has the field, dispatcher inits
 *     it to false, success-path sets it from `truncateResultPreview`
 *     return (the load-bearing assertion).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const CHAT_STREAM_PATH = join(
  process.cwd(),
  "server/agent-studio/chat-stream.ts",
);
const DISPATCHER_PATH = join(
  process.cwd(),
  "server/agent-studio/services/mcp/dispatcher.ts",
);
const DISPATCHER_TYPES_PATH = join(
  process.cwd(),
  "server/agent-studio/services/mcp/dispatcher-types.ts",
);

// ─────────────────────────────────────────────────────────────────────
// L2-c7 — SSE result-size known limitation doc-block
// ─────────────────────────────────────────────────────────────────────

describe("L2-c7 — SSE result-size known-limitation doc-block", () => {
  const src = readFileSync(CHAT_STREAM_PATH, "utf8");

  it("chat-stream.ts carries the L2-c7 closure marker", () => {
    expect(src).toMatch(/L2-c7\b/);
  });

  it("doc-block names the H2-c7 outputSchema follow-up (long-term fix)", () => {
    // The right cap point is the schema-validation framework, not
    // SSE-side truncation. Naming H2-c7 keeps the discovery surface
    // wired so a future PR finds the proper home for the cap.
    expect(
      src,
      "L2-c7 violated: chat-stream.ts L2-c7 doc-block must reference " +
        "H2-c7 (the schema-validation follow-up where size enforcement " +
        "actually belongs) so a future PR doesn't put SSE-side " +
        "truncation in the wrong layer.",
    ).toMatch(/L2-c7[\s\S]{0,1500}H2-c7/);
  });

  it("doc-block names the durable-message-store mitigation", () => {
    // The reason this is L (not M/H): SSE is just the live
    // notification — the canonical record is `agsChatMessages`
    // which appendChatMessage wrote BEFORE the SSE event. A
    // stalled SSE loses the notification, not data.
    expect(
      src,
      "L2-c7 violated: chat-stream.ts L2-c7 doc-block must explain " +
        "WHY the limitation is L-priority — the message-store path is " +
        "the canonical record, so a stalled SSE loses the notification " +
        "but not the data. Without naming this mitigation, a future " +
        "audit could re-flag the item at a higher priority.",
    ).toMatch(/L2-c7[\s\S]{0,1500}appendChatMessage|message-store|durable persistence/i);
  });

  it("doc-block sits at the tool_end emit site (not floating elsewhere)", () => {
    // The doc-block has to be visually adjacent to the unguarded
    // emit so a reviewer adding new emit branches can see the
    // limitation without grepping.
    expect(
      src,
      "L2-c7 violated: chat-stream.ts L2-c7 doc-block must be " +
        "adjacent to the `sendEvent({ type: \"tool_end\", ..., result: }) ` " +
        "emit so a reviewer adding new emit branches sees the " +
        "limitation in context.",
    ).toMatch(
      /L2-c7[\s\S]{0,2000}sendEvent\(\{[\s\S]{0,200}type:\s*"tool_end"[\s\S]{0,200}result:/,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────
// L3-c7 — OAuth refresh lifecycle doc-block
// ─────────────────────────────────────────────────────────────────────

describe("L3-c7 — OAuth refresh lifecycle doc-block at Phase 19a header", () => {
  const src = readFileSync(DISPATCHER_PATH, "utf8");

  it("dispatcher.ts carries the L3-c7 closure marker", () => {
    expect(src).toMatch(/L3-c7\b/);
  });

  it("doc-block names McpAuthRequiredError + needs_auth FSM flow", () => {
    expect(
      src,
      "L3-c7 violated: dispatcher.ts L3-c7 doc-block must name " +
        "`McpAuthRequiredError` AND `needs_auth` so a future reader " +
        "tracing 'what happens when a token expires mid-call' finds " +
        "the recovery path without re-deriving it.",
    ).toMatch(/L3-c7[\s\S]{0,1500}McpAuthRequiredError[\s\S]{0,400}needs_auth/);
  });

  it("doc-block declares 'no mid-call silent refresh' explicitly", () => {
    // The intentional absence. A future PR adding silent refresh
    // would change the latency model — the doc-block forces them to
    // update the contract here.
    expect(
      src,
      "L3-c7 violated: dispatcher.ts L3-c7 doc-block must say " +
        "explicitly that mid-call silent refresh is NOT supported, " +
        "and explain why (latency-model unpredictability + need-auth " +
        "UI handles the recovery case).",
    // Permit JSDoc continuation chars (asterisks, whitespace) between
    // tokens so the multi-line "NO mid-call silent\n * refresh" form
    // still matches.
    ).toMatch(/L3-c7[\s\S]{0,1500}NO[\s\*]+mid-call[\s\*]+silent[\s\*]+refresh/i);
  });

  it("doc-block links to M8-c7's transport_http_error (the actual surface code)", () => {
    expect(
      src,
      "L3-c7 violated: doc-block must link to the dispatcher code an " +
        "expired token surfaces as (`transport_http_error` per M8-c7) " +
        "so operators reading `transport_http_error` audit rows know " +
        "to check token state.",
    ).toMatch(/L3-c7[\s\S]{0,1500}transport_http_error/);
  });
});

// ─────────────────────────────────────────────────────────────────────
// L4-c7 — resultTruncated boolean on audit payload
// ─────────────────────────────────────────────────────────────────────

describe("L4-c7 — explicit resultTruncated boolean on audit payload", () => {
  const dispSrc = readFileSync(DISPATCHER_PATH, "utf8");
  const typesSrc = readFileSync(DISPATCHER_TYPES_PATH, "utf8");

  it("dispatcher.ts carries the L4-c7 closure marker", () => {
    expect(dispSrc).toMatch(/L4-c7\b/);
  });

  it("dispatcher-types.ts carries the L4-c7 closure marker", () => {
    expect(typesSrc).toMatch(/L4-c7\b/);
  });

  it("McpDispatchAuditPayload declares resultTruncated: boolean (not optional)", () => {
    // Making the field non-optional means a future PR that adds a
    // new audit-payload-construction site will get a typescript
    // error if it forgets the flag — the type system enforces the
    // contract. Mirrors how H3-c7 made sandboxErrorCode required.
    expect(
      typesSrc,
      "L4-c7 violated: McpDispatchAuditPayload must declare " +
        "`resultTruncated: boolean` (non-optional) so external " +
        "readers can rely on the field being present + so future " +
        "audit-payload constructors get a tsc error if they forget it.",
    ).toMatch(/resultTruncated:\s*boolean/);
  });

  it("truncateResultPreview returns a {preview, truncated} shape", () => {
    expect(
      dispSrc,
      "L4-c7 violated: truncateResultPreview must return both the " +
        "preview AND the truncated boolean so the audit-row builder " +
        "can pin both fields without re-implementing the truncation " +
        "check externally.",
    ).toMatch(
      /function truncateResultPreview[\s\S]{0,200}preview:\s*unknown[\s\S]{0,100}truncated:\s*boolean/,
    );
  });

  it("dispatcher inits resultTruncated to false in the audit payload", () => {
    // The success-path is the only path that flips it to true; all
    // failure paths keep it false (since they don't write a preview).
    expect(
      dispSrc,
      "L4-c7 violated: dispatcher must init `resultTruncated: false` " +
        "in the auditPayload literal so failure paths (which never " +
        "call truncateResultPreview) carry the explicit-false signal.",
    ).toMatch(/resultTruncated:\s*false/);
  });

  it("success path sets resultTruncated from truncateResultPreview's return", () => {
    // The load-bearing assertion. A future PR that "simplified" by
    // dropping the boolean and reverting to the sentinel-string
    // approach would break the lockstep here.
    expect(
      dispSrc,
      "L4-c7 violated: dispatcher success-path must set " +
        "`auditPayload.resultTruncated = previewResult.truncated` so " +
        "the boolean reflects the actual truncation outcome rather " +
        "than staying at the init-false default.",
    ).toMatch(
      /auditPayload\.resultTruncated\s*=\s*previewResult\.truncated/,
    );
  });
});
