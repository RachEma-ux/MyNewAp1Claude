/**
 * Workforce Assignment Bridge — HR Validation Hooks
 *
 * Validates employee eligibility using HR-owned workforce data.
 * Uses existing HR tables (hrWorkerProfiles, hrWorkerSkills) — does not invent new data sources.
 */

import { eq, and, ilike } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db/connection";
import { hrWorkerProfiles, hrWorkerSkills } from "../../drizzle/schema";

export interface ValidationResult {
  valid: boolean;
  checks: {
    employeeExists: boolean;
    employeeActive: boolean;
    skillMatch: boolean | null; // null = no skill requirement or no data
    levelMatch: boolean | null; // null = no level requirement or no data
  };
  reason?: string;
}

/**
 * Validate an employee's eligibility for a resource request.
 *
 * Checks:
 * 1. Employee exists in HR system (hrWorkerProfiles)
 * 2. Employee is active (status = "active")
 * 3. Required skill is present (if specified in request)
 * 4. Proficiency level meets requirement (if both specified)
 */
export async function validateEmployeeEligibility(params: {
  employeeId: number;
  requiredSkill?: string | null;
  requiredLevel?: string | null;
}): Promise<ValidationResult> {
  const db = getDb();
  if (!db) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
  }

  const result: ValidationResult = {
    valid: true,
    checks: {
      employeeExists: false,
      employeeActive: false,
      skillMatch: null,
      levelMatch: null,
    },
  };

  // 1. Employee exists
  const [worker] = await db
    .select({
      id: hrWorkerProfiles.id,
      status: hrWorkerProfiles.status,
      workerType: hrWorkerProfiles.workerType,
    })
    .from(hrWorkerProfiles)
    .where(eq(hrWorkerProfiles.id, params.employeeId))
    .limit(1);

  if (!worker) {
    result.valid = false;
    result.reason = `Employee #${params.employeeId} not found in HR system.`;
    return result;
  }
  result.checks.employeeExists = true;

  // 2. Employee is active
  if (worker.status !== "active") {
    result.valid = false;
    result.checks.employeeActive = false;
    result.reason = `Employee #${params.employeeId} is "${worker.status}" — must be "active" for assignment.`;
    return result;
  }
  result.checks.employeeActive = true;

  // 3. Skill match (if required)
  if (params.requiredSkill) {
    const skills = await db
      .select({
        skillName: hrWorkerSkills.skillName,
        proficiencyLevel: hrWorkerSkills.proficiencyLevel,
      })
      .from(hrWorkerSkills)
      .where(
        and(
          eq(hrWorkerSkills.workerId, params.employeeId),
          ilike(hrWorkerSkills.skillName, params.requiredSkill),
        ),
      )
      .limit(1);

    if (skills.length === 0) {
      result.valid = false;
      result.checks.skillMatch = false;
      result.reason = `Employee #${params.employeeId} does not have required skill "${params.requiredSkill}".`;
      return result;
    }
    result.checks.skillMatch = true;

    // 4. Level match (if required)
    if (params.requiredLevel) {
      const levelOrder: Record<string, number> = {
        beginner: 1,
        intermediate: 2,
        advanced: 3,
        expert: 4,
      };
      const employeeLevel = levelOrder[skills[0].proficiencyLevel ?? "beginner"] ?? 0;
      const requiredLevel = levelOrder[params.requiredLevel] ?? 0;

      if (employeeLevel < requiredLevel) {
        result.valid = false;
        result.checks.levelMatch = false;
        result.reason = `Employee #${params.employeeId} skill level "${skills[0].proficiencyLevel}" ` +
          `does not meet required level "${params.requiredLevel}".`;
        return result;
      }
      result.checks.levelMatch = true;
    }
  }

  return result;
}
