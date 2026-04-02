/**
 * PRM Catalog — Catalog/playbook/lesson promotion and publishing logic
 */

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
