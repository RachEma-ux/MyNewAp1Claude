/**
 * Pack Resolver — Governance Bible CGT v2
 *
 * Role: CE-A (Engine & Backend Lead)
 * Phase: 1 — Pack Resolution Logic
 *
 * Resolves which control packs apply to a GovernedSubject:
 *   1. Base pack — always loaded for every subject type
 *   2. Type pack — loaded based on subject.type (provider, llm, model, agent, bot)
 *
 * Resolution rules (NON-NEGOTIABLE):
 *   - Missing base pack = FAIL (system integrity compromised)
 *   - Missing type pack = FAIL validate (type-specific controls absent)
 *   - Empty resolved set = FAIL (no controls to evaluate = non-compliant)
 *
 * Pack assignment is done via the `pack` field on ControlDefinition.
 */

import {
  getActiveControls,
  getControlsForStage,
  type ControlDefinition,
} from "./control-catalog";
import type { SubjectType } from "./governed-subject";
import type { LifecycleStage } from "../lifecycle-guard";

// ============================================================================
// Types
// ============================================================================

export type PackId = "base" | SubjectType;

export interface PackResolution {
  /** Whether resolution succeeded */
  resolved: boolean;
  /** Controls selected for this subject */
  controls: ControlDefinition[];
  /** Packs that were loaded */
  loadedPacks: PackId[];
  /** Packs that were expected but missing */
  missingPacks: PackId[];
  /** Base pack controls */
  baseControls: ControlDefinition[];
  /** Type pack controls */
  typeControls: ControlDefinition[];
  /** Error message if resolution failed */
  error?: string;
}

// ============================================================================
// Pack Resolver
// ============================================================================

/**
 * Resolve the control packs for a governed subject.
 *
 * Steps:
 *   1. Load base pack controls (pack === "base")
 *   2. Load type pack controls (pack === subject.type)
 *   3. Validate both packs are non-empty
 *   4. Optionally filter by stage
 *   5. Return merged set
 *
 * If base pack is empty → resolution FAILS.
 * If type pack is empty → resolution FAILS at validate+ stages.
 */
export function resolvePacks(
  subjectType: SubjectType,
  stage?: LifecycleStage
): PackResolution {
  const allControls = getActiveControls();

  // 1. Base pack
  const baseControls = allControls.filter((c) => c.pack === "base");

  // 2. Type pack
  const typeControls = allControls.filter((c) => c.pack === subjectType);

  // 3. Track loaded/missing packs
  const loadedPacks: PackId[] = [];
  const missingPacks: PackId[] = [];

  if (baseControls.length > 0) {
    loadedPacks.push("base");
  } else {
    missingPacks.push("base");
  }

  if (typeControls.length > 0) {
    loadedPacks.push(subjectType);
  } else {
    missingPacks.push(subjectType);
  }

  // 4. Enforce: base pack is MANDATORY
  if (baseControls.length === 0) {
    return {
      resolved: false,
      controls: [],
      loadedPacks,
      missingPacks,
      baseControls: [],
      typeControls: [],
      error: `FATAL: Base pack is empty — no base controls found. System integrity compromised.`,
    };
  }

  // 5. Enforce: type pack missing = FAIL at validate+
  // At register stage, missing type pack is a warning; at validate+ it's a failure
  const validateStages: LifecycleStage[] = ["validate", "publish", "catalog"];
  if (typeControls.length === 0 && stage && validateStages.includes(stage)) {
    return {
      resolved: false,
      controls: baseControls, // Still return base controls for partial scoring
      loadedPacks,
      missingPacks,
      baseControls,
      typeControls: [],
      error: `Type pack '${subjectType}' is empty — cannot proceed past register stage without type-specific controls.`,
    };
  }

  // 6. Merge controls
  let merged = [...baseControls, ...typeControls];

  // 7. Optionally filter by stage
  if (stage) {
    merged = merged.filter((c) => c.blocksStages.includes(stage));
  }

  return {
    resolved: true,
    controls: merged,
    loadedPacks,
    missingPacks,
    baseControls,
    typeControls,
  };
}

/**
 * Quick check: does a type pack exist for the given subject type?
 */
export function hasTypePack(subjectType: SubjectType): boolean {
  return getActiveControls().some((c) => c.pack === subjectType);
}

/**
 * Get all available pack IDs.
 */
export function getAvailablePacks(): PackId[] {
  const packs = new Set<PackId>();
  for (const c of getActiveControls()) {
    if (c.pack) packs.add(c.pack as PackId);
  }
  return Array.from(packs);
}
