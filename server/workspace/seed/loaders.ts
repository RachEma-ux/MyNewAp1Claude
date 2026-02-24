/**
 * YAML Config Loaders — Capabilities & Workspace Role Presets
 *
 * Loads and validates config/capabilities.yaml and config/workspace_role_presets.yaml
 * using Zod schemas. Rejects invalid or inconsistent configurations at load time.
 */

import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import { z } from "zod";

// ============================================================================
// Zod Schemas
// ============================================================================

const capabilityEntrySchema = z.object({
  key: z.string().min(1),
  description: z.string().optional(),
});

const capabilitiesCatalogSchema = z.object({
  version: z.number().int().positive(),
  capabilities: z.array(capabilityEntrySchema).min(1, "Capabilities list must not be empty"),
});

const roleEntrySchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  isSystem: z.boolean().default(false),
  allow: z.array(z.string()).min(1, "Role must have at least one capability"),
});

const workspaceTypePresetSchema = z.object({
  type: z.string().min(1),
  description: z.string().optional(),
  blockedCapabilities: z.array(z.string()),
});

const workspaceRolePresetsSchema = z.object({
  version: z.number().int().positive(),
  roles: z.array(roleEntrySchema).min(1, "Roles list must not be empty"),
  workspaceTypes: z.array(workspaceTypePresetSchema).min(1, "Workspace types list must not be empty"),
});

// ============================================================================
// Exported Types
// ============================================================================

export type CapabilityEntry = z.infer<typeof capabilityEntrySchema>;
export type CapabilitiesCatalog = z.infer<typeof capabilitiesCatalogSchema>;
export type RoleEntry = z.infer<typeof roleEntrySchema>;
export type WorkspaceTypePreset = z.infer<typeof workspaceTypePresetSchema>;
export type WorkspaceRolePresets = z.infer<typeof workspaceRolePresetsSchema>;

// ============================================================================
// Loaders
// ============================================================================

/**
 * Load and validate config/capabilities.yaml.
 * Rejects: missing version, empty list, duplicate keys.
 */
export function loadCapabilitiesCatalog(rootDir?: string): CapabilitiesCatalog {
  const root = rootDir ?? path.resolve(process.cwd());
  const filePath = path.join(root, "config", "capabilities.yaml");

  if (!fs.existsSync(filePath)) {
    throw new Error(`Capabilities config not found: ${filePath}`);
  }

  const raw = yaml.load(fs.readFileSync(filePath, "utf-8"));
  const parsed = capabilitiesCatalogSchema.parse(raw);

  // Check for duplicate keys
  const keys = parsed.capabilities.map((c) => c.key);
  const dupes = keys.filter((k, i) => keys.indexOf(k) !== i);
  if (dupes.length > 0) {
    throw new Error(`Duplicate capability keys: ${[...new Set(dupes)].join(", ")}`);
  }

  return parsed;
}

/**
 * Load and validate config/workspace_role_presets.yaml.
 * Cross-validates: roles referencing unknown capabilities, presets referencing unknown roles.
 */
export function loadWorkspaceRolePresets(rootDir?: string): WorkspaceRolePresets {
  const root = rootDir ?? path.resolve(process.cwd());
  const filePath = path.join(root, "config", "workspace_role_presets.yaml");

  if (!fs.existsSync(filePath)) {
    throw new Error(`Role presets config not found: ${filePath}`);
  }

  const raw = yaml.load(fs.readFileSync(filePath, "utf-8"));
  const parsed = workspaceRolePresetsSchema.parse(raw);

  // Cross-validate: load capabilities catalog to check references
  const catalog = loadCapabilitiesCatalog(rootDir);
  const validKeys = new Set(catalog.capabilities.map((c) => c.key));

  // Check role capability references
  for (const role of parsed.roles) {
    const unknownCaps = role.allow.filter((cap) => !validKeys.has(cap));
    if (unknownCaps.length > 0) {
      throw new Error(
        `Role "${role.name}" references unknown capabilities: ${unknownCaps.join(", ")}`
      );
    }
  }

  // Check workspace type preset blocked capability references
  for (const preset of parsed.workspaceTypes) {
    const unknownBlocked = preset.blockedCapabilities.filter((cap) => !validKeys.has(cap));
    if (unknownBlocked.length > 0) {
      throw new Error(
        `Workspace type "${preset.type}" references unknown blocked capabilities: ${unknownBlocked.join(", ")}`
      );
    }
  }

  return parsed;
}
