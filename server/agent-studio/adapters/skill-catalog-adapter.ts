/**
 * AI Agent Studio — Local Skill Catalog Adapter
 *
 * Reads vendored skill .md files from `server/agent-studio/skills/` at boot.
 * Parses YAML frontmatter for each skill and returns a structured catalog
 * of packs + skills.
 *
 * Local-first: zero network calls. To update, run the manual sync script
 * (sync-openllm-skills.ts) which copies the latest from
 * `RachEma-ux/openllm-skills` (or `~/openllm-skills`) into the vendored
 * directory and writes the index.
 *
 * Format expected for each skill `.md` file:
 *   ---
 *   name: <skill-key>
 *   description: <one-line summary>
 *   context: fork | inherit | new
 *   agent: <subagent-name>
 *   allowedTools:
 *     - Read
 *     - Grep
 *   ---
 *   <markdown body — the prompt template>
 */

import { readFileSync, readdirSync, existsSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";

// ── Types ───────────────────────────────────────────────────────────────────

export interface SkillPackEntry {
  key: string;
  name: string;
  description: string;
  skillCount: number;
}

export interface SkillCatalogEntry {
  packKey: string;
  skillKey: string;
  name: string;
  description: string;
  context?: string;
  agent?: string;
  allowedTools: string[];
  argumentsHint?: string;
  /** Path to the skill file on disk (for inspection / open in editor) */
  filePath: string;
}

export interface SkillCatalog {
  packs: SkillPackEntry[];
  skills: SkillCatalogEntry[];
  /** True when the catalog was loaded from real vendored files; false if the dir is missing */
  loaded: boolean;
}

// ── Module-level cache ──────────────────────────────────────────────────────

let cached: SkillCatalog | null = null;

/**
 * Resolve the absolute path of the vendored `skills/` directory.
 *
 * This needs to work in both dev (tsx runs source files in-tree) and
 * prod (esbuild bundles everything into dist/index.js, and the
 * `server/agent-studio/skills/` source tree is still on disk but the
 * file location no longer relates to its source path).
 *
 * Strategy: build a list of candidate paths and return the first one
 * that exists. Order matters — most specific first.
 *
 * Candidates tried:
 *   1. Dev / unbundled: walk up from import.meta.url
 *      → .../server/agent-studio/skills
 *   2. Prod with cwd at project root:
 *      → <cwd>/server/agent-studio/skills
 *   3. Prod with cwd at dist/:
 *      → <cwd>/../server/agent-studio/skills
 *   4. Override via env var:
 *      → AGS_SKILLS_DIR (absolute path)
 */
function resolveSkillsDir(): string {
  // 0. Explicit override always wins
  const envOverride = process.env.AGS_SKILLS_DIR;
  if (envOverride && existsSync(envOverride)) return envOverride;

  const candidates: string[] = [];

  // 1. Walk up from this file (works in dev / tsx / unbundled)
  try {
    const here = fileURLToPath(import.meta.url);
    // here = .../server/agent-studio/adapters/skill-catalog-adapter.ts
    // We want    .../server/agent-studio/skills/
    candidates.push(join(here, "..", "..", "skills"));
  } catch {
    // import.meta.url not available — skip this candidate
  }

  // 2. From the project root via cwd (works when cwd is the repo root)
  candidates.push(join(process.cwd(), "server", "agent-studio", "skills"));

  // 3. From dist/ via cwd (works when cwd is the dist directory itself)
  candidates.push(
    join(process.cwd(), "..", "server", "agent-studio", "skills")
  );

  // 4. Sibling to the bundle if the bundle ends up in dist/
  try {
    const here = fileURLToPath(import.meta.url);
    candidates.push(
      join(here, "..", "..", "server", "agent-studio", "skills")
    );
    candidates.push(
      join(here, "..", "..", "..", "server", "agent-studio", "skills")
    );
  } catch {
    /* ignore */
  }

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }

  // Nothing matched — return the first guess so the caller's
  // existsSync() check fails cleanly with a stable path
  return candidates[0] ?? join(process.cwd(), "server", "agent-studio", "skills");
}

// ── YAML frontmatter parser (minimal — only the keys we need) ───────────────

interface ParsedFrontmatter {
  name?: string;
  description?: string;
  context?: string;
  agent?: string;
  allowedTools: string[];
  argumentsHint?: string;
}

function parseFrontmatter(raw: string): ParsedFrontmatter {
  const out: ParsedFrontmatter = { allowedTools: [] };
  // Match the leading --- ... --- block
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return out;
  const body = m[1];
  const lines = body.split(/\r?\n/);
  let inAllowedTools = false;
  for (const line of lines) {
    if (inAllowedTools) {
      const item = line.match(/^\s*-\s+(.+)\s*$/);
      if (item) {
        out.allowedTools.push(item[1].trim());
        continue;
      }
      // Non-list line ends the allowedTools block
      inAllowedTools = false;
    }
    if (/^allowedTools:\s*$/.test(line)) {
      inAllowedTools = true;
      continue;
    }
    const kv = line.match(/^([a-zA-Z_]+):\s*(.+)\s*$/);
    if (!kv) continue;
    const key = kv[1];
    const value = kv[2].replace(/^["']|["']$/g, "");
    if (key === "name") out.name = value;
    else if (key === "description") out.description = value;
    else if (key === "context") out.context = value;
    else if (key === "agent") out.agent = value;
    else if (key === "argumentsHint") out.argumentsHint = value;
  }
  return out;
}

// ── Load + cache ────────────────────────────────────────────────────────────

interface PacksManifest {
  version?: string;
  syncedFrom?: string;
  syncedAt?: string;
  packs: Array<{
    key: string;
    name: string;
    description: string;
  }>;
}

function loadCatalog(): SkillCatalog {
  if (cached) return cached;

  const skillsDir = resolveSkillsDir();
  if (!existsSync(skillsDir)) {
    cached = { packs: [], skills: [], loaded: false };
    return cached;
  }

  // Read the index manifest
  const manifestPath = join(skillsDir, "packs.json");
  let manifest: PacksManifest = { packs: [] };
  if (existsSync(manifestPath)) {
    try {
      manifest = JSON.parse(readFileSync(manifestPath, "utf-8")) as PacksManifest;
    } catch (e) {
      console.warn(
        `[agent-studio] failed to parse skills/packs.json: ${e instanceof Error ? e.message : String(e)}`
      );
    }
  }

  const packs: SkillPackEntry[] = [];
  const skills: SkillCatalogEntry[] = [];

  // For each declared pack, scan its directory for .md files
  for (const pack of manifest.packs) {
    const packDir = join(skillsDir, pack.key);
    if (!existsSync(packDir)) {
      packs.push({
        key: pack.key,
        name: pack.name,
        description: pack.description,
        skillCount: 0,
      });
      continue;
    }
    let count = 0;
    let entries: string[] = [];
    try {
      entries = readdirSync(packDir).filter((f) => f.endsWith(".md"));
    } catch {
      entries = [];
    }
    for (const file of entries) {
      const filePath = join(packDir, file);
      let raw: string;
      try {
        raw = readFileSync(filePath, "utf-8");
      } catch {
        continue;
      }
      const fm = parseFrontmatter(raw);
      const skillKey = (fm.name ?? file.replace(/\.md$/, "")).trim();
      const skillName = skillKey
        .replace(/[-_]/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());
      skills.push({
        packKey: pack.key,
        skillKey,
        name: skillName,
        description: fm.description ?? "",
        context: fm.context,
        agent: fm.agent,
        allowedTools: fm.allowedTools,
        argumentsHint: fm.argumentsHint,
        filePath,
      });
      count++;
    }
    packs.push({
      key: pack.key,
      name: pack.name,
      description: pack.description,
      skillCount: count,
    });
  }

  cached = { packs, skills, loaded: true };
  return cached;
}

// ── Public API ──────────────────────────────────────────────────────────────

export async function listSkillCatalog(): Promise<SkillCatalog> {
  return loadCatalog();
}

export async function listSkillPacks(): Promise<SkillPackEntry[]> {
  return loadCatalog().packs;
}

export async function listSkillsInPack(packKey: string): Promise<SkillCatalogEntry[]> {
  return loadCatalog().skills.filter((s) => s.packKey === packKey);
}

export async function getSkillByKey(
  packKey: string,
  skillKey: string
): Promise<SkillCatalogEntry | null> {
  const catalog = loadCatalog();
  return catalog.skills.find((s) => s.packKey === packKey && s.skillKey === skillKey) ?? null;
}

/**
 * Test helper / cache invalidation. Call after the sync script writes new
 * files to force a fresh disk read on the next request.
 */
export function invalidateSkillCatalogCache(): void {
  cached = null;
}
