/**
 * Vault — Attachment Library service (Phase 15-β V1+).
 *
 * The base `attachments.ts` service (MVP 1 / Phase 15-α) covers
 * create / get / link / mark-as-source. It deliberately refuses
 * vault-wide listings (the listAttachments() function returns [] if
 * called without a vaultId or noteId filter), because the early
 * surface was per-note attachment binding — not a library browser.
 *
 * Phase 15-β closes the gap by adding the operator-facing surfaces
 * the V1+ plan lists under "Attachment library UI" + "Attachment
 * quota enforcement":
 *
 *   - `browseAttachmentLibrary()` — vault-wide listing with closed
 *     mime-class filter + sort + pagination.
 *   - `findUnusedAttachments()` — attachments not linked to any
 *     active (non-trashed) note. Operator candidates for cleanup.
 *   - `computeAttachmentQuota()` — sum of `sizeBytes` for a vault,
 *     compared against an optional bytes limit. Drives the per-
 *     workspace MB cap surface in the future operator UI.
 *
 * Closed mime-class taxonomy:
 *   - `image | video | audio | document | archive | other`
 *   - Additive extensions ("font", "model") require an ADR + this
 *     union update + a new branch in `classifyMimeType`.
 *
 * Hard-rule compliance (CLAUDE.md):
 *   - No graph access (this lives on the Postgres SoT side; no
 *     neo4j-driver imports).
 *   - No `credential-resolver` import. Source-scan tested.
 *   - No `process.env.*_API_KEY` reads.
 *   - Postgres = source of truth. The library reads `ags_vault_attachments`
 *     directly; no parallel index.
 */

import { and, desc, eq, isNotNull, isNull, sql, sum, count } from "drizzle-orm";

import { getAsDb } from "../../db/connection.js";
import {
  agsVaultAttachments,
  agsVaultNotes,
} from "../../../../drizzle/tables/agent-studio-vault.js";
import type {
  AttachmentRow,
  AttachmentServiceOptions,
} from "./attachments.js";

// ============================================================================
// Closed mime-class taxonomy
// ============================================================================

export const ATTACHMENT_MIME_CLASSES = [
  "image",
  "video",
  "audio",
  "document",
  "archive",
  "other",
] as const;

export type AttachmentMimeClass = (typeof ATTACHMENT_MIME_CLASSES)[number];

export function isAttachmentMimeClass(
  s: unknown,
): s is AttachmentMimeClass {
  return (
    typeof s === "string" &&
    (ATTACHMENT_MIME_CLASSES as readonly string[]).includes(s)
  );
}

// ============================================================================
// Per-mime-class operator-facing metadata (T-V.2)
// ============================================================================

export interface AttachmentMimeClassMetadata {
  /** Display label rendered in the attachment library's filter tabs. */
  readonly label: string;
  /** Short operator-facing description of what file types this class
   *  covers. */
  readonly description: string;
  /** Whether this class supports inline rendering in the attachment
   *  library preview pane (true) vs. download-only (false). */
  readonly previewable: boolean;
  /** Whether this class is media (image / video / audio) vs.
   *  document-shaped content vs. opaque blob. Drives the library's
   *  three-tab UX (Media / Documents / Other). */
  readonly displayBucket: "media" | "documents" | "other";
}

export const ATTACHMENT_MIME_CLASS_METADATA: Readonly<
  Record<AttachmentMimeClass, AttachmentMimeClassMetadata>
> = {
  image: {
    label: "Image",
    description:
      "Raster and vector images (PNG, JPEG, GIF, SVG, WebP, etc). Rendered inline in the preview pane.",
    previewable: true,
    displayBucket: "media",
  },
  video: {
    label: "Video",
    description:
      "Video files (MP4, WebM, OGV, MOV, etc). Rendered as an inline video element in the preview pane.",
    previewable: true,
    displayBucket: "media",
  },
  audio: {
    label: "Audio",
    description:
      "Audio files (MP3, WAV, OGG, FLAC, etc). Rendered as an inline audio element in the preview pane.",
    previewable: true,
    displayBucket: "media",
  },
  document: {
    label: "Document",
    description:
      "Documents (PDF, Word, Excel, PowerPoint, plain text, JSON, RTF, etc). PDF previews inline; other types show metadata.",
    previewable: true,
    displayBucket: "documents",
  },
  archive: {
    label: "Archive",
    description:
      "Archive bundles (ZIP, 7Z, TAR, RAR, GZIP, etc). Cannot be previewed — operator downloads and opens externally.",
    previewable: false,
    displayBucket: "other",
  },
  other: {
    label: "Other",
    description:
      "Files that don't match any known mime-class pattern. Treated as opaque blobs — download-only.",
    previewable: false,
    displayBucket: "other",
  },
};

export function getAttachmentMimeClassMetadata(
  mimeClass: AttachmentMimeClass,
): AttachmentMimeClassMetadata {
  return ATTACHMENT_MIME_CLASS_METADATA[mimeClass];
}

const DOCUMENT_PATTERN =
  /^application\/(pdf|msword|vnd\.openxmlformats-officedocument\.|vnd\.ms-|rtf|x-rtf)|^application\/json$|^text\//i;
const ARCHIVE_PATTERN =
  /^application\/(zip|x-zip-compressed|x-7z-compressed|x-tar|x-rar-compressed|gzip|x-gzip)$/i;

export function classifyMimeType(mime: string): AttachmentMimeClass {
  if (/^image\//i.test(mime)) return "image";
  if (/^video\//i.test(mime)) return "video";
  if (/^audio\//i.test(mime)) return "audio";
  if (ARCHIVE_PATTERN.test(mime)) return "archive";
  if (DOCUMENT_PATTERN.test(mime)) return "document";
  return "other";
}

// ============================================================================
// Browse
// ============================================================================

export const BROWSE_SORT_KEYS = [
  "created_at_desc",
  "size_desc",
] as const;
export type BrowseSortKey = (typeof BROWSE_SORT_KEYS)[number];

// ============================================================================
// Per-sort-key operator-facing metadata (T-V.3)
// ============================================================================

export interface BrowseSortKeyMetadata {
  /** Display label rendered in the sort picker. */
  readonly label: string;
  /** Short operator-facing description of what the sort does. */
  readonly description: string;
  /** Underlying SoT column the sort applies to. */
  readonly sortColumn: "createdAt" | "byteSize";
  /** Sort direction ascending (true) vs descending (false). Both
   *  current sorts are descending. */
  readonly ascending: boolean;
}

export const BROWSE_SORT_KEY_METADATA: Readonly<
  Record<BrowseSortKey, BrowseSortKeyMetadata>
> = {
  created_at_desc: {
    label: "Recently Added",
    description:
      "Sort attachments by upload time (newest first). Default sort for the attachment library browse view.",
    sortColumn: "createdAt",
    ascending: false,
  },
  size_desc: {
    label: "Largest First",
    description:
      "Sort attachments by byte-size (largest first). Useful for finding storage hot-spots and operator cleanup candidates.",
    sortColumn: "byteSize",
    ascending: false,
  },
};

export function getBrowseSortKeyMetadata(
  key: BrowseSortKey,
): BrowseSortKeyMetadata {
  return BROWSE_SORT_KEY_METADATA[key];
}

export interface BrowseAttachmentLibraryInput {
  readonly vaultId: number;
  readonly mimeClass?: AttachmentMimeClass;
  readonly sortBy?: BrowseSortKey;
  readonly limit?: number;
  readonly offset?: number;
}

export interface AttachmentLibraryRow extends AttachmentRow {
  readonly mimeClass: AttachmentMimeClass;
}

const MAX_BROWSE_LIMIT = 500;
const DEFAULT_BROWSE_LIMIT = 100;

function annotateMimeClass(rows: ReadonlyArray<AttachmentRow>): AttachmentLibraryRow[] {
  return rows.map((r) => ({ ...r, mimeClass: classifyMimeType(r.mimeType) }));
}

/**
 * Vault-wide attachment listing with optional mime-class filter +
 * sort. Returns empty array if ASDB is unavailable (test-mode fall-
 * through).
 *
 * Mime-class filter runs server-side via mime-type prefix (image/),
 * exact match (archive types), or pattern match (documents), so the
 * SQL stays index-eligible on `mime_type`.
 */
export async function browseAttachmentLibrary(
  input: BrowseAttachmentLibraryInput,
  options: AttachmentServiceOptions = {},
): Promise<AttachmentLibraryRow[]> {
  const getDb = options.getDb ?? getAsDb;
  const db = getDb();
  if (!db) return [];

  const limit = Math.min(
    Math.max(1, input.limit ?? DEFAULT_BROWSE_LIMIT),
    MAX_BROWSE_LIMIT,
  );
  const offset = Math.max(0, input.offset ?? 0);
  const sortBy: BrowseSortKey = input.sortBy ?? "created_at_desc";

  const filters = [eq(agsVaultAttachments.vaultId, input.vaultId)];

  if (input.mimeClass) {
    switch (input.mimeClass) {
      case "image":
        filters.push(sql`${agsVaultAttachments.mimeType} ilike 'image/%'`);
        break;
      case "video":
        filters.push(sql`${agsVaultAttachments.mimeType} ilike 'video/%'`);
        break;
      case "audio":
        filters.push(sql`${agsVaultAttachments.mimeType} ilike 'audio/%'`);
        break;
      case "archive":
        filters.push(
          sql`${agsVaultAttachments.mimeType} ~* '^application/(zip|x-zip-compressed|x-7z-compressed|x-tar|x-rar-compressed|gzip|x-gzip)$'`,
        );
        break;
      case "document":
        filters.push(
          sql`${agsVaultAttachments.mimeType} ~* '^application/(pdf|msword|vnd\\.openxmlformats-officedocument\\.|vnd\\.ms-|rtf|x-rtf)|^application/json$|^text/'`,
        );
        break;
      case "other":
        filters.push(
          sql`${agsVaultAttachments.mimeType} !~* '^(image|video|audio)/|^application/(pdf|msword|vnd\\.openxmlformats-officedocument\\.|vnd\\.ms-|rtf|x-rtf|zip|x-zip-compressed|x-7z-compressed|x-tar|x-rar-compressed|gzip|x-gzip|json)$|^text/'`,
        );
        break;
    }
  }

  const orderBy =
    sortBy === "size_desc"
      ? desc(agsVaultAttachments.sizeBytes)
      : desc(agsVaultAttachments.createdAt);

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
    .where(and(...filters))
    .orderBy(orderBy)
    .limit(limit)
    .offset(offset);

  return annotateMimeClass(rows as ReadonlyArray<AttachmentRow>);
}

// ============================================================================
// Unused detection
// ============================================================================

export interface FindUnusedAttachmentsInput {
  readonly vaultId: number;
  readonly limit?: number;
}

/**
 * Return attachments in the given vault that are not bound to any
 * active note. "Active" = note exists and is not trashed
 * (`deletedAt IS NULL`).
 *
 * Definition of "unused":
 *   1. `noteId IS NULL` (never bound), OR
 *   2. `noteId` points to a row whose `deletedAt IS NOT NULL` (trashed).
 *
 * Implemented with a LEFT JOIN to keep the query index-eligible.
 */
export async function findUnusedAttachments(
  input: FindUnusedAttachmentsInput,
  options: AttachmentServiceOptions = {},
): Promise<AttachmentLibraryRow[]> {
  const getDb = options.getDb ?? getAsDb;
  const db = getDb();
  if (!db) return [];

  const limit = Math.min(
    Math.max(1, input.limit ?? DEFAULT_BROWSE_LIMIT),
    MAX_BROWSE_LIMIT,
  );

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
    .leftJoin(
      agsVaultNotes,
      eq(agsVaultAttachments.noteId, agsVaultNotes.id),
    )
    .where(
      and(
        eq(agsVaultAttachments.vaultId, input.vaultId),
        // unused = (noteId IS NULL) OR (joined note's deletedAt IS NOT NULL)
        sql`(${isNull(agsVaultAttachments.noteId)} or ${isNotNull(agsVaultNotes.deletedAt)})`,
      ),
    )
    .orderBy(desc(agsVaultAttachments.createdAt))
    .limit(limit);

  return annotateMimeClass(rows as ReadonlyArray<AttachmentRow>);
}

// ============================================================================
// Quota
// ============================================================================

export interface AttachmentQuotaResult {
  readonly vaultId: number;
  readonly bytesUsed: number;
  readonly bytesLimit: number | null;
  /** 0..1 utilization. `null` if no limit is set. */
  readonly utilization: number | null;
  readonly attachmentCount: number;
  /** True when bytesLimit is set and bytesUsed exceeds it. */
  readonly overQuota: boolean;
}

export interface ComputeAttachmentQuotaOptions extends AttachmentServiceOptions {
  /** Per-vault bytes cap. `null` = unlimited (default). Operators
   *  set this via a workspace setting or env. */
  readonly bytesLimit?: number | null;
}

/**
 * Compute the storage footprint of a vault's attachments. Returns
 * `bytesUsed`, `attachmentCount`, and (if a limit is provided) the
 * fraction utilized + an over-quota flag.
 */
export async function computeAttachmentQuota(
  vaultId: number,
  options: ComputeAttachmentQuotaOptions = {},
): Promise<AttachmentQuotaResult> {
  const getDb = options.getDb ?? getAsDb;
  const db = getDb();
  const bytesLimit = options.bytesLimit ?? null;
  if (!db) {
    return {
      vaultId,
      bytesUsed: 0,
      bytesLimit,
      utilization: bytesLimit !== null ? 0 : null,
      attachmentCount: 0,
      overQuota: false,
    };
  }

  const rows = await db
    .select({
      bytesUsed: sum(agsVaultAttachments.sizeBytes).mapWith(Number),
      attachmentCount: count(agsVaultAttachments.id).mapWith(Number),
    })
    .from(agsVaultAttachments)
    .where(eq(agsVaultAttachments.vaultId, vaultId));

  const bytesUsed = Number(rows[0]?.bytesUsed ?? 0);
  const attachmentCount = Number(rows[0]?.attachmentCount ?? 0);
  const utilization =
    bytesLimit !== null && bytesLimit > 0
      ? bytesUsed / bytesLimit
      : bytesLimit === 0
        ? 1
        : null;
  const overQuota = bytesLimit !== null && bytesUsed > bytesLimit;

  return {
    vaultId,
    bytesUsed,
    bytesLimit,
    utilization,
    attachmentCount,
    overQuota,
  };
}
