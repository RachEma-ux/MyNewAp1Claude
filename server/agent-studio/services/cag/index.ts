/**
 * CAG (Capability Pack) — RAC Phase 1A
 *
 * Public barrel for the CAG store. Re-exports types and store/events
 * functions. Builder/validator/renderer (P1B), resolver (P1C), and
 * preview APIs (P1D) land in subsequent files within this directory.
 */

export type {
  CagPackStatus,
  CagPackEventType,
  CagPackEventSeverity,
  CagPackActorType,
  CagSourceManifestEntry,
  CagCapabilityPack,
  CreatePackInput,
  CreatePackResult,
  CagPackEvent,
  AppendEventInput,
} from "./types";

export {
  canonicalize,
  hashJsonStable,
  aggregateManifestHash,
  manifestToHashMap,
  hashMapsEqual,
} from "./hashing";

export {
  createPack,
  getLatestPack,
  listPacks,
  getPackById,
  markPackStale,
  touchPackLastUsed,
  listPacksForAgent,
} from "./store";

export {
  appendPackEvent,
  listPackEvents,
  listEventsByPack,
} from "./events";
