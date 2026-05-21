/**
 * Institutional Memory lens — ASDB read-seam adapter.
 *
 * Original surface (T-F.69) loaded only `agsAgents`. 2026-05-20
 * saturation closes audit item 18 (`ASDB reader saturation for
 * institutional memory lens`) by populating every read field the
 * runner consumes:
 *
 *   - agents          ← `agsAgents`
 *   - workflows       ← `workflows` (main DB)
 *   - persons         ← `users` (main DB; the "intentionally
 *                       deferred" carve-out from PR #1404 closes here)
 *   - projects        ← `workspaces` (main DB)
 *   - decisions       ← `agsApprovalSteps`
 *   - outcomes        ← `agsRuntimeRuns` (joined to `agsAgents` for label)
 *   - timelineEvents  ← `agsRuntimeRuns` (synthetic discriminator
 *                       `sourceKind="runtime_run"`)
 *   - documents       ← `agsVaultNotes` + `agsVaults` (for projectId)
 *   - teams           ← `workspaceMembers` (main DB, grouped per
 *                       workspace)
 *   - policies        ← distinct `approverRole` from `agsApprovalSteps`
 *   - governanceRecords ← `agsApprovalSteps` (same rows as decisions,
 *                       distinct typeKey + label per the contract note)
 *
 * Two DB handles: `getAsDbForWorkspace` for ASDB-resident tables;
 * `getDb` for main-DB tables (users / workspaces / workspaceMembers /
 * workflows). When the main DB isn't reachable the reader still
 * returns the ASDB-resident slice — the lens degrades gracefully
 * rather than failing whole-snapshot.
 *
 * Hard-rule compliance (CLAUDE.md):
 *   - No `neo4j-driver` / `dispatchMcpToolCall` / `openrouter` /
 *     `credential-resolver` imports.
 *   - Source-scan tested.
 */

import { desc, eq, lt, inArray } from "drizzle-orm";

import { agsAgents, agsApprovalSteps, agsRuntimeRuns } from "../../../../../drizzle/tables/agent-studio.js";
import {
  agsVaults,
  agsVaultNotes,
} from "../../../../../drizzle/tables/agent-studio-vault.js";
import { workflows } from "../../../../../drizzle/tables/automation.js";
import {
  users,
  workspaces,
  workspaceMembers,
} from "../../../../../drizzle/tables/users.js";
import { getAsDbForWorkspace } from "../../../db/connection.js";
import { getDb } from "../../../../db/connection.js";
import type {
  InstitutionalMemoryLensAgentRow,
  InstitutionalMemoryLensDecisionRow,
  InstitutionalMemoryLensDocumentRow,
  InstitutionalMemoryLensGovernanceRecordRow,
  InstitutionalMemoryLensOutcomeRow,
  InstitutionalMemoryLensPersonRow,
  InstitutionalMemoryLensPolicyRow,
  InstitutionalMemoryLensProjectRow,
  InstitutionalMemoryLensReadFn,
  InstitutionalMemoryLensReadParams,
  InstitutionalMemoryLensReadResult,
  InstitutionalMemoryLensTeamRow,
  InstitutionalMemoryLensTimelineEventRow,
  InstitutionalMemoryLensWorkflowRow,
} from "./institutional-memory-lens-runner.js";

const EMPTY_RESULT: InstitutionalMemoryLensReadResult = {
  agents: [],
  truncated: false,
};

export interface CreateInstitutionalMemoryLensAsdbReaderOptions {
  readonly getDbForWorkspace?: typeof getAsDbForWorkspace;
  /** Main-DB handle accessor — defaults to the platform's `getDb()`. */
  readonly getMainDb?: typeof getDb;
}

export function createInstitutionalMemoryLensAsdbReader(
  options: CreateInstitutionalMemoryLensAsdbReaderOptions = {},
): InstitutionalMemoryLensReadFn {
  const getDbForWorkspace = options.getDbForWorkspace ?? getAsDbForWorkspace;
  const getMainDb = options.getMainDb ?? getDb;
  return async (
    params: InstitutionalMemoryLensReadParams,
  ): Promise<InstitutionalMemoryLensReadResult> => {
    const asdb = getDbForWorkspace(params.workspaceId);
    const main = getMainDb();
    if (!asdb && !main) return EMPTY_RESULT;

    const fetchSize = params.limit + 1;

    // ── ASDB-resident reads ─────────────────────────────────────
    let agents: InstitutionalMemoryLensAgentRow[] = [];
    let decisions: InstitutionalMemoryLensDecisionRow[] = [];
    let governanceRecords: InstitutionalMemoryLensGovernanceRecordRow[] = [];
    let policies: InstitutionalMemoryLensPolicyRow[] = [];
    let outcomes: InstitutionalMemoryLensOutcomeRow[] = [];
    let timelineEvents: InstitutionalMemoryLensTimelineEventRow[] = [];
    let documents: InstitutionalMemoryLensDocumentRow[] = [];
    let truncated = false;

    if (asdb) {
      // Agents.
      const agentWhere = params.before
        ? lt(agsAgents.createdAt, params.before)
        : undefined;
      const agentRows = await (agentWhere
        ? asdb
            .select({
              id: agsAgents.id,
              name: agsAgents.name,
              internalKey: agsAgents.internalKey,
              ownerId: agsAgents.ownerId,
              domain: agsAgents.domain,
              visibility: agsAgents.visibility,
              lifecycleState: agsAgents.lifecycleState,
              agentClass: agsAgents.agentClass,
              createdAt: agsAgents.createdAt,
            })
            .from(agsAgents)
            .where(agentWhere)
            .orderBy(desc(agsAgents.createdAt))
            .limit(fetchSize)
        : asdb
            .select({
              id: agsAgents.id,
              name: agsAgents.name,
              internalKey: agsAgents.internalKey,
              ownerId: agsAgents.ownerId,
              domain: agsAgents.domain,
              visibility: agsAgents.visibility,
              lifecycleState: agsAgents.lifecycleState,
              agentClass: agsAgents.agentClass,
              createdAt: agsAgents.createdAt,
            })
            .from(agsAgents)
            .orderBy(desc(agsAgents.createdAt))
            .limit(fetchSize));
      truncated = truncated || agentRows.length > params.limit;
      agents = (
        agentRows.length > params.limit
          ? agentRows.slice(0, params.limit)
          : agentRows
      ).map((r) => ({
        id: r.id,
        name: r.name,
        internalKey: r.internalKey,
        ownerId: r.ownerId,
        domain: r.domain,
        visibility: r.visibility,
        lifecycleState: r.lifecycleState,
        agentClass: r.agentClass,
        createdAt: r.createdAt,
      }));

      // Decisions + governance_records + policies (all from agsApprovalSteps).
      const approvalWhere = params.before
        ? lt(agsApprovalSteps.createdAt, params.before)
        : undefined;
      const approvalRows = await (approvalWhere
        ? asdb
            .select({
              id: agsApprovalSteps.id,
              publishRequestId: agsApprovalSteps.publishRequestId,
              stepOrder: agsApprovalSteps.stepOrder,
              approverRole: agsApprovalSteps.approverRole,
              state: agsApprovalSteps.state,
              decidedBy: agsApprovalSteps.decidedBy,
              decisionNote: agsApprovalSteps.decisionNote,
              decidedAt: agsApprovalSteps.decidedAt,
              createdAt: agsApprovalSteps.createdAt,
            })
            .from(agsApprovalSteps)
            .where(approvalWhere)
            .orderBy(desc(agsApprovalSteps.createdAt))
            .limit(fetchSize)
        : asdb
            .select({
              id: agsApprovalSteps.id,
              publishRequestId: agsApprovalSteps.publishRequestId,
              stepOrder: agsApprovalSteps.stepOrder,
              approverRole: agsApprovalSteps.approverRole,
              state: agsApprovalSteps.state,
              decidedBy: agsApprovalSteps.decidedBy,
              decisionNote: agsApprovalSteps.decisionNote,
              decidedAt: agsApprovalSteps.decidedAt,
              createdAt: agsApprovalSteps.createdAt,
            })
            .from(agsApprovalSteps)
            .orderBy(desc(agsApprovalSteps.createdAt))
            .limit(fetchSize));
      const cappedApprovals =
        approvalRows.length > params.limit
          ? approvalRows.slice(0, params.limit)
          : approvalRows;
      truncated = truncated || approvalRows.length > params.limit;
      decisions = cappedApprovals.map((r) => ({
        id: r.id,
        publishRequestId: r.publishRequestId,
        stepOrder: r.stepOrder,
        approverRole: r.approverRole,
        state: r.state,
        decidedBy: r.decidedBy,
        decisionNote: r.decisionNote,
        decidedAt: r.decidedAt,
        createdAt: r.createdAt,
      }));
      governanceRecords = cappedApprovals.map((r) => ({
        id: r.id,
        approverRole: r.approverRole,
        state: r.state,
        decidedBy: r.decidedBy,
        decisionNote: r.decisionNote,
        decidedAt: r.decidedAt,
        createdAt: r.createdAt,
      }));
      // Dedupe policies by approverRole.
      const enforcementCounts = new Map<string, number>();
      for (const r of cappedApprovals) {
        enforcementCounts.set(
          r.approverRole,
          (enforcementCounts.get(r.approverRole) ?? 0) + 1,
        );
      }
      policies = Array.from(enforcementCounts.entries())
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([policyKey, enforcementCount]) => ({
          policyKey,
          enforcementCount,
        }));

      // Outcomes + timelineEvents (both from agsRuntimeRuns).
      const runWhere = params.before
        ? lt(agsRuntimeRuns.createdAt, params.before)
        : undefined;
      const runRows = await (runWhere
        ? asdb
            .select({
              id: agsRuntimeRuns.id,
              agentId: agsRuntimeRuns.agentId,
              agentKey: agsAgents.internalKey,
              environment: agsRuntimeRuns.environment,
              status: agsRuntimeRuns.status,
              summary: agsRuntimeRuns.summary,
              durationMs: agsRuntimeRuns.durationMs,
              finishedAt: agsRuntimeRuns.finishedAt,
              createdAt: agsRuntimeRuns.createdAt,
            })
            .from(agsRuntimeRuns)
            .leftJoin(agsAgents, eq(agsAgents.id, agsRuntimeRuns.agentId))
            .where(runWhere)
            .orderBy(desc(agsRuntimeRuns.createdAt))
            .limit(fetchSize)
        : asdb
            .select({
              id: agsRuntimeRuns.id,
              agentId: agsRuntimeRuns.agentId,
              agentKey: agsAgents.internalKey,
              environment: agsRuntimeRuns.environment,
              status: agsRuntimeRuns.status,
              summary: agsRuntimeRuns.summary,
              durationMs: agsRuntimeRuns.durationMs,
              finishedAt: agsRuntimeRuns.finishedAt,
              createdAt: agsRuntimeRuns.createdAt,
            })
            .from(agsRuntimeRuns)
            .leftJoin(agsAgents, eq(agsAgents.id, agsRuntimeRuns.agentId))
            .orderBy(desc(agsRuntimeRuns.createdAt))
            .limit(fetchSize));
      const cappedRuns =
        runRows.length > params.limit
          ? runRows.slice(0, params.limit)
          : runRows;
      truncated = truncated || runRows.length > params.limit;
      outcomes = cappedRuns.map((r) => ({
        id: r.id,
        agentId: r.agentId,
        agentKey: r.agentKey ?? `agent-${r.agentId}`,
        environment: r.environment ?? "unknown",
        status: r.status,
        summary: (r.summary as string | null) ?? null,
        durationMs: r.durationMs,
        finishedAt: r.finishedAt,
        createdAt: r.createdAt,
      }));
      timelineEvents = cappedRuns.map((r) => ({
        id: r.id,
        sourceKind: "runtime_run" as const,
        occurredAt: r.createdAt,
        label: `runtime ${r.status}: ${r.agentKey ?? r.agentId}`,
        meta: {
          runtimeRunId: r.id,
          status: r.status,
          environment: r.environment,
        },
      }));

      // Documents — join to vaults to surface the projectId
      // (workspaceId) so the cross-node project → document edge
      // has data.
      const noteWhere = params.before
        ? lt(agsVaultNotes.createdAt, params.before)
        : undefined;
      const noteRows = await (noteWhere
        ? asdb
            .select({
              id: agsVaultNotes.id,
              vaultId: agsVaultNotes.vaultId,
              title: agsVaultNotes.title,
              slug: agsVaultNotes.slug,
              governanceStatus: agsVaultNotes.governanceStatus,
              currentVersionId: agsVaultNotes.currentVersionId,
              createdByUserId: agsVaultNotes.createdByUserId,
              createdAt: agsVaultNotes.createdAt,
              updatedAt: agsVaultNotes.updatedAt,
              projectId: agsVaults.workspaceId,
            })
            .from(agsVaultNotes)
            .leftJoin(agsVaults, eq(agsVaults.id, agsVaultNotes.vaultId))
            .where(noteWhere)
            .orderBy(desc(agsVaultNotes.createdAt))
            .limit(fetchSize)
        : asdb
            .select({
              id: agsVaultNotes.id,
              vaultId: agsVaultNotes.vaultId,
              title: agsVaultNotes.title,
              slug: agsVaultNotes.slug,
              governanceStatus: agsVaultNotes.governanceStatus,
              currentVersionId: agsVaultNotes.currentVersionId,
              createdByUserId: agsVaultNotes.createdByUserId,
              createdAt: agsVaultNotes.createdAt,
              updatedAt: agsVaultNotes.updatedAt,
              projectId: agsVaults.workspaceId,
            })
            .from(agsVaultNotes)
            .leftJoin(agsVaults, eq(agsVaults.id, agsVaultNotes.vaultId))
            .orderBy(desc(agsVaultNotes.createdAt))
            .limit(fetchSize));
      const cappedNotes =
        noteRows.length > params.limit
          ? noteRows.slice(0, params.limit)
          : noteRows;
      truncated = truncated || noteRows.length > params.limit;
      documents = cappedNotes.map((r) => ({
        id: r.id,
        vaultId: r.vaultId,
        title: r.title,
        slug: r.slug,
        governanceStatus: r.governanceStatus,
        currentVersionId: r.currentVersionId,
        createdByUserId: r.createdByUserId,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        projectId: r.projectId,
      }));
    }

    // ── Main-DB reads (persons / projects / teams / workflows) ───
    let persons: InstitutionalMemoryLensPersonRow[] = [];
    let projects: InstitutionalMemoryLensProjectRow[] = [];
    let teams: InstitutionalMemoryLensTeamRow[] = [];
    let workflowRows: InstitutionalMemoryLensWorkflowRow[] = [];

    if (main) {
      // Projects (workspaces). Scope to the viewer's workspace to
      // preserve the "you only see your project" boundary — a
      // workspace-id of 0 falls back to "load all" (used by admin
      // surfaces that look across projects).
      const projWhere = params.workspaceId
        ? eq(workspaces.id, params.workspaceId)
        : undefined;
      const projRows = await (projWhere
        ? main
            .select({
              id: workspaces.id,
              name: workspaces.name,
              purposeType: workspaces.purposeType,
              status: workspaces.status,
              ownerId: workspaces.ownerId,
              createdAt: workspaces.createdAt,
            })
            .from(workspaces)
            .where(projWhere)
            .orderBy(desc(workspaces.createdAt))
            .limit(fetchSize)
        : main
            .select({
              id: workspaces.id,
              name: workspaces.name,
              purposeType: workspaces.purposeType,
              status: workspaces.status,
              ownerId: workspaces.ownerId,
              createdAt: workspaces.createdAt,
            })
            .from(workspaces)
            .orderBy(desc(workspaces.createdAt))
            .limit(fetchSize));
      truncated = truncated || projRows.length > params.limit;
      projects = (
        projRows.length > params.limit
          ? projRows.slice(0, params.limit)
          : projRows
      ).map((r) => ({
        id: r.id,
        name: r.name,
        purposeType: r.purposeType,
        status: r.status,
        ownerId: r.ownerId,
        createdAt: r.createdAt,
      }));

      // Teams — group workspace_members by workspaceId. One
      // inst_team per workspace; meta carries the member-user list.
      const memberWhere = params.workspaceId
        ? eq(workspaceMembers.workspaceId, params.workspaceId)
        : undefined;
      const memberRows = await (memberWhere
        ? main
            .select({
              workspaceId: workspaceMembers.workspaceId,
              userId: workspaceMembers.userId,
              workspaceName: workspaces.name,
            })
            .from(workspaceMembers)
            .leftJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
            .where(memberWhere)
        : main
            .select({
              workspaceId: workspaceMembers.workspaceId,
              userId: workspaceMembers.userId,
              workspaceName: workspaces.name,
            })
            .from(workspaceMembers)
            .leftJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId)));
      const teamMap = new Map<number, { name: string; members: Set<number> }>();
      for (const r of memberRows) {
        if (r.workspaceId == null) continue;
        const existing = teamMap.get(r.workspaceId);
        if (existing) {
          existing.members.add(r.userId);
        } else {
          teamMap.set(r.workspaceId, {
            name: r.workspaceName ?? `workspace-${r.workspaceId}`,
            members: new Set([r.userId]),
          });
        }
      }
      teams = Array.from(teamMap.entries()).map(([workspaceId, t]) => ({
        workspaceId,
        workspaceName: t.name,
        memberUserIds: Array.from(t.members).sort((a, b) => a - b),
      }));

      // Persons — the carve-out closes here. Limit to members of
      // the viewer's accessible workspace(s). When workspaceId is
      // set, pull users in that workspace's member roster; when
      // unset (admin surface), pull every user. Either path is
      // cheap because limit fetches at most 100 + 1 rows.
      let personRows: Array<{
        id: number;
        email: string | null;
        name: string | null;
        role: string;
        createdAt: Date;
      }>;
      if (params.workspaceId) {
        const memberIds = Array.from(teamMap.get(params.workspaceId)?.members ?? []);
        if (memberIds.length === 0) {
          personRows = [];
        } else {
          personRows = await main
            .select({
              id: users.id,
              email: users.email,
              name: users.name,
              role: users.role,
              createdAt: users.createdAt,
            })
            .from(users)
            .where(inArray(users.id, memberIds))
            .orderBy(desc(users.createdAt))
            .limit(fetchSize);
        }
      } else {
        personRows = await main
          .select({
            id: users.id,
            email: users.email,
            name: users.name,
            role: users.role,
            createdAt: users.createdAt,
          })
          .from(users)
          .orderBy(desc(users.createdAt))
          .limit(fetchSize);
      }
      truncated = truncated || personRows.length > params.limit;
      persons = (
        personRows.length > params.limit
          ? personRows.slice(0, params.limit)
          : personRows
      ).map((r) => ({
        id: r.id,
        name: r.name,
        email: r.email,
        role: r.role,
        createdAt: r.createdAt,
      }));

      // Workflows — scope to the viewer's project (workspaceId)
      // when provided, else load globally.
      const workflowWhere = params.workspaceId
        ? eq(workflows.workspaceId, params.workspaceId)
        : undefined;
      const workflowQueryRows = await (workflowWhere
        ? main
            .select({
              id: workflows.id,
              name: workflows.name,
              description: workflows.description,
              userId: workflows.userId,
              workspaceId: workflows.workspaceId,
              createdAt: workflows.createdAt,
            })
            .from(workflows)
            .where(workflowWhere)
            .orderBy(desc(workflows.createdAt))
            .limit(fetchSize)
        : main
            .select({
              id: workflows.id,
              name: workflows.name,
              description: workflows.description,
              userId: workflows.userId,
              workspaceId: workflows.workspaceId,
              createdAt: workflows.createdAt,
            })
            .from(workflows)
            .orderBy(desc(workflows.createdAt))
            .limit(fetchSize));
      truncated = truncated || workflowQueryRows.length > params.limit;
      workflowRows = (
        workflowQueryRows.length > params.limit
          ? workflowQueryRows.slice(0, params.limit)
          : workflowQueryRows
      ).map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        userId: r.userId,
        workspaceId: r.workspaceId,
        createdAt: r.createdAt,
      }));
    }

    return {
      agents,
      workflows: workflowRows,
      persons,
      projects,
      decisions,
      outcomes,
      timelineEvents,
      documents,
      teams,
      policies,
      governanceRecords,
      truncated,
    };
  };
}
