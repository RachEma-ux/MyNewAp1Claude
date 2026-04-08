/**
 * AI Agent Studio — Catalog Skills Service
 *
 * Phase 13b: User-authored skills CRUD with strict validation. Builds
 * on Phase 0c's vendored skill catalog (read-only .md files) by adding
 * a DB-backed authoring layer.
 *
 * Key design decision (stricter than upstream openclaude): tool names
 * in `allowedTools` are cross-validated against the live merged tool
 * registry at save time. Upstream silently accepts typos and they fail
 * at runtime as permission denials (we confirmed this from the deep
 * dive into openclaude/src/tools/SkillTool/SkillTool.ts and the
 * `alwaysAllowRules.command` permission gate). Our catalog UI saves
 * users from this footgun.
 *
 * Merge logic: listMerged() returns vendored .md catalog entries first,
 * then DB rows. Vendored entries are always read-only. DB entries can
 * be edited/deleted by their creator.
 */

import * as repo from "../repository";
import * as skillCatalog from "../adapters/skill-catalog-adapter";
import { getToolCatalogEntry } from "../adapters/tool-catalog-adapter";

// ── Public types ────────────────────────────────────────────────────────────

export interface CatalogSkillInput {
  packKey: string;
  skillKey: string;
  name: string;
  description?: string | null;
  context?: "inline" | "fork" | null;
  agent?: string | null;
  model?: "sonnet" | "opus" | "haiku" | null;
  allowedTools?: string[];
  argNames?: string[];
  effort?: "low" | "medium" | "high" | null;
  body: string;
  version?: string | null;
  source?: "db" | "imported" | "marketplace";
  sourcePath?: string | null;
  createdBy?: number | null;
}

export interface ValidateResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

export interface MergedSkillEntry {
  id?: number;
  packKey: string;
  skillKey: string;
  name: string;
  description: string;
  context?: string | null;
  agent?: string | null;
  model?: string | null;
  allowedTools: string[];
  effort?: string | null;
  body?: string | null;
  source: "vendored" | "db" | "imported" | "marketplace" | "mcp_prompt";
  sourcePath?: string | null;
}

// ── Validation ──────────────────────────────────────────────────────────────

const SKILL_KEY_PATTERN = /^[a-z][a-z0-9_-]*$/;
const PACK_KEY_PATTERN = /^[a-z][a-z0-9_-]*$/;
const VALID_CONTEXTS = new Set(["inline", "fork"]);
const VALID_MODELS = new Set(["sonnet", "opus", "haiku"]);
const VALID_EFFORTS = new Set(["low", "medium", "high"]);

/**
 * Cross-check that every entry in the skill's `allowedTools` list exists
 * in the merged tool registry. Returns the list of unknown tool names.
 *
 * "Merged registry" today = the static 51 from tool-catalog-adapter +
 * any user-created agsCatalogTools rows. Phase 15d will add MCP-discovered
 * tools to this set.
 */
async function findUnknownToolNames(allowedTools: string[]): Promise<string[]> {
  const unknown: string[] = [];
  // Pull all DB-catalog tool keys once for fast lookup
  const dbTools = await repo.listCatalogTools();
  const dbKeys = new Set(dbTools.map((t) => t.key));
  for (const name of allowedTools) {
    if (dbKeys.has(name)) continue;
    const builtin = await getToolCatalogEntry(name);
    if (builtin) continue;
    // MCP-prefixed tool names like "mcp__server__tool" are accepted
    // optimistically — they're discovered at runtime per-draft, so we
    // can't validate them statically here without a draftId.
    if (name.startsWith("mcp__")) continue;
    unknown.push(name);
  }
  return unknown;
}

/**
 * Validate a CatalogSkillInput. Strict — more validation than upstream
 * openclaude does. Returns { ok, errors, warnings }.
 *
 * Errors block save; warnings are surfaced to the user but allow save.
 */
export async function validateCatalogSkill(
  input: CatalogSkillInput
): Promise<ValidateResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!SKILL_KEY_PATTERN.test(input.skillKey)) {
    errors.push(
      `skillKey "${input.skillKey}" must match ^[a-z][a-z0-9_-]*$ (lowercase alpha start, then alnum/_-)`
    );
  }
  if (!PACK_KEY_PATTERN.test(input.packKey)) {
    errors.push(
      `packKey "${input.packKey}" must match ^[a-z][a-z0-9_-]*$`
    );
  }
  if (!input.name || input.name.trim().length === 0) {
    errors.push("name is required");
  }
  if (input.context && !VALID_CONTEXTS.has(input.context)) {
    errors.push(`context "${input.context}" must be "inline" or "fork"`);
  }
  if (input.model && !VALID_MODELS.has(input.model)) {
    errors.push(`model "${input.model}" must be one of sonnet|opus|haiku`);
  }
  if (input.effort && !VALID_EFFORTS.has(input.effort)) {
    errors.push(`effort "${input.effort}" must be one of low|medium|high`);
  }
  if (!input.body || input.body.trim().length === 0) {
    errors.push("body is required (markdown prompt)");
  }
  if (input.body && !input.body.includes("$ARGUMENTS")) {
    warnings.push(
      "body does not contain $ARGUMENTS — most skills accept a user input via this placeholder"
    );
  }

  // Tool name cross-validation — the key improvement over upstream
  if (input.allowedTools && input.allowedTools.length > 0) {
    const unknown = await findUnknownToolNames(input.allowedTools);
    if (unknown.length > 0) {
      errors.push(
        `unknown tool name${unknown.length === 1 ? "" : "s"} in allowedTools: ${unknown.join(", ")}. ` +
          `Tool must exist in the merged registry (built-in 51 + catalog tools + mcp__ names).`
      );
    }
  }

  // Uniqueness — check for existing same packKey + skillKey
  const existing = await repo.getCatalogSkillByKey(
    input.packKey,
    input.skillKey
  );
  if (existing) {
    errors.push(
      `skill "${input.packKey}/${input.skillKey}" already exists (id ${existing.id}) — use update instead of create`
    );
  }

  return { ok: errors.length === 0, errors, warnings };
}

// ── CRUD ────────────────────────────────────────────────────────────────────

/**
 * Insert a new catalog skill. Validates first; throws on errors.
 */
export async function createCatalogSkill(input: CatalogSkillInput) {
  const validation = await validateCatalogSkill(input);
  if (!validation.ok) {
    throw new Error(
      `[catalog-skills] validation failed: ${validation.errors.join("; ")}`
    );
  }
  return repo.createCatalogSkill(input);
}

/**
 * Update an existing catalog skill. Validates the new shape before
 * writing. The packKey/skillKey uniqueness check is bypassed when the
 * existing row IS the same row.
 */
export async function updateCatalogSkill(
  id: number,
  patch: Partial<CatalogSkillInput>
) {
  const existing = await repo.getCatalogSkillById(id);
  if (!existing) throw new Error(`catalog skill ${id} not found`);

  // Build the post-update shape for validation
  const merged: CatalogSkillInput = {
    packKey: patch.packKey ?? existing.packKey,
    skillKey: patch.skillKey ?? existing.skillKey,
    name: patch.name ?? existing.name,
    description: patch.description ?? existing.description,
    context: (patch.context ?? existing.context) as any,
    agent: patch.agent ?? existing.agent,
    model: (patch.model ?? existing.model) as any,
    allowedTools:
      patch.allowedTools ?? ((existing.allowedTools ?? []) as string[]),
    argNames: patch.argNames ?? ((existing.argNames ?? []) as string[]),
    effort: (patch.effort ?? existing.effort) as any,
    body: patch.body ?? existing.body,
    version: patch.version ?? existing.version,
  };

  // Validate without the uniqueness check (we're updating in place)
  const validation = await validateUpdate(id, merged);
  if (!validation.ok) {
    throw new Error(
      `[catalog-skills] validation failed: ${validation.errors.join("; ")}`
    );
  }

  return repo.updateCatalogSkill(id, {
    ...patch,
    updatedAt: new Date(),
  });
}

/**
 * Internal: same checks as validateCatalogSkill but skips the
 * "row already exists" check when the existing row IS this id.
 */
async function validateUpdate(
  id: number,
  input: CatalogSkillInput
): Promise<ValidateResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!SKILL_KEY_PATTERN.test(input.skillKey)) {
    errors.push(
      `skillKey "${input.skillKey}" must match ^[a-z][a-z0-9_-]*$`
    );
  }
  if (!PACK_KEY_PATTERN.test(input.packKey)) {
    errors.push(`packKey "${input.packKey}" must match ^[a-z][a-z0-9_-]*$`);
  }
  if (!input.name || input.name.trim().length === 0) {
    errors.push("name is required");
  }
  if (input.context && !VALID_CONTEXTS.has(input.context)) {
    errors.push(`context "${input.context}" must be "inline" or "fork"`);
  }
  if (input.model && !VALID_MODELS.has(input.model)) {
    errors.push(`model "${input.model}" must be one of sonnet|opus|haiku`);
  }
  if (input.effort && !VALID_EFFORTS.has(input.effort)) {
    errors.push(`effort "${input.effort}" must be one of low|medium|high`);
  }
  if (!input.body || input.body.trim().length === 0) {
    errors.push("body is required (markdown prompt)");
  }
  if (input.body && !input.body.includes("$ARGUMENTS")) {
    warnings.push(
      "body does not contain $ARGUMENTS — most skills accept user input via this placeholder"
    );
  }
  if (input.allowedTools && input.allowedTools.length > 0) {
    const unknown = await findUnknownToolNames(input.allowedTools);
    if (unknown.length > 0) {
      errors.push(
        `unknown tool name${unknown.length === 1 ? "" : "s"} in allowedTools: ${unknown.join(", ")}`
      );
    }
  }

  // Check uniqueness, but allow self
  const existingByKey = await repo.getCatalogSkillByKey(
    input.packKey,
    input.skillKey
  );
  if (existingByKey && existingByKey.id !== id) {
    errors.push(
      `skill "${input.packKey}/${input.skillKey}" already exists at id ${existingByKey.id}`
    );
  }

  return { ok: errors.length === 0, errors, warnings };
}

export async function removeCatalogSkill(id: number) {
  const existing = await repo.getCatalogSkillById(id);
  if (!existing) return { ok: false, error: "not found" };
  // Vendored shadow rows would be marked source="vendored" — we don't
  // create those yet, but if/when we do, this is where the immutability
  // is enforced.
  if (existing.source === "vendored") {
    return {
      ok: false,
      error: "vendored skills are read-only — they're sourced from disk",
    };
  }
  await repo.removeCatalogSkill(id);
  return { ok: true };
}

// ── Merge ──────────────────────────────────────────────────────────────────

/**
 * Return the unified skill catalog: vendored .md skills + DB rows.
 * The vendored entries always come first; DB rows follow. Each entry
 * is tagged with its `source` so the UI can render source-aware
 * affordances (read-only badge for vendored, edit button for db, etc).
 */
export async function listMergedSkills(filter?: {
  packKey?: string;
  source?: string;
  search?: string;
}): Promise<{
  vendored: MergedSkillEntry[];
  db: MergedSkillEntry[];
  all: MergedSkillEntry[];
}> {
  const vendored: MergedSkillEntry[] = [];
  const dbEntries: MergedSkillEntry[] = [];

  // Vendored — read from the existing Phase 0c adapter
  const vendoredCatalog = await skillCatalog.listSkillCatalog();
  if (vendoredCatalog.loaded) {
    for (const v of vendoredCatalog.skills) {
      vendored.push({
        packKey: v.packKey,
        skillKey: v.skillKey,
        name: v.name,
        description: v.description,
        context: v.context ?? null,
        agent: v.agent ?? null,
        allowedTools: v.allowedTools,
        source: "vendored",
        sourcePath: v.filePath,
      });
    }
  }

  // DB
  const dbRows = await repo.listCatalogSkills(filter);
  for (const r of dbRows) {
    dbEntries.push({
      id: r.id,
      packKey: r.packKey,
      skillKey: r.skillKey,
      name: r.name,
      description: r.description ?? "",
      context: r.context,
      agent: r.agent,
      model: r.model,
      allowedTools: (r.allowedTools ?? []) as string[],
      effort: r.effort,
      body: r.body,
      source: r.source as any,
      sourcePath: r.sourcePath,
    });
  }

  // Apply filter to vendored too (the DB filter happens in repo.listCatalogSkills)
  let filteredVendored = vendored;
  if (filter?.packKey) {
    filteredVendored = filteredVendored.filter((v) => v.packKey === filter.packKey);
  }
  if (filter?.source && filter.source !== "vendored") {
    filteredVendored = [];
  }
  if (filter?.search && filter.search.trim()) {
    const needle = filter.search.trim().toLowerCase();
    filteredVendored = filteredVendored.filter(
      (v) =>
        v.skillKey.toLowerCase().includes(needle) ||
        v.name.toLowerCase().includes(needle) ||
        v.description.toLowerCase().includes(needle)
    );
  }

  return {
    vendored: filteredVendored,
    db: dbEntries,
    all: [...filteredVendored, ...dbEntries],
  };
}
