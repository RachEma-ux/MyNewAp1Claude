/**
 * Bases Filter Language — V1 typed schema + parser.
 *
 * Per ADR `docs/architecture/agent-studio-bases-filter-language.md`
 * (T-F.99 / T-F.2-filter-α): bases' `filters` JSON column is
 * validated against a versioned declarative DSL before persistence
 * and parsed back into a typed `FilterDocument` before application.
 *
 * V1 schema covers the practical first-cut filter surface for
 * vault notes:
 *   - folderId       eq        number
 *   - slug           eq        string
 *   - title          contains  string
 *   - governanceStatus  in     string[]
 *   - updatedAt      gte/lte   ISO-8601 timestamp string
 *
 * All conditions are AND-joined implicitly. V2 will introduce
 * OR-groups + NOT via a `version: 2` schema variant; the parser
 * dispatches by `version` literal so V1 callers stay decoupled.
 *
 * Backwards-compat: the parser ALSO admits the legacy pre-ADR
 * `{ folderId: number }` shape (shipped pre-T-F.99 in T-F.98 ζ
 * preview) and projects it into the typed shape transparently.
 * Operators editing existing bases through the UI save the typed
 * shape on first edit — no migration required.
 *
 * No runtime dependencies beyond Zod so the module can be imported
 * from both server (CRUD validation) and client (UI editor) without
 * pulling DB or tRPC deps.
 */

import { z } from "zod";

/**
 * V1 condition variants. The discriminator is `field` — every
 * variant pairs a field with a small set of operators valid for
 * that field's type. Adding a new field is one new union variant.
 */
const FolderIdEqSchema = z.object({
  field: z.literal("folderId"),
  op: z.literal("eq"),
  value: z.number().int().positive(),
});

const SlugEqSchema = z.object({
  field: z.literal("slug"),
  op: z.literal("eq"),
  value: z.string().min(1).max(255),
});

const TitleContainsSchema = z.object({
  field: z.literal("title"),
  op: z.literal("contains"),
  value: z.string().min(1).max(255),
});

const GovernanceStatusInSchema = z.object({
  field: z.literal("governanceStatus"),
  op: z.literal("in"),
  value: z.array(z.string().min(1).max(64)).min(1).max(16),
});

const UpdatedAtTimeBoundSchema = z.object({
  field: z.literal("updatedAt"),
  op: z.union([z.literal("gte"), z.literal("lte")]),
  // ISO-8601 string. Zod's `.datetime()` enforces the format
  // without parsing into a Date (the consumer reads the string).
  value: z.string().datetime(),
});

export const FilterConditionSchema = z.discriminatedUnion("field", [
  FolderIdEqSchema,
  SlugEqSchema,
  TitleContainsSchema,
  GovernanceStatusInSchema,
  UpdatedAtTimeBoundSchema,
]);
export type FilterCondition = z.infer<typeof FilterConditionSchema>;

export const FilterDocumentSchema = z.object({
  version: z.literal(1),
  conditions: z.array(FilterConditionSchema).max(32),
});
export type FilterDocument = z.infer<typeof FilterDocumentSchema>;

/**
 * Legacy pre-ADR shape `{ folderId: number }` (shipped in T-F.98
 * ζ preview before the filter language was formalized). Project it
 * into the typed shape transparently so existing bases work without
 * migration. Anything else falls through to `null`.
 */
const LegacyFolderIdShapeSchema = z.object({
  folderId: z.number().int().positive(),
});

/**
 * Parse an opaque JSON value into a typed `FilterDocument`.
 *
 * Returns `null` for inputs that don't match either the V1 schema
 * or the legacy `{ folderId }` shape. Consumers (server-side query
 * builder, UI preview) treat `null` as "no narrowing applied".
 *
 * The parser is intentionally lenient (returns `null` rather than
 * throwing) because the database column is `json` and we cannot
 * trust historical writes to match either shape. Callers that need
 * stricter behavior should use `FilterDocumentSchema.safeParse`
 * directly and inspect `.error`.
 */
export function parseFilterDocument(
  input: unknown,
): FilterDocument | null {
  // Try V1 typed shape first.
  const v1 = FilterDocumentSchema.safeParse(input);
  if (v1.success) return v1.data;

  // Fall back to legacy `{ folderId: N }` shape.
  const legacy = LegacyFolderIdShapeSchema.safeParse(input);
  if (legacy.success) {
    return {
      version: 1,
      conditions: [
        {
          field: "folderId",
          op: "eq",
          value: legacy.data.folderId,
        },
      ],
    };
  }

  return null;
}

/**
 * Convenience helper: extract just the folder-id constraint from a
 * parsed filter document, if any. Used by the ζ-preview path
 * (T-F.98) to keep its existing `vault.listNotes` integration
 * working unchanged while the rest of the filter language is wired
 * server-side in follow-up slices.
 *
 * Returns `null` when no `folderId eq N` condition is present.
 */
export function extractFolderIdConstraint(
  doc: FilterDocument | null,
): number | null {
  if (doc === null) return null;
  for (const c of doc.conditions) {
    if (c.field === "folderId" && c.op === "eq") {
      return c.value;
    }
  }
  return null;
}

/**
 * T-F.100 (filter-β): pure-function predicate applying a parsed
 * `FilterDocument` to an in-memory note record. All conditions are
 * AND-joined; an empty `conditions` list matches everything.
 *
 * The note shape is intentionally narrow — only the fields that V1
 * conditions reference. Callers (ζ preview's client-side narrower,
 * future server-side query builder) pass whatever row type they
 * have; TypeScript's structural typing accepts any superset.
 *
 * `null` filter document = match-all (preserves "no narrowing
 * applied" semantics from `parseFilterDocument`).
 */
export interface FilterableNote {
  readonly slug: string;
  readonly title: string;
  readonly governanceStatus: string;
  readonly updatedAt: string | Date;
  /**
   * Notes may or may not carry an explicit `folderId` field. The
   * predicate treats `undefined` as "not in any folder" — a
   * `folderId eq N` condition will not match.
   */
  readonly folderId?: number | null;
}

function matchesCondition(
  note: FilterableNote,
  condition: FilterCondition,
): boolean {
  switch (condition.field) {
    case "folderId":
      // `folderId eq N` matches only when the note explicitly has
      // that folderId. `null` / `undefined` does not match.
      return note.folderId === condition.value;
    case "slug":
      return note.slug === condition.value;
    case "title":
      // Case-insensitive substring match. Operators expect "draft"
      // to find "Draft notes" — case-sensitive would surprise.
      return note.title
        .toLowerCase()
        .includes(condition.value.toLowerCase());
    case "governanceStatus":
      return condition.value.includes(note.governanceStatus);
    case "updatedAt": {
      const noteMs =
        typeof note.updatedAt === "string"
          ? Date.parse(note.updatedAt)
          : note.updatedAt.getTime();
      const boundMs = Date.parse(condition.value);
      if (Number.isNaN(noteMs) || Number.isNaN(boundMs)) {
        // Defensively reject malformed timestamps — never match
        // on a comparison we can't evaluate.
        return false;
      }
      return condition.op === "gte" ? noteMs >= boundMs : noteMs <= boundMs;
    }
  }
}

export function applyFilterDocument<T extends FilterableNote>(
  notes: ReadonlyArray<T>,
  doc: FilterDocument | null,
): T[] {
  if (doc === null || doc.conditions.length === 0) {
    return notes.slice();
  }
  return notes.filter((n) =>
    doc.conditions.every((c) => matchesCondition(n, c)),
  );
}
