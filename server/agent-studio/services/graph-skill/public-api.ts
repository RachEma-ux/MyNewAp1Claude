/**
 * Graph Skill Pack — public API barrel.
 *
 * Phase 12.5.
 *
 * Mirrors KGRA Agent module shape: manifest / ports / public-api pattern.
 */

export { evaluateEligibility } from "./eligibility.js";
export type {
  SkillPackSummary,
  EligibilityInput,
  EligibilityResult,
} from "./eligibility.js";
export { selectTemplateForEligiblePacks } from "./template-selection.js";
export type {
  PackTemplateMap,
  SelectTemplateInput,
  SelectTemplateResult,
} from "./template-selection.js";
export { createRuntimeUsageRecorder } from "./runtime-usage.js";
export type { CreateRuntimeUsageRecorderOptions } from "./runtime-usage.js";
