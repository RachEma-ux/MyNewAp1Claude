/**
 * AI Agent Studio — Catalog Tools Service
 *
 * Phase 13c: User-authored tools CRUD + merged registry. Mirrors the
 * shape of catalog-skills.ts.
 *
 * Merge sources (3):
 *   1. Static built-in 51 from tool-catalog-adapter.ts
 *   2. DB rows from agsCatalogTools (this phase)
 *   3. MCP-discovered tools (Phase 15d will wire this — for now the
 *      mcpManager.listConnectedTools() call is optional and only used
 *      when a draftId is supplied)
 *
 * Built-in tools are immutable (cannot be edited or deleted via the
 * catalog API). DB tools and MCP tools are presented as separate
 * sources in the merged view so the UI can label them clearly.
 *
 * Validation rules:
 *   - key matches PascalCase ^[A-Z][A-Za-z0-9_]*$
 *   - key must NOT collide with any built-in 51 key
 *   - invocationKind drives required fields in invocationConfig:
 *       shell:   { argv: string[], env?: Record<string,string> }
 *       http:    { url: string, method: string, headers?: Record }
 *       mcp_ref: { serverId: number, toolName: string }
 *       builtin: REJECTED — only the static 51 can be source=builtin
 */

import * as repo from "../repository";
import * as toolCatalog from "../adapters/tool-catalog-adapter";
import * as mcpManager from "./mcp/mcp-manager";
import * as registry from "./mcp/registry";

// ── Public types ────────────────────────────────────────────────────────────

export interface CatalogToolInput {
  key: string;
  name: string;
  description?: string | null;
  category?: string | null;
  defaultAllowedActions?: string[];
  hardBlockedActions?: string[];
  defaultRequiresApproval?: boolean;
  destructive?: boolean;
  invocationKind: "shell" | "http" | "mcp_ref" | "builtin";
  invocationConfig?: Record<string, unknown>;
  inputSchema?: Record<string, unknown>;
  version?: string | null;
  createdBy?: number | null;
}

export interface ValidateResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

export interface MergedToolEntry {
  id?: number;
  key: string;
  name: string;
  description: string;
  category: string;
  defaultAllowedActions: string[];
  hardBlockedActions: string[];
  defaultRequiresApproval: boolean;
  destructive: boolean;
  invocationKind: string;
  source: "builtin" | "db" | "mcp";
  /** Only present for source=mcp */
  mcpInfo?: { serverId: number; serverName: string; toolName: string };
}

// ── Validation ──────────────────────────────────────────────────────────────

const TOOL_KEY_PATTERN = /^[A-Z][A-Za-z0-9_]*$/;

function validateInvocationConfig(
  kind: string,
  config: Record<string, unknown>
): string[] {
  const errors: string[] = [];
  if (kind === "shell") {
    if (!Array.isArray(config.argv) || config.argv.length === 0) {
      errors.push("shell invocation requires invocationConfig.argv (string[])");
    } else if (!config.argv.every((a) => typeof a === "string")) {
      errors.push("shell argv must be all strings");
    }
    if (config.env != null && typeof config.env !== "object") {
      errors.push("shell env must be an object");
    }
  } else if (kind === "http") {
    if (typeof config.url !== "string" || !config.url) {
      errors.push("http invocation requires invocationConfig.url (string)");
    }
    if (config.method != null && typeof config.method !== "string") {
      errors.push("http method must be a string");
    }
    if (config.headers != null && typeof config.headers !== "object") {
      errors.push("http headers must be an object");
    }
  } else if (kind === "mcp_ref") {
    if (typeof config.serverId !== "number" || config.serverId <= 0) {
      errors.push(
        "mcp_ref invocation requires invocationConfig.serverId (positive integer)"
      );
    }
    if (typeof config.toolName !== "string" || !config.toolName) {
      errors.push(
        "mcp_ref invocation requires invocationConfig.toolName (string)"
      );
    }
  } else if (kind === "builtin") {
    errors.push(
      'invocationKind "builtin" is reserved for the static catalog and cannot be set via the API'
    );
  }
  return errors;
}

export async function validateCatalogTool(
  input: CatalogToolInput
): Promise<ValidateResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!TOOL_KEY_PATTERN.test(input.key)) {
    errors.push(
      `key "${input.key}" must match ^[A-Z][A-Za-z0-9_]*$ (PascalCase, alphanumeric + underscore)`
    );
  }
  if (!input.name || input.name.trim().length === 0) {
    errors.push("name is required");
  }
  if (!input.invocationKind) {
    errors.push("invocationKind is required");
  } else {
    errors.push(...validateInvocationConfig(input.invocationKind, input.invocationConfig ?? {}));
  }

  // Built-in collision check (the 51 static tools)
  const builtin = await toolCatalog.getToolCatalogEntry(input.key);
  if (builtin) {
    errors.push(
      `key "${input.key}" collides with built-in tool — built-ins are immutable, pick a different key`
    );
  }

  // DB uniqueness
  const existingByKey = await repo.getCatalogToolByKey(input.key);
  if (existingByKey) {
    errors.push(
      `tool "${input.key}" already exists in catalog (id ${existingByKey.id})`
    );
  }

  // inputSchema sanity (optional but if present must be an object)
  if (input.inputSchema != null && typeof input.inputSchema !== "object") {
    errors.push("inputSchema must be a JSON Schema object");
  }

  return { ok: errors.length === 0, errors, warnings };
}

// ── CRUD ────────────────────────────────────────────────────────────────────

export async function createCatalogTool(input: CatalogToolInput) {
  const validation = await validateCatalogTool(input);
  if (!validation.ok) {
    throw new Error(
      `[catalog-tools] validation failed: ${validation.errors.join("; ")}`
    );
  }
  return repo.createCatalogTool(input);
}

export async function updateCatalogTool(
  id: number,
  patch: Partial<CatalogToolInput>
) {
  const existing = await repo.getCatalogToolById(id);
  if (!existing) throw new Error(`catalog tool ${id} not found`);

  const merged: CatalogToolInput = {
    key: patch.key ?? existing.key,
    name: patch.name ?? existing.name,
    description: patch.description ?? existing.description,
    category: patch.category ?? existing.category,
    defaultAllowedActions:
      patch.defaultAllowedActions ??
      ((existing.defaultAllowedActions ?? []) as string[]),
    hardBlockedActions:
      patch.hardBlockedActions ??
      ((existing.hardBlockedActions ?? []) as string[]),
    defaultRequiresApproval:
      patch.defaultRequiresApproval ?? existing.defaultRequiresApproval ?? false,
    destructive: patch.destructive ?? existing.destructive ?? false,
    invocationKind: (patch.invocationKind ?? existing.invocationKind) as any,
    invocationConfig:
      patch.invocationConfig ??
      ((existing.invocationConfig ?? {}) as Record<string, unknown>),
    inputSchema:
      patch.inputSchema ?? ((existing.inputSchema ?? {}) as Record<string, unknown>),
    version: patch.version ?? existing.version,
  };

  const validation = await validateUpdate(id, merged);
  if (!validation.ok) {
    throw new Error(
      `[catalog-tools] validation failed: ${validation.errors.join("; ")}`
    );
  }

  return repo.updateCatalogTool(id, { ...patch, updatedAt: new Date() });
}

async function validateUpdate(
  id: number,
  input: CatalogToolInput
): Promise<ValidateResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!TOOL_KEY_PATTERN.test(input.key)) {
    errors.push(`key "${input.key}" must match ^[A-Z][A-Za-z0-9_]*$`);
  }
  if (!input.name || input.name.trim().length === 0) {
    errors.push("name is required");
  }
  if (!input.invocationKind) {
    errors.push("invocationKind is required");
  } else {
    errors.push(...validateInvocationConfig(input.invocationKind, input.invocationConfig ?? {}));
  }

  // Built-in collision check
  const builtin = await toolCatalog.getToolCatalogEntry(input.key);
  if (builtin) {
    errors.push(`key "${input.key}" collides with built-in tool`);
  }

  // DB uniqueness — allow self
  const existingByKey = await repo.getCatalogToolByKey(input.key);
  if (existingByKey && existingByKey.id !== id) {
    errors.push(
      `tool "${input.key}" already exists at id ${existingByKey.id}`
    );
  }

  return { ok: errors.length === 0, errors, warnings };
}

export async function removeCatalogTool(id: number) {
  const existing = await repo.getCatalogToolById(id);
  if (!existing) return { ok: false, error: "not found" };
  await repo.removeCatalogTool(id);
  return { ok: true };
}

// ── Merge ──────────────────────────────────────────────────────────────────

/**
 * Return the unified tool catalog from up to 3 sources:
 *   1. Static built-in 51 from tool-catalog-adapter
 *   2. DB rows from agsCatalogTools
 *   3. MCP-discovered tools — from EVERY connected server across every
 *      draft when no `draftId` is provided (via Phase 19c's versioned
 *      registry), OR scoped to the draft's attached servers when
 *      `draftId` is passed (used by the per-agent Tools page to show
 *      only tools the draft can actually use).
 *
 * Phase 19 follow-up: pre-19 the MCP source was gated on draftId
 * because there was no way to enumerate connected servers without a
 * per-draft filter. The versioned registry built in Phase 19c changed
 * that — it holds frozen snapshots of every connected server's tools
 * indexed by serverId, so the global Tools Catalog page can now flatten
 * them across all drafts.
 */
export async function listMergedTools(opts?: {
  draftId?: number;
  category?: string;
  search?: string;
}): Promise<{
  builtin: MergedToolEntry[];
  db: MergedToolEntry[];
  mcp: MergedToolEntry[];
  all: MergedToolEntry[];
}> {
  // Built-in
  const builtinList = await toolCatalog.listToolCatalog();
  const builtin: MergedToolEntry[] = builtinList.map((t) => ({
    key: t.key,
    name: t.name,
    description: t.description ?? "",
    category: (t as any).category ?? "custom",
    defaultAllowedActions: ((t as any).defaultAllowedActions ?? []) as string[],
    hardBlockedActions: ((t as any).hardBlockedActions ?? []) as string[],
    defaultRequiresApproval: (t as any).defaultRequiresApproval ?? false,
    destructive: (t as any).destructive ?? false,
    invocationKind: "builtin",
    source: "builtin",
  }));

  // DB
  const dbRows = await repo.listCatalogTools(
    opts?.category || opts?.search ? { category: opts?.category, search: opts?.search } : undefined
  );
  const dbEntries: MergedToolEntry[] = dbRows.map((t) => ({
    id: t.id,
    key: t.key,
    name: t.name,
    description: t.description ?? "",
    category: t.category ?? "custom",
    defaultAllowedActions: (t.defaultAllowedActions ?? []) as string[],
    hardBlockedActions: (t.hardBlockedActions ?? []) as string[],
    defaultRequiresApproval: t.defaultRequiresApproval ?? false,
    destructive: t.destructive ?? false,
    invocationKind: t.invocationKind,
    source: "db",
  }));

  // MCP — Phase 19 follow-up: include MCP tools in BOTH modes:
  //   - With draftId  → only tools from servers attached to that draft
  //                     (existing per-agent Tools page behavior)
  //   - Without draftId → every tool from every connected server across
  //                       every draft (global Tools Catalog page). The
  //                       Phase 19c registry holds frozen snapshots keyed
  //                       by serverId, which we join with the row data
  //                       (for serverName) via repo.listAllMcpServers.
  let mcpEntries: MergedToolEntry[] = [];
  try {
    if (opts?.draftId) {
      // Draft-scoped — existing path
      const mcpTools = await mcpManager.listConnectedTools(opts.draftId);
      mcpEntries = mcpTools.map((t) => ({
        key: `mcp__${t.serverName}__${t.name}`,
        name: t.name,
        description: t.description ?? "",
        category: "mcp",
        defaultAllowedActions: [],
        hardBlockedActions: [],
        defaultRequiresApproval: false,
        destructive: false,
        invocationKind: "mcp_ref",
        source: "mcp",
        mcpInfo: {
          serverId: t.serverId,
          serverName: t.serverName,
          toolName: t.name,
        },
      }));
    } else {
      // Global — walk every connected server via the registry. One
      // repo call to resolve serverId → serverName, one walk of the
      // connected states map.
      const allRows = await repo.listAllMcpServers();
      const nameBySid = new Map<number, string>();
      for (const r of allRows) nameBySid.set(r.id, r.name);
      const states = mcpManager.getAllConnectionStates();
      for (const { serverId, state } of states) {
        if (state.kind !== "connected") continue;
        const snapshot = registry.getSnapshot(serverId);
        if (!snapshot) continue;
        const serverName = nameBySid.get(serverId) ?? `server-${serverId}`;
        for (const tool of snapshot.tools) {
          mcpEntries.push({
            key: `mcp__${serverName}__${tool.name}`,
            name: tool.name,
            description: tool.description ?? "",
            category: "mcp",
            defaultAllowedActions: [],
            hardBlockedActions: [],
            defaultRequiresApproval: false,
            destructive: false,
            invocationKind: "mcp_ref",
            source: "mcp",
            mcpInfo: {
              serverId,
              serverName,
              toolName: tool.name,
            },
          });
        }
      }
    }
  } catch {
    // MCP manager not initialized, registry empty, or repo failure —
    // silent. The catalog page still renders with builtin + db sources.
  }

  // Apply filters to MCP entries too (the builtin filter is below; DB
  // filter happens in the repo layer). Without this, search/category
  // filters would leak every MCP tool through unchanged.
  if (opts?.category) {
    mcpEntries = mcpEntries.filter((t) => t.category === opts.category);
  }
  if (opts?.search && opts.search.trim()) {
    const needle = opts.search.trim().toLowerCase();
    mcpEntries = mcpEntries.filter(
      (t) =>
        t.key.toLowerCase().includes(needle) ||
        t.name.toLowerCase().includes(needle) ||
        t.description.toLowerCase().includes(needle)
    );
  }

  // Apply filters to builtin (DB filter happens in repo)
  let filteredBuiltin = builtin;
  if (opts?.category) {
    filteredBuiltin = filteredBuiltin.filter((t) => t.category === opts.category);
  }
  if (opts?.search && opts.search.trim()) {
    const needle = opts.search.trim().toLowerCase();
    filteredBuiltin = filteredBuiltin.filter(
      (t) =>
        t.key.toLowerCase().includes(needle) ||
        t.name.toLowerCase().includes(needle) ||
        t.description.toLowerCase().includes(needle)
    );
  }

  return {
    builtin: filteredBuiltin,
    db: dbEntries,
    mcp: mcpEntries,
    all: [...filteredBuiltin, ...dbEntries, ...mcpEntries],
  };
}
