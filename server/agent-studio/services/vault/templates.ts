/**
 * Vault Templates — Phase 15 §1 + §2.
 *
 * Wires the dormant `ags_vault_templates` table. Operators (and
 * Agent Studio modules that ship blessed templates) can:
 *
 *   - register templates keyed on `templateKey` — vault-scoped when
 *     `vaultId` is set, global otherwise
 *   - list templates available to a vault (vault-scoped first, then
 *     global, deduped by templateKey)
 *   - instantiate a template into a vault note in one shot, with
 *     `{{var}}` placeholders substituted from caller-supplied values
 *
 * Closes the Phase 15 "Basic templates work" + "Template variables
 * resolve" acceptance criteria. Other Phase 15 template criteria
 * (Graph Skill Pack Template, runtime-investigation template, etc.)
 * are template *kinds* — once basic templates land, those become
 * pre-seeded rows in this same table.
 *
 * Idempotency:
 *   - `createTemplate` is keyed on `(vaultId, templateKey)`; the
 *     existing row is returned when one already exists rather than
 *     throwing. Matches the seed-pipeline upsert pattern used by
 *     the Graph Skill packs (§10 pack-mutations).
 *
 * Variable substitution:
 *   - `{{name}}` placeholders match `[A-Za-z_][A-Za-z0-9_]*`.
 *   - Unknown variables pass through literally so a partial render
 *     is recoverable (the operator sees what wasn't supplied).
 *   - Frontmatter defaults are deep-cloned then shallow-merged with
 *     caller overrides — caller wins per key.
 *
 * ADR: docs/architecture/agent-studio-markdown-profile.md
 */

import { and, asc, eq, isNull, or } from "drizzle-orm";
import { getAsDb } from "../../db/connection.js";
import { agsVaultTemplates } from "../../../../drizzle/tables/agent-studio-vault.js";

export class AsdbUnavailableError extends Error {
  constructor() {
    super("ASDB connection unavailable");
    this.name = "AsdbUnavailableError";
  }
}

export class TemplateNotFoundError extends Error {
  constructor(public readonly templateId: number) {
    super(`Vault template with id=${templateId} not found`);
    this.name = "TemplateNotFoundError";
  }
}

export interface CreateTemplateInput {
  readonly vaultId?: number | null;
  readonly templateKey: string;
  readonly name: string;
  readonly contentMd: string;
  readonly frontmatterDefaults?: Record<string, unknown> | null;
}

export interface VaultTemplateRow {
  readonly id: number;
  readonly vaultId: number | null;
  readonly templateKey: string;
  readonly name: string;
  readonly contentMd: string;
  readonly frontmatterDefaults: Record<string, unknown> | null;
  readonly createdAt: Date;
  readonly created: boolean;
}

export interface ListTemplatesInput {
  readonly vaultId?: number | null;
}

export interface VaultTemplateListing {
  readonly id: number;
  readonly vaultId: number | null;
  readonly templateKey: string;
  readonly name: string;
  readonly scope: "vault" | "global";
}

export interface RenderTemplateInput {
  readonly contentMd: string;
  readonly frontmatterDefaults?: Record<string, unknown> | null;
  readonly variables?: Record<string, string | number | boolean | null | undefined>;
  /**
   * Frontmatter overrides (merged on top of `frontmatterDefaults`).
   * Caller wins per key. Use this for per-instantiation values like
   * createdBy or runId.
   */
  readonly frontmatterOverrides?: Record<string, unknown>;
}

export interface RenderedTemplate {
  readonly contentMd: string;
  readonly frontmatter: Record<string, unknown>;
}

export interface TemplateServiceOptions {
  readonly getDb?: typeof getAsDb;
}

const VARIABLE_PATTERN = /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g;

export function renderTemplate(input: RenderTemplateInput): RenderedTemplate {
  const variables = input.variables ?? {};
  const contentMd = input.contentMd.replace(VARIABLE_PATTERN, (match, key) => {
    if (Object.prototype.hasOwnProperty.call(variables, key)) {
      const v = variables[key];
      if (v === null || v === undefined) return match;
      return String(v);
    }
    // Unknown variable — pass through verbatim so the operator sees
    // what wasn't supplied. Silently empty-stringing is worse: the
    // resulting note looks correct but is missing data.
    return match;
  });

  const frontmatter: Record<string, unknown> = {
    ...(input.frontmatterDefaults ?? {}),
    ...(input.frontmatterOverrides ?? {}),
  };

  return { contentMd, frontmatter };
}

export async function createTemplate(
  input: CreateTemplateInput,
  options: TemplateServiceOptions = {},
): Promise<VaultTemplateRow> {
  const getDb = options.getDb ?? getAsDb;
  const db = getDb();
  if (!db) throw new AsdbUnavailableError();

  const vaultId = input.vaultId ?? null;

  const existing = await db
    .select({
      id: agsVaultTemplates.id,
      vaultId: agsVaultTemplates.vaultId,
      templateKey: agsVaultTemplates.templateKey,
      name: agsVaultTemplates.name,
      contentMd: agsVaultTemplates.contentMd,
      frontmatterDefaults: agsVaultTemplates.frontmatterDefaults,
      createdAt: agsVaultTemplates.createdAt,
    })
    .from(agsVaultTemplates)
    .where(
      and(
        eq(agsVaultTemplates.templateKey, input.templateKey),
        vaultId === null
          ? isNull(agsVaultTemplates.vaultId)
          : eq(agsVaultTemplates.vaultId, vaultId),
      ),
    )
    .limit(1);

  if (existing.length > 0) {
    const r = existing[0];
    return {
      id: r.id,
      vaultId: r.vaultId,
      templateKey: r.templateKey,
      name: r.name,
      contentMd: r.contentMd,
      frontmatterDefaults: r.frontmatterDefaults ?? null,
      createdAt: r.createdAt as Date,
      created: false,
    };
  }

  const inserted = await db
    .insert(agsVaultTemplates)
    .values({
      vaultId,
      templateKey: input.templateKey,
      name: input.name,
      contentMd: input.contentMd,
      frontmatterDefaults: input.frontmatterDefaults ?? null,
    })
    .returning({
      id: agsVaultTemplates.id,
      vaultId: agsVaultTemplates.vaultId,
      templateKey: agsVaultTemplates.templateKey,
      name: agsVaultTemplates.name,
      contentMd: agsVaultTemplates.contentMd,
      frontmatterDefaults: agsVaultTemplates.frontmatterDefaults,
      createdAt: agsVaultTemplates.createdAt,
    });

  const row = inserted[0];
  if (!row) throw new Error("Failed to insert vault template row");
  return {
    id: row.id,
    vaultId: row.vaultId,
    templateKey: row.templateKey,
    name: row.name,
    contentMd: row.contentMd,
    frontmatterDefaults: row.frontmatterDefaults ?? null,
    createdAt: row.createdAt as Date,
    created: true,
  };
}

export async function listTemplates(
  input: ListTemplatesInput,
  options: TemplateServiceOptions = {},
): Promise<VaultTemplateListing[]> {
  const getDb = options.getDb ?? getAsDb;
  const db = getDb();
  if (!db) return [];

  const vaultId = input.vaultId ?? null;

  const rows = await db
    .select({
      id: agsVaultTemplates.id,
      vaultId: agsVaultTemplates.vaultId,
      templateKey: agsVaultTemplates.templateKey,
      name: agsVaultTemplates.name,
    })
    .from(agsVaultTemplates)
    .where(
      vaultId === null
        ? isNull(agsVaultTemplates.vaultId)
        : or(
            eq(agsVaultTemplates.vaultId, vaultId),
            isNull(agsVaultTemplates.vaultId),
          ),
    )
    .orderBy(asc(agsVaultTemplates.templateKey));

  // Dedupe on templateKey, preferring vault-scoped (vaultId !== null)
  // over global (vaultId === null). The DB returns both; we collapse
  // here so callers see a single "effective" template per key.
  const byKey = new Map<string, VaultTemplateListing>();
  for (const r of rows) {
    const scope: "vault" | "global" = r.vaultId === null ? "global" : "vault";
    const existing = byKey.get(r.templateKey);
    if (!existing || (scope === "vault" && existing.scope === "global")) {
      byKey.set(r.templateKey, {
        id: r.id,
        vaultId: r.vaultId,
        templateKey: r.templateKey,
        name: r.name,
        scope,
      });
    }
  }
  return Array.from(byKey.values());
}

export async function getTemplateById(
  templateId: number,
  options: TemplateServiceOptions = {},
): Promise<VaultTemplateRow | null> {
  const getDb = options.getDb ?? getAsDb;
  const db = getDb();
  if (!db) return null;

  const rows = await db
    .select({
      id: agsVaultTemplates.id,
      vaultId: agsVaultTemplates.vaultId,
      templateKey: agsVaultTemplates.templateKey,
      name: agsVaultTemplates.name,
      contentMd: agsVaultTemplates.contentMd,
      frontmatterDefaults: agsVaultTemplates.frontmatterDefaults,
      createdAt: agsVaultTemplates.createdAt,
    })
    .from(agsVaultTemplates)
    .where(eq(agsVaultTemplates.id, templateId))
    .limit(1);

  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    id: r.id,
    vaultId: r.vaultId,
    templateKey: r.templateKey,
    name: r.name,
    contentMd: r.contentMd,
    frontmatterDefaults: r.frontmatterDefaults ?? null,
    createdAt: r.createdAt as Date,
    created: false,
  };
}
