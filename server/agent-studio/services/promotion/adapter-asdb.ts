/**
 * Phase 11 — Drizzle-backed PromotionAdapter (ASDB).
 *
 * Implements the {@link PromotionAdapter} interface against Postgres
 * (ASDB) using Drizzle. Pairs with `services/promotion/lifecycle.ts`
 * (pure orchestration) and the tRPC router which calls
 * `_setPromotionAdapter()` at boot.
 *
 * Design:
 *   - validate: verifies note + version exist; rejects duplicate active
 *     promotion for the same (noteVersionId, promotionKind).
 *   - evaluateGovernance: kind-driven policy — high-risk kinds require
 *     approval; safe kinds auto-approve. The runtime context (admin
 *     check, etc.) is not yet wired and lives at the router boundary.
 *   - createDraft: inserts ags_note_promotions row with status=pending.
 *   - activateVersion: inserts ags_note_promotion_versions (active=true)
 *     + decision row + flips ags_note_promotions.status=approved.
 *   - rollback: deactivates current active version, marks the
 *     immediately-previous version as active, writes the decision row,
 *     flips status=rolled_back.
 *   - emitProjectionEvent: inserts ags_note_promotion_audit_events.
 *
 * ADR: docs/architecture/agent-studio-note-promotion-binding-semantics.md
 */

import { and, desc, eq } from "drizzle-orm";
import type {
  PromotionAdapter,
  PromotionGovernanceResult,
  PromotionKind,
  PromotionRequest,
  PromotionStatus,
  PromotionValidationOutcome,
} from "./lifecycle.js";
import {
  agsNotePromotions,
  agsNotePromotionVersions,
  agsNotePromotionDecisions,
  agsNotePromotionAuditEvents,
} from "../../../../drizzle/tables/agent-studio-graph-promotion.js";
import { buildNotePromotionStatusUpdate } from "../retention/lifecycle-transition.js";
import {
  agsVaultNotes,
  agsVaultNoteVersions,
} from "../../../../drizzle/tables/agent-studio-vault.js";

/**
 * The minimum Drizzle DB shape this adapter needs. Defined locally so
 * tests can pass a stub without importing the full asdb connection
 * module (which lazy-creates a real pg pool).
 */
export interface PromotionAdapterDb {
  select: (...args: any[]) => any;
  insert: (...args: any[]) => any;
  update: (...args: any[]) => any;
}

/**
 * Promotion kinds that require approval before runtime activation.
 * Mirrors the high-risk classification in
 * `agent-studio-note-promotion-binding-semantics.md` §3.
 */
const APPROVAL_REQUIRED_KINDS = new Set<PromotionKind>([
  "policy",
  "graph_skill_pack",
  "tool_knowledge",
  "runtime_investigation",
  "graph_entity",
]);

export interface AsdbPromotionAdapterOptions {
  readonly db: PromotionAdapterDb;
  /** Optional override list of kinds that require approval. Defaults to APPROVAL_REQUIRED_KINDS. */
  readonly approvalRequiredKinds?: ReadonlySet<PromotionKind>;
}

export class AsdbPromotionAdapter implements PromotionAdapter {
  private readonly db: PromotionAdapterDb;
  private readonly approvalRequiredKinds: ReadonlySet<PromotionKind>;

  constructor(opts: AsdbPromotionAdapterOptions) {
    this.db = opts.db;
    this.approvalRequiredKinds = opts.approvalRequiredKinds ?? APPROVAL_REQUIRED_KINDS;
  }

  async validate(request: PromotionRequest): Promise<PromotionValidationOutcome> {
    const errors: Array<{ field: string; message: string }> = [];

    const note = await this.db
      .select({ id: agsVaultNotes.id, governanceStatus: agsVaultNotes.governanceStatus })
      .from(agsVaultNotes)
      .where(eq(agsVaultNotes.id, request.noteId))
      .limit(1);
    if (note.length === 0) {
      errors.push({ field: "noteId", message: "note does not exist" });
    } else if (note[0].governanceStatus !== "active") {
      errors.push({ field: "noteId", message: `note governance status is ${note[0].governanceStatus}, not active` });
    }

    const version = await this.db
      .select({ id: agsVaultNoteVersions.id, noteId: agsVaultNoteVersions.noteId })
      .from(agsVaultNoteVersions)
      .where(eq(agsVaultNoteVersions.id, request.noteVersionId))
      .limit(1);
    if (version.length === 0) {
      errors.push({ field: "noteVersionId", message: "note version does not exist" });
    } else if (version[0].noteId !== request.noteId) {
      errors.push({
        field: "noteVersionId",
        message: `version belongs to note ${version[0].noteId}, not ${request.noteId}`,
      });
    }

    const existing = await this.db
      .select({ id: agsNotePromotions.id, status: agsNotePromotions.status })
      .from(agsNotePromotions)
      .where(
        and(
          eq(agsNotePromotions.noteVersionId, request.noteVersionId),
          eq(agsNotePromotions.promotionKind, request.promotionKind),
        ),
      )
      .limit(1);
    if (existing.length > 0 && ["pending", "validating", "in_review", "approved"].includes(existing[0].status)) {
      errors.push({
        field: "promotionKind",
        message: `active or pending promotion already exists for this note version + kind (id=${existing[0].id}, status=${existing[0].status})`,
      });
    }

    return { ok: errors.length === 0, errors };
  }

  async evaluateGovernance(
    request: PromotionRequest,
    validation: PromotionValidationOutcome,
  ): Promise<PromotionGovernanceResult> {
    if (!validation.ok) {
      return { approved: false, approvalRequired: false, reason: "validation_failed" };
    }
    const approvalRequired = this.approvalRequiredKinds.has(request.promotionKind);
    return {
      approved: !approvalRequired,
      approvalRequired,
      reason: approvalRequired ? "high_risk_kind" : "auto_approve",
    };
  }

  async createDraft(request: PromotionRequest): Promise<{ promotionId: number; targetAssetId: number }> {
    const inserted = await this.db
      .insert(agsNotePromotions)
      .values({
        noteId: request.noteId,
        noteVersionId: request.noteVersionId,
        promotionKind: request.promotionKind,
        status: "pending",
        initiatedByUserId: request.initiatedByUserId,
      })
      .returning({ id: agsNotePromotions.id });
    const promotionId = inserted[0].id;

    await this.db.insert(agsNotePromotionAuditEvents).values({
      promotionId,
      eventKind: "draft_created",
      metadata: { rationale: request.rationale ?? null, kind: request.promotionKind },
    });

    // Phase 11 MVP: target asset binding deferred to activate; stub returns 0.
    return { promotionId, targetAssetId: 0 };
  }

  async activateVersion(
    promotionId: number,
    decidedByUserId: number,
  ): Promise<{ versionId: number }> {
    // Find the next monotonic version (count of existing versions + 1).
    const existing = await this.db
      .select({ id: agsNotePromotionVersions.id })
      .from(agsNotePromotionVersions)
      .where(eq(agsNotePromotionVersions.promotionId, promotionId));
    const nextVersionLabel = `v${existing.length + 1}`;

    // Deactivate any existing active version row for this promotion.
    await this.db
      .update(agsNotePromotionVersions)
      .set({ active: false })
      .where(
        and(
          eq(agsNotePromotionVersions.promotionId, promotionId),
          eq(agsNotePromotionVersions.active, true),
        ),
      );

    const inserted = await this.db
      .insert(agsNotePromotionVersions)
      .values({
        promotionId,
        version: nextVersionLabel,
        active: true,
      })
      .returning({ id: agsNotePromotionVersions.id });
    const versionId = inserted[0].id;

    await this.db.insert(agsNotePromotionDecisions).values({
      promotionId,
      decision: "approve",
      decidedByUserId,
    });

    const approvedTransition = buildNotePromotionStatusUpdate({
      status: "approved",
      reason: `approved by user ${decidedByUserId}`,
    });
    await this.db
      .update(agsNotePromotions)
      .set({
        status: approvedTransition.status,
        approvedByUserId: decidedByUserId,
        approvedAt: new Date(),
        updatedAt: new Date(),
        terminalAt: approvedTransition.terminalAt,
        terminalReason: approvedTransition.terminalReason,
      })
      .where(eq(agsNotePromotions.id, promotionId));

    return { versionId };
  }

  async rollback(
    promotionId: number,
    decidedByUserId: number,
  ): Promise<{ activatedVersionId: number }> {
    const versions = await this.db
      .select({
        id: agsNotePromotionVersions.id,
        active: agsNotePromotionVersions.active,
        createdAt: agsNotePromotionVersions.createdAt,
      })
      .from(agsNotePromotionVersions)
      .where(eq(agsNotePromotionVersions.promotionId, promotionId))
      .orderBy(desc(agsNotePromotionVersions.createdAt));

    if (versions.length < 2) {
      throw new Error(
        `cannot rollback promotion ${promotionId}: requires >= 2 versions, has ${versions.length}`,
      );
    }

    // Deactivate the current active version, activate the previous one.
    const current = versions[0];
    const previous = versions[1];

    await this.db
      .update(agsNotePromotionVersions)
      .set({ active: false })
      .where(eq(agsNotePromotionVersions.id, current.id));

    await this.db
      .update(agsNotePromotionVersions)
      .set({ active: true })
      .where(eq(agsNotePromotionVersions.id, previous.id));

    await this.db.insert(agsNotePromotionDecisions).values({
      promotionId,
      decision: "rollback",
      decidedByUserId,
    });

    const rollbackTransition = buildNotePromotionStatusUpdate({
      status: "rolled_back",
      reason: `rolled back by user ${decidedByUserId}`,
    });
    await this.db
      .update(agsNotePromotions)
      .set({
        status: rollbackTransition.status,
        rolledBackAt: new Date(),
        updatedAt: new Date(),
        terminalAt: rollbackTransition.terminalAt,
        terminalReason: rollbackTransition.terminalReason,
      })
      .where(eq(agsNotePromotions.id, promotionId));

    return { activatedVersionId: previous.id };
  }

  async emitProjectionEvent(promotionId: number, status: PromotionStatus): Promise<void> {
    await this.db.insert(agsNotePromotionAuditEvents).values({
      promotionId,
      eventKind: `projection.${status}`,
      metadata: { status },
    });
  }
}
