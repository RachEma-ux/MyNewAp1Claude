/**
 * M7-c8 (cycle-8 audit `/sdcard/Download/RAC_ORCHESTRATOR_AUDIT_2026-05-09.md`
 * §M7-c8) — orchestration-error registry.
 *
 * Pre-cycle-8 the two orchestration-side error classes
 * (`CagRequiredError` in `system-prompt-composer.ts`,
 * `RetrievalRequiredError` in `rac-orchestrator.ts`) had no shared
 * base. Both call sites (chat-stream.ts + chat.ts) handled them via
 * an `instanceof` chain:
 *
 *     if (err instanceof CagRequiredError) { ... }
 *     if (err instanceof RetrievalRequiredError) { ... }
 *     throw err;
 *
 * This had two failure modes:
 *
 *   1. Adding a third orchestration error class (e.g. a hypothetical
 *      `ComposerRequiredError`) required the developer to remember
 *      to update BOTH chat flows AND the SSE error-code mapping AND
 *      the result-shape mapping. Easy to miss one — TypeScript had
 *      no signal because each `if instanceof` is independent.
 *
 *   2. The `code` field on each class was a free-form string that
 *      collided with the dispatch-error namespace (L4-c8 documented
 *      this). A future error-mapping helper that conflated the two
 *      namespaces would silently route the wrong way.
 *
 * Cycle-8 closure (mirrors cycle-7 H3-c7 + M8-c7 typed-error pattern):
 *
 *   1. Define a base `OrchestrationError` abstract class with an
 *      abstract `readonly code: OrchestrationErrorCode` field.
 *   2. Define `OrchestrationErrorCode` as a typed union literal —
 *      adding a new code is a one-place change in this file.
 *   3. Both subclasses extend `OrchestrationError`. The subclass
 *      `code` field is `as const` so the type discriminator is the
 *      literal string, not the wider `OrchestrationErrorCode` type.
 *   4. Both chat flows replace the `instanceof` chain with a single
 *      `if (err instanceof OrchestrationError)` followed by a
 *      `switch (err.code)` whose `default` branch assigns to a
 *      `_exhaustive: never` — TypeScript fails compile when a new
 *      `OrchestrationErrorCode` is added without a matching branch.
 *
 * Boundary discipline: this module exports types and the abstract
 * base only. The concrete subclasses MUST live in their producing
 * module so the dependency graph stays acyclic:
 *
 *     CagRequiredError       → system-prompt-composer.ts
 *     RetrievalRequiredError → rac-orchestrator.ts
 *
 * Both producing modules import from THIS file; this file imports
 * from neither. A future PR that flips the dependency direction
 * would re-introduce the cycle the cycle-7 boundary work
 * (check-cag-boundary.ts) was designed to prevent.
 *
 * Lockstep: pinned by tests/agent-studio/m7-c8-orchestration-error-registry.test.ts.
 */

/**
 * Typed discriminated-union of every orchestration-side error code.
 *
 * Adding a new code:
 *   1. Add the literal to this union.
 *   2. Add a new subclass of `OrchestrationError` in the producing
 *      module with `readonly code = "new_code" as const`.
 *   3. The TypeScript compiler will fail builds at chat-stream.ts +
 *      chat.ts until both flows add a matching `case` branch.
 *      That's the whole point.
 *
 * This namespace is DISJOINT from the dispatch-error namespace
 * (`DispatchErrorCode` in dispatcher-types.ts). See L4-c8 doc-block
 * above `RetrievalRequiredError` for the full namespace boundary.
 */
export type OrchestrationErrorCode = "cag_required" | "retrieval_required";

/**
 * Base class for orchestration-side errors that the chat flows must
 * catch and surface to the client (SSE error event / non-streaming
 * result `code` field).
 *
 * Abstract — instantiate via the concrete subclasses (CagRequiredError,
 * RetrievalRequiredError). The base exists for the `instanceof` check
 * and for the type discriminator.
 */
export abstract class OrchestrationError extends Error {
  /**
   * Discriminator for the discriminated-union switch. Subclasses
   * MUST declare this as `readonly code = "<literal>" as const` so
   * TypeScript narrows the type to the literal string in switch
   * branches.
   */
  abstract readonly code: OrchestrationErrorCode;

  constructor(message: string) {
    super(message);
    // Subclasses set `this.name` after super so error-log breadcrumbs
    // identify the concrete class.
  }
}
