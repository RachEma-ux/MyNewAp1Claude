/**
 * Platform Port Registry — Public API
 *
 * Modules import from `server/platform/ports` rather than the
 * implementation files so the internals (singleton management, host
 * defaulting, conflict detection algorithm) can change without touching
 * call sites.
 */

export type {
  PortMode,
  PortProtocol,
  PortHealthStatus,
  ModulePortDeclaration,
  PortReservation,
  PortStatusSnapshot,
} from "./types";

export {
  getPortRegistry,
  __resetPortRegistryForTests,
} from "./registry";

export type { ConflictDetail, PortRegistry } from "./registry";
