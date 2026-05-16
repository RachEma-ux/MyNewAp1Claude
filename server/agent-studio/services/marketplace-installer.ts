/**
 * AI Agent Studio — Marketplace Installer
 *
 * Phase 14d: Materializes a marketplace item's payload into the
 * catalog tables (and optionally onto a specific agent's draft).
 * Records every install in agsMarketplaceInstalls so it can be fully
 * reversed later.
 *
 * Conflict resolution (Decision #8): user-configurable per-call,
 * defaults to "skip" if already present:
 *   "skip"      → leave existing row alone, don't include in install
 *   "overwrite" → update the existing row in place, bump version
 *   "rename"    → append "-marketplace-<timestamp>" to skillKey/key
 */

import * as repo from "../repository";
import {
  computeContentHash,
  type SkillBundleEntry,
  type ToolBundleEntry,
} from "./marketplace";

/**
 * Closed-taxonomy install-time conflict behavior. Promoted to a tuple
 * at T-G.53 so the metadata table + lockstep tests can be authored.
 */
export const CONFLICT_BEHAVIORS = [
  "skip",
  "overwrite",
  "rename",
] as const;
export type ConflictBehavior = (typeof CONFLICT_BEHAVIORS)[number];

// ============================================================================
// Per-conflict-behavior operator-facing metadata (T-G.53)
// ============================================================================

export interface ConflictBehaviorMetadata {
  /** Display label rendered in the install conflict-resolution prompt. */
  readonly label: string;
  /** Short operator-facing description of what this behavior does
   *  when an existing item collides with the installing one. */
  readonly description: string;
  /** Whether this behavior produces a new record on collision (true
   *  for `rename`; false for `skip` + `overwrite` which either
   *  no-op or replace the existing record in place). */
  readonly producesNewRecord: boolean;
  /** Whether this behavior preserves the existing record (true for
   *  `skip` + `rename`; false for `overwrite` which replaces it). */
  readonly preservesExisting: boolean;
}

export const CONFLICT_BEHAVIOR_METADATA: Readonly<
  Record<ConflictBehavior, ConflictBehaviorMetadata>
> = {
  skip: {
    label: "Skip",
    description:
      "On collision, leave the existing item in place and abort the install. Safest default for accidental re-installs.",
    producesNewRecord: false,
    preservesExisting: true,
  },
  overwrite: {
    label: "Overwrite",
    description:
      "On collision, replace the existing item's record with the incoming payload. Destructive; requires explicit operator intent.",
    producesNewRecord: false,
    preservesExisting: false,
  },
  rename: {
    label: "Rename",
    description:
      "On collision, install the incoming payload under a suffixed name so both rows coexist. Non-destructive; produces a new record.",
    producesNewRecord: true,
    preservesExisting: true,
  },
};

export function getConflictBehaviorMetadata(
  behavior: ConflictBehavior,
): ConflictBehaviorMetadata {
  return CONFLICT_BEHAVIOR_METADATA[behavior];
}

export interface InstallInput {
  itemId: number;
  /** Optional — when set, install also tries to attach to this agent */
  agentId?: number | null;
  onConflict?: ConflictBehavior;
  installedBy?: number | null;
}

export interface InstallResult {
  installId: number;
  itemId: number;
  itemKey: string;
  itemType: string;
  createdSkillIds: number[];
  createdToolIds: number[];
  skipped: Array<{ kind: "skill" | "tool"; key: string; reason: string }>;
  warnings: string[];
}

export interface UninstallResult {
  installId: number;
  removedSkills: number;
  removedTools: number;
  warnings: string[];
}

// ── Helpers ────────────────────────────────────────────────────────────────

function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
}

async function installSkillEntry(
  entry: SkillBundleEntry,
  installedBy: number | null,
  onConflict: ConflictBehavior
): Promise<{ id: number | null; skipped?: { reason: string }; warning?: string }> {
  const existing = await repo.getCatalogSkillByKey(entry.packKey, entry.skillKey);
  if (existing) {
    if (onConflict === "skip") {
      return {
        id: null,
        skipped: { reason: `already exists at id ${existing.id}` },
      };
    }
    if (onConflict === "overwrite") {
      const updated = await repo.updateCatalogSkill(existing.id, {
        name: entry.name,
        description: entry.description ?? null,
        context: entry.context ?? "inline",
        agent: entry.agent ?? null,
        model: entry.model ?? null,
        allowedTools: entry.allowedTools ?? [],
        argNames: entry.argNames ?? [],
        effort: entry.effort ?? null,
        body: entry.body,
        version: entry.version ?? null,
        source: "marketplace",
      });
      return { id: updated?.id ?? existing.id };
    }
    if (onConflict === "rename") {
      const newKey = `${entry.skillKey}-marketplace-${timestamp()}`;
      const created = await repo.createCatalogSkill({
        packKey: entry.packKey,
        skillKey: newKey,
        name: entry.name,
        description: entry.description ?? null,
        context: entry.context ?? "inline",
        agent: entry.agent ?? null,
        model: entry.model ?? null,
        allowedTools: entry.allowedTools ?? [],
        argNames: entry.argNames ?? [],
        effort: entry.effort ?? null,
        body: entry.body,
        version: entry.version ?? null,
        source: "marketplace",
        createdBy: installedBy,
      });
      return {
        id: created.id,
        warning: `renamed ${entry.skillKey} → ${newKey} due to conflict`,
      };
    }
  }
  const created = await repo.createCatalogSkill({
    packKey: entry.packKey,
    skillKey: entry.skillKey,
    name: entry.name,
    description: entry.description ?? null,
    context: entry.context ?? "inline",
    agent: entry.agent ?? null,
    model: entry.model ?? null,
    allowedTools: entry.allowedTools ?? [],
    argNames: entry.argNames ?? [],
    effort: entry.effort ?? null,
    body: entry.body,
    version: entry.version ?? null,
    source: "marketplace",
    createdBy: installedBy,
  });
  return { id: created.id };
}

async function installToolEntry(
  entry: ToolBundleEntry,
  installedBy: number | null,
  onConflict: ConflictBehavior
): Promise<{ id: number | null; skipped?: { reason: string }; warning?: string }> {
  const existing = await repo.getCatalogToolByKey(entry.key);
  if (existing) {
    if (onConflict === "skip") {
      return {
        id: null,
        skipped: { reason: `already exists at id ${existing.id}` },
      };
    }
    if (onConflict === "overwrite") {
      const updated = await repo.updateCatalogTool(existing.id, {
        name: entry.name,
        description: entry.description ?? null,
        category: entry.category ?? "custom",
        defaultAllowedActions: entry.defaultAllowedActions ?? [],
        hardBlockedActions: entry.hardBlockedActions ?? [],
        defaultRequiresApproval: entry.defaultRequiresApproval ?? false,
        destructive: entry.destructive ?? false,
        invocationKind: entry.invocationKind,
        invocationConfig: entry.invocationConfig ?? {},
        inputSchema: entry.inputSchema ?? {},
        version: entry.version ?? null,
      });
      return { id: updated?.id ?? existing.id };
    }
    if (onConflict === "rename") {
      const newKey = `${entry.key}_marketplace_${timestamp().replace(/[-:]/g, "")}`;
      const created = await repo.createCatalogTool({
        ...entry,
        key: newKey,
        createdBy: installedBy,
      });
      return {
        id: created.id,
        warning: `renamed ${entry.key} → ${newKey} due to conflict`,
      };
    }
  }
  const created = await repo.createCatalogTool({
    key: entry.key,
    name: entry.name,
    description: entry.description ?? null,
    category: entry.category ?? "custom",
    defaultAllowedActions: entry.defaultAllowedActions ?? [],
    hardBlockedActions: entry.hardBlockedActions ?? [],
    defaultRequiresApproval: entry.defaultRequiresApproval ?? false,
    destructive: entry.destructive ?? false,
    invocationKind: entry.invocationKind,
    invocationConfig: entry.invocationConfig ?? {},
    inputSchema: entry.inputSchema ?? {},
    version: entry.version ?? null,
    createdBy: installedBy,
  });
  return { id: created.id };
}

// ── Public API ──────────────────────────────────────────────────────────────

export async function installMarketplaceItem(
  input: InstallInput
): Promise<InstallResult> {
  const item = await repo.getMarketplaceItemById(input.itemId);
  if (!item) {
    throw new Error(`marketplace item ${input.itemId} not found`);
  }

  // Optional integrity check — recompute hash and warn on mismatch
  const warnings: string[] = [];
  if (item.contentHash) {
    const recomputed = computeContentHash(item.payload);
    if (recomputed !== item.contentHash) {
      warnings.push(
        `contentHash mismatch — stored=${item.contentHash.slice(0, 12)}… recomputed=${recomputed.slice(0, 12)}…`
      );
    }
  }

  const onConflict: ConflictBehavior = input.onConflict ?? "skip";
  const createdSkillIds: number[] = [];
  const createdToolIds: number[] = [];
  const skipped: Array<{ kind: "skill" | "tool"; key: string; reason: string }> = [];

  const payload = (item.payload ?? {}) as Record<string, unknown>;
  const kind = payload.kind as string | undefined;

  // Helper to flatten skill/tool arrays from various payload kinds
  const skills: SkillBundleEntry[] = [];
  const tools: ToolBundleEntry[] = [];

  if (kind === "skill" && payload.skill) {
    skills.push(payload.skill as SkillBundleEntry);
  } else if (kind === "skill_pack" && Array.isArray(payload.skills)) {
    skills.push(...(payload.skills as SkillBundleEntry[]));
  } else if (kind === "tool" && payload.tool) {
    tools.push(payload.tool as ToolBundleEntry);
  } else if (kind === "tool_pack" && Array.isArray(payload.tools)) {
    tools.push(...(payload.tools as ToolBundleEntry[]));
  } else if (kind === "bundle") {
    if (Array.isArray(payload.skills)) {
      skills.push(...(payload.skills as SkillBundleEntry[]));
    }
    if (Array.isArray(payload.tools)) {
      tools.push(...(payload.tools as ToolBundleEntry[]));
    }
  } else {
    throw new Error(
      `unknown payload.kind "${kind}" — cannot install ${item.itemType}`
    );
  }

  // Install skills
  for (const skill of skills) {
    try {
      const result = await installSkillEntry(skill, input.installedBy ?? null, onConflict);
      if (result.id != null) {
        createdSkillIds.push(result.id);
        if (result.warning) warnings.push(result.warning);
      } else if (result.skipped) {
        skipped.push({
          kind: "skill",
          key: `${skill.packKey}/${skill.skillKey}`,
          reason: result.skipped.reason,
        });
      }
    } catch (e) {
      skipped.push({
        kind: "skill",
        key: `${skill.packKey}/${skill.skillKey}`,
        reason: e instanceof Error ? e.message : String(e),
      });
    }
  }

  // Install tools
  for (const tool of tools) {
    try {
      const result = await installToolEntry(tool, input.installedBy ?? null, onConflict);
      if (result.id != null) {
        createdToolIds.push(result.id);
        if (result.warning) warnings.push(result.warning);
      } else if (result.skipped) {
        skipped.push({
          kind: "tool",
          key: tool.key,
          reason: result.skipped.reason,
        });
      }
    } catch (e) {
      skipped.push({
        kind: "tool",
        key: tool.key,
        reason: e instanceof Error ? e.message : String(e),
      });
    }
  }

  // Record the install for traceability + future uninstall
  const installRecord = await repo.recordMarketplaceInstall({
    itemId: input.itemId,
    agentId: input.agentId ?? null,
    createdSkillIds,
    createdToolIds,
    installedBy: input.installedBy ?? null,
  });

  // Bump install count on the marketplace item
  if (createdSkillIds.length + createdToolIds.length > 0) {
    await repo.bumpMarketplaceInstallCount(input.itemId);
  }

  return {
    installId: installRecord.id,
    itemId: input.itemId,
    itemKey: item.itemKey,
    itemType: item.itemType,
    createdSkillIds,
    createdToolIds,
    skipped,
    warnings,
  };
}

/**
 * Reverse an install. Reads the recorded createdSkillIds /
 * createdToolIds from agsMarketplaceInstalls and deletes those rows
 * from the catalog tables. Decrements the install count and removes
 * the install record itself.
 */
export async function uninstallMarketplaceItem(
  installId: number
): Promise<UninstallResult> {
  const record = await repo.getMarketplaceInstallById(installId);
  if (!record) {
    throw new Error(`install record ${installId} not found`);
  }

  const warnings: string[] = [];
  let removedSkills = 0;
  let removedTools = 0;

  for (const skillId of (record.createdSkillIds ?? []) as number[]) {
    try {
      await repo.removeCatalogSkill(skillId);
      removedSkills++;
    } catch (e) {
      warnings.push(
        `failed to remove skill ${skillId}: ${e instanceof Error ? e.message : String(e)}`
      );
    }
  }

  for (const toolId of (record.createdToolIds ?? []) as number[]) {
    try {
      await repo.removeCatalogTool(toolId);
      removedTools++;
    } catch (e) {
      warnings.push(
        `failed to remove tool ${toolId}: ${e instanceof Error ? e.message : String(e)}`
      );
    }
  }

  await repo.decrementMarketplaceInstallCount(record.itemId);
  await repo.removeMarketplaceInstall(installId);

  return {
    installId,
    removedSkills,
    removedTools,
    warnings,
  };
}
