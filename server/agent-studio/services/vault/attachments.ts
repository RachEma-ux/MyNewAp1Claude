/**
 * Vault — Attachments service.
 *
 * Phase 15. Wires the dormant `ags_vault_attachments` table. Closes
 * the Phase 15 attachment criteria:
 *   - "Image attachments work"
 *   - "PDF attachments work"
 *   - "Attachments can be embedded in notes"
 *   - "Attachments can become source artifacts"
 *
 * The service is mime-agnostic at the storage layer — image vs PDF
 * is a render-time classification, not a write-time gate. Operators
 * upload via the existing `/api` upload surface; the resulting
 * `storageUri` + `contentHash` are recorded here so the vault layer
 * can list, link, and embed them.
 *
 * Embed semantics (Obsidian-style):
 *   - Image → `![[<filename>]]` (rendered inline by the markdown
 *     editor / preview)
 *   - PDF → `![[<filename>]]` (most editors render the first page)
 *   - Anything else → `[[<filename>]]` (plain link)
 *
 * Source-artifact flag:
 *   - `markAttachmentAsSourceArtifact(id)` flips
 *     `is_source_artifact` to true. The Universal Ingestion /
 *     `ags_rac_sources` pipeline reads this column when it scans
 *     the vault for new ingestion candidates. The flip is a pure
 *     marker; actual ingestion registration happens in the
 *     ingestion service.
 *
 * ADR: docs/architecture/agent-studio-markdown-profile.md
 */

import { and, desc, eq } from "drizzle-orm";
import { getAsDb } from "../../db/connection.js";
import { agsVaultAttachments } from "../../../../drizzle/tables/agent-studio-vault.js";

export class AsdbUnavailableError extends Error {
  constructor() {
    super("ASDB connection unavailable");
    this.name = "AsdbUnavailableError";
  }
}

export class AttachmentNotFoundError extends Error {
  constructor(public readonly attachmentId: number) {
    super(`Attachment ${attachmentId} not found`);
    this.name = "AttachmentNotFoundError";
  }
}

export interface CreateAttachmentInput {
  readonly vaultId: number;
  readonly noteId?: number | null;
  readonly filename: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly storageUri: string;
  readonly contentHash: string;
}

export interface AttachmentRow {
  readonly id: number;
  readonly vaultId: number;
  readonly noteId: number | null;
  readonly filename: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly storageUri: string;
  readonly contentHash: string;
  readonly createdByUserId: number | null;
  readonly isSourceArtifact: boolean;
  readonly createdAt: Date;
}

export interface AttachmentServiceOptions {
  readonly getDb?: typeof getAsDb;
}

export function isImageMimeType(mime: string): boolean {
  return /^image\//i.test(mime);
}

export function isPdfMimeType(mime: string): boolean {
  return /^application\/pdf(\b|;)/i.test(mime);
}

export function isEmbeddableMimeType(mime: string): boolean {
  return isImageMimeType(mime) || isPdfMimeType(mime);
}

/**
 * Returns the Markdown snippet that embeds (or links to) the
 * attachment when pasted into a note body. Uses the Obsidian
 * embed/link syntax — `![[...]]` for inlineable types, `[[...]]`
 * for everything else.
 */
export function buildAttachmentEmbedSnippet(
  attachment: Pick<AttachmentRow, "filename" | "mimeType">,
): string {
  if (isEmbeddableMimeType(attachment.mimeType)) {
    return `![[${attachment.filename}]]`;
  }
  return `[[${attachment.filename}]]`;
}

function rowToAttachment(r: Record<string, unknown>): AttachmentRow {
  return {
    id: Number(r.id),
    vaultId: Number(r.vaultId),
    noteId: r.noteId == null ? null : Number(r.noteId),
    filename: String(r.filename),
    mimeType: String(r.mimeType),
    sizeBytes: Number(r.sizeBytes),
    storageUri: String(r.storageUri),
    contentHash: String(r.contentHash),
    createdByUserId:
      r.createdByUserId == null ? null : Number(r.createdByUserId),
    isSourceArtifact: Boolean(r.isSourceArtifact),
    createdAt: r.createdAt as Date,
  };
}

export async function createAttachment(
  input: CreateAttachmentInput,
  createdByUserId: number,
  options: AttachmentServiceOptions = {},
): Promise<AttachmentRow> {
  const getDb = options.getDb ?? getAsDb;
  const db = getDb();
  if (!db) throw new AsdbUnavailableError();

  const inserted = await db
    .insert(agsVaultAttachments)
    .values({
      vaultId: input.vaultId,
      noteId: input.noteId ?? null,
      filename: input.filename,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      storageUri: input.storageUri,
      contentHash: input.contentHash,
      createdByUserId,
      isSourceArtifact: false,
    })
    .returning({
      id: agsVaultAttachments.id,
      vaultId: agsVaultAttachments.vaultId,
      noteId: agsVaultAttachments.noteId,
      filename: agsVaultAttachments.filename,
      mimeType: agsVaultAttachments.mimeType,
      sizeBytes: agsVaultAttachments.sizeBytes,
      storageUri: agsVaultAttachments.storageUri,
      contentHash: agsVaultAttachments.contentHash,
      createdByUserId: agsVaultAttachments.createdByUserId,
      isSourceArtifact: agsVaultAttachments.isSourceArtifact,
      createdAt: agsVaultAttachments.createdAt,
    });
  const row = inserted[0];
  if (!row) throw new Error("Failed to insert vault attachment");
  return rowToAttachment(row);
}

export async function getAttachmentById(
  attachmentId: number,
  options: AttachmentServiceOptions = {},
): Promise<AttachmentRow | null> {
  const getDb = options.getDb ?? getAsDb;
  const db = getDb();
  if (!db) return null;

  const rows = await db
    .select({
      id: agsVaultAttachments.id,
      vaultId: agsVaultAttachments.vaultId,
      noteId: agsVaultAttachments.noteId,
      filename: agsVaultAttachments.filename,
      mimeType: agsVaultAttachments.mimeType,
      sizeBytes: agsVaultAttachments.sizeBytes,
      storageUri: agsVaultAttachments.storageUri,
      contentHash: agsVaultAttachments.contentHash,
      createdByUserId: agsVaultAttachments.createdByUserId,
      isSourceArtifact: agsVaultAttachments.isSourceArtifact,
      createdAt: agsVaultAttachments.createdAt,
    })
    .from(agsVaultAttachments)
    .where(eq(agsVaultAttachments.id, attachmentId))
    .limit(1);
  if (rows.length === 0) return null;
  return rowToAttachment(rows[0]);
}

export interface ListAttachmentsInput {
  readonly vaultId?: number;
  readonly noteId?: number;
  readonly limit?: number;
}

export async function listAttachments(
  input: ListAttachmentsInput,
  options: AttachmentServiceOptions = {},
): Promise<AttachmentRow[]> {
  const getDb = options.getDb ?? getAsDb;
  const db = getDb();
  if (!db) return [];

  const filters = [];
  if (input.vaultId !== undefined) {
    filters.push(eq(agsVaultAttachments.vaultId, input.vaultId));
  }
  if (input.noteId !== undefined) {
    filters.push(eq(agsVaultAttachments.noteId, input.noteId));
  }
  if (filters.length === 0) {
    // Refuse "list everything" — operators always scope.
    return [];
  }

  const rows = await db
    .select({
      id: agsVaultAttachments.id,
      vaultId: agsVaultAttachments.vaultId,
      noteId: agsVaultAttachments.noteId,
      filename: agsVaultAttachments.filename,
      mimeType: agsVaultAttachments.mimeType,
      sizeBytes: agsVaultAttachments.sizeBytes,
      storageUri: agsVaultAttachments.storageUri,
      contentHash: agsVaultAttachments.contentHash,
      createdByUserId: agsVaultAttachments.createdByUserId,
      isSourceArtifact: agsVaultAttachments.isSourceArtifact,
      createdAt: agsVaultAttachments.createdAt,
    })
    .from(agsVaultAttachments)
    .where(filters.length === 1 ? filters[0] : and(...filters))
    .orderBy(desc(agsVaultAttachments.createdAt))
    .limit(input.limit ?? 100);

  return rows.map(rowToAttachment);
}

export async function linkAttachmentToNote(
  attachmentId: number,
  noteId: number,
  options: AttachmentServiceOptions = {},
): Promise<AttachmentRow> {
  const getDb = options.getDb ?? getAsDb;
  const db = getDb();
  if (!db) throw new AsdbUnavailableError();

  await db
    .update(agsVaultAttachments)
    .set({ noteId })
    .where(eq(agsVaultAttachments.id, attachmentId));

  const updated = await getAttachmentById(attachmentId, options);
  if (!updated) throw new AttachmentNotFoundError(attachmentId);
  return updated;
}

export async function unlinkAttachmentFromNote(
  attachmentId: number,
  options: AttachmentServiceOptions = {},
): Promise<AttachmentRow> {
  const getDb = options.getDb ?? getAsDb;
  const db = getDb();
  if (!db) throw new AsdbUnavailableError();

  await db
    .update(agsVaultAttachments)
    .set({ noteId: null })
    .where(eq(agsVaultAttachments.id, attachmentId));

  const updated = await getAttachmentById(attachmentId, options);
  if (!updated) throw new AttachmentNotFoundError(attachmentId);
  return updated;
}

export async function markAttachmentAsSourceArtifact(
  attachmentId: number,
  options: AttachmentServiceOptions = {},
): Promise<AttachmentRow> {
  const getDb = options.getDb ?? getAsDb;
  const db = getDb();
  if (!db) throw new AsdbUnavailableError();

  await db
    .update(agsVaultAttachments)
    .set({ isSourceArtifact: true })
    .where(eq(agsVaultAttachments.id, attachmentId));

  const updated = await getAttachmentById(attachmentId, options);
  if (!updated) throw new AttachmentNotFoundError(attachmentId);
  return updated;
}
