/**
 * Live-ASDB integration tests for approval-lifecycle retention.
 *
 * Covers the full Track 1 + Track 2 + holds-management surface (PRs
 * #682-#702) against a real Postgres ASDB:
 *
 *   1. publish-requests sweep — happy path, age filter, blockers
 *      (ACTIVE_RELEASE_LINK, LEGAL_HOLD, NON_TERMINAL_STATE,
 *      MINIMUM_RETENTION_WINDOW_NOT_ELAPSED)
 *   2. approval-steps sweep — happy path, parent-lifecycle invariant
 *      (PENDING_APPROVAL_CHAIN), parent-hold inheritance (K1 regression)
 *   3. note-promotions sweep — happy path, children-first cascade
 *      (ACTIVE_PROMOTION_VERSION blocker)
 *   4. release-audit-refs archival — list candidates, archive a row,
 *      7-year floor enforcement, deletion blocked
 *   5. holds management — set / release roundtrip
 *
 * Sentinel id range: 999_900 + offset. All test rows are tagged via
 * `targetEnvironment="apl-retention-test"` or equivalent so the
 * afterAll cleanup can delete them without scanning more than needed.
 *
 * Skip semantics match the existing `approval-gate.integration.test.ts`:
 * runs only when ASDB env is configured. In staging-integration mode
 * the skip flips to a hard run.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, inArray, isNull, lte } from "drizzle-orm";

import { getAsDb } from "../../../server/agent-studio/db/connection";
import {
  agsAgentReleases,
  agsApprovalSteps,
  agsLifecycleHolds,
  agsPublishRequests,
  agsReleaseAuditRefs,
} from "../../../drizzle/tables/agent-studio";
import {
  agsNotePromotions,
  agsNotePromotionAuditEvents,
  agsNotePromotionDecisions,
  agsNotePromotionVersions,
} from "../../../drizzle/tables/agent-studio-graph-promotion";
import { prunePublishRequestsRetention } from "../../../server/agent-studio/services/publish-requests-retention";
import { pruneApprovalStepsRetention } from "../../../server/agent-studio/services/approval-steps-retention";
import { pruneNotePromotionsRetention } from "../../../server/agent-studio/services/note-promotions-retention";
import {
  archiveReleaseAuditRef,
  deleteReleaseAuditRef,
  listReleaseAuditRefsArchivalCandidates,
  RELEASE_AUDIT_REFS_MIN_RETENTION_MS,
} from "../../../server/agent-studio/services/release-audit-refs-archival";
import {
  listLifecycleHoldsForEntity,
  releaseLifecycleHold,
  setLifecycleHold,
} from "../../../server/agent-studio/services/retention/lifecycle-holds-management";

const hasDb = (): boolean =>
  Boolean(process.env.DATABASE_URL || process.env.DATABASE_URL_ASDB);

// Sentinel constants for test-row identification and cleanup.
const SENTINEL_AGENT_ID = 999_900;
const SENTINEL_NOTE_ID = 999_910;
const SENTINEL_NOTE_VERSION_ID = 999_920;
const SENTINEL_TARGET_ENV = "apl-retention-test";
const SENTINEL_AUDIT_SYSTEM = "apl-retention-test-audit";

// Time anchors
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const NINETY_DAYS_MS = 90 * ONE_DAY_MS;
const HUNDRED_DAYS_AGO = new Date(Date.now() - 100 * ONE_DAY_MS);
const ONE_DAY_AGO = new Date(Date.now() - ONE_DAY_MS);
const SEVEN_YEARS_AGO = new Date(
  Date.now() - RELEASE_AUDIT_REFS_MIN_RETENTION_MS - ONE_DAY_MS,
);
const FIVE_YEARS_AGO = new Date(
  Date.now() - 5 * 365 * 24 * 60 * 60 * 1000,
);

async function cleanupAll() {
  const db = getAsDb();
  if (!db) return;

  // Clean note-promotion children first (FK), then parent
  // Children FK to promotionId — find our sentinel promotions and cascade
  const promos = await db
    .select({ id: agsNotePromotions.id })
    .from(agsNotePromotions)
    .where(eq(agsNotePromotions.noteId, SENTINEL_NOTE_ID));
  if (promos.length > 0) {
    const promoIds = promos.map((p) => p.id);
    await db
      .delete(agsNotePromotionVersions)
      .where(inArray(agsNotePromotionVersions.promotionId, promoIds));
    await db
      .delete(agsNotePromotionDecisions)
      .where(inArray(agsNotePromotionDecisions.promotionId, promoIds));
    await db
      .delete(agsNotePromotionAuditEvents)
      .where(inArray(agsNotePromotionAuditEvents.promotionId, promoIds));
    await db
      .delete(agsNotePromotions)
      .where(eq(agsNotePromotions.noteId, SENTINEL_NOTE_ID));
  }

  // Approval steps → publish-requests
  const reqs = await db
    .select({ id: agsPublishRequests.id })
    .from(agsPublishRequests)
    .where(eq(agsPublishRequests.agentId, SENTINEL_AGENT_ID));
  if (reqs.length > 0) {
    const reqIds = reqs.map((r) => r.id);
    await db
      .delete(agsApprovalSteps)
      .where(inArray(agsApprovalSteps.publishRequestId, reqIds));
    await db
      .delete(agsPublishRequests)
      .where(eq(agsPublishRequests.agentId, SENTINEL_AGENT_ID));
  }

  // Releases + audit refs
  const releases = await db
    .select({ id: agsAgentReleases.id })
    .from(agsAgentReleases)
    .where(eq(agsAgentReleases.agentId, SENTINEL_AGENT_ID));
  if (releases.length > 0) {
    const releaseIds = releases.map((r) => r.id);
    await db
      .delete(agsReleaseAuditRefs)
      .where(inArray(agsReleaseAuditRefs.releaseId, releaseIds));
    await db
      .delete(agsAgentReleases)
      .where(eq(agsAgentReleases.agentId, SENTINEL_AGENT_ID));
  }

  // Audit refs not linked to an agent (extra safety): match by auditSystem
  await db
    .delete(agsReleaseAuditRefs)
    .where(eq(agsReleaseAuditRefs.auditSystem, SENTINEL_AUDIT_SYSTEM));

  // Lifecycle holds for our sentinel entities
  await db
    .delete(agsLifecycleHolds)
    .where(eq(agsLifecycleHolds.entityType, "ags_publish_requests"));
  // Note: scoped by entityType. Each test seeds + cleans its own row id.
  // We re-delete on every cleanup to keep the table tidy on flaky runs.
}

describe.skipIf(!hasDb())(
  "approval-lifecycle retention — live-ASDB integration",
  () => {
    beforeAll(async () => {
      await cleanupAll();
    });
    afterAll(async () => {
      await cleanupAll();
    });

    // ── 1. publish-requests sweep ────────────────────────────────────────

    describe("prunePublishRequestsRetention", () => {
      it("deletes a row that is terminal + old + has no active link / no hold", async () => {
        const db = getAsDb()!;
        const [inserted] = await db
          .insert(agsPublishRequests)
          .values({
            agentId: SENTINEL_AGENT_ID,
            versionId: 999_001,
            targetEnvironment: SENTINEL_TARGET_ENV,
            state: "approved",
            terminalAt: HUNDRED_DAYS_AGO,
            terminalReason: "test happy path",
          })
          .returning({ id: agsPublishRequests.id });

        const cutoff = new Date(Date.now() - NINETY_DAYS_MS);
        const result = await prunePublishRequestsRetention({
          olderThan: cutoff,
          agentId: SENTINEL_AGENT_ID,
        });

        expect(result.deletedCount).toBeGreaterThanOrEqual(1);

        const remaining = await db
          .select({ id: agsPublishRequests.id })
          .from(agsPublishRequests)
          .where(eq(agsPublishRequests.id, inserted.id));
        expect(remaining.length).toBe(0);
      });

      it("preserves a row whose terminalAt is too recent (MINIMUM_RETENTION_WINDOW_NOT_ELAPSED)", async () => {
        const db = getAsDb()!;
        const [inserted] = await db
          .insert(agsPublishRequests)
          .values({
            agentId: SENTINEL_AGENT_ID,
            versionId: 999_002,
            targetEnvironment: SENTINEL_TARGET_ENV,
            state: "approved",
            terminalAt: ONE_DAY_AGO,
            terminalReason: "too recent",
          })
          .returning({ id: agsPublishRequests.id });

        const cutoff = new Date(Date.now() - NINETY_DAYS_MS);
        const result = await prunePublishRequestsRetention({
          olderThan: cutoff,
          agentId: SENTINEL_AGENT_ID,
        });
        // Candidate query filters by terminalAt < cutoff, so a recent-
        // terminal row is below the candidate threshold. Either way: row
        // still exists.
        const remaining = await db
          .select({ id: agsPublishRequests.id })
          .from(agsPublishRequests)
          .where(eq(agsPublishRequests.id, inserted.id));
        expect(remaining.length).toBe(1);
        void result;
      });

      it("preserves a row in NON_TERMINAL_STATE (pending) regardless of age", async () => {
        const db = getAsDb()!;
        const [inserted] = await db
          .insert(agsPublishRequests)
          .values({
            agentId: SENTINEL_AGENT_ID,
            versionId: 999_003,
            targetEnvironment: SENTINEL_TARGET_ENV,
            state: "pending",
            // terminalAt explicitly NULL — pending row should never have it
          })
          .returning({ id: agsPublishRequests.id });

        const cutoff = new Date(Date.now() - NINETY_DAYS_MS);
        await prunePublishRequestsRetention({
          olderThan: cutoff,
          agentId: SENTINEL_AGENT_ID,
        });

        const remaining = await db
          .select({ id: agsPublishRequests.id })
          .from(agsPublishRequests)
          .where(eq(agsPublishRequests.id, inserted.id));
        expect(remaining.length).toBe(1);
      });

      it("preserves a row whose linked release has archivedAt=null (ACTIVE_RELEASE_LINK)", async () => {
        const db = getAsDb()!;
        // Active release: archivedAt = null
        const [release] = await db
          .insert(agsAgentReleases)
          .values({
            agentId: SENTINEL_AGENT_ID,
            versionId: 999_004,
            targetEnvironment: SENTINEL_TARGET_ENV,
            state: "published",
            // archivedAt deliberately null
          })
          .returning({ id: agsAgentReleases.id });
        void release;

        // Publish request linked by (agentId, versionId, targetEnvironment)
        const [pubReq] = await db
          .insert(agsPublishRequests)
          .values({
            agentId: SENTINEL_AGENT_ID,
            versionId: 999_004,
            targetEnvironment: SENTINEL_TARGET_ENV,
            state: "approved",
            terminalAt: HUNDRED_DAYS_AGO,
            terminalReason: "linked to active release",
          })
          .returning({ id: agsPublishRequests.id });

        const cutoff = new Date(Date.now() - NINETY_DAYS_MS);
        const result = await prunePublishRequestsRetention({
          olderThan: cutoff,
          agentId: SENTINEL_AGENT_ID,
        });
        expect(result.preservedCount).toBeGreaterThanOrEqual(1);
        expect(result.blockerCounts.ACTIVE_RELEASE_LINK ?? 0).toBeGreaterThanOrEqual(1);

        const remaining = await db
          .select({ id: agsPublishRequests.id })
          .from(agsPublishRequests)
          .where(eq(agsPublishRequests.id, pubReq.id));
        expect(remaining.length).toBe(1);
      });

      it("preserves a row under LEGAL_HOLD", async () => {
        const db = getAsDb()!;
        const [pubReq] = await db
          .insert(agsPublishRequests)
          .values({
            agentId: SENTINEL_AGENT_ID,
            versionId: 999_005,
            targetEnvironment: SENTINEL_TARGET_ENV,
            state: "rejected",
            terminalAt: HUNDRED_DAYS_AGO,
            terminalReason: "test legal hold",
          })
          .returning({ id: agsPublishRequests.id });

        await setLifecycleHold({
          entityType: "ags_publish_requests",
          entityId: pubReq.id,
          holdType: "legal_hold",
          reason: "integration-test active litigation",
          setBy: 1,
        });

        const cutoff = new Date(Date.now() - NINETY_DAYS_MS);
        const result = await prunePublishRequestsRetention({
          olderThan: cutoff,
          agentId: SENTINEL_AGENT_ID,
        });
        expect(result.blockerCounts.LEGAL_HOLD ?? 0).toBeGreaterThanOrEqual(1);

        const remaining = await db
          .select({ id: agsPublishRequests.id })
          .from(agsPublishRequests)
          .where(eq(agsPublishRequests.id, pubReq.id));
        expect(remaining.length).toBe(1);
      });
    });

    // ── 2. approval-steps sweep ──────────────────────────────────────────

    describe("pruneApprovalStepsRetention", () => {
      it("happy path: child terminal + parent terminal + window elapsed → deleted", async () => {
        const db = getAsDb()!;
        const [parent] = await db
          .insert(agsPublishRequests)
          .values({
            agentId: SENTINEL_AGENT_ID,
            versionId: 999_010,
            targetEnvironment: SENTINEL_TARGET_ENV,
            state: "approved",
            terminalAt: HUNDRED_DAYS_AGO,
            terminalReason: "step-test parent",
          })
          .returning({ id: agsPublishRequests.id });
        // Archive the linked release so ACTIVE_RELEASE_LINK doesn't block
        await db
          .insert(agsAgentReleases)
          .values({
            agentId: SENTINEL_AGENT_ID,
            versionId: 999_010,
            targetEnvironment: SENTINEL_TARGET_ENV,
            state: "published",
            archivedAt: HUNDRED_DAYS_AGO,
          });
        const [step] = await db
          .insert(agsApprovalSteps)
          .values({
            publishRequestId: parent.id,
            stepOrder: 1,
            approverRole: "owner",
            state: "approved",
            terminalAt: HUNDRED_DAYS_AGO,
            terminalReason: "step happy path",
          })
          .returning({ id: agsApprovalSteps.id });

        const cutoff = new Date(Date.now() - NINETY_DAYS_MS);
        const result = await pruneApprovalStepsRetention({
          olderThan: cutoff,
          publishRequestId: parent.id,
        });
        expect(result.deletedCount).toBeGreaterThanOrEqual(1);

        const remaining = await db
          .select({ id: agsApprovalSteps.id })
          .from(agsApprovalSteps)
          .where(eq(agsApprovalSteps.id, step.id));
        expect(remaining.length).toBe(0);
      });

      it("preserves child when parent is non-terminal (PENDING_APPROVAL_CHAIN)", async () => {
        const db = getAsDb()!;
        const [parent] = await db
          .insert(agsPublishRequests)
          .values({
            agentId: SENTINEL_AGENT_ID,
            versionId: 999_011,
            targetEnvironment: SENTINEL_TARGET_ENV,
            state: "pending",
            // No terminalAt — parent still in flight
          })
          .returning({ id: agsPublishRequests.id });

        // Even if the step itself is terminal, parent gates retention
        const [step] = await db
          .insert(agsApprovalSteps)
          .values({
            publishRequestId: parent.id,
            stepOrder: 1,
            approverRole: "owner",
            state: "approved",
            terminalAt: HUNDRED_DAYS_AGO,
          })
          .returning({ id: agsApprovalSteps.id });

        const cutoff = new Date(Date.now() - NINETY_DAYS_MS);
        const result = await pruneApprovalStepsRetention({
          olderThan: cutoff,
          publishRequestId: parent.id,
        });
        expect(result.blockerCounts.PENDING_APPROVAL_CHAIN ?? 0).toBeGreaterThanOrEqual(1);

        const remaining = await db
          .select({ id: agsApprovalSteps.id })
          .from(agsApprovalSteps)
          .where(eq(agsApprovalSteps.id, step.id));
        expect(remaining.length).toBe(1);
      });

      it("REGRESSION (K1): parent-level legal_hold protects child approval-step", async () => {
        const db = getAsDb()!;
        const [parent] = await db
          .insert(agsPublishRequests)
          .values({
            agentId: SENTINEL_AGENT_ID,
            versionId: 999_012,
            targetEnvironment: SENTINEL_TARGET_ENV,
            state: "approved",
            terminalAt: HUNDRED_DAYS_AGO,
            terminalReason: "parent-hold inheritance test",
          })
          .returning({ id: agsPublishRequests.id });
        await db
          .insert(agsAgentReleases)
          .values({
            agentId: SENTINEL_AGENT_ID,
            versionId: 999_012,
            targetEnvironment: SENTINEL_TARGET_ENV,
            state: "published",
            archivedAt: HUNDRED_DAYS_AGO,
          });
        const [step] = await db
          .insert(agsApprovalSteps)
          .values({
            publishRequestId: parent.id,
            stepOrder: 1,
            approverRole: "owner",
            state: "approved",
            terminalAt: HUNDRED_DAYS_AGO,
          })
          .returning({ id: agsApprovalSteps.id });

        // Place hold on the PARENT, not on the step.
        await setLifecycleHold({
          entityType: "ags_publish_requests",
          entityId: parent.id,
          holdType: "legal_hold",
          reason: "regression test for K1 (PR #701)",
          setBy: 1,
        });

        const cutoff = new Date(Date.now() - NINETY_DAYS_MS);
        const result = await pruneApprovalStepsRetention({
          olderThan: cutoff,
          publishRequestId: parent.id,
        });
        // The step itself has no direct hold; pre-#701 this would have
        // deleted the step. Post-#701 the parent's legal_hold inherits
        // and preserves the audit-trail row.
        expect(result.blockerCounts.LEGAL_HOLD ?? 0).toBeGreaterThanOrEqual(1);

        const remaining = await db
          .select({ id: agsApprovalSteps.id })
          .from(agsApprovalSteps)
          .where(eq(agsApprovalSteps.id, step.id));
        expect(remaining.length).toBe(1);
      });
    });

    // ── 3. note-promotions sweep (cascade) ──────────────────────────────

    describe("pruneNotePromotionsRetention", () => {
      it("cascade-deletes versions + decisions + audit_events with the parent", async () => {
        const db = getAsDb()!;
        const [promo] = await db
          .insert(agsNotePromotions)
          .values({
            noteId: SENTINEL_NOTE_ID,
            noteVersionId: SENTINEL_NOTE_VERSION_ID,
            promotionKind: "knowledge_unit",
            status: "approved",
            terminalAt: HUNDRED_DAYS_AGO,
            terminalReason: "cascade test",
          })
          .returning({ id: agsNotePromotions.id });

        const [version] = await db
          .insert(agsNotePromotionVersions)
          .values({
            promotionId: promo.id,
            version: "v1",
            active: false, // not active → no ACTIVE_PROMOTION_VERSION blocker
          })
          .returning({ id: agsNotePromotionVersions.id });

        const [decision] = await db
          .insert(agsNotePromotionDecisions)
          .values({
            promotionId: promo.id,
            decision: "approve",
            decidedByUserId: 1,
          })
          .returning({ id: agsNotePromotionDecisions.id });

        const [auditEvent] = await db
          .insert(agsNotePromotionAuditEvents)
          .values({
            promotionId: promo.id,
            eventKind: "projection.approved",
            metadata: { test: true },
          })
          .returning({ id: agsNotePromotionAuditEvents.id });

        const cutoff = new Date(Date.now() - NINETY_DAYS_MS);
        const result = await pruneNotePromotionsRetention({
          olderThan: cutoff,
          promotionKind: "knowledge_unit",
        });
        expect(result.deletedCount).toBeGreaterThanOrEqual(1);
        expect(result.cascadeDeletedCounts.versions).toBeGreaterThanOrEqual(1);
        expect(result.cascadeDeletedCounts.decisions).toBeGreaterThanOrEqual(1);
        expect(result.cascadeDeletedCounts.auditEvents).toBeGreaterThanOrEqual(1);

        // All four rows gone
        const parentLeft = await db
          .select({ id: agsNotePromotions.id })
          .from(agsNotePromotions)
          .where(eq(agsNotePromotions.id, promo.id));
        const versionLeft = await db
          .select({ id: agsNotePromotionVersions.id })
          .from(agsNotePromotionVersions)
          .where(eq(agsNotePromotionVersions.id, version.id));
        const decisionLeft = await db
          .select({ id: agsNotePromotionDecisions.id })
          .from(agsNotePromotionDecisions)
          .where(eq(agsNotePromotionDecisions.id, decision.id));
        const auditLeft = await db
          .select({ id: agsNotePromotionAuditEvents.id })
          .from(agsNotePromotionAuditEvents)
          .where(eq(agsNotePromotionAuditEvents.id, auditEvent.id));
        expect(parentLeft.length).toBe(0);
        expect(versionLeft.length).toBe(0);
        expect(decisionLeft.length).toBe(0);
        expect(auditLeft.length).toBe(0);
      });

      it("ACTIVE_PROMOTION_VERSION preserves the promotion + its cascade", async () => {
        const db = getAsDb()!;
        const [promo] = await db
          .insert(agsNotePromotions)
          .values({
            noteId: SENTINEL_NOTE_ID,
            noteVersionId: SENTINEL_NOTE_VERSION_ID + 1,
            promotionKind: "graph_skill_pack",
            status: "rolled_back",
            terminalAt: HUNDRED_DAYS_AGO,
          })
          .returning({ id: agsNotePromotions.id });

        // Active version — should block retention
        await db.insert(agsNotePromotionVersions).values({
          promotionId: promo.id,
          version: "v1",
          active: true,
        });

        const cutoff = new Date(Date.now() - NINETY_DAYS_MS);
        const result = await pruneNotePromotionsRetention({
          olderThan: cutoff,
          promotionKind: "graph_skill_pack",
        });
        expect(result.blockerCounts.ACTIVE_PROMOTION_VERSION ?? 0).toBeGreaterThanOrEqual(1);

        const remaining = await db
          .select({ id: agsNotePromotions.id })
          .from(agsNotePromotions)
          .where(eq(agsNotePromotions.id, promo.id));
        expect(remaining.length).toBe(1);
      });
    });

    // ── 4. release-audit-refs archival ──────────────────────────────────

    describe("release-audit-refs archival", () => {
      it("listArchivalCandidates returns rows past 7y on archived releases", async () => {
        const db = getAsDb()!;
        const [release] = await db
          .insert(agsAgentReleases)
          .values({
            agentId: SENTINEL_AGENT_ID,
            versionId: 999_020,
            targetEnvironment: SENTINEL_TARGET_ENV,
            state: "published",
            archivedAt: SEVEN_YEARS_AGO,
          })
          .returning({ id: agsAgentReleases.id });

        const [ref] = await db
          .insert(agsReleaseAuditRefs)
          .values({
            releaseId: release.id,
            auditSystem: SENTINEL_AUDIT_SYSTEM,
            externalRef: "TEST-7Y-OLD",
            createdAt: SEVEN_YEARS_AGO,
          })
          .returning({ id: agsReleaseAuditRefs.id });

        const candidates = await listReleaseAuditRefsArchivalCandidates({
          minRetentionMs: RELEASE_AUDIT_REFS_MIN_RETENTION_MS,
          limit: 100,
        });
        const found = candidates.find((c) => c.id === ref.id);
        expect(found).toBeDefined();
        expect(found?.auditSystem).toBe(SENTINEL_AUDIT_SYSTEM);
      });

      it("excludes rows on still-active releases (release archivedAt null)", async () => {
        const db = getAsDb()!;
        const [release] = await db
          .insert(agsAgentReleases)
          .values({
            agentId: SENTINEL_AGENT_ID,
            versionId: 999_021,
            targetEnvironment: SENTINEL_TARGET_ENV,
            state: "published",
            // archivedAt deliberately null
          })
          .returning({ id: agsAgentReleases.id });

        const [ref] = await db
          .insert(agsReleaseAuditRefs)
          .values({
            releaseId: release.id,
            auditSystem: SENTINEL_AUDIT_SYSTEM,
            externalRef: "TEST-LIVE-RELEASE",
            createdAt: SEVEN_YEARS_AGO,
          })
          .returning({ id: agsReleaseAuditRefs.id });

        const candidates = await listReleaseAuditRefsArchivalCandidates({
          minRetentionMs: RELEASE_AUDIT_REFS_MIN_RETENTION_MS,
          limit: 100,
        });
        const found = candidates.find((c) => c.id === ref.id);
        expect(found).toBeUndefined();
      });

      it("archiveReleaseAuditRef populates archive columns; row preserved", async () => {
        const db = getAsDb()!;
        const [release] = await db
          .insert(agsAgentReleases)
          .values({
            agentId: SENTINEL_AGENT_ID,
            versionId: 999_022,
            targetEnvironment: SENTINEL_TARGET_ENV,
            state: "published",
            archivedAt: SEVEN_YEARS_AGO,
          })
          .returning({ id: agsAgentReleases.id });

        const [ref] = await db
          .insert(agsReleaseAuditRefs)
          .values({
            releaseId: release.id,
            auditSystem: SENTINEL_AUDIT_SYSTEM,
            externalRef: "TEST-ARCHIVE-ME",
            createdAt: SEVEN_YEARS_AGO,
          })
          .returning({ id: agsReleaseAuditRefs.id });

        const result = await archiveReleaseAuditRef({
          id: ref.id,
          complianceApprovalRef: "INTEGRATION-TEST-TICKET-1",
          archivedBy: 1,
          reason: "integration test archive action",
        });
        expect(result.archived).toBe(true);
        expect(result.id).toBe(ref.id);
        expect(result.archivedAt).toBeInstanceOf(Date);

        // Row still exists; archive cols populated
        const [post] = await db
          .select({
            id: agsReleaseAuditRefs.id,
            archivedAt: agsReleaseAuditRefs.archivedAt,
            archivedBy: agsReleaseAuditRefs.archivedBy,
            archiveReason: agsReleaseAuditRefs.archiveReason,
            complianceApprovalRef: agsReleaseAuditRefs.complianceApprovalRef,
          })
          .from(agsReleaseAuditRefs)
          .where(eq(agsReleaseAuditRefs.id, ref.id));
        expect(post).toBeDefined();
        expect(post.archivedAt).not.toBeNull();
        expect(post.archivedBy).toBe(1);
        expect(post.archiveReason).toBe("integration test archive action");
        expect(post.complianceApprovalRef).toBe("INTEGRATION-TEST-TICKET-1");
      });

      it("double-archive of the same row returns archived:false", async () => {
        const db = getAsDb()!;
        const [release] = await db
          .insert(agsAgentReleases)
          .values({
            agentId: SENTINEL_AGENT_ID,
            versionId: 999_023,
            targetEnvironment: SENTINEL_TARGET_ENV,
            state: "published",
            archivedAt: SEVEN_YEARS_AGO,
          })
          .returning({ id: agsAgentReleases.id });

        const [ref] = await db
          .insert(agsReleaseAuditRefs)
          .values({
            releaseId: release.id,
            auditSystem: SENTINEL_AUDIT_SYSTEM,
            externalRef: "TEST-DOUBLE-ARCHIVE",
            createdAt: SEVEN_YEARS_AGO,
          })
          .returning({ id: agsReleaseAuditRefs.id });

        const first = await archiveReleaseAuditRef({
          id: ref.id,
          complianceApprovalRef: "TICKET-DOUBLE",
          archivedBy: 1,
          reason: "first archive",
        });
        expect(first.archived).toBe(true);

        const second = await archiveReleaseAuditRef({
          id: ref.id,
          complianceApprovalRef: "TICKET-DOUBLE",
          archivedBy: 1,
          reason: "second archive should be idempotent",
        });
        expect(second.archived).toBe(false);
      });

      it("deleteReleaseAuditRef always throws (policy)", async () => {
        await expect(
          deleteReleaseAuditRef({
            id: 1,
            complianceApprovalRef: "TICKET",
            deletedBy: 1,
          }),
        ).rejects.toThrow(/blocked by policy/);
      });

      it("listArchivalCandidates rejects sub-7y window", async () => {
        await expect(
          listReleaseAuditRefsArchivalCandidates({
            minRetentionMs:
              RELEASE_AUDIT_REFS_MIN_RETENTION_MS - 1,
          }),
        ).rejects.toThrow(/7-year floor/);
      });

      it("hold on a release-audit-ref excludes it from candidates", async () => {
        const db = getAsDb()!;
        const [release] = await db
          .insert(agsAgentReleases)
          .values({
            agentId: SENTINEL_AGENT_ID,
            versionId: 999_024,
            targetEnvironment: SENTINEL_TARGET_ENV,
            state: "published",
            archivedAt: SEVEN_YEARS_AGO,
          })
          .returning({ id: agsAgentReleases.id });

        const [ref] = await db
          .insert(agsReleaseAuditRefs)
          .values({
            releaseId: release.id,
            auditSystem: SENTINEL_AUDIT_SYSTEM,
            externalRef: "TEST-HELD-FROM-ARCHIVE",
            createdAt: SEVEN_YEARS_AGO,
          })
          .returning({ id: agsReleaseAuditRefs.id });

        await setLifecycleHold({
          entityType: "ags_release_audit_refs",
          entityId: ref.id,
          holdType: "legal_hold",
          reason: "active litigation against this audit ref",
          setBy: 1,
        });

        const candidates = await listReleaseAuditRefsArchivalCandidates({
          minRetentionMs: RELEASE_AUDIT_REFS_MIN_RETENTION_MS,
          limit: 100,
        });
        const found = candidates.find((c) => c.id === ref.id);
        expect(found).toBeUndefined();

        // cleanup the cross-table hold (cleanupAll only clears
        // ags_publish_requests holds)
        await db
          .delete(agsLifecycleHolds)
          .where(
            and(
              eq(agsLifecycleHolds.entityType, "ags_release_audit_refs"),
              eq(agsLifecycleHolds.entityId, ref.id),
            ),
          );
      });
    });

    // ── 5. holds management roundtrip ───────────────────────────────────

    describe("holds management roundtrip", () => {
      it("set → list-active → release → list-shows-released", async () => {
        const db = getAsDb()!;
        const [pubReq] = await db
          .insert(agsPublishRequests)
          .values({
            agentId: SENTINEL_AGENT_ID,
            versionId: 999_030,
            targetEnvironment: SENTINEL_TARGET_ENV,
            state: "pending",
          })
          .returning({ id: agsPublishRequests.id });

        const setResult = await setLifecycleHold({
          entityType: "ags_publish_requests",
          entityId: pubReq.id,
          holdType: "audit_hold",
          reason: "integration test roundtrip",
          setBy: 1,
        });
        expect(setResult.set).toBe(true);
        expect(setResult.holdId).not.toBeNull();

        let holds = await listLifecycleHoldsForEntity({
          entityType: "ags_publish_requests",
          entityId: pubReq.id,
        });
        expect(holds.length).toBeGreaterThanOrEqual(1);
        const active = holds.find((h) => h.id === setResult.holdId);
        expect(active?.releasedAt).toBeNull();
        expect(active?.holdType).toBe("audit_hold");

        const releaseResult = await releaseLifecycleHold({
          holdId: setResult.holdId!,
          releasedBy: 1,
          releaseNote: "integration test release",
        });
        expect(releaseResult.released).toBe(true);

        holds = await listLifecycleHoldsForEntity({
          entityType: "ags_publish_requests",
          entityId: pubReq.id,
        });
        const released = holds.find((h) => h.id === setResult.holdId);
        expect(released?.releasedAt).not.toBeNull();
        expect(released?.releaseNote).toBe("integration test release");
      });

      it("released hold does not block retention", async () => {
        const db = getAsDb()!;
        const [pubReq] = await db
          .insert(agsPublishRequests)
          .values({
            agentId: SENTINEL_AGENT_ID,
            versionId: 999_031,
            targetEnvironment: SENTINEL_TARGET_ENV,
            state: "approved",
            terminalAt: HUNDRED_DAYS_AGO,
          })
          .returning({ id: agsPublishRequests.id });

        const setResult = await setLifecycleHold({
          entityType: "ags_publish_requests",
          entityId: pubReq.id,
          holdType: "governance_hold",
          reason: "transient hold",
          setBy: 1,
        });
        await releaseLifecycleHold({
          holdId: setResult.holdId!,
          releasedBy: 1,
          releaseNote: "matter resolved",
        });

        const cutoff = new Date(Date.now() - NINETY_DAYS_MS);
        const result = await prunePublishRequestsRetention({
          olderThan: cutoff,
          agentId: SENTINEL_AGENT_ID,
        });
        // Row should be deletable now
        expect(result.deletedCount).toBeGreaterThanOrEqual(1);
        expect(result.blockerCounts.GOVERNANCE_HOLD ?? 0).toBe(0);
      });

      it("hold with holdUntil in the past is no longer active", async () => {
        const db = getAsDb()!;
        const [pubReq] = await db
          .insert(agsPublishRequests)
          .values({
            agentId: SENTINEL_AGENT_ID,
            versionId: 999_032,
            targetEnvironment: SENTINEL_TARGET_ENV,
            state: "approved",
            terminalAt: HUNDRED_DAYS_AGO,
          })
          .returning({ id: agsPublishRequests.id });

        // Set hold expiring in 1ms (effectively immediately past)
        const nearFuture = new Date(Date.now() + 50);
        const setResult = await setLifecycleHold({
          entityType: "ags_publish_requests",
          entityId: pubReq.id,
          holdType: "legal_hold",
          reason: "expires-now test",
          setBy: 1,
          holdUntil: nearFuture,
        });
        expect(setResult.set).toBe(true);

        // Wait briefly for expiry
        await new Promise((r) => setTimeout(r, 100));

        const cutoff = new Date(Date.now() - NINETY_DAYS_MS);
        const result = await prunePublishRequestsRetention({
          olderThan: cutoff,
          agentId: SENTINEL_AGENT_ID,
        });
        // The hold is expired, so it shouldn't block — row deletable
        expect(result.deletedCount).toBeGreaterThanOrEqual(1);
        // LEGAL_HOLD blocker count for THIS sweep should be 0 (hold expired)
        expect(result.blockerCounts.LEGAL_HOLD ?? 0).toBe(0);
      });
    });

    // suppress unused-import noise for items only used in cleanup type pos.
    void isNull;
    void lte;
  },
);
