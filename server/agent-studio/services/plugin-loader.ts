/**
 * AI Agent Studio — Plugin Loader
 *
 * Phase 9 of the Agent Studio remaining-phases plan. Reads plugin
 * manifests from disk and exposes their contributions (tools, hooks,
 * MCP servers) to the agent at runtime.
 *
 * Plugin layout on disk:
 *   <path>/plugin.json
 *
 * plugin.json shape (validated against PluginManifestSchema):
 *   {
 *     "name": "string",
 *     "version": "string",
 *     "description": "optional string",
 *     "tools": [{ "name", "description?", "category?" }],
 *     "hooks": [{ "eventName", "matcher?", "command", "timeoutMs?",
 *                  "requiresApproval?" }],
 *     "mcpServers": [{ "name", "transport", "command?", "args?",
 *                       "url?", "env?" }]
 *   }
 *
 * Security model:
 *   - The user explicitly attaches a plugin path via the UI; we never
 *     auto-discover plugins.
 *   - The path must resolve to a real directory on disk.
 *   - The path must live INSIDE one of the agent's workingDirectories.
 *     This prevents an attacker who can write a row in the DB from
 *     loading arbitrary code from /etc/.
 *   - Plugin contributions are merged at runtime in memory only; we
 *     never persist them as agsDraft* rows. Removing the plugin removes
 *     its contributions on the next reload.
 *   - The manifest is JSON, not executable code. Phase 9 doesn't
 *     support code-bearing plugins. (Tools/hooks declared by a plugin
 *     are still spawned via the existing hook/tool runners.)
 *
 * Caching:
 *   - Manifests are read fresh on every applyPlugins call. There's no
 *     cache invalidation problem because plugins are user-managed and
 *     rarely change.
 */

import { promises as fs } from "fs";
import { resolve, isAbsolute, relative } from "path";
import * as repo from "../repository";

// ── Types ───────────────────────────────────────────────────────────────────

export interface PluginToolContribution {
  name: string;
  description?: string;
  category?: string;
}

export interface PluginHookContribution {
  eventName: string;
  matcher?: string | null;
  command: string;
  timeoutMs?: number | null;
  requiresApproval?: boolean;
}

export interface PluginMcpContribution {
  name: string;
  transport: string;
  command?: string | null;
  args?: string[];
  url?: string | null;
  env?: Record<string, string>;
}

export interface PluginManifest {
  name: string;
  version: string;
  description?: string;
  tools?: PluginToolContribution[];
  hooks?: PluginHookContribution[];
  mcpServers?: PluginMcpContribution[];
}

export interface LoadedPlugin {
  pluginId: number;
  path: string;
  manifest: PluginManifest;
}

export interface PluginLoadResult {
  ok: boolean;
  manifest?: PluginManifest;
  error?: string;
  resolvedPath?: string;
}

// ── Manifest validation ────────────────────────────────────────────────────

/**
 * Validate a parsed manifest object. Returns null if valid, error
 * string otherwise. Strict — unknown fields are tolerated but required
 * fields and shape mismatches are rejected.
 */
function validateManifest(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return "manifest must be an object";
  const m = raw as Record<string, unknown>;
  if (typeof m.name !== "string" || !m.name) return "manifest.name is required";
  if (typeof m.version !== "string" || !m.version)
    return "manifest.version is required";
  if (m.tools != null) {
    if (!Array.isArray(m.tools)) return "manifest.tools must be an array";
    for (const t of m.tools) {
      if (!t || typeof t !== "object" || typeof (t as any).name !== "string")
        return "every tool must have a name string";
    }
  }
  if (m.hooks != null) {
    if (!Array.isArray(m.hooks)) return "manifest.hooks must be an array";
    for (const h of m.hooks) {
      if (
        !h ||
        typeof h !== "object" ||
        typeof (h as any).eventName !== "string" ||
        typeof (h as any).command !== "string"
      )
        return "every hook must have eventName + command strings";
    }
  }
  if (m.mcpServers != null) {
    if (!Array.isArray(m.mcpServers))
      return "manifest.mcpServers must be an array";
    for (const s of m.mcpServers) {
      if (
        !s ||
        typeof s !== "object" ||
        typeof (s as any).name !== "string" ||
        typeof (s as any).transport !== "string"
      )
        return "every mcpServer must have name + transport strings";
    }
  }
  return null;
}

// ── Path security ──────────────────────────────────────────────────────────

/**
 * Resolve a plugin path against the agent's workingDirectories. The
 * resolved path must:
 *  1. exist as a directory
 *  2. live inside at least one of the agent's allowed working dirs
 *
 * Returns the absolute resolved path or null if invalid. The "inside"
 * check uses path.relative() — if the relative path doesn't start with
 * ".." then the target is inside the base.
 */
async function resolvePluginPath(
  pluginPath: string,
  workingDirs: string[]
): Promise<{ ok: boolean; resolved?: string; error?: string }> {
  if (workingDirs.length === 0) {
    return {
      ok: false,
      error:
        "agent has no workingDirectories configured — refusing to load plugin",
    };
  }

  // Resolve against the first working dir if relative
  const candidate = isAbsolute(pluginPath)
    ? pluginPath
    : resolve(workingDirs[0], pluginPath);

  // Check it exists and is a directory
  let stat;
  try {
    stat = await fs.stat(candidate);
  } catch (e) {
    return {
      ok: false,
      error: `plugin path does not exist: ${candidate}`,
    };
  }
  if (!stat.isDirectory()) {
    return { ok: false, error: `plugin path is not a directory: ${candidate}` };
  }

  // Check the resolved path is inside at least one allowed dir
  const allowed = workingDirs.some((base) => {
    const absBase = isAbsolute(base) ? base : resolve(base);
    const rel = relative(absBase, candidate);
    return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
  });
  if (!allowed) {
    return {
      ok: false,
      error: `plugin path ${candidate} is outside the agent's workingDirectories`,
    };
  }

  return { ok: true, resolved: candidate };
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Validate a plugin without loading its contributions. Used by the UI
 * "Validate" button to preview the manifest before enabling.
 */
export async function validatePlugin(input: {
  agentId: number;
  path: string;
}): Promise<PluginLoadResult> {
  const draft = await repo.getCurrentDraft(input.agentId);
  if (!draft) return { ok: false, error: "no current draft for agent" };
  const workingDirs = ((draft.workingDirectories ?? []) as string[]) ?? [];

  const resolved = await resolvePluginPath(input.path, workingDirs);
  if (!resolved.ok) return { ok: false, error: resolved.error };

  const manifestPath = `${resolved.resolved}/plugin.json`;
  let raw: string;
  try {
    raw = await fs.readFile(manifestPath, "utf-8");
  } catch (e) {
    return {
      ok: false,
      error: `failed to read plugin.json: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    return {
      ok: false,
      error: `plugin.json is not valid JSON: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  const validationError = validateManifest(parsed);
  if (validationError) {
    return { ok: false, error: validationError };
  }

  return {
    ok: true,
    manifest: parsed as PluginManifest,
    resolvedPath: resolved.resolved,
  };
}

/**
 * Load all enabled plugins for a draft and return their contributions
 * as a single merged structure. Failures per-plugin are collected so
 * the simulation engine can decide whether to abort or continue.
 *
 * Returns:
 *   - loaded: successfully loaded plugin manifests
 *   - errors: per-plugin failures with message
 *   - merged: flattened tool/hook/mcp arrays ready to merge into the
 *     draft state at runtime
 */
export async function loadPluginsForDraft(input: {
  agentId: number;
  draftId: number;
}): Promise<{
  loaded: LoadedPlugin[];
  errors: Array<{ pluginId: number; path: string; error: string }>;
  merged: {
    tools: PluginToolContribution[];
    hooks: PluginHookContribution[];
    mcpServers: PluginMcpContribution[];
  };
}> {
  const plugins = await repo.listPlugins(input.draftId);
  const draft = await repo.getCurrentDraft(input.agentId);
  const workingDirs = (draft?.workingDirectories ?? []) as string[];

  const loaded: LoadedPlugin[] = [];
  const errors: Array<{ pluginId: number; path: string; error: string }> = [];
  const merged = {
    tools: [] as PluginToolContribution[],
    hooks: [] as PluginHookContribution[],
    mcpServers: [] as PluginMcpContribution[],
  };

  for (const p of plugins) {
    if (p.enabled === false) continue;
    const resolved = await resolvePluginPath(p.path, workingDirs);
    if (!resolved.ok) {
      errors.push({
        pluginId: p.id,
        path: p.path,
        error: resolved.error ?? "path resolution failed",
      });
      continue;
    }
    const manifestPath = `${resolved.resolved}/plugin.json`;
    let raw: string;
    try {
      raw = await fs.readFile(manifestPath, "utf-8");
    } catch (e) {
      errors.push({
        pluginId: p.id,
        path: p.path,
        error: `failed to read plugin.json: ${e instanceof Error ? e.message : String(e)}`,
      });
      continue;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      errors.push({
        pluginId: p.id,
        path: p.path,
        error: `plugin.json is not valid JSON: ${e instanceof Error ? e.message : String(e)}`,
      });
      continue;
    }
    const validationError = validateManifest(parsed);
    if (validationError) {
      errors.push({
        pluginId: p.id,
        path: p.path,
        error: validationError,
      });
      continue;
    }
    const manifest = parsed as PluginManifest;
    loaded.push({
      pluginId: p.id,
      path: resolved.resolved!,
      manifest,
    });
    if (manifest.tools) merged.tools.push(...manifest.tools);
    if (manifest.hooks) merged.hooks.push(...manifest.hooks);
    if (manifest.mcpServers) merged.mcpServers.push(...manifest.mcpServers);
  }

  return { loaded, errors, merged };
}
