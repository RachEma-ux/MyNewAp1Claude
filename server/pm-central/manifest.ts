/**
 * PM Central Module Manifest
 *
 * Registered top-level RTLM. Owns the dedicated `pmdb` database and
 * the canonical project-management domain (projects, plans,
 * milestones, tasks, risks, issues, decisions, handoffs).
 *
 * Other modules consume PM Central exclusively through the Module
 * Gateway (see `registerPublicApi` calls in boot) or by submitting
 * handoffs to the accept types declared below. PS specifically must
 * not write PMDB directly — it must hand off via
 * `pmCentral.project.receiveFromPS`.
 */

import type { ModuleManifest } from "../platform/modules/types";
import { pmCentralRouter } from "./router";
import { pmHealth } from "./pm.health";
import { registerModuleHealthAction } from "../platform/modules/register-module-health-action";
import { registerPublicApi } from "../platform/modules/module-gateway";
import { registerHandoffAcceptor } from "../platform/handoff";

export const pmCentralManifest: ModuleManifest = {
  key: "pmCentral",
  name: "PM Central",
  version: "1.0.0",

  runtime: { mode: "embedded", required: false },

  database: {
    kind: "owned",
    key: "pmdb",
    connect: async () => {
      const { getPmDb } = await import("./connection");
      return getPmDb();
    },
    ownedTables: [
      "pm_projects",
      "pm_plans",
      "pm_milestones",
      "pm_tasks",
      "pm_risks",
      "pm_issues",
      "pm_decisions",
      "pm_handoffs",
      "pm_activity_log",
    ],
  },

  router: pmCentralRouter,
  routerKey: "pmCentral",

  permissions: {
    keys: ["pm.read", "pm.write", "pm.admin"],
  },

  governanceActions: [
    {
      key: "pmCentral.project.create",
      description: "Create a PM Central project",
      risk: "low",
      receiptRequired: false,
    },
    {
      key: "pmCentral.project.update",
      description: "Update a PM Central project",
      risk: "low",
      receiptRequired: false,
    },
    {
      key: "pmCentral.project.archive",
      description: "Archive a PM Central project",
      risk: "medium",
      receiptRequired: true,
    },
    {
      key: "pmCentral.project.status.update",
      description: "Update a PM project lifecycle status",
      risk: "medium",
      receiptRequired: true,
    },
    {
      key: "pmCentral.plan.approve",
      description: "Approve a PM Central plan (locks it for execution)",
      risk: "medium",
      receiptRequired: true,
    },
    {
      key: "pmCentral.task.create",
      description: "Create a PM Central task",
      risk: "low",
      receiptRequired: false,
    },
    {
      key: "pmCentral.task.assign",
      description: "Assign a PM Central task to a user",
      risk: "low",
      receiptRequired: false,
    },
    {
      key: "pmCentral.task.status.update",
      description: "Update a PM task status",
      risk: "low",
      receiptRequired: false,
    },
    {
      key: "pmCentral.risk.create",
      description: "Create a PM risk",
      risk: "low",
      receiptRequired: false,
    },
    {
      key: "pmCentral.issue.create",
      description: "Create a PM issue",
      risk: "low",
      receiptRequired: false,
    },
    {
      key: "pmCentral.decision.record",
      description: "Record a PM decision",
      risk: "low",
      receiptRequired: false,
    },
    {
      key: "pmCentral.handoff.accept",
      description: "Accept an inbound PS → PM handoff",
      risk: "low",
      receiptRequired: false,
    },
    {
      key: "pmCentral.handoff.reject",
      description: "Reject an inbound PS → PM handoff",
      risk: "low",
      receiptRequired: false,
    },
    {
      key: "pmCentral.handoff.convert",
      description:
        "Convert an accepted handoff into a PM project (creates pm_projects row)",
      risk: "medium",
      receiptRequired: true,
    },
  ],

  routes: [
    { path: "/pm-central/rtlm", label: "PM Central — Module Dashboard" },
    { path: "/pm-central/rtlm/projects", label: "Projects" },
    { path: "/pm-central/rtlm/projects/:id", label: "Project" },
    { path: "/pm-central/rtlm/tasks", label: "Tasks" },
    { path: "/pm-central/rtlm/milestones", label: "Milestones" },
    { path: "/pm-central/rtlm/risks", label: "Risks" },
    { path: "/pm-central/rtlm/issues", label: "Issues" },
    { path: "/pm-central/rtlm/decisions", label: "Decisions" },
    { path: "/pm-central/rtlm/handoffs", label: "Handoffs" },
    { path: "/pm-central/rtlm/settings", label: "Settings" },
  ],
  navigation: [{ group: "pmCentral", label: "PM Central", order: 4 }],

  boot: async (ctx) => {
    registerModuleHealthAction(pmCentralManifest);

    try {
      const { seedPmDb } = await import("./seed");
      const result = await seedPmDb();
      if (result.seeded) {
        ctx.log("info", "pmdb tables ensured");
      } else {
        ctx.log("warn", `seed skipped — ${result.reason ?? "unknown"}`);
      }
    } catch (err: any) {
      ctx.log("warn", `seed skipped — ${err?.message ?? err}`);
    }

    // ── Public API: dashboard / health / summary ───────────────────
    registerPublicApi({
      module: "pmCentral",
      action: "pmCentral.health",
      handler: async () => {
        const { pmHealth } = await import("./pm.health");
        return pmHealth();
      },
    });

    registerPublicApi({
      module: "pmCentral",
      action: "pmCentral.summary",
      handler: async (input) => {
        const payload = input as { workspaceId?: number };
        if (typeof payload?.workspaceId !== "number") {
          throw new Error("workspaceId is required");
        }
        const { getSummary } = await import("./pm.service");
        return getSummary(payload.workspaceId);
      },
    });

    // ── Public API: projects ───────────────────────────────────────
    registerPublicApi({
      module: "pmCentral",
      action: "pmCentral.project.create",
      handler: async (input) => {
        const payload = input as {
          workspaceId?: number;
          name?: string;
          description?: string;
          priority?: "low" | "normal" | "high" | "critical";
          ownerUserId?: number;
          actorId?: number;
        };
        if (
          typeof payload?.workspaceId !== "number" ||
          !payload?.name ||
          typeof payload?.actorId !== "number"
        ) {
          throw new Error("workspaceId, name, actorId are required");
        }
        const { createProject } = await import("./pm.service");
        const { actorId, ...rest } = payload;
        return createProject(rest as any, actorId);
      },
      descriptor: {
        key: "pmCentral.project.create",
        description: "Create a PM Central project",
        risk: "low",
        receiptRequired: false,
      },
    });

    registerPublicApi({
      module: "pmCentral",
      action: "pmCentral.project.get",
      handler: async (input) => {
        const payload = input as { id?: number };
        if (typeof payload?.id !== "number") throw new Error("id is required");
        const { getProject } = await import("./pm.service");
        return getProject(payload.id);
      },
    });

    registerPublicApi({
      module: "pmCentral",
      action: "pmCentral.project.list",
      handler: async (input) => {
        const payload = input as {
          workspaceId?: number;
          status?: string;
          sourceModule?: string;
          sourceRefId?: number;
          limit?: number;
          offset?: number;
        };
        if (typeof payload?.workspaceId !== "number") {
          throw new Error("workspaceId is required");
        }
        const { listProjects } = await import("./pm.service");
        return listProjects(payload as any);
      },
    });

    registerPublicApi({
      module: "pmCentral",
      action: "pmCentral.project.status.update",
      handler: async (input) => {
        const payload = input as {
          id?: number;
          status?: string;
          actorId?: number;
        };
        if (
          typeof payload?.id !== "number" ||
          !payload?.status ||
          typeof payload?.actorId !== "number"
        ) {
          throw new Error("id, status, actorId are required");
        }
        const { updateProjectStatus } = await import("./pm.service");
        return updateProjectStatus(
          payload.id,
          payload.status as any,
          payload.actorId,
        );
      },
      descriptor: {
        key: "pmCentral.project.status.update",
        description: "Update a PM project lifecycle status",
        risk: "medium",
        receiptRequired: true,
      },
    });

    // ── Public API: tasks ──────────────────────────────────────────
    registerPublicApi({
      module: "pmCentral",
      action: "pmCentral.task.create",
      handler: async (input) => {
        const payload = input as {
          pmProjectId?: number;
          title?: string;
          description?: string;
          assigneeUserId?: number;
          priority?: "low" | "normal" | "high" | "critical";
          milestoneId?: number;
          actorId?: number;
        };
        if (
          typeof payload?.pmProjectId !== "number" ||
          !payload?.title ||
          typeof payload?.actorId !== "number"
        ) {
          throw new Error("pmProjectId, title, actorId are required");
        }
        const { createTask } = await import("./pm.service");
        const { actorId, ...rest } = payload;
        return createTask(rest as any, actorId);
      },
      descriptor: {
        key: "pmCentral.task.create",
        description: "Create a PM Central task",
        risk: "low",
        receiptRequired: false,
      },
    });

    registerPublicApi({
      module: "pmCentral",
      action: "pmCentral.task.status.update",
      handler: async (input) => {
        const payload = input as {
          id?: number;
          status?: string;
          actorId?: number;
        };
        if (
          typeof payload?.id !== "number" ||
          !payload?.status ||
          typeof payload?.actorId !== "number"
        ) {
          throw new Error("id, status, actorId are required");
        }
        const { updateTaskStatus } = await import("./pm.service");
        return updateTaskStatus(
          payload.id,
          payload.status as any,
          payload.actorId,
        );
      },
      descriptor: {
        key: "pmCentral.task.status.update",
        description: "Update a PM task status",
        risk: "low",
        receiptRequired: false,
      },
    });

    registerPublicApi({
      module: "pmCentral",
      action: "pmCentral.project.update",
      handler: async (input) => {
        const payload = input as {
          id?: number;
          name?: string;
          description?: string;
          priority?: "low" | "normal" | "high" | "critical";
          ownerUserId?: number;
          actorId?: number;
        };
        if (
          typeof payload?.id !== "number" ||
          typeof payload?.actorId !== "number"
        ) {
          throw new Error("id and actorId are required");
        }
        const { updateProject } = await import("./pm.service");
        const { id, actorId, ...patch } = payload;
        return updateProject(id, patch as any, actorId);
      },
      descriptor: {
        key: "pmCentral.project.update",
        description: "Update a PM Central project",
        risk: "low",
        receiptRequired: false,
      },
    });

    registerPublicApi({
      module: "pmCentral",
      action: "pmCentral.project.archive",
      handler: async (input) => {
        const payload = input as { id?: number; actorId?: number };
        if (
          typeof payload?.id !== "number" ||
          typeof payload?.actorId !== "number"
        ) {
          throw new Error("id and actorId are required");
        }
        const { archiveProject } = await import("./pm.service");
        return archiveProject(payload.id, payload.actorId);
      },
      descriptor: {
        key: "pmCentral.project.archive",
        description: "Archive a PM Central project",
        risk: "medium",
        receiptRequired: true,
      },
    });

    registerPublicApi({
      module: "pmCentral",
      action: "pmCentral.plan.approve",
      handler: async (input) => {
        const payload = input as { id?: number; actorId?: number };
        if (
          typeof payload?.id !== "number" ||
          typeof payload?.actorId !== "number"
        ) {
          throw new Error("id and actorId are required");
        }
        const { approvePlan } = await import("./pm.service");
        return approvePlan(payload.id, payload.actorId);
      },
      descriptor: {
        key: "pmCentral.plan.approve",
        description: "Approve a PM Central plan (locks it for execution)",
        risk: "medium",
        receiptRequired: true,
      },
    });

    registerPublicApi({
      module: "pmCentral",
      action: "pmCentral.task.assign",
      handler: async (input) => {
        const payload = input as {
          id?: number;
          assigneeUserId?: number;
          actorId?: number;
        };
        if (
          typeof payload?.id !== "number" ||
          typeof payload?.assigneeUserId !== "number" ||
          typeof payload?.actorId !== "number"
        ) {
          throw new Error("id, assigneeUserId, actorId are required");
        }
        const { assignTask } = await import("./pm.service");
        return assignTask(payload.id, payload.assigneeUserId, payload.actorId);
      },
      descriptor: {
        key: "pmCentral.task.assign",
        description: "Assign a PM Central task to a user",
        risk: "low",
        receiptRequired: false,
      },
    });

    registerPublicApi({
      module: "pmCentral",
      action: "pmCentral.risk.create",
      handler: async (input) => {
        const payload = input as {
          pmProjectId?: number;
          title?: string;
          description?: string;
          severity?: "low" | "medium" | "high" | "critical";
          probability?: "low" | "medium" | "high";
          mitigation?: string;
          owner?: string;
          actorId?: number;
        };
        if (
          typeof payload?.pmProjectId !== "number" ||
          !payload?.title ||
          typeof payload?.actorId !== "number"
        ) {
          throw new Error("pmProjectId, title, actorId are required");
        }
        const { createRisk } = await import("./pm.service");
        const { actorId, ...rest } = payload;
        return createRisk(rest as any, actorId);
      },
      descriptor: {
        key: "pmCentral.risk.create",
        description: "Create a PM risk",
        risk: "low",
        receiptRequired: false,
      },
    });

    registerPublicApi({
      module: "pmCentral",
      action: "pmCentral.issue.create",
      handler: async (input) => {
        const payload = input as {
          pmProjectId?: number;
          title?: string;
          description?: string;
          severity?: "low" | "medium" | "high" | "critical";
          owner?: string;
          actorId?: number;
        };
        if (
          typeof payload?.pmProjectId !== "number" ||
          !payload?.title ||
          typeof payload?.actorId !== "number"
        ) {
          throw new Error("pmProjectId, title, actorId are required");
        }
        const { createIssue } = await import("./pm.service");
        const { actorId, ...rest } = payload;
        return createIssue(rest as any, actorId);
      },
      descriptor: {
        key: "pmCentral.issue.create",
        description: "Create a PM issue",
        risk: "low",
        receiptRequired: false,
      },
    });

    registerPublicApi({
      module: "pmCentral",
      action: "pmCentral.decision.record",
      handler: async (input) => {
        const payload = input as {
          pmProjectId?: number;
          title?: string;
          rationale?: string;
          decidedBy?: string;
          actorId?: number;
        };
        if (
          typeof payload?.pmProjectId !== "number" ||
          !payload?.title ||
          typeof payload?.actorId !== "number"
        ) {
          throw new Error("pmProjectId, title, actorId are required");
        }
        const { recordDecision } = await import("./pm.service");
        const { actorId, ...rest } = payload;
        return recordDecision(rest as any, actorId);
      },
      descriptor: {
        key: "pmCentral.decision.record",
        description: "Record a PM decision",
        risk: "low",
        receiptRequired: false,
      },
    });

    // ── Public API: handoffs (PS → PM) ─────────────────────────────
    registerPublicApi({
      module: "pmCentral",
      action: "pmCentral.handoff.receiveFromPS",
      handler: async (input) => {
        const payload = input as Record<string, unknown> & { actorId?: number };
        const { actorId, ...rest } = payload;
        const { receivePsHandoff } = await import("./pm.service");
        return receivePsHandoff(rest as any, actorId);
      },
    });

    registerPublicApi({
      module: "pmCentral",
      action: "pmCentral.handoff.accept",
      handler: async (input) => {
        const payload = input as { id?: number; actorId?: number };
        if (
          typeof payload?.id !== "number" ||
          typeof payload?.actorId !== "number"
        ) {
          throw new Error("id and actorId are required");
        }
        const { acceptHandoff } = await import("./pm.service");
        return acceptHandoff(payload.id, payload.actorId);
      },
      descriptor: {
        key: "pmCentral.handoff.accept",
        description: "Accept an inbound PS → PM handoff",
        risk: "low",
        receiptRequired: false,
      },
    });

    registerPublicApi({
      module: "pmCentral",
      action: "pmCentral.handoff.reject",
      handler: async (input) => {
        const payload = input as {
          id?: number;
          reason?: string;
          actorId?: number;
        };
        if (
          typeof payload?.id !== "number" ||
          !payload?.reason ||
          typeof payload?.actorId !== "number"
        ) {
          throw new Error("id, reason, actorId are required");
        }
        const { rejectHandoff } = await import("./pm.service");
        return rejectHandoff(payload.id, payload.reason, payload.actorId);
      },
      descriptor: {
        key: "pmCentral.handoff.reject",
        description: "Reject an inbound PS → PM handoff",
        risk: "low",
        receiptRequired: false,
      },
    });

    registerPublicApi({
      module: "pmCentral",
      action: "pmCentral.handoff.convert",
      handler: async (input) => {
        const payload = input as { id?: number; actorId?: number };
        if (
          typeof payload?.id !== "number" ||
          typeof payload?.actorId !== "number"
        ) {
          throw new Error("id and actorId are required");
        }
        const { convertHandoffToProject } = await import("./pm.service");
        return convertHandoffToProject(payload.id, payload.actorId);
      },
      descriptor: {
        key: "pmCentral.handoff.convert",
        description:
          "Convert an accepted handoff into a PM project (creates pm_projects row)",
        risk: "medium",
        receiptRequired: true,
      },
    });

    // ── Handoff acceptors ──────────────────────────────────────────
    // Literal type strings used so check:wiring:handoff verifies them
    // statically; constants live in handoffs.ts.
    registerHandoffAcceptor(
      "pmCentral",
      "pmCentral.project.receiveFromPS",
      async (handoff) => {
        const payload = handoff.payload as Record<string, unknown>;
        if (
          typeof payload?.workspaceId !== "number" ||
          typeof payload?.sourceProjectId !== "number" ||
          !payload?.name
        ) {
          return {
            accepted: false,
            reason: "workspaceId, sourceProjectId and name are required",
          };
        }
        const actorId =
          typeof handoff.actorId === "number"
            ? handoff.actorId
            : Number(handoff.actorId) || undefined;
        try {
          const { receivePsHandoff } = await import("./pm.service");
          await receivePsHandoff(
            {
              ...(payload as any),
              sourceModule: "ps",
              handoffId: handoff.handoffId,
            },
            actorId,
          );
          return { accepted: true };
        } catch (err: any) {
          ctx.log(
            "warn",
            `pmCentral.project.receiveFromPS handoff failed: ${err?.message ?? err}`,
          );
          return { accepted: false, reason: err?.message ?? "internal error" };
        }
      },
    );

    registerHandoffAcceptor(
      "pmCentral",
      "pmCentral.project.convertFromPS",
      async (handoff) => {
        const payload = handoff.payload as Record<string, unknown>;
        if (
          typeof payload?.workspaceId !== "number" ||
          typeof payload?.sourceProjectId !== "number" ||
          !payload?.name
        ) {
          return {
            accepted: false,
            reason: "workspaceId, sourceProjectId and name are required",
          };
        }
        const actorId =
          typeof handoff.actorId === "number"
            ? handoff.actorId
            : Number(handoff.actorId) || 0;
        try {
          const { receivePsHandoff, convertHandoffToProject } = await import(
            "./pm.service"
          );
          const handoffRow = await receivePsHandoff(
            {
              ...(payload as any),
              sourceModule: "ps",
              handoffId: handoff.handoffId,
            },
            actorId,
          );
          await convertHandoffToProject(handoffRow.id, actorId);
          return { accepted: true };
        } catch (err: any) {
          ctx.log(
            "warn",
            `pmCentral.project.convertFromPS handoff failed: ${err?.message ?? err}`,
          );
          return { accepted: false, reason: err?.message ?? "internal error" };
        }
      },
    );
  },

  health: pmHealth,

  publicApi: { path: "server/pm-central/public-api.ts" },
  events: {
    emits: [
      "pm.project.created",
      "pm.project.status.changed",
      "pm.project.archived",
      "pm.plan.created",
      "pm.plan.approved",
      "pm.milestone.created",
      "pm.milestone.completed",
      "pm.task.created",
      "pm.task.status.changed",
      "pm.risk.created",
      "pm.issue.created",
      "pm.decision.recorded",
      "pm.handoff.received",
      "pm.handoff.accepted",
      "pm.handoff.rejected",
      "pm.handoff.converted",
    ],
  },
  handoffs: {
    accepts: [
      "pmCentral.project.receiveFromPS",
      "pmCentral.project.convertFromPS",
    ],
    produces: [],
  },
  ports: {
    provided: ["pmCentral.read", "pmCentral.handoff"],
    consumed: [],
  },
  communication: { modes: ["gateway", "handoff", "event"] },
};
