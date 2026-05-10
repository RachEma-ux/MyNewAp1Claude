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
  markPackUsed,
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
// H2-c8 (cycle-8 audit closure §H2-c8): bounded wait on the
// CAG-build chain. Pre-cycle-8 the resolver had no per-operation
// timeout, so a hung MCP `listTools()` (during the snapshot
// enumeration in `buildFromCurrentSources`) or a stalled ASDB
// write would block the orchestrator indefinitely. Mirrors
// cycle-7 H1-c7's `withTimeout` pattern at the dispatcher layer.
import { withTimeout, isTimeoutError } from "../runtime/with-timeout";

/**
 * H2-c8: per-operation timeout ceilings for the CAG-resolve chain.
 * The two ceilings target operationally-distinct hazards:
 *   - `CAG_BUILD_TIMEOUT_MS` (default 10s): wraps the MCP-snapshot
 *     enumeration + builder. The MCP `listTools()` calls are the
 *     dominant latency contributor; 10s is generous for normal
 *     listing but bounds a hung server.
 *   - `CAG_PERSIST_TIMEOUT_MS` (default 5s): wraps the ASDB writes
 *     (`createPack`, `markPackUsed`). DB writes should be fast; a
 *     5s ceiling catches lock-contention or ASDB outages without
 *     stalling the chat turn.
 *
 * Both env-var overrides validate + warn-on-out-of-range per the
 * standing pattern (cycle-7 L5-c6 / H1-c7 / H7-c7 / H8-c7).
 */
const CAG_BUILD_TIMEOUT_MS = (() => {
  const raw = process.env.CAG_BUILD_TIMEOUT_MS;
  if (!raw) return 10_000;
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n) || n <= 0) {
    console.warn(
      `[ags-cag] CAG_BUILD_TIMEOUT_MS=${raw} is not a positive integer; using default 10000ms`,
    );
    return 10_000;
  }
  return n;
})();
const CAG_PERSIST_TIMEOUT_MS = (() => {
  const raw = process.env.CAG_PERSIST_TIMEOUT_MS;
  if (!raw) return 5_000;
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n) || n <= 0) {
    console.warn(
      `[ags-cag] CAG_PERSIST_TIMEOUT_MS=${raw} is not a positive integer; using default 5000ms`,
    );
    return 5_000;
  }
  return n;
})();

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
    // H2-c8: bound the MCP-snapshot + builder chain. A hung
    // `getSnapshot` / slow MCP server would block the orchestrator
    // indefinitely pre-cycle-8.
    const built = await withTimeout(
      buildFromCurrentSources(input),
      CAG_BUILD_TIMEOUT_MS,
      "CAG build (MCP snapshot enumeration)",
    );

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
      }).catch((err) => {
        // Best-effort event log — surface failures to operators
        // instead of swallowing silently (review-polish PR).
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[ags-cag] pack event log failed: ${msg}`);
      });
      if (input.mode === "strict") {
        throw new CagRequiredError(
          `CAG validation failed: ${violations.slice(0, 3).join("; ")}`,
        );
      }
      warnings.push(`cag: validation failed (${violations.length} violations); section omitted`);
      return { section: null, pack: null, warnings };
    }

    // D-CAG-RECON-4: render BEFORE persist so the compiledHash (SHA-256
    // of the rendered prompt text) flows into createPack. The renderer
    // is pure — same content always yields the same section — so we
    // can render once here and reuse the result regardless of cache
    // hit / miss. (Review cleanup — was previously rendered after
    // createPack, leaving compiledHash NULL forever.)
    const section = renderCapabilityPack(built.content);
    const renderWarnings = section.warnings;
    const compileWarnings = [
      ...built.warnings.map((w) => `cag-builder: ${w}`),
      ...renderWarnings.map((w) => `cag-renderer: ${w}`),
    ];
    const compileResult = renderWarnings.length > 0 ? "warn" : "ok";

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
      // H2-c8: bound the persist write. Lock contention or ASDB
      // outage would otherwise stall the chat turn.
      const created = await withTimeout(
        createPack({
          workspaceId: input.workspaceId,
          agentId: input.agentId,
          agentDraftId: input.agentDraftId,
          contentJson: built.content as unknown as Record<string, unknown>,
          sourceManifest: built.sourceManifest,
          createdBy: input.actorId,
          // D-CAG-RECON-3/4/5: persist compile + governance metadata so
          // traces can verify which pack version actually rendered and
          // which validation outcome it shipped under.
          compiledHash: section.contentHash,
          compileResult,
          compileWarnings,
          governanceVerdict: "cleared",
          governanceBlockers: [],
          tokenBudgetEstimate: section.tokenEstimate,
        }),
        CAG_PERSIST_TIMEOUT_MS,
        "CAG createPack",
      );
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
        }).catch((err) => {
        // Best-effort event log — surface failures to operators
        // instead of swallowing silently (review-polish PR).
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[ags-cag] pack event log failed: ${msg}`);
      });
      }
    }

    for (const w of compileWarnings) warnings.push(w);

    // D-CAG-RECON-2: atomic increment of useCount + lastUsedAt. Smoke
    // testing surfaced that the previous `touchPackLastUsed` call only
    // updated the timestamp, leaving the counter pinned at 0 even
    // though `pack_used` events fired on every resolve. `markPackUsed`
    // returns the new count so we can thread it into the event payload.
    //
    // H2-c8: bounded by `CAG_PERSIST_TIMEOUT_MS`. Failure (including
    // timeout) is best-effort — the pack is already used, the
    // counter is observability-only.
    const useCount = await withTimeout(
      markPackUsed(pack.id),
      CAG_PERSIST_TIMEOUT_MS,
      "CAG markPackUsed",
    ).catch((err) => {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[ags-cag] markPackUsed failed (pack=${pack.id}): ${msg}`);
      return null;
    });
    await appendPackEvent({
      workspaceId: input.workspaceId,
      agentDraftId: input.agentDraftId,
      packId: pack.id,
      eventType: "pack_used",
      eventSeverity: "info",
      actorType: "runtime",
      packVersion: pack.packVersion,
      createdBy: input.actorId,
      metadata: { reused, useCount },
    }).catch((err) => {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[ags-cag] pack_used event log failed: ${msg}`);
    });

    return { section, pack, warnings };
  } catch (err) {
    if (err instanceof CagRequiredError) throw err;
    // H2-c8: discriminate timeout from generic failure so operator
    // forensics can tell "MCP enumeration hung" from "validator
    // rejected" from "DB write failed". Timeout warning carries
    // the structured prefix `cag: timeout` for grep-ability.
    const detail = err instanceof Error ? err.message : String(err);
    const isTimeout = isTimeoutError(err);
    if (input.mode === "strict") {
      throw new CagRequiredError(
        isTimeout
          ? `CAG resolution timed out: ${detail}`
          : `CAG resolution failed: ${detail}`,
      );
    }
    warnings.push(
      isTimeout
        ? `cag: timeout (${detail}); proceeding without pack`
        : `cag: resolution failed (${detail}); proceeding without pack`,
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
