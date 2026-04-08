/**
 * AI Agent Studio — Marketplace Service
 *
 * Phase 14: Agent Studio's own marketplace. NO external links — no
 * Claude marketplace, no NPM registry, no openclaude plugin pulls.
 * Distribution is via:
 *   1. Local-only items (created on this Studio instance via Publish)
 *   2. Imported items (pulled from a remote registry — JSON file URL)
 *   3. Bundled seed (the 19 vendored skills as 9 official packs)
 *
 * Per Decision #4 + #5: there's exactly ONE official registry URL,
 * hardcoded to a static JSON file in our own repo. Users can add
 * additional registry URLs via marketplace.addRegistry() (Phase 14
 * stores them in-memory for now; persistence is a follow-up).
 *
 * Per Decision #7: publishing to a remote registry is "file a PR"
 * not API-driven. No write auth to implement.
 */

import { createHash } from "crypto";
import * as repo from "../repository";

// ── Types ───────────────────────────────────────────────────────────────────

export type MarketplaceItemType =
  | "skill"
  | "skill_pack"
  | "tool"
  | "tool_pack"
  | "bundle";

export type MarketplaceItemSource = "local" | "imported" | "published";

/**
 * The payload shape inside agsMarketplaceItems.payload — discriminated
 * by the parent row's `itemType`. Strict at install time, permissive
 * at storage time so we can evolve the shape without migrations.
 */
export interface SkillPayload {
  kind: "skill";
  skill: SkillBundleEntry;
}

export interface SkillPackPayload {
  kind: "skill_pack";
  packKey: string;
  packName: string;
  skills: SkillBundleEntry[];
}

export interface ToolPayload {
  kind: "tool";
  tool: ToolBundleEntry;
}

export interface ToolPackPayload {
  kind: "tool_pack";
  tools: ToolBundleEntry[];
}

export interface BundlePayload {
  kind: "bundle";
  skills?: SkillBundleEntry[];
  tools?: ToolBundleEntry[];
}

export type MarketplacePayload =
  | SkillPayload
  | SkillPackPayload
  | ToolPayload
  | ToolPackPayload
  | BundlePayload;

export interface SkillBundleEntry {
  packKey: string;
  skillKey: string;
  name: string;
  description?: string;
  context?: "inline" | "fork";
  agent?: string;
  model?: "sonnet" | "opus" | "haiku";
  allowedTools?: string[];
  argNames?: string[];
  effort?: "low" | "medium" | "high";
  body: string;
  version?: string;
}

export interface ToolBundleEntry {
  key: string;
  name: string;
  description?: string;
  category?: string;
  defaultAllowedActions?: string[];
  hardBlockedActions?: string[];
  defaultRequiresApproval?: boolean;
  destructive?: boolean;
  invocationKind: "shell" | "http" | "mcp_ref";
  invocationConfig?: Record<string, unknown>;
  inputSchema?: Record<string, unknown>;
  version?: string;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Compute SHA-256 of the payload for integrity + dedupe. The hash is
 * stored on the row and verified at install time.
 */
export function computeContentHash(payload: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex");
}

/**
 * Validate a marketplace item before insert. Returns errors[] (empty
 * = valid). Catches the most common payload shape mistakes.
 */
export function validatePayload(
  itemType: MarketplaceItemType,
  payload: unknown
): string[] {
  const errors: string[] = [];
  if (!payload || typeof payload !== "object") {
    errors.push("payload must be an object");
    return errors;
  }
  const p = payload as Record<string, unknown>;
  if (p.kind !== itemType) {
    errors.push(`payload.kind "${p.kind}" must equal itemType "${itemType}"`);
  }
  if (itemType === "skill") {
    if (!p.skill || typeof p.skill !== "object") errors.push("payload.skill required");
  } else if (itemType === "skill_pack") {
    if (typeof p.packKey !== "string") errors.push("payload.packKey required");
    if (!Array.isArray(p.skills)) errors.push("payload.skills must be an array");
  } else if (itemType === "tool") {
    if (!p.tool || typeof p.tool !== "object") errors.push("payload.tool required");
  } else if (itemType === "tool_pack") {
    if (!Array.isArray(p.tools)) errors.push("payload.tools must be an array");
  } else if (itemType === "bundle") {
    // bundle is permissive — both skills and tools optional
    if (p.skills && !Array.isArray(p.skills)) errors.push("payload.skills must be an array");
    if (p.tools && !Array.isArray(p.tools)) errors.push("payload.tools must be an array");
  }
  return errors;
}

// ── List + search ──────────────────────────────────────────────────────────

export interface ListMarketplaceFilter {
  itemType?: MarketplaceItemType;
  author?: string;
  source?: MarketplaceItemSource;
  search?: string;
  limit?: number;
}

export async function listMarketplaceItems(filter?: ListMarketplaceFilter) {
  return repo.listMarketplaceItems(filter);
}

export async function getMarketplaceItem(itemKey: string, version?: string) {
  return repo.getMarketplaceItemByKeyVersion(itemKey, version);
}

// ── Publish (create local item) ────────────────────────────────────────────

export interface PublishInput {
  itemKey: string;
  itemType: MarketplaceItemType;
  displayName: string;
  description?: string;
  author?: string;
  version: string;
  payload: MarketplacePayload;
  tags?: string[];
  createdBy?: number;
}

export async function publishToLocalMarketplace(
  input: PublishInput
): Promise<{ id: number; contentHash: string }> {
  const errors = validatePayload(input.itemType, input.payload);
  if (errors.length > 0) {
    throw new Error(
      `[marketplace] payload validation failed: ${errors.join("; ")}`
    );
  }
  const contentHash = computeContentHash(input.payload);
  const created = await repo.createMarketplaceItem({
    itemKey: input.itemKey,
    itemType: input.itemType,
    displayName: input.displayName,
    description: input.description ?? null,
    author: input.author ?? "local",
    version: input.version,
    payload: input.payload as unknown as Record<string, unknown>,
    tags: input.tags ?? [],
    contentHash,
    source: "local",
    createdBy: input.createdBy ?? null,
  });
  return { id: created.id, contentHash };
}

export async function unpublishLocalItem(itemId: number) {
  const item = await repo.getMarketplaceItemById(itemId);
  if (!item) return { ok: false, error: "not found" };
  if (item.source === "imported") {
    return {
      ok: false,
      error:
        'cannot unpublish "imported" items — they came from a remote registry. Remove the registry instead.',
    };
  }
  await repo.removeMarketplaceItem(itemId);
  return { ok: true };
}

// ── Remote registry refresh ────────────────────────────────────────────────

/**
 * Format of a remote registry JSON file. We control this format end-to-end.
 */
export interface RemoteRegistry {
  version: "1.0";
  name: string;
  description?: string;
  updatedAt?: string;
  items: Array<{
    itemKey: string;
    itemType: MarketplaceItemType;
    displayName: string;
    description?: string;
    author?: string;
    version: string;
    tags?: string[];
    contentHash?: string;
    payload: MarketplacePayload;
  }>;
}

/**
 * The single hardcoded official registry URL. Per Decision #4, this
 * points at a static JSON file in our own repo so there's zero
 * third-party dependency. Users can override via env var if they want
 * to test against a different file.
 */
const OFFICIAL_REGISTRY_URL =
  process.env.AGS_OFFICIAL_REGISTRY_URL ||
  "https://raw.githubusercontent.com/RachEma-ux/MyNewAp1Claude/main/docs/agent-studio/marketplace/registry.json";

/**
 * Pull a remote registry, parse, validate per-item, and upsert each
 * item with source="imported". Items already present at the same
 * (itemKey, version) are skipped (not overwritten — the local copy
 * wins).
 */
export async function refreshFromRegistry(
  registryUrl: string = OFFICIAL_REGISTRY_URL
): Promise<{
  fetched: number;
  inserted: number;
  skipped: number;
  errors: Array<{ itemKey: string; error: string }>;
}> {
  const result = {
    fetched: 0,
    inserted: 0,
    skipped: 0,
    errors: [] as Array<{ itemKey: string; error: string }>,
  };
  let res: Response;
  try {
    res = await fetch(registryUrl, {
      headers: { accept: "application/json" },
    });
  } catch (e) {
    throw new Error(
      `[marketplace] failed to fetch registry ${registryUrl}: ${e instanceof Error ? e.message : String(e)}`
    );
  }
  if (!res.ok) {
    throw new Error(
      `[marketplace] registry returned HTTP ${res.status} ${res.statusText}`
    );
  }
  let registry: RemoteRegistry;
  try {
    registry = (await res.json()) as RemoteRegistry;
  } catch (e) {
    throw new Error(
      `[marketplace] registry not valid JSON: ${e instanceof Error ? e.message : String(e)}`
    );
  }
  if (!registry || registry.version !== "1.0" || !Array.isArray(registry.items)) {
    throw new Error("[marketplace] registry missing required fields (version, items)");
  }
  result.fetched = registry.items.length;

  for (const item of registry.items) {
    try {
      // Already exists?
      const existing = await repo.getMarketplaceItemByKeyVersion(
        item.itemKey,
        item.version
      );
      if (existing) {
        result.skipped++;
        continue;
      }
      const errors = validatePayload(item.itemType, item.payload);
      if (errors.length > 0) {
        result.errors.push({
          itemKey: item.itemKey,
          error: errors.join("; "),
        });
        continue;
      }
      const contentHash =
        item.contentHash ?? computeContentHash(item.payload);
      await repo.createMarketplaceItem({
        itemKey: item.itemKey,
        itemType: item.itemType,
        displayName: item.displayName,
        description: item.description ?? null,
        author: item.author ?? "registry",
        version: item.version,
        payload: item.payload as unknown as Record<string, unknown>,
        tags: item.tags ?? [],
        contentHash,
        source: "imported",
      });
      result.inserted++;
    } catch (e) {
      result.errors.push({
        itemKey: item.itemKey,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
  return result;
}

// ── Collections ────────────────────────────────────────────────────────────

export async function listCollections() {
  return repo.listMarketplaceCollections();
}
