/**
 * Code Studio — Main tRPC Router
 *
 * Composes all Code Studio sub-routers into a single namespace.
 * Mounted as `codeStudio` in the platform appRouter.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
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
  listSessionMessagesSchema,
  createTemplateSchema,
  updateTemplateSchema,
  listTemplatesSchema,
  importTemplatesSchema,
  generateJobDraftSchema,
  openIdeForJobSchema,
  openIdeForSessionSchema,
  ideInstanceStatusSchema,
  closeIdeInstanceSchema,
} from "../shared/schemas";
import { opencodeSettingsRouter } from "../opencode/settings-router";
import * as ideMgr from "../opencode/web-instance-manager";

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
    const sessions = await repo.listSessions({ jobId: input.id });
    return { ...job, steps, diffs, workspace, sessions };
  }),
  create: protectedProcedure.input(createJobSchema).mutation(async ({ input, ctx }) => {
    const { model, ...rest } = input;
    const job = await repo.createJob({
      ...rest,
      requestedModel: model || undefined,
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
  results: protectedProcedure.input(byIdSchema).query(async ({ input }) => {
    const job = await repo.getJobById(input.id);
    if (!job) return null;
    const steps = await repo.listJobSteps(input.id);
    const artifacts = await repo.listArtifacts(input.id);
    const sessions = await repo.listSessions({ jobId: input.id });
    const diffs = await repo.listDiffs(input.id);

    const reportMd = artifacts.find((a: any) => a.artifactType === "final_report_markdown");
    const reportJson = artifacts.find((a: any) => a.artifactType === "final_report_json");

    return {
      jobId: input.id,
      status: job.status,
      resultSummary: job.resultSummary,
      finalReportMarkdown: reportMd?.content || null,
      finalReportJson: reportJson?.content || null,
      stepOutputs: steps.map((s: any) => ({
        stepName: s.stepName,
        stepOrder: s.stepOrder,
        status: s.status,
        agentRole: s.agentRole,
        output: s.output,
      })),
      diffCount: diffs.length,
      sessionCount: sessions.length,
      artifacts: artifacts.map((a: any) => ({
        id: a.id,
        artifactType: a.artifactType,
        name: a.name,
        metadata: a.metadata,
      })),
    };
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
  messages: protectedProcedure.input(listSessionMessagesSchema).query(async ({ input }) => {
    // Authorization: verify the session exists and belongs to a valid job
    const session = await repo.getSessionById(input.sessionId);
    if (!session || !session.jobId) return [];
    return repo.listSessionMessages(input.sessionId, input.limit ?? 200);
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

// ── Templates ─────────────────────────────────────────────────────────────────

const templatesRouter = router({
  list: protectedProcedure.input(listTemplatesSchema).query(({ input }) => {
    return repo.listTemplates(input || {});
  }),
  getById: protectedProcedure.input(byIdSchema).query(({ input }) => {
    return repo.getTemplateById(input.id);
  }),
  create: protectedProcedure.input(createTemplateSchema).mutation(async ({ input, ctx }) => {
    const created = await repo.createTemplate(input);
    await repo.createAuditEvent({
      eventType: "template_created",
      entityType: "template",
      entityId: created.id,
      actorUserId: (ctx as any).user?.id,
    });
    return created;
  }),
  update: protectedProcedure.input(updateTemplateSchema).mutation(async ({ input, ctx }) => {
    const { id, ...data } = input;
    const updated = await repo.updateTemplate(id, data);
    await repo.createAuditEvent({
      eventType: "template_updated",
      entityType: "template",
      entityId: id,
      actorUserId: (ctx as any).user?.id,
    });
    return updated;
  }),
  delete: protectedProcedure.input(byIdSchema).mutation(async ({ input, ctx }) => {
    const deleted = await repo.deleteTemplate(input.id);
    if (deleted) {
      await repo.createAuditEvent({
        eventType: "template_deleted",
        entityType: "template",
        entityId: input.id,
        actorUserId: (ctx as any).user?.id,
      });
    }
    return deleted;
  }),
  importFile: protectedProcedure.input(importTemplatesSchema).mutation(async ({ input, ctx }) => {
    const results: any[] = [];
    for (const tmpl of input.templates) {
      const created = await repo.createTemplate({
        ...tmpl,
        importSource: "file_import",
      });
      results.push(created);
    }
    await repo.createAuditEvent({
      eventType: "templates_imported",
      entityType: "template",
      actorUserId: (ctx as any).user?.id,
      details: { count: results.length, names: results.map((r) => r.name) },
    });
    return { imported: results.length, templates: results };
  }),
  generateJobDraft: protectedProcedure.input(generateJobDraftSchema).query(async ({ input }) => {
    const template = await repo.getTemplateById(input.templateId);
    if (!template) throw new Error("Template not found");
    const vars = input.variables;
    // Validate required variables
    const varDefs = (template.variableSchema as any[]) || [];
    const missing = varDefs
      .filter((v: any) => v.required && (!vars[v.key] || !vars[v.key].trim()))
      .map((v: any) => v.label);
    if (missing.length > 0) {
      throw new Error(`Missing required fields: ${missing.join(", ")}`);
    }
    const title = template.titleTemplate
      ? repo.renderTemplate(template.titleTemplate, vars).slice(0, 200)
      : template.name;
    const objective = template.objectiveTemplate
      ? repo.renderTemplate(template.objectiveTemplate, vars)
      : "";
    return {
      title,
      objective,
      priority: template.defaultPriority || "normal",
      constraints: {
        ...(template.defaultConstraints as any || {}),
        _sourceTemplateId: template.id,
        _sourceTemplateName: template.name,
      },
    };
  }),
  seed: protectedProcedure.mutation(async () => {
    await repo.ensureBuiltInTemplates();
    return { ok: true };
  }),
});

// ── IDE (OpenCode Web) ──────────────────────────────────────────────────────

const ideRouter = router({
  openForJob: protectedProcedure.input(openIdeForJobSchema).mutation(async ({ input }) => {
    // Check for a running OpenCode runtime (e.g. from CI deploy or manual start)
    const runtimeUrl = process.env.OPENCODE_URL || "http://127.0.0.1:4096";
    try {
      const health = await fetch(`${runtimeUrl}/global/health`, { signal: AbortSignal.timeout(2000) });
      if (health.ok) {
        return {
          instanceId: 0,
          proxyUrl: runtimeUrl,
          directUrl: runtimeUrl,
          status: "running" as const,
          port: Number(new URL(runtimeUrl).port),
          isReused: true,
          workspacePath: process.cwd(),
        };
      }
    } catch { /* not available */ }

    // No existing runtime — spawn a new instance
    try {
      const result = await ideMgr.openForJob(input.jobId);
      return {
        instanceId: result.instance.id,
        proxyUrl: result.proxyUrl,
        directUrl: result.directUrl,
        status: result.instance.status,
        port: result.instance.port,
        isReused: result.isReused,
        workspacePath: result.instance.workspacePath,
      };
    } catch (err: any) {
      throw new TRPCError({ code: "BAD_REQUEST", message: err.message || "IDE launch failed" });
    }
  }),
  openForSession: protectedProcedure.input(openIdeForSessionSchema).mutation(async ({ input }) => {
    const runtimeUrl = process.env.OPENCODE_URL || "http://127.0.0.1:4096";
    try {
      const health = await fetch(`${runtimeUrl}/global/health`, { signal: AbortSignal.timeout(2000) });
      if (health.ok) {
        return {
          instanceId: 0,
          proxyUrl: runtimeUrl,
          directUrl: runtimeUrl,
          status: "running" as const,
          port: Number(new URL(runtimeUrl).port),
          isReused: true,
          workspacePath: process.cwd(),
        };
      }
    } catch { /* not available */ }

    try {
      const result = await ideMgr.openForSession(input.sessionId);
      return {
        instanceId: result.instance.id,
        proxyUrl: result.proxyUrl,
        directUrl: result.directUrl,
        status: result.instance.status,
        port: result.instance.port,
        isReused: result.isReused,
        workspacePath: result.instance.workspacePath,
      };
    } catch (err: any) {
      throw new TRPCError({ code: "BAD_REQUEST", message: err.message || "IDE launch failed" });
    }
  }),
  getStatus: protectedProcedure.input(ideInstanceStatusSchema).query(async ({ input }) => {
    const status = await ideMgr.getInstanceStatus(input.instanceId);
    if (!status) return null;
    return {
      ...status,
      proxyUrl: `/api/code-studio/ide/${status.proxyKey}/`,
    };
  }),
  close: protectedProcedure.input(closeIdeInstanceSchema).mutation(async ({ input }) => {
    await ideMgr.closeInstance(input.instanceId);
    return { ok: true };
  }),
  list: protectedProcedure.query(async () => {
    return repo.listIdeInstances();
  }),
});

// ── Ollama Runtime ──────────────────────────────────────────────────────────

const OLLAMA_URL = process.env.OLLAMA_BASE_URL || "http://localhost:11434";

const ollamaRouter = router({
  status: protectedProcedure.query(async () => {
    try {
      const res = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(2000) });
      if (res.ok) {
        const data = await res.json();
        return { running: true, models: data.models?.map((m: any) => m.name) || [] };
      }
      return { running: false, models: [] };
    } catch {
      return { running: false, models: [] };
    }
  }),
  start: protectedProcedure.mutation(async () => {
    // Check if already running
    try {
      const res = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(2000) });
      if (res.ok) return { started: true, message: "Ollama is already running" };
    } catch { /* not running, proceed to start */ }

    const { spawn, execSync } = await import("child_process");

    // Resolve full path to ollama binary
    let ollamaBin = "ollama";
    try {
      ollamaBin = execSync("which ollama", { encoding: "utf-8" }).trim();
    } catch { /* fallback to PATH lookup */ }

    const child = spawn(ollamaBin, ["serve"], {
      stdio: "ignore",
      detached: true,
      env: { ...process.env },
    });

    let spawnError: string | null = null;
    child.on("error", (err) => { spawnError = err.message; });
    child.unref();

    // Wait for it to come up
    for (let i = 0; i < 15; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      if (spawnError) return { started: false, message: `Spawn failed: ${spawnError}` };
      try {
        const res = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(1000) });
        if (res.ok) return { started: true, message: "Ollama started", pid: child.pid };
      } catch { /* still starting */ }
    }

    return { started: false, message: "Ollama process spawned but not responding after 15s" };
  }),
  stop: protectedProcedure.mutation(async () => {
    // Check if running first
    try {
      const res = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(2000) });
      if (!res.ok) return { stopped: true, message: "Ollama was not running" };
    } catch {
      return { stopped: true, message: "Ollama was not running" };
    }

    const { execSync } = await import("child_process");
    try {
      execSync("pkill -f 'ollama serve'", { timeout: 5000, stdio: "ignore" });
    } catch { /* pkill returns non-zero if no process found */ }

    // Wait for it to stop
    for (let i = 0; i < 5; i++) {
      await new Promise((r) => setTimeout(r, 500));
      try {
        await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(500) });
      } catch {
        return { stopped: true, message: "Ollama stopped" };
      }
    }

    return { stopped: false, message: "Ollama still responding after kill attempt" };
  }),
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
  opencodeSettings: opencodeSettingsRouter,
  templates: templatesRouter,
  ide: ideRouter,
  ollama: ollamaRouter,
});
