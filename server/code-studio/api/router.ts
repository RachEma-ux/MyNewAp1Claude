/**
 * Code Studio — Main tRPC Router
 *
 * Composes all Code Studio sub-routers into a single namespace.
 * Mounted as `codeStudio` in the platform appRouter.
 */

import { z } from "zod";
import { router, protectedProcedure } from "../../_core/trpc";
import * as repo from "../repository";
import * as orchestrator from "../worker/job-orchestrator";
import * as workspaceMgr from "../worker/workspace-manager";
import * as ocClient from "../opencode/client";
import {
  byIdSchema,
  createJobSchema,
  updateJobSchema,
  listJobsSchema,
  createRepoSchema,
  listReposSchema,
  listSessionsSchema,
  listPendingApprovalsSchema,
  resolveApprovalSchema,
  inboundHandoffSchema,
  listAuditSchema,
  createPolicySchema,
  listDiffsSchema,
} from "../shared/schemas";

// ── Health ────────────────────────────────────────────────────────────────────

const healthRouter = router({
  status: protectedProcedure.query(async () => {
    return orchestrator.checkRuntimeHealth();
  }),
  summary: protectedProcedure.query(async () => {
    return repo.getModuleSummary();
  }),
});

// ── Jobs ──────────────────────────────────────────────────────────────────────

const jobsRouter = router({
  list: protectedProcedure.input(listJobsSchema).query(({ input }) => {
    return repo.listJobs(input || {});
  }),
  getById: protectedProcedure.input(byIdSchema).query(async ({ input }) => {
    const job = await repo.getJobById(input.id);
    if (!job) return null;
    const steps = await repo.listJobSteps(input.id);
    const diffs = await repo.listDiffs(input.id);
    const workspace = await workspaceMgr.getWorkspaceByJobId(input.id);
    return { ...job, steps, diffs, workspace };
  }),
  create: protectedProcedure.input(createJobSchema).mutation(async ({ input, ctx }) => {
    const job = await repo.createJob({
      ...input,
      actorUserId: (ctx as any).user?.id,
    });
    await repo.createAuditEvent({
      eventType: "job_created",
      entityType: "job",
      entityId: job.id,
      actorUserId: (ctx as any).user?.id,
    });
    return job;
  }),
  update: protectedProcedure.input(updateJobSchema).mutation(async ({ input, ctx }) => {
    const { id, ...data } = input;
    const updated = await repo.updateJob(id, data);
    await repo.createAuditEvent({
      eventType: "job_updated",
      entityType: "job",
      entityId: id,
      actorUserId: (ctx as any).user?.id,
    });
    return updated;
  }),
  delete: protectedProcedure.input(byIdSchema).mutation(async ({ input, ctx }) => {
    const deleted = await repo.deleteJob(input.id);
    if (deleted) {
      await repo.createAuditEvent({
        eventType: "job_deleted",
        entityType: "job",
        entityId: input.id,
        actorUserId: (ctx as any).user?.id,
      });
    }
    return deleted;
  }),
  start: protectedProcedure.input(byIdSchema).mutation(async ({ input, ctx }) => {
    return orchestrator.startJob(input.id);
  }),
  cancel: protectedProcedure.input(byIdSchema).mutation(async ({ input, ctx }) => {
    return orchestrator.cancelJob(input.id, (ctx as any).user?.id);
  }),
  retry: protectedProcedure.input(byIdSchema).mutation(async ({ input }) => {
    return orchestrator.retryJob(input.id);
  }),
  steps: protectedProcedure.input(byIdSchema).query(({ input }) => {
    return repo.listJobSteps(input.id);
  }),
  evidence: protectedProcedure.input(byIdSchema).query(async ({ input }) => {
    return orchestrator.buildEvidenceBundle(input.id);
  }),
});

// ── Repositories ─────────────────────────────────────────────────────────────

const reposRouter = router({
  list: protectedProcedure.input(listReposSchema).query(({ input }) => {
    return repo.listRepos(input?.limit);
  }),
  create: protectedProcedure.input(createRepoSchema).mutation(async ({ input, ctx }) => {
    const created = await repo.createRepo(input);
    await repo.createAuditEvent({
      eventType: "repo_registered",
      entityType: "repository",
      entityId: created.id,
      actorUserId: (ctx as any).user?.id,
    });
    return created;
  }),
  getById: protectedProcedure.input(byIdSchema).query(({ input }) => {
    return repo.getRepoById(input.id);
  }),
});

// ── Sessions ─────────────────────────────────────────────────────────────────

const sessionsRouter = router({
  list: protectedProcedure.input(listSessionsSchema).query(({ input }) => {
    return repo.listSessions(input || {});
  }),
  getById: protectedProcedure.input(byIdSchema).query(async ({ input }) => {
    return repo.getSessionById(input.id);
  }),
});

// ── Approvals ────────────────────────────────────────────────────────────────

const approvalsRouter = router({
  pending: protectedProcedure.input(listPendingApprovalsSchema).query(({ input }) => {
    return repo.listPendingApprovals(input || {});
  }),
  resolve: protectedProcedure.input(resolveApprovalSchema).mutation(async ({ input, ctx }) => {
    const approval = await repo.resolvePermissionRequest(
      input.permissionRequestId,
      input.decision,
      (ctx as any).user?.id,
      input.scope,
      input.rationale
    );
    await repo.createAuditEvent({
      eventType: `approval_${input.decision}`,
      entityType: "permission_request",
      entityId: input.permissionRequestId,
      actorUserId: (ctx as any).user?.id,
      details: { scope: input.scope, rationale: input.rationale },
    });
    return approval;
  }),
});

// ── Diffs ────────────────────────────────────────────────────────────────────

const diffsRouter = router({
  list: protectedProcedure.input(listDiffsSchema).query(({ input }) => {
    return repo.listDiffs(input.jobId);
  }),
});

// ── Handoffs ─────────────────────────────────────────────────────────────────

const handoffsRouter = router({
  inbound: protectedProcedure.input(inboundHandoffSchema).mutation(async ({ input, ctx }) => {
    // Create job from handoff
    const job = await repo.createJob({
      title: input.objective.slice(0, 200),
      description: input.objective,
      objective: input.objective,
      constraints: input.constraints,
      priority: input.priority,
      repoId: input.repoId,
      sourceModule: input.sourceModule,
      sourceWorkflowId: input.sourceWorkflowId,
      actorUserId: (ctx as any).user?.id,
    });

    // Record handoff
    await repo.createHandoff({
      jobId: job.id,
      direction: "inbound",
      sourceModule: input.sourceModule,
      payload: input,
      callbackUrl: input.callbackUrl,
    });

    await repo.createAuditEvent({
      eventType: "handoff_inbound",
      entityType: "job",
      entityId: job.id,
      actorUserId: (ctx as any).user?.id,
      details: { sourceModule: input.sourceModule },
    });

    return { jobId: job.id, status: "draft" };
  }),
});

// ── Agents ───────────────────────────────────────────────────────────────────

const agentsRouter = router({
  list: protectedProcedure.query(async () => {
    try {
      return await ocClient.listAgents();
    } catch {
      // Return built-in agent definitions when OpenCode is unavailable
      return [
        { id: "coding-orchestrator", name: "Coding Orchestrator", description: "Coordinates overall coding workflow", mode: "primary" },
        { id: "planner", name: "Planner", description: "Read-only analysis and planning", mode: "subagent" },
        { id: "builder", name: "Builder", description: "Implements code changes", mode: "subagent" },
        { id: "reviewer", name: "Reviewer", description: "Audits changes, no silent rewrites", mode: "subagent" },
        { id: "tester", name: "Tester", description: "Runs tests and validation", mode: "subagent" },
        { id: "governance", name: "Governance", description: "Policy compliance checks", mode: "subagent" },
        { id: "explorer", name: "Explorer", description: "Read-only codebase search", mode: "subagent" },
      ];
    }
  }),
});

// ── Policies ─────────────────────────────────────────────────────────────────

const policiesRouter = router({
  list: protectedProcedure.query(() => repo.listPolicies()),
  create: protectedProcedure.input(createPolicySchema).mutation(async ({ input, ctx }) => {
    const created = await repo.createPolicy(input);
    await repo.createAuditEvent({
      eventType: "policy_created",
      entityType: "policy",
      entityId: created.id,
      actorUserId: (ctx as any).user?.id,
    });
    return created;
  }),
});

// ── Audit ────────────────────────────────────────────────────────────────────

const auditRouter = router({
  list: protectedProcedure.input(listAuditSchema).query(({ input }) => {
    return repo.listAuditEvents(input || {});
  }),
});

// ── Artifacts ────────────────────────────────────────────────────────────────

const artifactsRouter = router({
  list: protectedProcedure.input(byIdSchema).query(({ input }) => {
    return repo.listArtifacts(input.id);
  }),
});

// ── OpenCode Runtime ─────────────────────────────────────────────────────────

const opencodeRouter = router({
  health: protectedProcedure.query(async () => {
    return ocClient.checkHealth();
  }),
  sessions: protectedProcedure.query(async () => {
    try {
      return await ocClient.listSessions();
    } catch {
      return [];
    }
  }),
  agents: protectedProcedure.query(async () => {
    try {
      return await ocClient.listAgents();
    } catch {
      return [];
    }
  }),
});

// ── Settings ────────────────────────────────────────────────────────────────

const settingsRouter = router({
  get: protectedProcedure
    .input(z.object({ key: z.string() }))
    .query(({ input }) => repo.getSetting(input.key)),
  set: protectedProcedure
    .input(z.object({ key: z.string(), value: z.any() }))
    .mutation(({ input }) => repo.setSetting(input.key, input.value)),
});

// ── Catalog Imports ──────────────────────────────────────────────────────────

const catalogImportsRouter = router({
  list: protectedProcedure.query(() => repo.listCatalogImports()),
  import: protectedProcedure
    .input(
      z.object({
        catalogEntryId: z.number(),
        entryType: z.string(),
        name: z.string(),
        description: z.string().optional(),
        category: z.string().optional(),
        tags: z.array(z.string()).optional(),
        config: z.any().optional(),
      })
    )
    .mutation(({ input }) => repo.importCatalogEntry(input)),
  remove: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(({ input }) => repo.removeCatalogImport(input.id)),
});

// ── Compose Main Router ──────────────────────────────────────────────────────

export const codeStudioRouter = router({
  health: healthRouter,
  jobs: jobsRouter,
  repos: reposRouter,
  sessions: sessionsRouter,
  approvals: approvalsRouter,
  diffs: diffsRouter,
  handoffs: handoffsRouter,
  agents: agentsRouter,
  policies: policiesRouter,
  audit: auditRouter,
  artifacts: artifactsRouter,
  opencode: opencodeRouter,
  catalogImports: catalogImportsRouter,
  settings: settingsRouter,
});
