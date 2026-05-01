/**
 * Culture Values Service — module-owned business logic
 *
 * Extracted so both the tRPC router (`valueSetsRouter.publish`) and
 * the public-API gateway action (`cv.value.publish`) call the same
 * code path.
 */

import { eq, and } from "drizzle-orm";
import { getDb } from "../db/connection";
import { cvValueSets } from "../../drizzle/tables/culture-values";
import { validateValueSetTransition } from "./lifecycle";
import { requirePublishReady } from "./validation";
import { logCvAudit } from "./audit";
import { logActivity } from "../modules/registry";

export interface PublishValueSetInput {
  workspaceId: number;
  id: number;
}

/**
 * Publish a CV value set. Validates the lifecycle transition,
 * enforces publish-readiness, deprecates currently-active sets in
 * the workspace, then activates the target set with publishedAt
 * + publishedBy. Audit-logs and emits a registry activity entry.
 */
export async function publishValueSet(
  input: PublishValueSetInput,
  actorId?: number,
) {
  const db = getDb();
  if (!db) throw new Error("DB unavailable");

  const [existing] = await db
    .select()
    .from(cvValueSets)
    .where(
      and(
        eq(cvValueSets.id, input.id),
        eq(cvValueSets.workspaceId, input.workspaceId),
      ),
    )
    .limit(1);
  if (!existing) throw new Error(`Value set ${input.id} not found`);

  validateValueSetTransition(existing.status, "active");
  await requirePublishReady(input.workspaceId, input.id);

  const activeSets = await db
    .select()
    .from(cvValueSets)
    .where(
      and(
        eq(cvValueSets.workspaceId, input.workspaceId),
        eq(cvValueSets.status, "active"),
      ),
    );
  for (const s of activeSets) {
    await db
      .update(cvValueSets)
      .set({ status: "deprecated", updatedAt: new Date() })
      .where(eq(cvValueSets.id, s.id));
  }

  const [published] = await db
    .update(cvValueSets)
    .set({
      status: "active",
      publishedAt: new Date(),
      publishedBy: actorId,
      updatedAt: new Date(),
    })
    .where(eq(cvValueSets.id, input.id))
    .returning();

  await logCvAudit({
    workspaceId: input.workspaceId,
    actorId,
    action: "value_set.publish",
    entityType: "value_set",
    entityId: input.id,
    newValue: { status: "active" },
    category: "status_change",
  });
  await logActivity({
    workspaceId: input.workspaceId,
    moduleKey: "cv",
    actorId,
    action: "value_set.publish",
    targetType: "value_set",
    targetId: input.id,
  });

  return published;
}
