/**
 * AI Agent Studio — Skill Importer
 *
 * Phase 13d: Import user-supplied .md skill files into the catalog.
 *
 * The user picks one or more .md files via a file explorer in the UI.
 * The client reads them with FileReader and POSTs an array of
 * { fileName, content } pairs to importFromMarkdown(). For each:
 *   1. Parse YAML frontmatter using the same parser as the Phase 0c
 *      skill-catalog-adapter (ensures compat with vendored .md files)
 *   2. Build a CatalogSkillInput with source="imported"
 *   3. Run the same validation Phase 13b's catalog-skills.ts uses
 *   4. On success, insert into agsCatalogSkills
 *   5. Collect per-file results into a structured response
 *
 * Cross-validation against the merged tool registry happens
 * automatically because we delegate to catalogSkillsService.create.
 *
 * Conflict handling (Decision #8):
 *   - If a skill with the same (packKey, skillKey) already exists,
 *     the import is rejected with a clear error
 *   - The client passes `overwrite=true` to opt into replacement
 *   - When overwriting, the existing row is updated rather than
 *     deleted+recreated (preserves the row id and createdAt)
 *
 * Pack handling:
 *   - Caller can specify `packKey` to override the default
 *   - If a skill's frontmatter has a `pack` field, we use that
 *   - Otherwise default to "imported"
 *
 * Naming derivation:
 *   - skillKey: from frontmatter `name` field (lowercased, dashed)
 *     OR derived from the filename minus .md extension
 *   - name: humanized from skillKey (kebab → Title Case)
 */

import { createCatalogSkill, updateCatalogSkill } from "./catalog-skills";
import * as repo from "../repository";

// ── Public types ────────────────────────────────────────────────────────────

export interface ImportFileInput {
  fileName: string;
  content: string;
}

export interface ImportRequest {
  files: ImportFileInput[];
  /** Override pack for all imported files (defaults to frontmatter.pack or "imported") */
  packKey?: string;
  /** Replace existing skills with the same (packKey, skillKey) */
  overwrite?: boolean;
  createdBy?: number | null;
}

export interface ImportFileResult {
  fileName: string;
  ok: boolean;
  skillId?: number;
  packKey?: string;
  skillKey?: string;
  errors?: string[];
  warnings?: string[];
}

export interface ImportResult {
  results: ImportFileResult[];
  summary: {
    imported: number;
    failed: number;
    overwritten: number;
  };
}

// ── Frontmatter parser (mirrors Phase 0c skill-catalog-adapter) ─────────────

interface ParsedFrontmatter {
  name?: string;
  description?: string;
  context?: string;
  agent?: string;
  model?: string;
  pack?: string;
  effort?: string;
  allowedTools: string[];
  argNames: string[];
}

interface ParsedFile {
  frontmatter: ParsedFrontmatter;
  body: string;
}

/**
 * Same minimal YAML parser as skill-catalog-adapter.ts but extended to
 * handle the `pack`, `model`, `effort`, and `argNames` fields too.
 * Returns the parsed frontmatter + the markdown body below the second
 * --- separator.
 */
function parseMarkdownFile(raw: string): ParsedFile {
  const fm: ParsedFrontmatter = { allowedTools: [], argNames: [] };
  let body = raw;

  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) {
    return { frontmatter: fm, body: raw };
  }
  const yamlBlock = m[1];
  body = m[2] ?? "";

  const lines = yamlBlock.split(/\r?\n/);
  let currentList: "allowedTools" | "argNames" | null = null;
  for (const line of lines) {
    if (currentList) {
      const item = line.match(/^\s*-\s+(.+)\s*$/);
      if (item) {
        const value = item[1].trim().replace(/^["']|["']$/g, "");
        if (currentList === "allowedTools") fm.allowedTools.push(value);
        else if (currentList === "argNames") fm.argNames.push(value);
        continue;
      }
      currentList = null;
    }
    if (/^allowedTools:\s*$/.test(line)) {
      currentList = "allowedTools";
      continue;
    }
    if (/^argNames:\s*$/.test(line)) {
      currentList = "argNames";
      continue;
    }
    const kv = line.match(/^([a-zA-Z_]+):\s*(.+)\s*$/);
    if (!kv) continue;
    const key = kv[1];
    const value = kv[2].trim().replace(/^["']|["']$/g, "");
    if (key === "name") fm.name = value;
    else if (key === "description") fm.description = value;
    else if (key === "context") fm.context = value;
    else if (key === "agent") fm.agent = value;
    else if (key === "model") fm.model = value;
    else if (key === "pack") fm.pack = value;
    else if (key === "effort") fm.effort = value;
  }
  return { frontmatter: fm, body };
}

// ── Helpers ────────────────────────────────────────────────────────────────

const KEY_PATTERN_INVALID = /[^a-z0-9_-]/g;

/**
 * Normalize a string into a valid skillKey: lowercase, kebab/snake-only.
 * "My Skill!" → "my-skill"
 * "FileName.md" → "filename"
 */
function normalizeSkillKey(input: string): string {
  return input
    .toLowerCase()
    .replace(/\.md$/, "")
    .replace(/\s+/g, "-")
    .replace(KEY_PATTERN_INVALID, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Humanize a kebab/snake key for the display name. */
function humanizeKey(key: string): string {
  return key
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── Public API ──────────────────────────────────────────────────────────────

export async function importFromMarkdown(
  request: ImportRequest
): Promise<ImportResult> {
  const results: ImportFileResult[] = [];
  let imported = 0;
  let failed = 0;
  let overwritten = 0;

  for (const file of request.files) {
    const fileName = file.fileName;
    try {
      // Parse the file
      const parsed = parseMarkdownFile(file.content);
      const fm = parsed.frontmatter;

      // Determine packKey + skillKey
      const packKey =
        request.packKey ?? fm.pack ?? "imported";
      const rawKey = fm.name ?? fileName;
      const skillKey = normalizeSkillKey(rawKey);
      if (!skillKey) {
        results.push({
          fileName,
          ok: false,
          errors: [
            `cannot derive a valid skillKey from name="${fm.name ?? ""}" or filename="${fileName}"`,
          ],
        });
        failed++;
        continue;
      }
      const name = fm.name
        ? humanizeKey(skillKey)
        : humanizeKey(skillKey);

      // Build the input
      const input = {
        packKey,
        skillKey,
        name,
        description: fm.description ?? null,
        context: (fm.context ?? "inline") as "inline" | "fork",
        agent: fm.agent ?? null,
        model: (fm.model ?? null) as "sonnet" | "opus" | "haiku" | null,
        allowedTools: fm.allowedTools,
        argNames: fm.argNames,
        effort: (fm.effort ?? null) as "low" | "medium" | "high" | null,
        body: parsed.body.trim(),
        source: "imported" as const,
        sourcePath: fileName,
        createdBy: request.createdBy ?? null,
      };

      // Check for an existing row
      const existing = await repo.getCatalogSkillByKey(packKey, skillKey);
      if (existing && !request.overwrite) {
        results.push({
          fileName,
          ok: false,
          packKey,
          skillKey,
          errors: [
            `skill "${packKey}/${skillKey}" already exists (id ${existing.id}). Pass overwrite=true to replace.`,
          ],
        });
        failed++;
        continue;
      }

      if (existing && request.overwrite) {
        // Update in place — preserves id and createdAt
        const updated = await updateCatalogSkill(existing.id, input);
        if (!updated) {
          throw new Error(`update returned null for id ${existing.id}`);
        }
        results.push({
          fileName,
          ok: true,
          skillId: updated.id,
          packKey,
          skillKey,
        });
        overwritten++;
      } else {
        // Insert new
        const created = await createCatalogSkill(input);
        results.push({
          fileName,
          ok: true,
          skillId: created.id,
          packKey,
          skillKey,
        });
        imported++;
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      results.push({
        fileName,
        ok: false,
        errors: [message],
      });
      failed++;
    }
  }

  return {
    results,
    summary: {
      imported,
      failed,
      overwritten,
    },
  };
}
