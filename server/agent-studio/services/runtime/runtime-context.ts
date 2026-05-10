/**
 * Phase 5a (Roadmap V3) — Runtime context shape.
 *
 * Single source of truth for "what does the runtime know about this
 * request?" — currently just the agent's lifecycle state, which
 * Phase 5b consumes as the fail-closed discriminator. New fields
 * land here over time (e.g., Phase 11a observability fields).
 *
 * Pre-flight #4 of the roadmap nails the derivation rule:
 *   `runtimeContext.agentLifecycleState` is derived from
 *   `agsAgents.lifecycle_state` at runtime context construction in
 *   the chat-stream entry point. Never from request headers, env
 *   vars, or any caller-supplied value.
 *
 * Pre-flight #6 nails the scope rule:
 *   Published-ness is an AGENT-level property regardless of execution
 *   lane. chat-stream, chat.ts (blocking), test-run-binding (when
 *   tools land), and simulation (Phase 5c) all derive the SAME
 *   lifecycle state from the SAME column.
 */

/**
 * Allowed lifecycle states for `agsAgents.lifecycle_state`. Validation
 * is lax (the column is just `varchar(32)`), but every code path
 * reading the field should treat unknown values as "not-published"
 * — fail-OPEN for unknown states is INTENTIONAL during rollout
 * (Phase 5b only flips to fail-closed when the value is the literal
 * `"published"`).
 */
export type AgentLifecycleState =
  | "new"
  | "draft"
  | "design"
  | "simulation"
  | "staging"
  | "published"
  | "archived"
  // Forward-compat for unrecognized values from older deployments.
  // Phase 5b's enforcement uses a strict equality check on
  // `"published"`, so unknown values short-circuit to the
  // dev-friendly behavior.
  | (string & { __brand?: "AgentLifecycleStateRaw" });

export interface RuntimeContext {
  /**
   * The agent's lifecycle state, derived from `agsAgents.lifecycle_state`.
   * Phase 5b uses this as the published-vs-draft discriminator inside
   * `checkAllowedTools`. Null means the agent row was missing — in
   * that case the runtime should already have early-returned with a
   * `draft_not_found` or similar error.
   */
  agentLifecycleState: AgentLifecycleState | null;
}

/**
 * Build a runtime context from the loaded agent row. Pure function;
 * the DB lookup happens upstream (in chat-stream / chat.ts) so this
 * helper stays cheap for tests.
 */
export function buildRuntimeContext(input: {
  agentLifecycleState: string | null;
}): RuntimeContext {
  return {
    agentLifecycleState: input.agentLifecycleState,
  };
}

/**
 * Phase 5b's published-vs-draft discriminator. Strict equality on
 * `"published"`. Unknown states fall through to the dev-friendly
 * behavior — important during rollout when staging deployments may
 * carry experimental lifecycle values.
 */
export function isPublishedRuntime(ctx: RuntimeContext): boolean {
  return ctx.agentLifecycleState === "published";
}
