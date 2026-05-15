/**
 * Tool-schema change detector — Phase 22 §T-I.5 batch A.4.
 *
 * Pure-function diff over two MCP registry snapshots' tool lists.
 * Emits a list of `{ name, change }` deltas the auto-sync listener
 * uses to fire `tool_schema_changed` failure-state events.
 *
 * The diff is conservative — only structural changes to a tool's
 * `inputSchema` count as schema changes; description / metadata
 * tweaks do NOT count (those are noise for the closed-taxonomy
 * `tool_schema_changed` signal).
 *
 * Hard-rule compliance (CLAUDE.md):
 *   - Pure module. No I/O. No graph mutation.
 *   - Inputs are `ReadonlyArray<McpToolLike>` so this module doesn't
 *     have to import the registry's full type.
 */

export interface McpToolLike {
  readonly name: string;
  readonly description?: string;
  readonly inputSchema?: Record<string, unknown> | unknown;
}

export type ToolSchemaChangeKind =
  | "added"
  | "removed"
  | "schema_changed";

export interface ToolSchemaChange {
  readonly toolName: string;
  readonly kind: ToolSchemaChangeKind;
}

/**
 * Stable canonical JSON serialization for use in schema-equality
 * checks. Sorts keys recursively so `{ a: 1, b: 2 }` and `{ b: 2, a: 1 }`
 * hash identically. Returns `null` for `undefined` schemas so the
 * caller can treat "no schema" and "explicit empty object" as
 * distinct.
 */
export function canonicalizeSchemaForCompare(schema: unknown): string | null {
  if (schema === undefined) return null;
  return canonicalize(schema);
}

function canonicalize(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return "[" + value.map((v) => canonicalize(v)).join(",") + "]";
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    return (
      "{" +
      keys
        .map((k) => JSON.stringify(k) + ":" + canonicalize(obj[k]))
        .join(",") +
      "}"
    );
  }
  return JSON.stringify(String(value));
}

/**
 * Diff `current` vs `previous` (the prior snapshot — undefined when
 * this is the first publish) and return the closed-kind change list:
 *
 *   - `added`: tool present in `current` but not in `previous`.
 *     Returned only when `previous !== undefined` (first publish is
 *     not a "change").
 *   - `removed`: tool present in `previous` but not in `current`.
 *   - `schema_changed`: tool present in both with a different
 *     canonical input schema.
 *
 * Returns `[]` when `previous` is undefined (first publish — nothing
 * to compare against) OR when nothing changed.
 */
export function detectToolSchemaChanges(
  current: ReadonlyArray<McpToolLike>,
  previous: ReadonlyArray<McpToolLike> | undefined,
): ReadonlyArray<ToolSchemaChange> {
  if (previous === undefined) return [];
  const changes: ToolSchemaChange[] = [];
  const prevByName = new Map(previous.map((t) => [t.name, t]));
  const currentNames = new Set<string>();
  for (const tool of current) {
    currentNames.add(tool.name);
    const prior = prevByName.get(tool.name);
    if (!prior) {
      changes.push({ toolName: tool.name, kind: "added" });
      continue;
    }
    const currentCanon = canonicalizeSchemaForCompare(tool.inputSchema);
    const priorCanon = canonicalizeSchemaForCompare(prior.inputSchema);
    if (currentCanon !== priorCanon) {
      changes.push({ toolName: tool.name, kind: "schema_changed" });
    }
  }
  for (const priorTool of previous) {
    if (!currentNames.has(priorTool.name)) {
      changes.push({ toolName: priorTool.name, kind: "removed" });
    }
  }
  return changes;
}
