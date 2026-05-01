/**
 * HR Directory Service — module-owned business logic
 *
 * Extracted from the directory router so both the tRPC mutation and
 * the public-API gateway action (`hr.employee.create`) can call the
 * same code path. Both entry points must produce identical DB state
 * (people + worker profile + initial employment record) and the same
 * audit trail.
 */

import { getDb } from "../../db/connection";
import {
  hrPeople,
  hrWorkerProfiles,
  hrEmploymentRecords,
} from "../../../drizzle/schema";
import { logHrAudit } from "../audit";

export interface CreateWorkerInput {
  firstName: string;
  lastName: string;
  displayName: string;
  primaryEmail: string;
  preferredName?: string;
  primaryPhone?: string;
  workerType?: "employee" | "contractor" | "intern" | "consultant";
  employeeNumber?: string;
  employmentCategory?: string;
  homeOrgUnitId?: number;
  primaryPositionId?: number;
  managerWorkerId?: number;
}

export interface CreateWorkerResult {
  personId: number;
  workerId: number;
}

/**
 * Create an HR person + worker profile + initial employment record.
 * Audit-logs `hr.worker.create`. Throws on missing DB.
 *
 * Permission/governance enforcement is the caller's responsibility:
 *  - tRPC path: `requireHrPermission(...)` in the router
 *  - gateway path: `receiptRequired: true` enforced by module-gateway
 */
export async function createWorker(
  input: CreateWorkerInput,
  actorId?: number,
): Promise<CreateWorkerResult> {
  const db = getDb();
  if (!db) throw new Error("DB unavailable");

  const [person] = await db
    .insert(hrPeople)
    .values({
      firstName: input.firstName,
      lastName: input.lastName,
      displayName: input.displayName,
      primaryEmail: input.primaryEmail,
      preferredName: input.preferredName,
      primaryPhone: input.primaryPhone,
    })
    .returning();

  const [worker] = await db
    .insert(hrWorkerProfiles)
    .values({
      personId: person.id,
      workerType: input.workerType ?? "employee",
      employeeNumber: input.employeeNumber,
      employmentCategory: input.employmentCategory ?? "full_time",
      homeOrgUnitId: input.homeOrgUnitId,
      primaryPositionId: input.primaryPositionId,
      managerWorkerId: input.managerWorkerId,
    })
    .returning();

  const today = new Date().toISOString().split("T")[0];
  await db.insert(hrEmploymentRecords).values({
    workerId: worker.id,
    employmentStatus: "active",
    contractType: "permanent",
    startDate: today,
    effectiveFrom: today,
  });

  await logHrAudit({
    actorId,
    targetWorkerId: worker.id,
    action: "hr.worker.create",
    metadata: { displayName: input.displayName, email: input.primaryEmail },
  });

  return { personId: person.id, workerId: worker.id };
}
