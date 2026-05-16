/**
 * Internal Command Registry — Phase 18.
 *
 * In-memory, process-lifetime registry of operator-callable
 * commands. Surfaces the Native Graph Workspace's internal
 * extension points to the UI command palette without standing up
 * a third-party plugin runtime.
 *
 * Boundaries (per Phase 18 ADR):
 *   - Registration is code-side only. There is no operator UI for
 *     adding new commands at runtime — that boundary keeps the
 *     dispatcher / approval / governance chokepoints from being
 *     bypassed by an unsigned extension.
 *   - Handlers run inside the host process. The MCP dispatcher
 *     remains the only path for tool calls; commands typically
 *     dispatch into existing tRPC procedures rather than executing
 *     business logic directly.
 *   - Commands have a `scope` discriminator — `read | write |
 *     destructive` — which the UI uses to gate the command behind
 *     extra confirmation for destructive scopes.
 *
 * No DB persistence — the registry resets on process restart.
 * Built-ins re-register at boot via the module manifest.
 *
 * ADR: docs/architecture/agent-studio-extension-framework-strategy.md
 */

/**
 * Closed-taxonomy command-registry scope. Promoted to a tuple at
 * T-G.49 so the metadata table + lockstep tests can be authored.
 */
export const COMMAND_SCOPES = ["read", "write", "destructive"] as const;
export type CommandScope = (typeof COMMAND_SCOPES)[number];

// ============================================================================
// Per-command-scope operator-facing metadata (T-G.49)
// ============================================================================

export interface CommandScopeMetadata {
  /** Display label rendered in the command palette scope chip. */
  readonly label: string;
  /** Short operator-facing description of what command scope implies
   *  for execution semantics. */
  readonly description: string;
  /** Stable rank 0-2 for scope severity (0=read → 2=destructive). */
  readonly rank: 0 | 1 | 2;
  /** Whether the palette must surface an extra confirmation step for
   *  this scope (true for `destructive` only). */
  readonly requiresExtraConfirmation: boolean;
}

export const COMMAND_SCOPE_METADATA: Readonly<
  Record<CommandScope, CommandScopeMetadata>
> = {
  read: {
    label: "Read",
    description:
      "Command reads state — opens a panel, fetches data, surfaces a view. No mutation; no confirmation needed.",
    rank: 0,
    requiresExtraConfirmation: false,
  },
  write: {
    label: "Write",
    description:
      "Command writes state — creates, updates, or mutates a record. Single-click invocation; no extra confirmation.",
    rank: 1,
    requiresExtraConfirmation: false,
  },
  destructive: {
    label: "Destructive",
    description:
      "Command deletes or hard-overrides state. Palette must surface an extra confirmation step before dispatch.",
    rank: 2,
    requiresExtraConfirmation: true,
  },
};

export function getCommandScopeMetadata(
  scope: CommandScope,
): CommandScopeMetadata {
  return COMMAND_SCOPE_METADATA[scope];
}

export interface CommandRegistration {
  readonly commandKey: string;
  readonly title: string;
  readonly description?: string;
  readonly scope: CommandScope;
  /**
   * The route or tRPC path that the UI invokes when the command
   * fires. Commands themselves do NOT contain business logic.
   * Format examples:
   *   - "trpc:agentStudio.vault.createNote"
   *   - "route:/agent-studio/runs/{runId}"
   *   - "ui:open-explain-panel"
   */
  readonly target: string;
  /**
   * Optional module key, used to namespace commands and present
   * them grouped in the command palette.
   */
  readonly module?: string;
}

export class CommandKeyConflictError extends Error {
  constructor(public readonly commandKey: string) {
    super(`Command "${commandKey}" is already registered`);
    this.name = "CommandKeyConflictError";
  }
}

let registry = new Map<string, CommandRegistration>();

export function registerCommand(cmd: CommandRegistration): void {
  if (registry.has(cmd.commandKey)) {
    throw new CommandKeyConflictError(cmd.commandKey);
  }
  registry.set(cmd.commandKey, cmd);
}

export function getCommand(commandKey: string): CommandRegistration | null {
  return registry.get(commandKey) ?? null;
}

export interface ListCommandsOptions {
  readonly module?: string;
  readonly scope?: CommandScope;
}

export function listCommands(
  options: ListCommandsOptions = {},
): CommandRegistration[] {
  let cmds = Array.from(registry.values());
  if (options.module !== undefined) {
    cmds = cmds.filter((c) => c.module === options.module);
  }
  if (options.scope !== undefined) {
    cmds = cmds.filter((c) => c.scope === options.scope);
  }
  return cmds.sort((a, b) => a.commandKey.localeCompare(b.commandKey));
}

/**
 * Test helper. Drops every registered command and any side-channel
 * state. Tests should call this in `beforeEach` so registrations
 * from one test don't leak into the next.
 */
export function _resetCommandRegistryForTests(): void {
  registry = new Map();
}
