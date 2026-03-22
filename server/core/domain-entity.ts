/**
 * Domain Entity — Shared abstractions for the 5 AI Types.
 *
 * All domain entities (LLM, Model, Bot, Agent, Provider) share a common
 * shape for lifecycle management, deployability assessment, and Catalog
 * import eligibility. This file defines those shared interfaces.
 *
 * IMPORTANT: Domain entities live in their own tables. Catalog entries are
 * a SEPARATE concern — they track governance/publication state. Domain
 * entities flow INTO the Catalog via importToCatalog, never the reverse.
 */

// ============================================================================
// AI Type Kind
// ============================================================================

/** The five AI types managed by the platform */
export type AITypeKind = "llm" | "model" | "bot" | "agent" | "provider";

// ============================================================================
// Domain Entity Interface
// ============================================================================

/**
 * Minimal shape every domain entity must satisfy for the shared
 * deployability / readiness pipeline. Domain routers MUST map their
 * entity to this interface before calling computeDeployable().
 */
export interface DomainEntity {
  id: number;
  name: string;
  kind: AITypeKind;
  status: string;
  createdAt: Date;
}

// ============================================================================
// Lifecycle Status Maps (per AI type)
// ============================================================================

/**
 * Each AI type defines its own lifecycle states.
 * "deployable" means eligible for Catalog import.
 * Only certain terminal-healthy states are considered deployable.
 */
export const LIFECYCLE_STATES: Record<AITypeKind, {
  all: readonly string[];
  deployable: readonly string[];
  terminal: readonly string[];
}> = {
  llm: {
    all: ["draft", "sandbox", "governed", "archived"],
    deployable: ["governed"],
    terminal: ["archived"],
  },
  model: {
    all: ["ready", "downloading", "error", "archived"],
    deployable: ["ready"],
    terminal: ["archived"],
  },
  bot: {
    all: ["draft", "configured", "validated", "deployable", "archived"],
    deployable: ["deployable"],
    terminal: ["archived"],
  },
  agent: {
    all: ["draft", "sandbox", "governed", "archived"],
    deployable: ["governed"],
    terminal: ["archived"],
  },
  provider: {
    all: ["configured", "authenticated", "validated", "healthy", "active", "suspended"],
    deployable: ["healthy", "active"],
    terminal: ["suspended"],
  },
};

// ============================================================================
// Catalog State Enum
// ============================================================================

/** Tracks where a domain entity sits relative to the Catalog pipeline */
export type CatalogImportState =
  | "not_imported"
  | "candidate"
  | "imported"
  | "published";

// ============================================================================
// Deployability Result
// ============================================================================

/** Result of a deployability check on a domain entity */
export interface DeployabilityResult {
  isDeployable: boolean;
  blockingReasons: string[];
  kind: AITypeKind;
  entityId: number;
}

// ============================================================================
// Normalized Status Mapping
// ============================================================================

/**
 * Maps diverse domain statuses to a normalized display status.
 * Used by list pages for consistent badge rendering.
 */
export type NormalizedStatus =
  | "draft"
  | "configuring"
  | "validating"
  | "deployable"
  | "imported"
  | "published"
  | "suspended"
  | "archived"
  | "error";

const STATUS_MAP: Record<string, NormalizedStatus> = {
  // LLM
  sandbox: "configuring",
  governed: "deployable",
  // Model
  ready: "deployable",
  downloading: "configuring",
  // Bot
  configured: "configuring",
  validated: "validating",
  deployable: "deployable",
  // Agent (reuses LLM pattern)
  // Provider
  configured: "configuring",
  authenticated: "configuring",
  healthy: "deployable",
  active: "deployable",
  suspended: "suspended",
  // Common
  draft: "draft",
  archived: "archived",
  error: "error",
};

export function normalizeStatus(domainStatus: string): NormalizedStatus {
  return STATUS_MAP[domainStatus] ?? "draft";
}
