import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import * as db from "../db";
import * as providerDb from "../providers/db";
import { getAuditLogger } from "../services/auditLogger";
import {
  getFrozenSubjects,
  isDriftDetectionActive,
  getLastDriftReport,
  isFrozen,
  getActiveControls,
} from "../governance/scorecard";

export const hqRouter = router({
  // 1. Org Authority — workspace owner, system config, governance freeze status
  orgAuthority: protectedProcedure.query(async ({ ctx }) => {
    const providers = await providerDb.getAllProviders();
    const frozen = await getFrozenSubjects();
    const systemFrozen = isFrozen(0);

    return {
      owner: ctx.user
        ? { id: ctx.user.id, name: ctx.user.name || "Admin", role: ctx.user.role || "user" }
        : null,
      systemStatus: systemFrozen ? "frozen" : "operational",
      freezeActive: systemFrozen,
      frozenCount: frozen.length,
      configItems: {
        providers: providers.length,
        nodeEnv: process.env.NODE_ENV || "development",
        opaConfigured: !!process.env.OPA_URL,
        driftActive: isDriftDetectionActive(),
      },
    };
  }),

  // 2. Roles & Membership — current user, workspace members, RBAC roles
  rolesMembership: protectedProcedure.query(async ({ ctx }) => {
    let rbacRoles: string[] = [];
    try {
      const { GOVERNANCE_ROLES } = require("../governance/rbac-model");
      rbacRoles = [...GOVERNANCE_ROLES];
    } catch { /* rbac module not available */ }

    return {
      currentUser: ctx.user
        ? {
            id: ctx.user.id,
            name: ctx.user.name || "User",
            email: ctx.user.email || "",
            role: ctx.user.role || "user",
          }
        : null,
      members: ctx.user
        ? [
            {
              id: ctx.user.id,
              name: ctx.user.name || "User",
              email: ctx.user.email || "",
              role: ctx.user.role || "user",
              status: "active" as const,
            },
          ]
        : [],
      rbacRoles,
    };
  }),

  // 3. Workspace Directory — user's workspaces from DB
  workspaceDirectory: protectedProcedure.query(async ({ ctx }) => {
    let workspaces: any[] = [];
    try {
      if (ctx.user) {
        workspaces = await db.getUserWorkspaces(ctx.user.id);
      }
    } catch { /* workspace query may fail if table not ready */ }

    return {
      workspaces: workspaces.map((ws: any) => ({
        id: ws.id,
        name: ws.name,
        description: ws.description || "",
        memberCount: ws.memberCount || 1,
        createdAt: ws.createdAt,
      })),
      total: workspaces.length,
    };
  }),

  // 4. Agent Orchestration — agent DB queries, status, promotion state
  agentOrchestration: protectedProcedure.query(async () => {
    let agents: any[] = [];
    try {
      const allModels = await db.getAllModels();
      agents = allModels.filter((m: any) => m.type === "agent");
    } catch { /* agents table may not exist */ }

    return {
      agents: agents.map((a: any) => ({
        id: a.id,
        name: a.name,
        type: a.type || "agent",
        status: a.status || "active",
        promotionState: a.promotionState || "none",
        description: a.description || "",
      })),
      total: agents.length,
      activeCount: agents.filter((a: any) => a.status === "active").length,
    };
  }),

  // 5. Discoverability — catalog entries, provider registry, model count
  discoverability: protectedProcedure.query(async () => {
    const providers = await providerDb.getAllProviders();
    const models = await db.getAllModels();

    let catalogCount = 0;
    try {
      const { getAllCatalogEntries } = require("../db/catalog");
      const entries = await getAllCatalogEntries();
      catalogCount = entries.length;
    } catch { /* catalog may not be available */ }

    return {
      catalogEntries: catalogCount,
      providerCount: providers.length,
      modelCount: models.length,
      totalItems: catalogCount + providers.length + models.length,
    };
  }),

  // 6. Notifications — audit logger recent events, drift alerts, freeze events
  notifications: protectedProcedure.query(async () => {
    const audit = getAuditLogger();
    const events = audit.getRecent(50);
    const frozen = await getFrozenSubjects();
    const driftReport = getLastDriftReport();

    return {
      events: events.map((e: any) => ({
        id: e.event_id,
        timestamp: e.timestamp,
        actionType: e.action_type,
        targetType: e.target_type,
        targetId: e.target_id,
        result: e.decision_result,
        actorId: e.actor_id,
      })),
      frozenAlerts: frozen.map((f: any) => ({
        subjectId: f.subjectId ?? f.id,
        reason: f.reason || "Governance freeze",
        frozenAt: f.frozenAt,
      })),
      driftAlerts: driftReport?.newViolations || [],
      totalEvents: events.length,
    };
  }),

  // 7. Risk Baselines — governance selfCheck output (read-only), risk classifier report
  riskBaselines: protectedProcedure.query(async () => {
    let selfCheck: any = null;
    try {
      const { runSelfCheck: sc } = require("../governance/self-check");
      selfCheck = sc();
    } catch { /* self-check may fail */ }

    const controls = getActiveControls();
    const riskBreakdown = {
      critical: controls.filter(c => c.severity === "critical").length,
      high: controls.filter(c => c.severity === "high").length,
      medium: controls.filter(c => c.severity === "medium").length,
      low: controls.filter(c => c.severity === "low").length,
    };

    return {
      selfCheck: selfCheck
        ? {
            compliant: selfCheck.compliant ?? false,
            score: selfCheck.score ?? 0,
            checkCount: selfCheck.checks?.length ?? 0,
            passedCount: selfCheck.checks?.filter((c: any) => c.passed).length ?? 0,
          }
        : null,
      riskBreakdown,
      totalControls: controls.length,
    };
  }),

  // 8. Collaboration Intel — audit trail activity, workspace member activity
  collaborationIntel: protectedProcedure.query(async ({ ctx }) => {
    const audit = getAuditLogger();
    const events = audit.getRecent(100);

    // Aggregate activity by action type
    const actionCounts: Record<string, number> = {};
    for (const e of events) {
      const action = (e as any).action_type || "unknown";
      actionCounts[action] = (actionCounts[action] || 0) + 1;
    }

    // Aggregate activity by actor
    const actorCounts: Record<string, number> = {};
    for (const e of events) {
      const actor = (e as any).actor_id || "unknown";
      actorCounts[actor] = (actorCounts[actor] || 0) + 1;
    }

    return {
      totalActivity: events.length,
      actionBreakdown: Object.entries(actionCounts).map(([action, count]) => ({ action, count })),
      actorBreakdown: Object.entries(actorCounts).map(([actor, count]) => ({ actor, count })),
      recentEvents: events.slice(0, 10).map((e: any) => ({
        id: e.event_id,
        timestamp: e.timestamp,
        actionType: e.action_type,
        actorId: e.actor_id,
        result: e.decision_result,
      })),
    };
  }),
});
