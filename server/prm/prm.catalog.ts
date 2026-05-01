/**
 * PRM Catalog — Catalog/playbook/lesson promotion and publishing logic
 */

import { eq } from "drizzle-orm";
import { getPrmDb } from "./connection";
import { prmMethodTemplates } from "../../drizzle/tables/prmdb";
import * as repo from "./prm.repository";
import type { PrmPublicationState } from "./prm.types";

const PUBLICATION_TRANSITIONS: Record<PrmPublicationState, PrmPublicationState[]> = {
  draft: ["under_review"],
  under_review: ["approved", "rejected"],
  approved: ["published"],
  published: ["archived"],
  rejected: ["draft"],
  archived: [],
};

export function isValidPublicationTransition(
  from: PrmPublicationState,
  to: PrmPublicationState
): boolean {
  return PUBLICATION_TRANSITIONS[from]?.includes(to) ?? false;
}

export async function publishLesson(lessonId: number) {
  return repo.updateLesson(lessonId, {
    published: true,
    publishedAt: new Date(),
  });
}

export async function publishPlaybook(playbookId: number) {
  return repo.updatePlaybook(playbookId, {
    published: true,
    publishedAt: new Date(),
  });
}

export async function archiveCatalogItem(itemId: number) {
  return repo.updateCatalogItem(itemId, {
    publicationState: "archived",
  });
}

/**
 * Publish a method template — flips the `published` boolean to true
 * on `prm_method_templates` so the template surfaces in catalog
 * listings. Returns the updated row.
 *
 * Used by `prm.method.publish` (gateway action). The action requires
 * a governance receipt; the gateway verifies that before calling
 * this function.
 */
export async function publishMethodTemplate(templateId: number) {
  const db = getPrmDb();
  if (!db) throw new Error("PRMDB not connected");
  const [updated] = await db
    .update(prmMethodTemplates)
    .set({ published: true, updatedAt: new Date() })
    .where(eq(prmMethodTemplates.id, templateId))
    .returning();
  if (!updated) throw new Error(`Method template ${templateId} not found`);
  return updated;
}

/**
 * Deprecate a method template — flips the `published` boolean to
 * false. The template stays in the DB so existing references keep
 * working; new listings won't surface it.
 */
export async function deprecateMethodTemplate(templateId: number) {
  const db = getPrmDb();
  if (!db) throw new Error("PRMDB not connected");
  const [updated] = await db
    .update(prmMethodTemplates)
    .set({ published: false, updatedAt: new Date() })
    .where(eq(prmMethodTemplates.id, templateId))
    .returning();
  if (!updated) throw new Error(`Method template ${templateId} not found`);
  return updated;
}

/**
 * Lookup helper used by gateway tests / observability — not exposed
 * directly via gateway.
 */
export async function getMethodTemplate(templateId: number) {
  const db = getPrmDb();
  if (!db) throw new Error("PRMDB not connected");
  const rows = await db
    .select()
    .from(prmMethodTemplates)
    .where(eq(prmMethodTemplates.id, templateId))
    .limit(1);
  return rows[0] ?? null;
}

export async function promoteLessonToCatalog(lessonId: number) {
  const lessons = await repo.listLessons();
  const lesson = lessons.find((l) => l.id === lessonId);
  if (!lesson) throw new Error(`Lesson ${lessonId} not found`);

  return repo.createCatalogItem({
    itemType: "lesson",
    title: lesson.title,
    description: lesson.whatHappened || "",
    contentData: {
      whatHappened: lesson.whatHappened,
      whyItMattered: lesson.whyItMattered,
      whatChanged: lesson.whatChanged,
      reuseNotes: lesson.reuseNotes,
    },
    sourceId: lesson.id,
    sourceType: "lesson",
    publicationState: "draft",
  });
}
