/**
 * CAG resolver — RAC P1C.
 *
 * The single function the runtime calls before composing the system
 * prompt. Behavior:
 *
 *   1. Look up the latest pack for the draft.
 *   2. If `mode=disabled` → return null (composer drops the section).
 *   3. If a fresh pack exists and its `sourceHashesJson` still matches
 *      the live source set → render and return it.
 *   4. Otherwise build a new pack via `buildCapabilityPack`, validate,
 *      persist via `createPack` (idempotent on hash match), render.
 *   5. On any error in `safe_degraded` → record a warning and return null.
 *      In `strict` → throw `CagRequiredError` (composer turns it into
 *      the SSE `cag_required` error).
 *
 * Boundary: this file imports `mcp/registry.ts` (snapshot read only),
 * the agent-studio repository (drafts, skills, mcp servers), the CAG
 * store, and the CAG builder/validator/renderer. It MUST NOT import
 * `mcp/dispatcher.ts` (P1E enforces).
 */

import * as repo from "../../repository";
import { getSnapshot } from "../mcp/registry";
import {
  buildCapabilityPack,
  type BuildPackInput,
  type BuildPackOutput,
  type BuilderMcpServerSnapshot,
} from "./builder";
import {
  createPack,
  getLatestPack,
  touchPackLastUsed,
} from "./store";
import { appendPackEvent } from "./events";
import { renderCapabilityPack } from "./renderer";
import { validatePackContent } from "./validator";
import { manifestToHashMap, hashMapsEqual } from "./hashing";
import type {
  CagCapabilityPack,
  CapabilityPackContent,
  SystemPromptSection,
} from "./types";
import type { ComposerMode } from "../runtime/system-prompt-composer";
import { CagRequiredError } from "../runtime/system-prompt-composer";

export interface ResolveCagInput {
  workspaceId: number;
  agentId: number;
  agentDraftId: number;
  actorId: number;
  mode: ComposerMode;
}

export interface ResolveCagResult {
  /** Rendered section ready to hand to the composer. Null when mode=disabled or no pack and safe_degraded. */
  section: SystemPromptSection | null;
  /** The persisted pack used (or null when no pack was used). */
  pack: CagCapabilityPack | null;
  warnings: string[];
}

/**
 * Resolve, build-or-reuse, render. Safe to call on every chat turn —
 * the store's idempotent createPack short-circuits the common case.
 */
export async function resolveCagPack(input: ResolveCagInput): Promise<ResolveCagResult> {
  if (input.mode === "disabled") {
    return { section: null, pack: null, warnings: [] };
  }

  const warnings: string[] = [];

  try {
    const built = await buildFromCurrentSources(input);

    const validation = validatePackContent(built.content);
    if (!validation.ok) {
      // tsconfig has strict:false which collapses discriminated-union narrowing,
      // so re-extract violations through the failure branch type explicitly.
      const violations = (validation as { ok: false; violations: string[] }).violations;
      await appendPackEvent({
        workspaceId: input.workspaceId,
        agentDraftId: input.agentDraftId,
        eventType: "pack_validation_failed",
        eventSeverity: "error",
        actorType: "system",
        createdBy: input.actorId,
        metadata: { violations },
      }).catch(() => {});
      if (input.mode === "strict") {
        throw new CagRequiredError(
          `CAG validation failed: ${violations.slice(0, 3).join("; ")}`,
        );
      }
      warnings.push(`cag: validation failed (${violations.length} violations); section omitted`);
      return { section: null, pack: null, warnings };
    }

    const newHashMap = manifestToHashMap(built.sourceManifest);
    const latest = await getLatestPack(input.agentDraftId);

    let pack: CagCapabilityPack;
    let reused = false;
    if (
      latest &&
      latest.status === "fresh" &&
      hashMapsEqual(latest.sourceHashesJson, newHashMap)
    ) {
      pack = latest;
      reused = true;
    } else {
      const created = await createPack({
        workspaceId: input.workspaceId,
        agentId: input.agentId,
        agentDraftId: input.agentDraftId,
        contentJson: built.content as unknown as Record<string, unknown>,
        sourceManifest: built.sourceManifest,
        createdBy: input.actorId,
      });
      pack = created.pack;
      reused = created.reused;
      if (!reused && latest && latest.status === "fresh") {
        // The store will have inserted a new version because hashes differ.
        // Mark the previous as stale so the event log records the reason.
        await appendPackEvent({
          workspaceId: input.workspaceId,
          agentDraftId: input.agentDraftId,
          packId: latest.id,
          eventType: "pack_marked_stale",
          eventSeverity: "info",
          reason: "source_drift",
          actorType: "system",
          packVersion: latest.packVersion,
          createdBy: input.actorId,
        }).catch(() => {});
      }
    }

    const section = renderCapabilityPack(pack.contentJson as unknown as CapabilityPackContent);
    for (const w of built.warnings) warnings.push(`cag-builder: ${w}`);

    await touchPackLastUsed(pack.id).catch(() => {});
    await appendPackEvent({
      workspaceId: input.workspaceId,
      agentDraftId: input.agentDraftId,
      packId: pack.id,
      eventType: "pack_used",
      eventSeverity: "info",
      actorType: "runtime",
      packVersion: pack.packVersion,
      createdBy: input.actorId,
      metadata: { reused },
    }).catch(() => {});

    return { section, pack, warnings };
  } catch (err) {
    if (err instanceof CagRequiredError) throw err;
    if (input.mode === "strict") {
      throw new CagRequiredError(
        `CAG resolution failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    warnings.push(
      `cag: resolution failed (${err instanceof Error ? err.message : String(err)}); proceeding without pack`,
    );
    return { section: null, pack: null, warnings };
  }
}

async function buildFromCurrentSources(
  input: ResolveCagInput,
): Promise<BuildPackOutput> {
  const draftRow = await repo.getDraftById(input.agentDraftId);
  if (!draftRow) throw new Error(`agent draft ${input.agentDraftId} not found`);

  const skillRows = await repo.listSkills(input.agentDraftId).catch(() => [] as any[]);
  const mcpServerRows = await repo
    .listMcpServers(input.agentDraftId)
    .catch(() => [] as any[]);

  const mcpServers: BuilderMcpServerSnapshot[] = [];
  for (const srv of mcpServerRows) {
    const snap = getSnapshot(srv.id);
    if (!snap) continue; // server not currently connected → no tools to surface
    mcpServers.push({
      serverId: srv.id,
      serverName: srv.name ?? `server_${srv.id}`,
      snapshotVersion: snap.version,
      tools: snap.tools.map((t) => ({
        name: t.name,
        description: t.description,
        // riskClass not yet on the manifest — classifier reads from
        // the provisional table or quarantines per D-TOOL-1 default-deny.
      })),
    });
  }

  const buildInput: BuildPackInput = {
    workspaceId: input.workspaceId,
    agentId: input.agentId,
    draftSnapshot: {
      agentDraftId: input.agentDraftId,
      name: (draftRow as any).name ?? `Draft ${input.agentDraftId}`,
      role: (draftRow as any).role ?? null,
      scope: (draftRow as any).scope ?? null,
      mission: (draftRow as any).mission ?? null,
    },
    skills: skillRows.map((s: any) => ({
      id: s.id,
      name: s.skillName ?? s.name ?? `skill_${s.id}`,
      description: s.description ?? null,
    })),
    mcpServers,
  };

  return buildCapabilityPack(buildInput);
}
