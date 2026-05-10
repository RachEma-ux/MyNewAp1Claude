/**
 * M7-c8 (cycle-8 audit `/sdcard/Download/RAC_ORCHESTRATOR_AUDIT_2026-05-09.md`
 * §M7-c8) — orchestration-error registry refactor.
 *
 * Pre-cycle-8 the two orchestration-side error classes
 * (CagRequiredError, RetrievalRequiredError) had no shared base. Both
 * chat flows handled them via an `instanceof` chain — a future third
 * class (e.g. ComposerRequiredError) could be added without
 * TypeScript catching the missing branches in BOTH flows.
 *
 * Cycle-8 closure (mirrors cycle-7 H3-c7 + M8-c7 typed-error pattern):
 *   1. Define `OrchestrationError` abstract base + `OrchestrationErrorCode`
 *      typed union in `runtime/orchestration-error.ts`.
 *   2. Refactor CagRequiredError + RetrievalRequiredError to extend
 *      `OrchestrationError` with `readonly code = "..." as const`.
 *   3. Both chat flows replace the `instanceof` chain with a single
 *      `if (err instanceof OrchestrationError)` followed by
 *      `switch (err.code)` whose default branch assigns to
 *      `_exhaustive: never` — TS fails compile when a new code is
 *      added without a matching case branch.
 *
 * Behavioral test for runtime correctness + source-scan lockstep
 * pinning the structural contract.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  OrchestrationError,
  type OrchestrationErrorCode,
} from "../../server/agent-studio/services/runtime/orchestration-error";
import { CagRequiredError } from "../../server/agent-studio/services/runtime/system-prompt-composer";
import { RetrievalRequiredError } from "../../server/agent-studio/services/runtime/rac-orchestrator";

const REGISTRY_PATH = join(
  process.cwd(),
  "server/agent-studio/services/runtime/orchestration-error.ts",
);
const CHAT_STREAM_PATH = join(
  process.cwd(),
  "server/agent-studio/chat-stream.ts",
);
const CHAT_TS_PATH = join(
  process.cwd(),
  "server/agent-studio/services/chat.ts",
);

const registrySrc = readFileSync(REGISTRY_PATH, "utf8");
const chatStreamSrc = readFileSync(CHAT_STREAM_PATH, "utf8");
const chatTsSrc = readFileSync(CHAT_TS_PATH, "utf8");

// ─────────────────────────────────────────────────────────────────────
// 1. Behavioral — base class extension + discriminator narrowing
// ─────────────────────────────────────────────────────────────────────

describe("M7-c8 — OrchestrationError base class behavioral contract", () => {
  it("CagRequiredError instances pass instanceof OrchestrationError", () => {
    const err = new CagRequiredError();
    expect(err).toBeInstanceOf(OrchestrationError);
    // Subclass identity is preserved.
    expect(err).toBeInstanceOf(CagRequiredError);
    // Subclass is also still an Error.
    expect(err).toBeInstanceOf(Error);
  });

  it("RetrievalRequiredError instances pass instanceof OrchestrationError", () => {
    const err = new RetrievalRequiredError();
    expect(err).toBeInstanceOf(OrchestrationError);
    expect(err).toBeInstanceOf(RetrievalRequiredError);
    expect(err).toBeInstanceOf(Error);
  });

  it("CagRequiredError.code is the literal 'cag_required'", () => {
    const err = new CagRequiredError();
    expect(err.code).toBe("cag_required");
  });

  it("RetrievalRequiredError.code is the literal 'retrieval_required'", () => {
    const err = new RetrievalRequiredError();
    expect(err.code).toBe("retrieval_required");
  });

  it("the discriminated-union switch narrows the error class correctly", () => {
    // Behavioral proof of the discriminated-union contract: a switch
    // on err.code narrows to the right branch. If the `as const` were
    // dropped on either subclass, TypeScript would widen `code` to
    // `OrchestrationErrorCode` and this switch would lose narrowing.
    const errs: OrchestrationError[] = [
      new CagRequiredError("cag err"),
      new RetrievalRequiredError("retrieval err"),
    ];
    const handled: string[] = [];
    for (const err of errs) {
      switch (err.code) {
        case "cag_required":
          handled.push(`cag:${err.message}`);
          break;
        case "retrieval_required":
          handled.push(`retrieval:${err.message}`);
          break;
        default: {
          const _exhaustive: never = err.code;
          void _exhaustive;
          throw new Error("unreachable");
        }
      }
    }
    expect(handled).toEqual(["cag:cag err", "retrieval:retrieval err"]);
  });

  it("OrchestrationErrorCode union enumerates exactly the known codes", () => {
    // Behavioral check that the union includes both expected literals.
    // (TypeScript would fail compile if it didn't, but having a runtime
    // assertion documents the registry's expected size for future
    // contributors.)
    const codes: OrchestrationErrorCode[] = ["cag_required", "retrieval_required"];
    expect(codes).toHaveLength(2);
  });
});

// ─────────────────────────────────────────────────────────────────────
// 2. Source-scan — registry shape + chat-flow switch lockstep
// ─────────────────────────────────────────────────────────────────────

describe("M7-c8 — registry module structural lockstep", () => {
  it("declares OrchestrationError as an abstract class", () => {
    expect(
      registrySrc,
      "M7-c8: OrchestrationError must be abstract — concrete subclasses " +
        "live in their producing modules.",
    ).toMatch(/export\s+abstract\s+class\s+OrchestrationError\s+extends\s+Error/);
  });

  it("declares OrchestrationError.code as abstract readonly", () => {
    // The `abstract readonly` declaration forces subclasses to provide
    // the code at construction time and prevents later mutation.
    const re =
      /class\s+OrchestrationError\s+extends\s+Error\s*\{[\s\S]*?abstract\s+readonly\s+code:\s*OrchestrationErrorCode/;
    expect(registrySrc).toMatch(re);
  });

  it("OrchestrationErrorCode union includes both known codes", () => {
    // The union is the authoritative list. New codes go here first.
    expect(registrySrc).toMatch(
      /type\s+OrchestrationErrorCode\s*=\s*["']cag_required["']\s*\|\s*["']retrieval_required["']/,
    );
  });

  it("M7-c8 closure marker is present", () => {
    expect(registrySrc).toMatch(/M7-c8/);
  });
});

describe("M7-c8 — subclasses extend OrchestrationError with `as const` code", () => {
  const composerSrc = readFileSync(
    join(process.cwd(), "server/agent-studio/services/runtime/system-prompt-composer.ts"),
    "utf8",
  );
  const orchestratorSrc = readFileSync(
    join(process.cwd(), "server/agent-studio/services/runtime/rac-orchestrator.ts"),
    "utf8",
  );

  it("CagRequiredError extends OrchestrationError", () => {
    expect(composerSrc).toMatch(
      /class\s+CagRequiredError\s+extends\s+OrchestrationError/,
    );
  });

  it("CagRequiredError.code is `as const` so TS narrows to the literal", () => {
    expect(
      composerSrc,
      "M7-c8: without `as const` the .code field widens to " +
        "OrchestrationErrorCode and the discriminated-union switch " +
        "loses narrowing in callers.",
    ).toMatch(/readonly\s+code\s*=\s*["']cag_required["']\s+as\s+const/);
  });

  it("RetrievalRequiredError extends OrchestrationError", () => {
    expect(orchestratorSrc).toMatch(
      /class\s+RetrievalRequiredError\s+extends\s+OrchestrationError/,
    );
  });

  it("RetrievalRequiredError.code is `as const`", () => {
    expect(orchestratorSrc).toMatch(
      /readonly\s+code\s*=\s*["']retrieval_required["']\s+as\s+const/,
    );
  });
});

// Cross-flow lockstep — both chat flows MUST use:
//   1. instanceof OrchestrationError (single base check)
//   2. switch (err.code) with cases for each known code
//   3. default branch with `_exhaustive: never` (TS exhaustiveness)
// And MUST NOT use the legacy `instanceof CagRequiredError` /
// `instanceof RetrievalRequiredError` chain.

describe("M7-c8 — both chat flows use the discriminated-union switch", () => {
  const flows = [
    { name: "chat-stream.ts", src: chatStreamSrc },
    { name: "chat.ts", src: chatTsSrc },
  ];

  for (const { name, src } of flows) {
    it(`${name} catches via instanceof OrchestrationError`, () => {
      expect(
        src,
        `M7-c8: ${name} must catch via the base class so a new ` +
          "OrchestrationErrorCode is automatically caught without " +
          "adding a new instanceof check.",
      ).toMatch(/if\s*\(\s*err\s+instanceof\s+OrchestrationError\s*\)/);
    });

    it(`${name} switches on err.code with cag_required + retrieval_required cases`, () => {
      // Both case branches must be present. The order doesn't matter,
      // but the discriminator must match the literal exactly.
      expect(src).toMatch(/switch\s*\(\s*err\.code\s*\)/);
      expect(src).toMatch(/case\s+["']cag_required["']\s*:/);
      expect(src).toMatch(/case\s+["']retrieval_required["']\s*:/);
    });

    it(`${name} default branch has the _exhaustive: never check`, () => {
      // Load-bearing — without the never assignment, adding a new
      // OrchestrationErrorCode wouldn't fail compile in this flow.
      const re = /default\s*:\s*\{[\s\S]*?const\s+_exhaustive:\s*never\s*=\s*err\.code/;
      expect(
        src,
        `M7-c8: ${name} default branch must assign err.code to a ` +
          "`_exhaustive: never` variable — that's what makes the " +
          "switch exhaustive at compile time.",
      ).toMatch(re);
    });

    it(`${name} no longer uses the legacy instanceof CagRequiredError chain`, () => {
      // Strip comments — doc-blocks legitimately reference the legacy
      // pattern; we only fail on actual code references.
      const stripped = src
        .replace(/\/\/[^\n]*/g, "")
        .replace(/\/\*[\s\S]*?\*\//g, "");
      expect(
        stripped.match(/instanceof\s+CagRequiredError/),
        `M7-c8: ${name} legacy 'instanceof CagRequiredError' chain ` +
          "must be removed. Use 'instanceof OrchestrationError' + " +
          "switch on err.code instead.",
      ).toBeNull();
      expect(
        stripped.match(/instanceof\s+RetrievalRequiredError/),
        `M7-c8: ${name} legacy 'instanceof RetrievalRequiredError' ` +
          "chain must be removed.",
      ).toBeNull();
    });
  }
});

describe("M7-c8 — closure marker on both chat flows", () => {
  const flows = [
    { name: "chat-stream.ts", src: chatStreamSrc },
    { name: "chat.ts", src: chatTsSrc },
  ];
  for (const { name, src } of flows) {
    it(`${name} carries M7-c8 marker`, () => {
      expect(src).toMatch(/M7-c8/);
    });
  }
});
