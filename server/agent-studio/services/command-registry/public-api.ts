/**
 * Command Registry — public-api barrel.
 *
 * Phase 18. The internal command registry surface that modules use
 * to declare operator-callable commands.
 *
 * ADR: docs/architecture/agent-studio-extension-framework-strategy.md
 */

export {
  registerCommand,
  getCommand,
  listCommands,
  summarizeCommandRegistry,
  CommandKeyConflictError,
  _resetCommandRegistryForTests,
  COMMAND_SCOPES,
  COMMAND_SCOPE_METADATA,
  getCommandScopeMetadata,
} from "./command-registry.js";
export type {
  CommandRegistration,
  CommandScope,
  CommandScopeMetadata,
  CommandRegistrySummary,
  ListCommandsOptions,
} from "./command-registry.js";
