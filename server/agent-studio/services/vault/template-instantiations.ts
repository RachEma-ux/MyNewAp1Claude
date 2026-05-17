/**
 * Vault template-instantiation ledger service — Phase 15-α V1+.
 *
 * Closes the V1+ plan Phase 15-α acceptance criterion #2:
 * "Template-instantiation tracking — `agsVaultTemplateInstantiations`
 *  table records which note was created from which template (for
 *  refactor-safety + audit)."
 *
 * Surfaces:
 *   - `computeTemplateDigest(contentMd)` — pure sha256 hex digest;
 *     refactor anchor. Tested in isolation.
 *   - `recordTemplateInstantiation(input)` — inserts one ledger row.
 *     No-ops if ASDB is unavailable (test-mode fall-through).
 *   - `listInstantiationsByTemplate(templateId)` — operator helper.
 *   - `listInstantiationsByNote(noteId)` — operator helper.
 *
 * Hard-rule compliance:
 *   - No graph mutation; vault-internal metadata only.
 *   - Postgres = source of truth.
 *   - No raw env reads.
 *
 * The router.ts `createNoteFromTemplate` mutation wires
 * `recordTemplateInstantiation` immediately after `createNote`
 * returns (separate PR — service-only here so unit tests are
 * decoupled from tRPC).
 */

import { createHash } from "node:crypto";
import { eq, sql } from "drizzle-orm";

import { getAsDb, getAsDbForWorkspace } from "../../db/connection.js";
import { agsVaultTemplateInstantiations } from "../../../../drizzle/tables/agent-studio-vault-template-instantiations.js";
import { agsVaultNotes, agsVaults } from "../../../../drizzle/tables/agent-studio-vault.js";

export function computeTemplateDigest(contentMd: string): string {
  return createHash("sha256").update(contentMd, "utf8").digest("hex");
}

export interface RecordInstantiationInput {
  readonly templateId: number;
  readonly noteId: number;
  readonly noteVersionId?: number;
  readonly templateVersionDigest: string;
  readonly instantiatedByUserId?: number;
  readonly context?: Record<string, unknown>;
}

export interface RecordedInstantiation {
  readonly id: number;
  readonly templateId: number;
  readonly noteId: number;
  readonly templateVersionDigest: string;
  readonly instantiatedAt: Date;
}

/**
 * Persist one instantiation ledger row. Returns the row, or null
 * when ASDB is unavailable (test-mode fall-through; mirrors the
 * drift cron + health-alert services).
 */
export async function recordTemplateInstantiation(
  input: RecordInstantiationInput,
): Promise<RecordedInstantiation | null> {
  // V1+ MR-3 sixty-first batch (PR-V1-131): Path-A style discovering
  // helper. The ledger row points at a note, and note→vault→
  // workspace gives us the routing key. Two-table JOIN on
  // agsVaultNotes × agsVaults walks the chain in one round-trip,
  // then the INSERT routes via getAsDbForWorkspace. Falls back to
  // bootstrap when the note's vault is missing OR vault.workspaceId
  // is null (legacy / pre-Phase-1 data); the FK constraint catches
  // an orphan noteId at the DB layer.
  const lookupDb = getAsDb();
  if (!lookupDb) return null;
  const lookup = await lookupDb
    .select({ workspaceId: agsVaults.workspaceId })
    .from(agsVaultNotes)
    .innerJoin(agsVaults, eq(agsVaultNotes.vaultId, agsVaults.id))
    .where(eq(agsVaultNotes.id, input.noteId))
    .limit(1);
  const workspaceId = lookup[0]?.workspaceId;
  const db =
    workspaceId != null
      ? (getAsDbForWorkspace(workspaceId) ?? lookupDb)
      : lookupDb;
  const [row] = await db
    .insert(agsVaultTemplateInstantiations)
    .values({
      templateId: input.templateId,
      noteId: input.noteId,
      noteVersionId: input.noteVersionId ?? null,
      templateVersionDigest: input.templateVersionDigest,
      instantiatedByUserId: input.instantiatedByUserId ?? null,
      context: input.context ?? null,
    })
    .returning({
      id: agsVaultTemplateInstantiations.id,
      templateId: agsVaultTemplateInstantiations.templateId,
      noteId: agsVaultTemplateInstantiations.noteId,
      templateVersionDigest:
        agsVaultTemplateInstantiations.templateVersionDigest,
      instantiatedAt: agsVaultTemplateInstantiations.instantiatedAt,
    });
  if (!row) return null;
  return {
    id: row.id,
    templateId: row.templateId,
    noteId: row.noteId,
    templateVersionDigest: row.templateVersionDigest,
    instantiatedAt: row.instantiatedAt,
  };
}

export interface InstantiationRow {
  readonly id: number;
  readonly templateId: number;
  readonly noteId: number;
  readonly noteVersionId: number | null;
  readonly templateVersionDigest: string;
  readonly instantiatedByUserId: number | null;
  readonly instantiatedAt: Date;
}

export async function listInstantiationsByTemplate(
  templateId: number,
  limit: number = 100,
): Promise<ReadonlyArray<InstantiationRow>> {
  const db = getAsDb();
  if (!db) return [];
  const rows = await db
    .select({
      id: agsVaultTemplateInstantiations.id,
      templateId: agsVaultTemplateInstantiations.templateId,
      noteId: agsVaultTemplateInstantiations.noteId,
      noteVersionId: agsVaultTemplateInstantiations.noteVersionId,
      templateVersionDigest:
        agsVaultTemplateInstantiations.templateVersionDigest,
      instantiatedByUserId:
        agsVaultTemplateInstantiations.instantiatedByUserId,
      instantiatedAt: agsVaultTemplateInstantiations.instantiatedAt,
    })
    .from(agsVaultTemplateInstantiations)
    .where(eq(agsVaultTemplateInstantiations.templateId, templateId))
    .orderBy(sql`${agsVaultTemplateInstantiations.instantiatedAt} desc`)
    .limit(limit);
  return rows;
}

export async function listInstantiationsByNote(
  noteId: number,
): Promise<ReadonlyArray<InstantiationRow>> {
  const db = getAsDb();
  if (!db) return [];
  const rows = await db
    .select({
      id: agsVaultTemplateInstantiations.id,
      templateId: agsVaultTemplateInstantiations.templateId,
      noteId: agsVaultTemplateInstantiations.noteId,
      noteVersionId: agsVaultTemplateInstantiations.noteVersionId,
      templateVersionDigest:
        agsVaultTemplateInstantiations.templateVersionDigest,
      instantiatedByUserId:
        agsVaultTemplateInstantiations.instantiatedByUserId,
      instantiatedAt: agsVaultTemplateInstantiations.instantiatedAt,
    })
    .from(agsVaultTemplateInstantiations)
    .where(eq(agsVaultTemplateInstantiations.noteId, noteId))
    .orderBy(sql`${agsVaultTemplateInstantiations.instantiatedAt} desc`);
  return rows;
}

/**
 * Count distinct digests recorded for a template — operator
 * shortcut to spot "this template has been edited N times since
 * the last bulk refactor".
 */
export async function countDistinctDigestsForTemplate(
  templateId: number,
): Promise<number> {
  const db = getAsDb();
  if (!db) return 0;
  const rows = await db
    .select({
      n: sql<number>`count(distinct ${agsVaultTemplateInstantiations.templateVersionDigest})::int`,
    })
    .from(agsVaultTemplateInstantiations)
    .where(eq(agsVaultTemplateInstantiations.templateId, templateId));
  return rows[0]?.n ?? 0;
}
