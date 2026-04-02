/**
 * Code Studio — Repository Workspace Manager
 *
 * Manages ephemeral per-job working copies with safe branch creation,
 * baseline/final SHA tracking, and cleanup.
 *
 * Security rules:
 * - No direct mutation of protected/default branches
 * - No implicit git push
 * - No external directory access
 * - No secret file reads by default
 */

import { getCodeDb } from "../connection";
import * as schema from "../../../drizzle/tables/codedb";
import { eq } from "drizzle-orm";
import * as repo from "../repository";

export interface WorkspaceInfo {
  id: number;
  jobId: number;
  repoId: number;
  workspacePath: string;
  branchName: string;
  baselineSha?: string;
}

const WORKSPACE_ROOT = process.env.CODE_STUDIO_WORKSPACE_ROOT || "/tmp/code-studio-workspaces";

/**
 * Prepare an ephemeral workspace for a coding job.
 * In MVP, this creates a record in CODEDB tracking the workspace.
 * Actual git operations would be executed by the OpenCode runtime
 * when operating within the workspace directory.
 */
export async function prepareWorkspace(
  jobId: number,
  repoId: number,
  baseBranch?: string
): Promise<WorkspaceInfo> {
  const db = getCodeDb();
  if (!db) throw new Error("CODEDB unavailable");

  const repoRecord = await repo.getRepoById(repoId);
  if (!repoRecord) throw new Error(`Repository ${repoId} not found`);

  const branchName = `code-studio/job-${jobId}-${Date.now()}`;
  const workspacePath = `${WORKSPACE_ROOT}/job-${jobId}`;

  const [workspace] = await db.insert(schema.codeWorkspaces).values({
    jobId,
    repoId,
    workspacePath,
    branchName,
    baselineSha: baseBranch || repoRecord.defaultBranch || "main",
    status: "active",
  }).returning();

  await repo.createAuditEvent({
    eventType: "workspace_created",
    entityType: "workspace",
    entityId: workspace.id,
    details: { jobId, repoId, branchName, workspacePath },
  });

  return {
    id: workspace.id,
    jobId,
    repoId,
    workspacePath,
    branchName,
    baselineSha: workspace.baselineSha ?? undefined,
  };
}

/**
 * Record final state of a workspace after job completion.
 */
export async function finalizeWorkspace(
  workspaceId: number,
  finalSha: string,
  changedFiles: string[]
): Promise<void> {
  const db = getCodeDb();
  if (!db) throw new Error("CODEDB unavailable");

  await db.update(schema.codeWorkspaces).set({
    finalSha,
    changedFiles: changedFiles as any,
    status: "completed",
  }).where(eq(schema.codeWorkspaces.id, workspaceId));
}

/**
 * Mark a workspace for cleanup.
 */
export async function cleanupWorkspace(workspaceId: number): Promise<void> {
  const db = getCodeDb();
  if (!db) throw new Error("CODEDB unavailable");

  await db.update(schema.codeWorkspaces).set({
    status: "cleaned",
    cleanedAt: new Date(),
  }).where(eq(schema.codeWorkspaces.id, workspaceId));

  await repo.createAuditEvent({
    eventType: "workspace_cleaned",
    entityType: "workspace",
    entityId: workspaceId,
  });
}

/**
 * Get workspace for a job.
 */
export async function getWorkspaceByJobId(jobId: number) {
  const db = getCodeDb();
  if (!db) return null;
  const [row] = await db.select().from(schema.codeWorkspaces)
    .where(eq(schema.codeWorkspaces.jobId, jobId)).limit(1);
  return row ?? null;
}
