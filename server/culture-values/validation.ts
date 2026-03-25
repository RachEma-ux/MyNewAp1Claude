/**
 * Culture Values — Validation
 *
 * Rules:
 * - Value sets should have 3–7 core values
 * - Every value must have at least one behavior
 * - Publish requires: all values have behaviors + translations coverage
 */

import { eq, and } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db/connection";
import {
  cvValueDefinitions,
  cvBehaviorModels,
  cvValueTranslations,
} from "../../drizzle/tables/culture-values";

/**
 * Validate a value set is ready for publishing.
 * Returns { ready, issues[] }.
 */
export async function validatePublishReadiness(
  workspaceId: number,
  valueSetId: number,
): Promise<{ ready: boolean; issues: string[] }> {
  const db = getDb();
  if (!db) return { ready: false, issues: ["Database unavailable"] };

  const issues: string[] = [];

  // Check value count (3–7 recommended)
  const values = await db.select().from(cvValueDefinitions)
    .where(and(
      eq(cvValueDefinitions.workspaceId, workspaceId),
      eq(cvValueDefinitions.valueSetId, valueSetId),
      eq(cvValueDefinitions.status, "active"),
    ));

  if (values.length === 0) {
    issues.push("No active values defined");
  } else if (values.length < 3) {
    issues.push(`Only ${values.length} values defined (minimum 3 recommended)`);
  } else if (values.length > 7) {
    issues.push(`${values.length} values defined (maximum 7 recommended)`);
  }

  // Check each value has at least one behavior
  for (const v of values) {
    const behaviors = await db.select().from(cvBehaviorModels)
      .where(and(
        eq(cvBehaviorModels.workspaceId, workspaceId),
        eq(cvBehaviorModels.valueDefinitionId, v.id),
        eq(cvBehaviorModels.status, "active"),
      ));
    if (behaviors.length === 0) {
      issues.push(`Value "${v.name}" has no behavior definitions`);
    }
  }

  // Check translation coverage
  const translations = await db.select().from(cvValueTranslations)
    .where(and(
      eq(cvValueTranslations.workspaceId, workspaceId),
      eq(cvValueTranslations.status, "active"),
    ));

  const valuesWithTranslations = new Set(translations.map(t => t.valueDefinitionId));
  for (const v of values) {
    if (!valuesWithTranslations.has(v.id)) {
      issues.push(`Value "${v.name}" has no unit-level translations`);
    }
  }

  return { ready: issues.length === 0, issues };
}

/**
 * Require that a value set is publishable, or throw.
 */
export async function requirePublishReady(
  workspaceId: number,
  valueSetId: number,
): Promise<void> {
  const { ready, issues } = await validatePublishReadiness(workspaceId, valueSetId);
  if (!ready) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Value set is not ready for publishing: ${issues.join("; ")}`,
    });
  }
}
