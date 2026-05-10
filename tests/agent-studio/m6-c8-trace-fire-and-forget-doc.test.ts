/**
 * M6-c8 (cycle-8 audit `/sdcard/Download/RAC_ORCHESTRATOR_AUDIT_2026-05-09.md`
 * §M6-c8) — RAC trace persistence fire-and-forget doc-block.
 *
 * `chat-stream.ts:~1250` invokes the end-of-stream RAC trace write via
 * `.then().catch()` WITHOUT awaiting (intentional per L4-c5's trace-vs-
 * audit asymmetry — trace is best-effort observability; await-ing it
 * would couple chat-turn latency to ASDB write latency on every turn).
 *
 * Pre-cycle-8 the call site had no doc-block naming the contract. A
 * future reader could reasonably mistake the missing `await` for a bug
 * and "fix" it — silently regressing chat-turn latency.
 *
 * Cycle-8 closure: doc-block above the writeTrace call naming L4-c5,
 * the intentional-no-await rationale, and the consequence of changing
 * it. Source-scan lockstep pins the doc-block + the no-await contract.
 *
 * Cross-flow asymmetry: chat.ts (offline / test-run-binding flow) does
 * NOT have an end-of-stream RAC trace persistence call — its trace
 * surface is the per-tool-call `persistRuntimeToolCallTrace` which IS
 * awaited (the next dispatch would race a non-awaited write). Both flows'
 * contracts are pinned below; the asymmetry is documented in chat.ts so
 * a future RAC-trace addition replicates the doc-block.
 *
 * Pinned invariants:
 *   1. chat-stream.ts has the M6-c8 doc-block immediately above the
 *      `writeTrace(...)` call site (regex ignores comments per cycle-7
 *      lessons — but here we WANT the comment, so the regex matches it).
 *   2. chat-stream.ts's writeTrace call is NOT awaited (load-bearing —
 *      a future PR adding `await writeTrace(...)` fails this test
 *      before the regression reaches prod).
 *   3. chat-stream.ts has the .then().catch() shape (the leaf-level
 *      breadcrumb on failure).
 *   4. chat.ts documents the asymmetry above its `persistRuntimeToolCallTrace`
 *      call (so future readers know why chat.ts uses await but
 *      chat-stream.ts doesn't).
 *   5. chat.ts does NOT call `writeTrace` (the cross-flow negative
 *      assertion — if a future PR adds RAC trace persistence to chat.ts,
 *      this test fails and forces the developer to replicate the
 *      doc-block).
 *   6. M6-c8 closure marker present in both files.
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

const chatStreamSrc = readFileSync(CHAT_STREAM_PATH, "utf8");
const chatTsSrc = readFileSync(CHAT_TS_PATH, "utf8");

describe("M6-c8 — chat-stream.ts trace fire-and-forget doc-block", () => {
  it("has the L4-c5 fire-and-forget contract doc-block above writeTrace", () => {
    // Match the doc-block keywords that name the contract, in any order
    // (we don't dictate authoring order — just presence within the same
    // ~2000-char window above a writeTrace call):
    //   - M6-c8 closure tag
    //   - L4-c5 contract reference
    //   - "fire-and-forget" or "FIRE-AND-FORGET" naming the pattern
    //   - The writeTrace call follows within ~2000 chars
    //
    // The 2000-char window is wide enough for a thorough doc-block but
    // narrow enough that a doc-block 100 lines away (i.e., not actually
    // documenting THIS call) would not match.
    const hasAllThree =
      /M6-c8/.test(chatStreamSrc) &&
      /L4-c5/.test(chatStreamSrc) &&
      /(?:fire-and-forget|FIRE-AND-FORGET)/.test(chatStreamSrc);
    expect(
      hasAllThree,
      "M6-c8 (cycle-8 audit §M6-c8): the L4-c5 fire-and-forget doc-block " +
        "must name M6-c8, L4-c5, and the fire-and-forget pattern. " +
        "Without it, a future reader will 'fix' the missing await and " +
        "couple chat-turn latency to ASDB write speed.",
    ).toBe(true);

    // Locality check: the M6-c8 closure tag must appear within 2000
    // chars BEFORE the writeTrace( call (so the doc-block actually
    // documents the call, not some unrelated section).
    const writeTraceIdx = chatStreamSrc.search(/writeTrace\s*\(/);
    expect(writeTraceIdx).toBeGreaterThan(0);
    const window = chatStreamSrc.slice(
      Math.max(0, writeTraceIdx - 2000),
      writeTraceIdx,
    );
    expect(
      window,
      "M6-c8: the doc-block must be within 2000 chars above the " +
        "writeTrace call site. A doc-block at the top of the file " +
        "describing the contract would not actually document THIS call.",
    ).toMatch(/M6-c8/);
  });

  it("warns against adding `await` in the doc-block (load-bearing breadcrumb)", () => {
    // The doc-block must explicitly say DO NOT add await. This is the
    // single most important sentence — without it, the doc-block could
    // describe the contract but fail to convey the directive.
    const re = /(?:DO NOT add `?await`?|do not add `?await`?|DO NOT.*await)/;
    expect(
      chatStreamSrc,
      "M6-c8: the doc-block must explicitly forbid adding `await`. " +
        "Documentation that describes a contract without naming the " +
        "directive is too easy to miss in a 'cleanup' PR.",
    ).toMatch(re);
  });

  it("writeTrace call uses .then().catch() (not await)", () => {
    // The call must be the fire-and-forget shape:
    //   writeTrace({...}).then(...).catch(...)
    // NOT:
    //   await writeTrace({...})
    // Source-scan asserts the .then(...) follows the writeTrace( call
    // closing paren within a small distance.
    const fireAndForget = /writeTrace\s*\(\s*\{[\s\S]*?\}\s*\)\s*\.then\s*\(/;
    expect(chatStreamSrc).toMatch(fireAndForget);
  });

  it("writeTrace call is NOT awaited (cycle-8 invariant)", () => {
    // Negative assertion: search for `await writeTrace(` anywhere in the
    // file. If present, a future PR has added await and broken the
    // contract. The test fails before the latency regression ships.
    const awaited = /await\s+writeTrace\s*\(/;
    expect(
      chatStreamSrc.match(awaited),
      "M6-c8: `await writeTrace(...)` is forbidden in chat-stream.ts. " +
        "The L4-c5 contract is fire-and-forget; await would couple " +
        "chat-turn latency to ASDB write speed.",
    ).toBeNull();
  });

  it("writeTrace call has a .catch() leaf-level breadcrumb", () => {
    // The .catch() is part of the contract — it ensures trace-write
    // failures are visible to operators (single line in stdout) without
    // affecting the user-visible response.
    const withCatch = /writeTrace\s*\([\s\S]*?\)\s*\.then\s*\([\s\S]*?\)\s*\.catch\s*\(/;
    expect(chatStreamSrc).toMatch(withCatch);
  });

  it("M6-c8 closure marker is present", () => {
    expect(chatStreamSrc).toMatch(/M6-c8/);
  });
});

describe("M6-c8 — chat.ts cross-flow asymmetry pin", () => {
  it("documents the asymmetry above persistRuntimeToolCallTrace", () => {
    // chat.ts uses synchronous await for traces. The asymmetry note
    // explains WHY (chat.ts traces are the audit ledger for offline
    // runs; the next dispatch would race a non-awaited write) and
    // tells future contributors to replicate the M6-c8 doc-block if
    // they add RAC trace persistence.
    const re =
      /M6-c8[\s\S]{0,800}cross-flow[\s\S]{0,2000}persistRuntimeToolCallTrace/;
    expect(
      chatTsSrc,
      "M6-c8: the cross-flow asymmetry note must appear above " +
        "persistRuntimeToolCallTrace in chat.ts. Without it, a future " +
        "reader cannot tell why chat.ts uses await but chat-stream.ts " +
        "doesn't.",
    ).toMatch(re);
  });

  it("does NOT call writeTrace (the cross-flow negative assertion)", () => {
    // chat.ts is the offline / test-run-binding flow and does NOT have
    // an end-of-stream RAC trace persistence call. If a future PR adds
    // writeTrace to chat.ts, this assertion fails — forcing the
    // developer to update both this test AND the M6-c8 doc-block in
    // chat.ts (the asymmetry note explicitly names this contract).
    //
    // Strip comments before scanning — the cross-flow asymmetry doc-block
    // legitimately mentions `writeTrace(...)` as a reference to chat-
    // stream's call. We only want to fail on a real CALL, not a comment.
    const stripped = chatTsSrc
      .replace(/\/\/[^\n]*/g, "") // line comments
      .replace(/\/\*[\s\S]*?\*\//g, ""); // block comments
    const callsWriteTrace = /\bwriteTrace\s*\(/;
    expect(
      stripped.match(callsWriteTrace),
      "M6-c8: chat.ts does not have an end-of-stream RAC trace " +
        "persistence call (the cross-flow asymmetry). If you're adding " +
        "one, REPLICATE the M6-c8 fire-and-forget doc-block from " +
        "chat-stream.ts and update this test to parametrize over both " +
        "flows.",
    ).toBeNull();
  });

  it("M6-c8 closure marker is present", () => {
    expect(chatTsSrc).toMatch(/M6-c8/);
  });
});

describe("M6-c8 — cross-flow lockstep parametrized over both flows", () => {
  // Cycle-7 H8-c7 / H1-c8 / H5-c8 idiom: parametrize over both files,
  // assert each flow's contract. Here the contracts ARE asymmetric
  // (fire-and-forget vs. await), so the lockstep documents the
  // asymmetry rather than enforcing identical shapes.
  const flows = [
    { name: "chat-stream.ts", src: chatStreamSrc },
    { name: "chat.ts", src: chatTsSrc },
  ];

  for (const { name, src } of flows) {
    it(`${name} carries its M6-c8 closure marker`, () => {
      expect(
        src,
        `M6-c8 closure marker missing from ${name}. Both flows must mark ` +
          `the audit-item closure so future audits can confirm coverage.`,
      ).toMatch(/M6-c8/);
    });
  }
});
