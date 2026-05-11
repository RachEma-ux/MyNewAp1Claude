/**
 * Graph Agent Lite — runtime trace export to vault note.
 *
 * Phase 14 §5. Persists the Markdown blob produced by
 * `exportDecisionTraceAsMarkdown()` as a vault note row in
 * `ags_vault_notes` + `ags_vault_note_versions`. Closes the
 * "Runtime trace can export to note" Phase 14 acceptance criterion.
 *
 * The slug is keyed on `runtimeRunId` so the same trace exports to
 * the same note across calls — re-export without `overwrite: true`
 * throws `TraceNoteAlreadyExistsError`. With `overwrite: true` the
 * existing note picks up a new version (vN+1) and its
 * `currentVersionId` flips to the new version. This matches the
 * vault-repo update semantics in `services/vault/repository-asdb.ts`
 * without re-using its optimistic-lock conflict path (the caller is
 * the runtime, not a human editor — there is no "expected version"
 * for it to carry).
 *
 * Frontmatter stamped on every version row:
 *   - runtimeRunId
 *   - graphAgentRunId
 *   - redacted (boolean — whether the markdown was scrubbed)
 *   - exportedAt (ISO string)
 *
 * Downstream consumers (Phase 14 §6/§7 "Trace note links to Neo4j
 * graph path") can pull these out of `agsVaultNoteVersions.frontmatter`
 * to follow the trace → graph link without re-parsing the markdown.
 *
 * ADR: docs/architecture/agent-studio-graph-agent-runtime.md §1.5
 */

import { and, desc, eq } from "drizzle-orm";
import { getAsDb } from "../../db/connection.js";
import {
  agsVaultNotes,
  agsVaultNoteVersions,
} from "../../../../drizzle/tables/agent-studio-vault.js";
import { computeContentHash } from "../vault/repository.js";
import {
  exportDecisionTraceAsMarkdown,
  type DecisionTraceMarkdown,
} from "./trace-export.js";

export class AsdbUnavailableError extends Error {
  constructor() {
    super("ASDB connection unavailable");
    this.name = "AsdbUnavailableError";
  }
}

export class TraceNoteAlreadyExistsError extends Error {
  constructor(
    public readonly vaultId: number,
    public readonly slug: string,
    public readonly noteId: number,
  ) {
    super(
      `Trace note for slug="${slug}" already exists in vault ${vaultId} (noteId=${noteId}); pass overwrite=true to append a new version`,
    );
    this.name = "TraceNoteAlreadyExistsError";
  }
}

export interface ExportTraceToNoteInput {
  readonly runtimeRunId: number;
  readonly vaultId: number;
  readonly createdByUserId: number;
  readonly folderId?: number;
  /** Title prefix; defaults to "Graph Agent Run". Mirrors `exportDecisionTraceAsMarkdown`. */
  readonly title?: string;
  /** Whether to apply sensitive-payload redaction (default true — matches §4). */
  readonly redact?: boolean;
  /** If true, append a new version to the existing trace note instead of throwing. */
  readonly overwrite?: boolean;
}

export interface ExportTraceToNoteResult {
  readonly noteId: number;
  readonly versionId: number;
  readonly version: number;
  readonly slug: string;
  readonly runtimeRunId: number;
  readonly graphAgentRunId: number;
  readonly created: boolean;
}

export interface ExportTraceToNoteOptions {
  readonly getDb?: typeof getAsDb;
  readonly exporter?: (
    runtimeRunId: number,
    options: { title?: string; redact?: boolean },
  ) => Promise<DecisionTraceMarkdown | null>;
}

function buildSlug(runtimeRunId: number): string {
  return `graph-agent-trace-${runtimeRunId}`;
}

function buildTitle(prefix: string | undefined, runtimeRunId: number): string {
  return `${prefix ?? "Graph Agent Run"} #${runtimeRunId}`;
}

export async function exportTraceToNote(
  input: ExportTraceToNoteInput,
  options: ExportTraceToNoteOptions = {},
): Promise<ExportTraceToNoteResult | null> {
  const getDb = options.getDb ?? getAsDb;
  const exporter = options.exporter ?? exportDecisionTraceAsMarkdown;

  const db = getDb();
  if (!db) throw new AsdbUnavailableError();

  const redact = input.redact !== false;
  const exported = await exporter(input.runtimeRunId, {
    title: input.title,
    redact,
  });
  if (!exported) return null;

  const slug = buildSlug(input.runtimeRunId);
  const title = buildTitle(input.title, input.runtimeRunId);
  const contentHash = computeContentHash(exported.markdown);
  const frontmatter = {
    runtimeRunId: exported.runtimeRunId,
    graphAgentRunId: exported.graphAgentRunId,
    redacted: redact,
    exportedAt: new Date().toISOString(),
  };

  const existing = await db
    .select({
      id: agsVaultNotes.id,
    })
    .from(agsVaultNotes)
    .where(
      and(
        eq(agsVaultNotes.vaultId, input.vaultId),
        eq(agsVaultNotes.slug, slug),
      ),
    )
    .limit(1);

  if (existing.length > 0) {
    const noteId = existing[0].id;
    if (!input.overwrite) {
      throw new TraceNoteAlreadyExistsError(input.vaultId, slug, noteId);
    }

    const latest = await db
      .select({ version: agsVaultNoteVersions.version })
      .from(agsVaultNoteVersions)
      .where(eq(agsVaultNoteVersions.noteId, noteId))
      .orderBy(desc(agsVaultNoteVersions.version))
      .limit(1);
    const nextVersion = (latest[0]?.version ?? 0) + 1;

    const inserted = await db
      .insert(agsVaultNoteVersions)
      .values({
        noteId,
        version: nextVersion,
        contentMd: exported.markdown,
        contentHash,
        frontmatter,
        authorUserId: input.createdByUserId,
        commitMessage: `Re-exported decision trace for runtimeRunId=${input.runtimeRunId}`,
      })
      .returning({ id: agsVaultNoteVersions.id });

    const versionId = inserted[0]?.id;
    if (!versionId) throw new Error("Failed to insert vault note version row");

    await db
      .update(agsVaultNotes)
      .set({ currentVersionId: versionId, updatedAt: new Date() })
      .where(eq(agsVaultNotes.id, noteId));

    return {
      noteId,
      versionId,
      version: nextVersion,
      slug,
      runtimeRunId: exported.runtimeRunId,
      graphAgentRunId: exported.graphAgentRunId,
      created: false,
    };
  }

  const insertedNote = await db
    .insert(agsVaultNotes)
    .values({
      vaultId: input.vaultId,
      folderId: input.folderId ?? null,
      slug,
      title,
      createdByUserId: input.createdByUserId,
      governanceStatus: "active",
    })
    .returning({ id: agsVaultNotes.id });
  const noteId = insertedNote[0]?.id;
  if (!noteId) throw new Error("Failed to insert vault note row");

  const insertedVersion = await db
    .insert(agsVaultNoteVersions)
    .values({
      noteId,
      version: 1,
      contentMd: exported.markdown,
      contentHash,
      frontmatter,
      authorUserId: input.createdByUserId,
      commitMessage: `Initial export of decision trace for runtimeRunId=${input.runtimeRunId}`,
    })
    .returning({ id: agsVaultNoteVersions.id });
  const versionId = insertedVersion[0]?.id;
  if (!versionId) throw new Error("Failed to insert vault note version row");

  await db
    .update(agsVaultNotes)
    .set({ currentVersionId: versionId })
    .where(eq(agsVaultNotes.id, noteId));

  return {
    noteId,
    versionId,
    version: 1,
    slug,
    runtimeRunId: exported.runtimeRunId,
    graphAgentRunId: exported.graphAgentRunId,
    created: true,
  };
}
