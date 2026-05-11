/**
 * Graph Skill Pack — governed mutations service.
 *
 * Phase 12.5 §10. Pack create + version publish, callable from the
 * graphSkill tRPC router. Today these operations are reachable only
 * through the boot-time seed pipeline at `db/seed-graph-skill-rows.ts`
 * — this module exposes them via a programmatic surface so operator
 * UIs (and tests) can create + version Skill Packs at runtime.
 *
 * Idempotency:
 *   - `createPack` is keyed on `skillKey` and returns the existing
 *     pack row when one already exists rather than throwing. This
 *     matches the seed pipeline's upsert pattern; the router caller
 *     decides whether duplicate creation is an error at its layer
 *     (today: no, it's idempotent).
 *   - `publishVersion` enforces the unique `(pack_id, version)` index
 *     by checking before insert and throwing a typed error on
 *     duplicate — the version string is operator-supplied and a
 *     collision means the caller picked the wrong version label.
 *
 * Both writers degrade to a typed error when ASDB is unavailable so
 * the router can surface a clean `INTERNAL_SERVER_ERROR` instead of
 * a raw drizzle stack trace.
 *
 * ADR: docs/architecture/agent-studio-graph-skill-packs.md §1.5
 */

import { and, desc, eq } from "drizzle-orm";
import { getAsDb } from "../../db/connection.js";
import {
  agsGraphSkillPacks,
  agsGraphSkillPackVersions,
} from "../../../../drizzle/tables/agent-studio-graph-skill.js";
import { agsVaultNoteVersions } from "../../../../drizzle/tables/agent-studio-vault.js";

export class AsdbUnavailableError extends Error {
  constructor() {
    super("ASDB connection unavailable");
    this.name = "AsdbUnavailableError";
  }
}

export class DuplicateVersionError extends Error {
  constructor(
    public readonly skillKey: string,
    public readonly version: string,
  ) {
    super(
      `pack "${skillKey}" already has a version labeled "${version}"`,
    );
    this.name = "DuplicateVersionError";
  }
}

export class PackNotFoundError extends Error {
  constructor(public readonly skillKey: string) {
    super(`Graph Skill Pack with skillKey="${skillKey}" not found`);
    this.name = "PackNotFoundError";
  }
}

export class SourceNoteVersionNotFoundError extends Error {
  constructor(public readonly sourceNoteVersionId: number) {
    super(
      `ags_vault_note_versions row with id=${sourceNoteVersionId} does not exist`,
    );
    this.name = "SourceNoteVersionNotFoundError";
  }
}

export type RiskLevel = "low" | "medium" | "high";

export interface CreatePackInput {
  readonly skillKey: string;
  readonly name: string;
  readonly description?: string | null;
  readonly domain?: string | null;
  readonly supportedNodeTypeKeys?: string[];
  readonly supportedEdgeTypeKeys?: string[];
  readonly riskLevel?: RiskLevel;
  readonly approvalRequired?: boolean;
}

export interface PackRow {
  readonly id: number;
  readonly skillKey: string;
  readonly name: string;
  readonly created: boolean;
}

export interface CreatePackOptions {
  readonly getDb?: typeof getAsDb;
}

export async function createPack(
  input: CreatePackInput,
  options: CreatePackOptions = {},
): Promise<PackRow> {
  const getDb = options.getDb ?? getAsDb;
  const db = getDb();
  if (!db) throw new AsdbUnavailableError();

  const existing = await db
    .select({
      id: agsGraphSkillPacks.id,
      skillKey: agsGraphSkillPacks.skillKey,
      name: agsGraphSkillPacks.name,
    })
    .from(agsGraphSkillPacks)
    .where(eq(agsGraphSkillPacks.skillKey, input.skillKey))
    .limit(1);

  if (existing.length > 0) {
    return {
      id: existing[0].id,
      skillKey: existing[0].skillKey,
      name: existing[0].name,
      created: false,
    };
  }

  const inserted = await db
    .insert(agsGraphSkillPacks)
    .values({
      skillKey: input.skillKey,
      name: input.name,
      description: input.description ?? null,
      domain: input.domain ?? null,
      supportedNodeTypeKeys: input.supportedNodeTypeKeys ?? [],
      supportedEdgeTypeKeys: input.supportedEdgeTypeKeys ?? [],
      riskLevel: input.riskLevel ?? "low",
      approvalRequired: input.approvalRequired ?? false,
      active: true,
      updatedAt: new Date(),
    })
    .returning({
      id: agsGraphSkillPacks.id,
      skillKey: agsGraphSkillPacks.skillKey,
      name: agsGraphSkillPacks.name,
    });

  return {
    id: inserted[0].id,
    skillKey: inserted[0].skillKey,
    name: inserted[0].name,
    created: true,
  };
}

export interface PublishVersionInput {
  readonly skillKey: string;
  readonly version: string;
  readonly manifest: Record<string, unknown>;
  readonly changelog?: string | null;
  readonly sourceNoteVersionId?: number | null;
}

export interface PackVersionRow {
  readonly id: number;
  readonly packId: number;
  readonly version: string;
}

export interface PublishVersionOptions {
  readonly getDb?: typeof getAsDb;
}

export async function publishVersion(
  input: PublishVersionInput,
  options: PublishVersionOptions = {},
): Promise<PackVersionRow> {
  const getDb = options.getDb ?? getAsDb;
  const db = getDb();
  if (!db) throw new AsdbUnavailableError();

  const packRows = await db
    .select({ id: agsGraphSkillPacks.id })
    .from(agsGraphSkillPacks)
    .where(eq(agsGraphSkillPacks.skillKey, input.skillKey))
    .limit(1);
  if (packRows.length === 0) throw new PackNotFoundError(input.skillKey);
  const packId = packRows[0].id;

  const dupCheck = await db
    .select({ id: agsGraphSkillPackVersions.id })
    .from(agsGraphSkillPackVersions)
    .where(
      and(
        eq(agsGraphSkillPackVersions.packId, packId),
        eq(agsGraphSkillPackVersions.version, input.version),
      ),
    )
    .limit(1);
  if (dupCheck.length > 0) {
    throw new DuplicateVersionError(input.skillKey, input.version);
  }

  // Phase 12.5 §14 — validate the source-note FK before we write so
  // operators get a clean error instead of a dangling reference. The
  // schema doesn't carry a `.references()` constraint on this column
  // (vault tables live in a separate per-module DB historically, so
  // FKs would cross databases), so we enforce it at the service
  // boundary instead.
  if (
    input.sourceNoteVersionId !== undefined &&
    input.sourceNoteVersionId !== null
  ) {
    const noteCheck = await db
      .select({ id: agsVaultNoteVersions.id })
      .from(agsVaultNoteVersions)
      .where(eq(agsVaultNoteVersions.id, input.sourceNoteVersionId))
      .limit(1);
    if (noteCheck.length === 0) {
      throw new SourceNoteVersionNotFoundError(input.sourceNoteVersionId);
    }
  }

  const inserted = await db
    .insert(agsGraphSkillPackVersions)
    .values({
      packId,
      version: input.version,
      manifest: input.manifest,
      changelog: input.changelog ?? null,
      sourceNoteVersionId: input.sourceNoteVersionId ?? null,
    })
    .returning({
      id: agsGraphSkillPackVersions.id,
      packId: agsGraphSkillPackVersions.packId,
      version: agsGraphSkillPackVersions.version,
    });

  return {
    id: inserted[0].id,
    packId: inserted[0].packId,
    version: inserted[0].version,
  };
}

export interface ListPackVersionsInput {
  readonly skillKey: string;
  readonly limit?: number;
}

export interface PackVersionListing {
  readonly id: number;
  readonly version: string;
  readonly createdAt: Date;
  readonly hasSourceNoteRef: boolean;
}

export interface ListPackVersionsOptions {
  readonly getDb?: typeof getAsDb;
}

export async function listPackVersions(
  input: ListPackVersionsInput,
  options: ListPackVersionsOptions = {},
): Promise<PackVersionListing[]> {
  const getDb = options.getDb ?? getAsDb;
  const db = getDb();
  if (!db) return [];

  const packRows = await db
    .select({ id: agsGraphSkillPacks.id })
    .from(agsGraphSkillPacks)
    .where(eq(agsGraphSkillPacks.skillKey, input.skillKey))
    .limit(1);
  if (packRows.length === 0) return [];
  const packId = packRows[0].id;

  const rows = await db
    .select({
      id: agsGraphSkillPackVersions.id,
      version: agsGraphSkillPackVersions.version,
      createdAt: agsGraphSkillPackVersions.createdAt,
      sourceNoteVersionId: agsGraphSkillPackVersions.sourceNoteVersionId,
    })
    .from(agsGraphSkillPackVersions)
    .where(eq(agsGraphSkillPackVersions.packId, packId))
    .orderBy(desc(agsGraphSkillPackVersions.createdAt))
    .limit(input.limit ?? 50);

  return rows.map((r) => ({
    id: r.id,
    version: r.version,
    createdAt: r.createdAt as Date,
    hasSourceNoteRef: r.sourceNoteVersionId !== null,
  }));
}
