/**
 * Code Studio — OpenCode Settings Repository (CODEDB)
 *
 * CRUD operations for OpenCode runtime/TUI profiles,
 * versioned snapshots, and apply events.
 */

import { eq, and, desc, sql } from "drizzle-orm";
import { getCodeDb } from "../connection";
import {
  codeOpencodeProfiles,
  codeOpencodeProfileVersions,
  codeOpencodeApplyEvents,
} from "../../../drizzle/tables/codedb";

// ── Profiles ─────────────────────────────────────────────────────────────────

export async function getActiveProfile(profileType: "runtime" | "tui") {
  const db = getCodeDb();
  if (!db) return null;
  const [row] = await db
    .select()
    .from(codeOpencodeProfiles)
    .where(
      and(
        eq(codeOpencodeProfiles.profileType, profileType),
        eq(codeOpencodeProfiles.isActive, true),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function listProfiles(profileType?: "runtime" | "tui") {
  const db = getCodeDb();
  if (!db) return [];
  const conditions: any[] = [];
  if (profileType) conditions.push(eq(codeOpencodeProfiles.profileType, profileType));
  return db
    .select()
    .from(codeOpencodeProfiles)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(codeOpencodeProfiles.updatedAt));
}

export async function getProfileById(id: number) {
  const db = getCodeDb();
  if (!db) return null;
  const [row] = await db
    .select()
    .from(codeOpencodeProfiles)
    .where(eq(codeOpencodeProfiles.id, id))
    .limit(1);
  return row ?? null;
}

export async function createProfile(data: {
  profileType: "runtime" | "tui";
  name: string;
  description?: string;
  configDraft?: Record<string, any>;
}) {
  const db = getCodeDb();
  if (!db) throw new Error("CODEDB unavailable");
  const [row] = await db
    .insert(codeOpencodeProfiles)
    .values({
      profileType: data.profileType,
      name: data.name,
      description: data.description ?? null,
      configDraft: data.configDraft ?? {},
      status: "draft",
      isActive: true,
    })
    .returning();
  return row;
}

export async function updateProfileDraft(id: number, configDraft: Record<string, any>) {
  const db = getCodeDb();
  if (!db) throw new Error("CODEDB unavailable");
  const [updated] = await db
    .update(codeOpencodeProfiles)
    .set({ configDraft, updatedAt: new Date() })
    .where(eq(codeOpencodeProfiles.id, id))
    .returning();
  return updated;
}

export async function markProfileApplied(id: number, version: number, config: Record<string, any>) {
  const db = getCodeDb();
  if (!db) throw new Error("CODEDB unavailable");
  const [updated] = await db
    .update(codeOpencodeProfiles)
    .set({
      configApplied: config,
      appliedAt: new Date(),
      appliedVersion: version,
      status: "applied",
      updatedAt: new Date(),
    })
    .where(eq(codeOpencodeProfiles.id, id))
    .returning();
  return updated;
}

export async function deleteProfile(id: number) {
  const db = getCodeDb();
  if (!db) throw new Error("CODEDB unavailable");
  // Delete versions and apply events first
  await db.delete(codeOpencodeProfileVersions).where(eq(codeOpencodeProfileVersions.profileId, id));
  await db.delete(codeOpencodeApplyEvents).where(eq(codeOpencodeApplyEvents.profileId, id));
  const [deleted] = await db.delete(codeOpencodeProfiles).where(eq(codeOpencodeProfiles.id, id)).returning();
  return deleted;
}

// ── Versions ─────────────────────────────────────────────────────────────────

export async function createVersion(data: {
  profileId: number;
  config: Record<string, any>;
  changeSummary?: string;
  createdBy?: number;
}) {
  const db = getCodeDb();
  if (!db) throw new Error("CODEDB unavailable");
  // Get next version number
  const existing = await db
    .select({ maxVersion: sql<number>`coalesce(max(${codeOpencodeProfileVersions.version}), 0)` })
    .from(codeOpencodeProfileVersions)
    .where(eq(codeOpencodeProfileVersions.profileId, data.profileId));
  const nextVersion = ((existing[0]?.maxVersion as number) ?? 0) + 1;
  const [row] = await db
    .insert(codeOpencodeProfileVersions)
    .values({
      profileId: data.profileId,
      version: nextVersion,
      config: data.config,
      changeSummary: data.changeSummary ?? null,
      createdBy: data.createdBy ?? null,
    })
    .returning();
  return row;
}

export async function listVersions(profileId: number, limit: number = 20) {
  const db = getCodeDb();
  if (!db) return [];
  return db
    .select()
    .from(codeOpencodeProfileVersions)
    .where(eq(codeOpencodeProfileVersions.profileId, profileId))
    .orderBy(desc(codeOpencodeProfileVersions.version))
    .limit(limit);
}

export async function getVersion(profileId: number, version: number) {
  const db = getCodeDb();
  if (!db) return null;
  const [row] = await db
    .select()
    .from(codeOpencodeProfileVersions)
    .where(
      and(
        eq(codeOpencodeProfileVersions.profileId, profileId),
        eq(codeOpencodeProfileVersions.version, version),
      ),
    )
    .limit(1);
  return row ?? null;
}

// ── Apply Events ─────────────────────────────────────────────────────────────

export async function createApplyEvent(data: {
  profileId: number;
  profileType: "runtime" | "tui";
  version: number;
  action: "apply" | "revert" | "validate" | "preview";
  status: "success" | "failed" | "pending";
  generatedConfig?: Record<string, any>;
  validationErrors?: any[];
  healthCheckResult?: Record<string, any>;
  errorMessage?: string;
  actorUserId?: number;
}) {
  const db = getCodeDb();
  if (!db) throw new Error("CODEDB unavailable");
  const [row] = await db
    .insert(codeOpencodeApplyEvents)
    .values({
      profileId: data.profileId,
      profileType: data.profileType,
      version: data.version,
      action: data.action,
      status: data.status,
      generatedConfig: data.generatedConfig ?? null,
      validationErrors: data.validationErrors ?? null,
      healthCheckResult: data.healthCheckResult ?? null,
      errorMessage: data.errorMessage ?? null,
      actorUserId: data.actorUserId ?? null,
    })
    .returning();
  return row;
}

export async function listApplyEvents(profileId?: number, limit: number = 50) {
  const db = getCodeDb();
  if (!db) return [];
  const conditions: any[] = [];
  if (profileId) conditions.push(eq(codeOpencodeApplyEvents.profileId, profileId));
  return db
    .select()
    .from(codeOpencodeApplyEvents)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(codeOpencodeApplyEvents.createdAt))
    .limit(limit);
}

export async function getLastApplyEvent(profileId: number) {
  const db = getCodeDb();
  if (!db) return null;
  const [row] = await db
    .select()
    .from(codeOpencodeApplyEvents)
    .where(
      and(
        eq(codeOpencodeApplyEvents.profileId, profileId),
        eq(codeOpencodeApplyEvents.action, "apply"),
      ),
    )
    .orderBy(desc(codeOpencodeApplyEvents.createdAt))
    .limit(1);
  return row ?? null;
}
