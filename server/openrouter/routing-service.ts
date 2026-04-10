/**
 * OpenRouter — Routing Service
 *
 * Manages routing profiles (presets + custom).
 * Profiles control provider ordering, fallback behavior, and constraints.
 */

import { eq, and } from "drizzle-orm";
import { getDb } from "../db/connection";
import { openrouterRoutingProfiles } from "./schema";
import { logActivity } from "./service";

/**
 * Seed default routing presets if they don't exist.
 */
export async function seedDefaultPresets(): Promise<void> {
  const db = getDb();
  if (!db) return;

  const existing = await db.select().from(openrouterRoutingProfiles).where(eq(openrouterRoutingProfiles.isPreset, true));
  if (existing.length > 0) return;

  const presets = [
    {
      name: "Balanced",
      description: "Balanced cost, speed, and quality. Default routing.",
      config: { allowFallbacks: true, requireParametersMatch: false },
      isDefault: true,
    },
    {
      name: "Lowest Cost",
      description: "Prioritize cheapest available provider.",
      config: { order: ["price"], allowFallbacks: true, modelConstraints: { maxCost: 5 } },
    },
    {
      name: "Tooling Priority",
      description: "Prefer providers with best tool calling support.",
      config: { order: ["quality"], allowFallbacks: true, requireParametersMatch: true },
    },
    {
      name: "Privacy / EU-first",
      description: "Prefer EU-based providers and deny data collection.",
      config: { dataCollection: "deny" as const, allowFallbacks: false },
    },
    {
      name: "Multimodal",
      description: "Optimized for vision and multimodal requests.",
      config: { order: ["quality"], allowFallbacks: true },
    },
  ];

  for (const preset of presets) {
    await db.insert(openrouterRoutingProfiles).values({
      name: preset.name,
      description: preset.description,
      isPreset: true,
      isDefault: preset.isDefault ?? false,
      config: preset.config,
    });
  }
}

/**
 * List all routing profiles.
 */
export async function listProfiles(): Promise<(typeof openrouterRoutingProfiles.$inferSelect)[]> {
  const db = getDb();
  if (!db) return [];
  return db.select().from(openrouterRoutingProfiles).orderBy(openrouterRoutingProfiles.isPreset);
}

/**
 * Get the active default profile.
 */
export async function getDefaultProfile(): Promise<typeof openrouterRoutingProfiles.$inferSelect | null> {
  const db = getDb();
  if (!db) return null;
  const [row] = await db.select().from(openrouterRoutingProfiles).where(eq(openrouterRoutingProfiles.isDefault, true)).limit(1);
  return row ?? null;
}

/**
 * Set a profile as the default (unsets previous default).
 */
export async function setDefaultProfile(profileId: number, actorId?: number): Promise<void> {
  const db = getDb();
  if (!db) return;

  // Unset current default
  await db.update(openrouterRoutingProfiles).set({ isDefault: false }).where(eq(openrouterRoutingProfiles.isDefault, true));

  // Set new default
  await db.update(openrouterRoutingProfiles).set({ isDefault: true, updatedAt: new Date() }).where(eq(openrouterRoutingProfiles.id, profileId));

  await logActivity("routing.setDefault", actorId, `Set profile #${profileId} as default`);
}

/**
 * Create a custom routing profile.
 */
export async function createProfile(params: {
  name: string;
  description?: string;
  config: Record<string, unknown>;
  actorId?: number;
}): Promise<typeof openrouterRoutingProfiles.$inferSelect> {
  const db = getDb();
  if (!db) throw new Error("Database unavailable");

  const [row] = await db
    .insert(openrouterRoutingProfiles)
    .values({
      name: params.name,
      description: params.description,
      isPreset: false,
      config: params.config,
    })
    .returning();

  await logActivity("routing.create", params.actorId, `Created profile "${params.name}"`);
  return row;
}

/**
 * Update a routing profile (only custom, not presets).
 */
export async function updateProfile(
  id: number,
  updates: { name?: string; description?: string; config?: Record<string, unknown> },
  actorId?: number
): Promise<typeof openrouterRoutingProfiles.$inferSelect> {
  const db = getDb();
  if (!db) throw new Error("Database unavailable");

  const [row] = await db
    .update(openrouterRoutingProfiles)
    .set({ ...updates, updatedAt: new Date() })
    .where(and(eq(openrouterRoutingProfiles.id, id), eq(openrouterRoutingProfiles.isPreset, false)))
    .returning();

  if (!row) throw new Error("Profile not found or is a preset");

  await logActivity("routing.update", actorId, `Updated profile #${id}`);
  return row;
}

/**
 * Delete a custom routing profile.
 */
export async function deleteProfile(id: number, actorId?: number): Promise<void> {
  const db = getDb();
  if (!db) return;

  await db.delete(openrouterRoutingProfiles).where(and(eq(openrouterRoutingProfiles.id, id), eq(openrouterRoutingProfiles.isPreset, false)));
  await logActivity("routing.delete", actorId, `Deleted profile #${id}`);
}
