/**
 * CAG (Capability Pack) — RAC Phase 1A + 1B
 *
 * Public barrel for the CAG store, builder, validator, and renderer.
 * Resolver (P1C) and preview APIs (P1D) land in subsequent files.
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
  ToolRiskClass,
  CapabilityPackContent,
  SystemPromptSection,
  // Retrofit P5 (D-CAG-RECON-2)
  CagCompileResult,
  CagGovernanceVerdict,
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
  // Retrofit P5 (D-CAG-RECON-2)
  markPackUsed,
  recordPackTokenActual,
} from "./store";

export {
  appendPackEvent,
  listPackEvents,
  listEventsByPack,
} from "./events";

export {
  classifyTool,
  readRiskClass,
  isPackable,
} from "./risk-classifier";
export type { ClassifiedTool } from "./risk-classifier";

export { mapSkillsAndTools } from "./skill-tool-mapper";
export type { SkillRef, ToolWithServer } from "./skill-tool-mapper";

export { buildCapabilityPack } from "./builder";
export type {
  BuildPackInput,
  BuildPackOutput,
  BuilderMcpServerSnapshot,
} from "./builder";

export { validatePackContent } from "./validator";
export type { ValidationResult } from "./validator";

export {
  renderCapabilityPack,
  estimateTokens,
  MANDATORY_ASSERTIONS,
  CAG_MAX_PROMPT_TOKENS,
} from "./renderer";

export { resolveCagPack } from "./resolver";
export type { ResolveCagInput, ResolveCagResult } from "./resolver";
