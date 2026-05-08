/**
 * Knowledge Unit Service — D-NKU-2 / D-NKU-3 / D-NKU-4 enforcement.
 *
 * The single insert point for `agsKnowledgeUnits`. Contract guarantees:
 *
 *   - `contentText` non-empty (D-NKU-3 — KnowledgeUnitContractError on miss).
 *   - `provenanceId` resolved (D-UI-2 — caller MUST pass; we don't synth).
 *   - `permissionContext` set (D-UI-2).
 *   - `freshnessState` defaults to "fresh" (D-UI-2).
 *   - `contentHash` computed from `contentText` (D-NKU-4).
 *
 * Validation runs at insert time (D-UI-4): the validator's verdict
 * lands on `validationStatus` and a sibling
 * `agsDataValidationResults` row is written. `blocked` units still
 * persist; the retrieval planner skips them based on
 * `validationStatus`.
 *
 * Hash-based dedupe (D-NKU-4): when an insert arrives with a
 * `(workspaceId, sourceId, contentHash)` that already exists for a
 * non-archived unit, the existing row is reused and `lastValidatedAt`
 * updates. Production callers go through this path so re-ingest is
 * cheap.
 */

import { createHash } from "crypto";
import { and, eq, isNull } from "drizzle-orm";
import { getAsDb } from "../../db/connection";
import {
  agsKnowledgeUnits,
  agsDataValidationResults,
} from "../../../../drizzle/tables/agent-studio";
import {
  KnowledgeUnitContractError,
  type NormalizedKnowledgeUnitInput,
} from "./types";
import { validateUnit } from "./data-validation-service";

export interface InsertUnitInput extends NormalizedKnowledgeUnitInput {
  /** D-UI-2 mandatory: provenance row id. */
  provenanceId: number;
}

export interface InsertUnitResult {
  unitId: number;
  validationStatus: "ok" | "warn" | "blocked";
  reused: boolean;
  contentHash: string;
}

export async function insertUnit(
  input: InsertUnitInput,
): Promise<InsertUnitResult> {
  const db = getAsDb();
  if (!db) throw new Error("ASDB unavailable");

  // ── Contract checks (D-NKU-3 + D-UI-2) ──
  if (!input.contentText || input.contentText.trim().length === 0) {
    throw new KnowledgeUnitContractError(
      "missing_content_text",
      "contentText is required (D-NKU-3 canonical projection)",
    );
  }
  if (!input.permissionContext) {
    throw new KnowledgeUnitContractError(
      "missing_permission",
      "permissionContext is required (D-UI-2)",
    );
  }
  if (input.provenanceId == null) {
    throw new KnowledgeUnitContractError(
      "missing_provenance",
      "provenanceId is required (D-UI-2)",
    );
  }

  const contentHash = createHash("sha256")
    .update(input.contentText)
    .digest("hex");
  const freshnessState = input.freshnessState ?? "fresh";

  // ── Hash dedupe (D-NKU-4) ──
  const existing = await db
    .select()
    .from(agsKnowledgeUnits)
    .where(
      and(
        eq(agsKnowledgeUnits.workspaceId, input.workspaceId),
        eq(agsKnowledgeUnits.sourceId, input.sourceId),
        eq(agsKnowledgeUnits.contentHash, contentHash),
        isNull(agsKnowledgeUnits.archivedAt),
      ),
    )
    .limit(1);

  if (existing.length > 0) {
    const row = existing[0];
    await db
      .update(agsKnowledgeUnits)
      .set({
        lastValidatedAt: new Date(),
        freshnessState: "fresh",
        updatedAt: new Date(),
      })
      .where(eq(agsKnowledgeUnits.id, row.id));
    return {
      unitId: row.id,
      validationStatus: row.validationStatus as "ok" | "warn" | "blocked",
      reused: true,
      contentHash,
    };
  }

  // ── Validate (D-UI-4) ──
  const verdict = validateUnit({ ...input, freshnessState });

  // U5-b.2: project block-severity PII findings to the hot-path
  // column (ADR DD4). The full finding set including warn-severity
  // entries lives in agsDataValidationResults (audit trail); the
  // unit-row projection holds the subset the retrieval filter
  // (U5-b.3) needs to make a O(1) reject decision per chunk.
  const piiFindingsProjection = verdict.findings
    .filter(
      (f) =>
        f.severity === "block" &&
        typeof f.rule === "string" &&
        f.rule.startsWith("pii_"),
    )
    .map((f) => ({
      entity: typeof f.detail?.entity === "string" ? f.detail.entity : f.rule.slice(4),
      start: typeof f.detail?.start === "number" ? f.detail.start : 0,
      end: typeof f.detail?.end === "number" ? f.detail.end : 0,
      severity: "block" as const,
    }));

  // ── Insert validation row first; FK from the unit row ──
  const [validationRow] = await db
    .insert(agsDataValidationResults)
    .values({
      workspaceId: input.workspaceId,
      // unitId is a placeholder — backfilled after the unit insert. We
      // use 0 here and update after; the agsDataValidationResults
      // schema does not enforce a FK, only an index.
      unitId: 0,
      status: verdict.status,
      findings: verdict.findings,
      validatorVersion: verdict.validatorVersion,
    })
    .returning({ id: agsDataValidationResults.id });

  // ── Insert the unit ──
  const [unitRow] = await db
    .insert(agsKnowledgeUnits)
    .values({
      workspaceId: input.workspaceId,
      sourceId: input.sourceId,
      parentUnitId: input.parentUnitId ?? null,
      unitType: input.unitType,
      contentText: input.contentText,
      contentJson: input.contentJson ?? null,
      contentHash,
      sourceLocation: input.sourceLocation ?? null,
      provenanceId: input.provenanceId,
      permissionContext: input.permissionContext,
      freshnessState,
      lastValidatedAt: new Date(),
      validationStatus: verdict.status,
      validationResultId: validationRow.id,
      license: input.license ?? null,
      piiFindings: piiFindingsProjection.length > 0 ? piiFindingsProjection : null,
    })
    .returning({ id: agsKnowledgeUnits.id });

  // Backfill validation row's unitId (best-effort; index-only).
  await db
    .update(agsDataValidationResults)
    .set({ unitId: unitRow.id })
    .where(eq(agsDataValidationResults.id, validationRow.id));

  return {
    unitId: unitRow.id,
    validationStatus: verdict.status,
    reused: false,
    contentHash,
  };
}

/** Archive (non-destructive) — sets `archivedAt`. Retrieval skips archived units. */
export async function archiveUnit(unitId: number): Promise<void> {
  const db = getAsDb();
  if (!db) throw new Error("ASDB unavailable");
  await db
    .update(agsKnowledgeUnits)
    .set({ archivedAt: new Date(), updatedAt: new Date() })
    .where(eq(agsKnowledgeUnits.id, unitId));
}
