/**
 * Phase 11b-2 (Roadmap V3) — observability writers, lockstep with
 * Phase 11b-1 (chat-stream).
 *
 * Locks the parallel-flow lockstep wiring on the BLOCKING chat lane
 * (`server/agent-studio/services/chat.ts`) + the abort-reason
 * capture on the simulation lane (`services/simulation.ts`).
 *
 * **Why two files instead of one:**
 *
 *   chat.ts — uses Result-typed returns (`{ok:false, error}`)
 *             instead of throws. Catches only thrown errors as
 *             `errorReason`; Result-typed `ok:false` paths are not
 *             observed at the run-level (deferred until a future
 *             dashboard surfaces the gap).
 *
 *   simulation.ts — already creates a runtime-run row + writes the
 *                   terminal `updateRuntimeRun`. Phase 11b-2 only
 *                   adds `abortReason` capture + threads it into
 *                   the existing terminal call. Smaller surface
 *                   than chat.ts.
 *
 * Pure source-scan invariants — no DB, no network. Behavioral
 * verification is operator-side.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const REPO_ROOT = process.cwd();
const CHAT_TS = readFileSync(
  join(REPO_ROOT, "server/agent-studio/services/chat.ts"),
  "utf8",
);
const SIMULATION = readFileSync(
  join(REPO_ROOT, "server/agent-studio/services/simulation.ts"),
  "utf8",
);

describe("Phase 11b-2 — observability writers (chat.ts blocking lane)", () => {
  it("creates an agsRuntimeRuns row with triggerType=\"chat\"", () => {
    // Distinct from chat-stream's triggerType="chat-stream" so
    // operator dashboards can filter by lane.
    expect(CHAT_TS).toMatch(
      /repo\.appendRuntimeRun\(\s*\{[\s\S]{0,400}triggerType:\s*["']chat["']/,
    );
  });

  it("hoists chatRunId for try/finally visibility", () => {
    expect(CHAT_TS).toMatch(/let\s+chatRunId\s*:\s*number\s*\|\s*null\s*=\s*null/);
  });

  it("declares finalizeChatBlockingRun closure", () => {
    expect(CHAT_TS).toMatch(
      /const\s+finalizeChatBlockingRun\s*=\s*async[\s\S]{0,1500}repo\.updateRuntimeRun\(/,
    );
  });

  it("row creation is best-effort (try/catch + warn)", () => {
    expect(CHAT_TS).toMatch(
      /repo\.appendRuntimeRun[\s\S]{0,1000}catch[\s\S]{0,200}\[chat\/observability\]\s+appendRuntimeRun\s+failed/,
    );
  });

  it("body wraps in try/catch/finally with errorReason capture", () => {
    // The catch captures the throw as errorReason; the finally
    // calls finalizeChatBlockingRun with the captured value (or
    // undefined for clean termination).
    expect(CHAT_TS).toMatch(/let\s+_chatErrorReason:\s*string\s*\|\s*undefined/);
    expect(CHAT_TS).toMatch(
      /catch[\s\S]{0,200}_chatErrorReason\s*=\s*e\s+instanceof\s+Error/,
    );
    expect(CHAT_TS).toMatch(
      /finally[\s\S]{0,400}finalizeChatBlockingRun\(\s*\{\s*\n?\s*status:\s*_chatErrorReason\s*\?\s*["']failed["']\s*:\s*["']completed["']/,
    );
  });

  it("re-throws caught errors (preserves the original contract)", () => {
    // sendChatMessage's existing callers expect throws to propagate.
    // Phase 11b-2 only OBSERVES, doesn't change error semantics.
    expect(CHAT_TS).toMatch(/_chatErrorReason\s*=[\s\S]{0,100}throw\s+e\s*;/);
  });

  it("terminal write uses the canonical durationMs from chatStartedAt", () => {
    expect(CHAT_TS).toMatch(
      /durationMs:\s*Date\.now\(\)\s*-\s*chatStartedAt/,
    );
  });

  it("doc-block notes the Result-typed-return deferral", () => {
    // The catch only captures THROWN errors, NOT Result-typed
    // `{ok:false}` returns. Lock the doc-comment so the gap stays
    // visible to future readers.
    expect(CHAT_TS).toMatch(/Result-typed[\s\S]{0,600}deferred/i);
  });
});

describe("Phase 11b-2 — observability writers (simulation lane)", () => {
  it("declares abortReason as a let-binding", () => {
    expect(SIMULATION).toMatch(
      /let\s+abortReason\s*:\s*string\s*\|\s*undefined/,
    );
  });

  it("captures abortReason at every aborted=true site", () => {
    // Three abort sites:
    //   1. intent classification block (strict policy)
    //   2. destructive-tool no-approval site
    //   3. governance evaluation block
    // Each MUST set abortReason so the terminal updateRuntimeRun
    // surfaces a meaningful errorReason. Locking the literal
    // strings catches a future PR that adds a new abort site
    // without setting the reason.
    expect(SIMULATION).toMatch(
      /abortReason\s*=\s*["']intent classification blocked/,
    );
    expect(SIMULATION).toMatch(
      /abortReason\s*=[\s\S]{0,200}destructive tool[\s\S]{0,200}without approval/,
    );
    expect(SIMULATION).toMatch(
      /abortReason\s*=[\s\S]{0,200}governance/,
    );
  });

  it("terminal updateRuntimeRun forwards abortReason as errorReason", () => {
    expect(SIMULATION).toMatch(
      /updateRuntimeRun\([\s\S]{0,800}errorReason:\s*aborted\s*\?\s*abortReason\s*:\s*undefined/,
    );
  });

  it("undefined errorReason on clean termination (no false positives)", () => {
    // The ternary returns undefined when not aborted — preserves
    // the column nullability so dashboards filtering on `WHERE
    // errorReason IS NOT NULL` correctly target failed runs only.
    // The previous assertion already locks the ternary; this is
    // belt-and-suspenders documentation.
    expect(SIMULATION).toMatch(
      /\?\s*abortReason\s*:\s*undefined/,
    );
  });
});

describe("Phase 11b-2 — parallel-flow lockstep with Phase 11b-1", () => {
  it("both chat lanes use the same observability column set", () => {
    // chat-stream populates: status, sseFirstTokenMs, sseDurationMs,
    // errorReason, clientDisconnected, idempotencyConflicts.
    // chat.ts (blocking) populates: status, durationMs, errorReason.
    // The blocking lane has no SSE/disconnect/idempotency concept,
    // so those columns stay null — that's by design.
    // What both MUST share: status + (S/d)urationMs + errorReason.
    expect(CHAT_TS).toMatch(/status:[\s\S]{0,100}terminal\.status/);
    expect(CHAT_TS).toMatch(/durationMs/);
    expect(CHAT_TS).toMatch(/errorReason/);
  });

  it("blocking lane does NOT claim SSE-only columns (no false positives)", () => {
    // Locking the absence catches a future copy-paste from chat-stream
    // that would silently write nonsense values for SSE columns on
    // blocking-path runs.
    expect(CHAT_TS).not.toMatch(/finalizeChatBlockingRun[\s\S]{0,1500}sseFirstTokenMs/);
    expect(CHAT_TS).not.toMatch(/finalizeChatBlockingRun[\s\S]{0,1500}clientDisconnected/);
  });
});
