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
  CommandKeyConflictError,
  _resetCommandRegistryForTests,
} from "./command-registry.js";
export type {
  CommandRegistration,
  CommandScope,
  ListCommandsOptions,
} from "./command-registry.js";
