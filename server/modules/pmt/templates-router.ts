/**
 * PMT Engine — Templates Router
 * Project templates and work-item templates with apply functionality
 */
import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, governedProcedure } from "../../_core/trpc";
import { getDb } from "../../db/connection";
import { requireModule, logActivity } from "../registry";
import { pmProjectTemplates, pmWorkItemTemplates } from "./integrations-schema";
import { projects, tasks } from "./schema";
import { pmStatuses, pmTypes } from "./config-schema";

// ============================================================================
// OpenProject-aligned PM² Lifecycle Template
// Based on opf/openproject standard.yml seed data + PM² methodology
// ============================================================================

/** 14 statuses matching OpenProject's standard.yml with done ratios */
const OP_STATUSES = [
  { name: "New",              color: "#15AABF", isClosed: false, isDefault: true,  position: 1,  doneRatio: 0 },
  { name: "In specification", color: "#4DABF7", isClosed: false, isDefault: false, position: 2,  doneRatio: 10 },
  { name: "Specified",        color: "#4DABF7", isClosed: false, isDefault: false, position: 3,  doneRatio: 20 },
  { name: "Confirmed",        color: "#B197FC", isClosed: false, isDefault: false, position: 4,  doneRatio: 20 },
  { name: "To be scheduled",  color: "#FFD43B", isClosed: false, isDefault: false, position: 5,  doneRatio: 20 },
  { name: "Scheduled",        color: "#A9E34B", isClosed: false, isDefault: false, position: 6,  doneRatio: 20 },
  { name: "In progress",      color: "#CC5DE8", isClosed: false, isDefault: false, position: 7,  doneRatio: 40 },
  { name: "Developed",        color: "#51CF66", isClosed: false, isDefault: false, position: 8,  doneRatio: 70 },
  { name: "In testing",       color: "#22B8CF", isClosed: false, isDefault: false, position: 9,  doneRatio: 80 },
  { name: "Tested",           color: "#20C997", isClosed: false, isDefault: false, position: 10, doneRatio: 90 },
  { name: "Test failed",      color: "#FF6B6B", isClosed: false, isDefault: false, position: 11, doneRatio: 70 },
  { name: "Closed",           color: "#868E96", isClosed: true,  isDefault: false, position: 12, doneRatio: 100 },
  { name: "On hold",          color: "#FFA94D", isClosed: false, isDefault: false, position: 13, doneRatio: 0 },
  { name: "Rejected",         color: "#FF8787", isClosed: true,  isDefault: false, position: 14, doneRatio: 0 },
];

/** 7 work package types matching OpenProject's standard.yml */
const OP_TYPES = [
  { name: "Task",         color: "#1C7ED6", icon: "check-square", isMilestone: false, isDefault: true,  position: 1 },
  { name: "Milestone",    color: "#69DB7C", icon: "flag",         isMilestone: true,  isDefault: true,  position: 2 },
  { name: "Summary task", color: "#FF922B", icon: "layers",       isMilestone: false, isDefault: true,  position: 3 },
  { name: "Feature",      color: "#5C7CFA", icon: "star",         isMilestone: false, isDefault: false, position: 4 },
  { name: "Epic",         color: "#845EF7", icon: "zap",          isMilestone: false, isDefault: false, position: 5 },
  { name: "User story",   color: "#74C0FC", icon: "user",         isMilestone: false, isDefault: false, position: 6 },
  { name: "Bug",          color: "#F03E3E", icon: "bug",          isMilestone: false, isDefault: false, position: 7 },
];

/** 4 PM² project phases with gate names */
const OP_PHASES = [
  { name: "Initiating", color: "#FF922B", gate: "Ready for Planning (RfP)" },
  { name: "Planning",   color: "#F03E3E", gate: "Ready for Executing (RfE)" },
  { name: "Executing",  color: "#CC5DE8", gate: "Ready for Closing (RfC)" },
  { name: "Closing",    color: "#C0EB75", gate: null },
];

/** 4 priorities matching OpenProject */
const OP_PRIORITIES = [
  { name: "Low",       color: "#15AABF", position: 1, isDefault: false },
  { name: "Normal",    color: "#4DABF7", position: 2, isDefault: true },
  { name: "High",      color: "#FFD43B", position: 3, isDefault: false },
  { name: "Immediate", color: "#CC5DE8", position: 4, isDefault: false },
];

/** Built-in "Full PM Lifecycle" template — OpenProject standard.yml + PM² */
const PM_LIFECYCLE_TEMPLATE_DATA = {
  description: "Complete PM² lifecycle based on OpenProject — 4 phases (Initiating → Planning → Executing → Closing) with phase gates (RfP, RfE, RfC), 14 statuses, 7 work package types, PM² deliverables, and monitoring activities.",
  status: "active",
  statuses: OP_STATUSES,
  types: OP_TYPES,
  priorities: OP_PRIORITIES,
  projectPhases: OP_PHASES,
  phases: [
    {
      name: "Initiating",
      type: "summary",
      description: "Define project outcomes, justify the investment, and gain approval to proceed. Primary driver: Project Owner (PO).",
      tasks: [
        { title: "Project Initiation Request", type: "task", description: "Capture requestor, business needs, desired outcomes, and initial constraints.", estimatedHours: 8 },
        { title: "Stakeholder identification & analysis", type: "task", description: "Identify all stakeholders, assess interest/influence, build stakeholder matrix.", estimatedHours: 8 },
        { title: "Business Case", type: "task", description: "Document justification, budget context, alternatives considered, expected ROI, and high-level roadmap.", estimatedHours: 16 },
        { title: "Project Charter", type: "task", description: "Define scope, cost, time, risk, milestones, deliverables, and project organization structure.", estimatedHours: 16 },
        { title: "Feasibility assessment", type: "task", description: "Technical, economic, and operational feasibility review.", estimatedHours: 8 },
        { title: "Ready for Planning (RfP) — Gate", type: "milestone", description: "Phase gate: Project Owner and Steering Committee approve transition to Planning." },
      ],
    },
    {
      name: "Planning",
      type: "summary",
      description: "Develop the project scope into an executable plan with schedules, budgets, resources, and risk strategies. Primary driver: Project Manager (PM).",
      tasks: [
        { title: "Planning kick-off meeting", type: "task", description: "Align the core team on objectives, approach, and governance.", estimatedHours: 4 },
        { title: "Project Handbook", type: "task", description: "Document management approach, roles & responsibilities, escalation paths, and decision-making rules.", estimatedHours: 12 },
        { title: "Work Breakdown Structure (WBS)", type: "task", description: "Decompose deliverables into manageable work packages with effort estimates.", estimatedHours: 16 },
        { title: "Schedule & timeline planning", type: "task", description: "Create Gantt chart with dependencies, critical path, and buffer. Set baseline.", estimatedHours: 12 },
        { title: "Resource allocation", type: "task", description: "Assign team members, define availability, and resolve resource conflicts.", estimatedHours: 8 },
        { title: "Budget estimation", type: "task", description: "Bottom-up cost estimation by work package. Include contingency reserves.", estimatedHours: 12 },
        { title: "Risk identification & mitigation plan", type: "task", description: "Build risk register: identify, assess probability/impact, define response strategies.", estimatedHours: 12 },
        { title: "Communication plan", type: "task", description: "Define reporting frequency, channels, stakeholder distribution lists, and escalation rules.", estimatedHours: 6 },
        { title: "Deliverables Acceptance Plan", type: "task", description: "Define acceptance criteria, review process, and sign-off authorities for each deliverable.", estimatedHours: 6 },
        { title: "Transition plan", type: "task", description: "Plan handover from project team to operations/business, including training and documentation.", estimatedHours: 8 },
        { title: "Business Implementation Plan", type: "task", description: "Plan organizational change management, user adoption, and go-live activities.", estimatedHours: 8 },
        { title: "Ready for Executing (RfE) — Gate", type: "milestone", description: "Phase gate: PM and Steering Committee approve the project plan and authorize execution." },
      ],
    },
    {
      name: "Executing",
      type: "summary",
      description: "Produce project deliverables according to the plan. Coordinate resources, manage quality, and communicate progress. Primary driver: Project Core Team (PCT).",
      tasks: [
        { title: "Executing kick-off meeting", type: "task", description: "Communicate execution approach, assignments, and reporting cadence to the full team.", estimatedHours: 4 },
        { title: "Sprint/iteration setup", type: "task", description: "Define iteration boundaries, sprint goals, and backlog priorities.", estimatedHours: 4 },
        { title: "Development & implementation", type: "summary", description: "Core deliverable production — design, build, integrate, and document.", estimatedHours: 120 },
        { title: "Quality assurance & testing", type: "task", description: "Execute test plans, validate against acceptance criteria, track defects.", estimatedHours: 40 },
        { title: "Stakeholder communication & reporting", type: "task", description: "Distribute status reports per communication plan. Conduct steering committee reviews.", estimatedHours: 8 },
        { title: "Change request management", type: "task", description: "Evaluate scope change requests: impact on schedule, budget, resources. Obtain approval.", estimatedHours: 8 },
        { title: "Deliverable hand-over", type: "task", description: "Formally hand over completed deliverables per the Deliverables Acceptance Plan.", estimatedHours: 8 },
        { title: "Ready for Closing (RfC) — Gate", type: "milestone", description: "Phase gate: All deliverables accepted. PM and PO authorize transition to Closing." },
      ],
    },
    {
      name: "Monitor & Control",
      type: "summary",
      description: "Continuous activity running throughout all phases. Measure performance against baselines and take corrective action.",
      tasks: [
        { title: "Progress tracking & KPI dashboard", type: "task", description: "Track schedule variance (SV), cost variance (CV), earned value (EV), and % complete.", estimatedHours: 16 },
        { title: "Budget vs. actual monitoring", type: "task", description: "Compare actual spend to planned budget by work package. Flag overruns.", estimatedHours: 8 },
        { title: "Risk register updates", type: "task", description: "Review and update risk register: new risks, changed probabilities, residual risks.", estimatedHours: 8 },
        { title: "Scope change control", type: "task", description: "Evaluate and document all scope changes. Update baselines if approved.", estimatedHours: 6 },
        { title: "Quality control reviews", type: "task", description: "Conduct peer reviews, inspections, and quality audits per QA plan.", estimatedHours: 12 },
        { title: "Status reporting", type: "task", description: "Weekly/biweekly status reports. Monthly executive summary for steering committee.", estimatedHours: 12 },
        { title: "Issue & escalation management", type: "task", description: "Log issues, assign owners, track resolution. Escalate blockers per governance rules.", estimatedHours: 8 },
      ],
    },
    {
      name: "Closing",
      type: "summary",
      description: "Formally close the project: transfer deliverables, capture lessons learned, release resources, and archive documents. Primary driver: All stakeholders.",
      tasks: [
        { title: "Final deliverable review & acceptance", type: "task", description: "Verify all deliverables meet acceptance criteria. Obtain formal sign-off.", estimatedHours: 8 },
        { title: "Project-End Report", type: "task", description: "Document final scope, schedule, budget, risks realized, and outcomes achieved vs. business case.", estimatedHours: 12 },
        { title: "Quality Review Report", type: "task", description: "Summarize quality metrics, defect rates, and lessons for future QA planning.", estimatedHours: 6 },
        { title: "Lessons learned documentation", type: "task", description: "Conduct retrospective: what went well, what to improve, recommendations for future projects.", estimatedHours: 8 },
        { title: "Knowledge transfer & training", type: "task", description: "Ensure operations team is trained and documentation is complete for ongoing support.", estimatedHours: 12 },
        { title: "Archive project artifacts", type: "task", description: "Archive all project documents, code, configurations, and communications in the organizational repository.", estimatedHours: 4 },
        { title: "Resource release & recognition", type: "task", description: "Release team members, close contracts, and recognize contributions.", estimatedHours: 4 },
        { title: "Administrative closure", type: "task", description: "Close financial accounts, update portfolio status, and notify stakeholders of project completion.", estimatedHours: 4 },
        { title: "Project Closure — Sign-off", type: "milestone", description: "Final milestone: Project Owner and Steering Committee formally close the project." },
      ],
    },
  ],
  // Time entry activity categories (for time tracking)
  activities: [
    { name: "Management",    isDefault: true },
    { name: "Specification", isDefault: false },
    { name: "Development",   isDefault: false },
    { name: "Testing",       isDefault: false },
    { name: "Support",       isDefault: false },
    { name: "Other",         isDefault: false },
  ],
};

/** Built-in Scrum/Agile template — OpenProject-inspired */
const SCRUM_TEMPLATE_DATA = {
  description: "Agile/Scrum project with epics, user stories, sprints, backlogs, and release milestones. Based on OpenProject's Scrum demo project.",
  status: "active",
  statuses: OP_STATUSES,
  types: OP_TYPES,
  priorities: OP_PRIORITIES,
  phases: [
    {
      name: "Product Backlog",
      type: "summary",
      description: "All user stories, features, and epics awaiting prioritization and sprint assignment.",
      tasks: [
        { title: "New login screen", type: "user_story", description: "Redesign the login page with SSO options and improved UX.", storyPoints: 5 },
        { title: "Password reset does not send email", type: "bug", description: "Bug: Password reset flow fails to trigger email notification.", storyPoints: 2 },
        { title: "SSL certificate", type: "user_story", description: "Procure and install SSL certificate for production domain.", storyPoints: 3 },
        { title: "Set-up staging environment", type: "user_story", description: "Configure staging server that mirrors production for QA.", storyPoints: 5 },
        { title: "Choose a content management system", type: "user_story", description: "Evaluate CMS options (WordPress, Strapi, etc.) and select one.", storyPoints: 3 },
        { title: "Newsletter registration form", type: "user_story", description: "Build email newsletter signup with double opt-in.", storyPoints: 3 },
        { title: "Implement product tour", type: "user_story", description: "Interactive onboarding walkthrough for new users.", storyPoints: 5 },
        { title: "Internal link structure", type: "user_story", description: "Define SEO-friendly URL hierarchy and implement redirects.", storyPoints: 3 },
      ],
    },
    {
      name: "Sprint 1",
      type: "summary",
      description: "First sprint iteration — core website features.",
      tasks: [
        { title: "New landing page", type: "user_story", description: "Design and implement responsive landing page.", storyPoints: 3, children: [
          { title: "Create wireframes for new landing page", type: "task", description: "Wireframe desktop & mobile layouts in Figma.", estimatedHours: 8 },
          { title: "Implement landing page HTML/CSS", type: "task", description: "Code responsive landing page from approved wireframes.", estimatedHours: 16 },
        ]},
        { title: "Feature carousel", type: "user_story", description: "Interactive feature showcase carousel on homepage.", storyPoints: 5, children: [
          { title: "Make screenshots for feature tour", type: "task", description: "Capture annotated screenshots of all features.", estimatedHours: 4 },
          { title: "Build carousel component", type: "task", description: "Implement auto-advancing carousel with touch/swipe support.", estimatedHours: 12 },
        ]},
        { title: "Contact form", type: "user_story", description: "Contact form with validation and email delivery.", storyPoints: 1 },
        { title: "Website navigation structure", type: "user_story", description: "Define and implement site-wide navigation.", storyPoints: 3, children: [
          { title: "Set up navigation concept for website", type: "task", description: "Design IA and navigation patterns.", estimatedHours: 6 },
        ]},
        { title: "Wrong hover color", type: "bug", description: "Hover state on buttons uses incorrect brand color.", storyPoints: 1 },
      ],
    },
    {
      name: "Sprint 2",
      type: "summary",
      description: "Second sprint — advanced features and stabilization.",
      tasks: [
        { title: "User authentication system", type: "user_story", description: "Login, registration, and session management.", storyPoints: 8 },
        { title: "Search functionality", type: "user_story", description: "Full-text search across all content.", storyPoints: 5 },
        { title: "Performance optimization", type: "task", description: "Optimize images, enable caching, and minimize bundle size.", estimatedHours: 16 },
        { title: "Accessibility audit", type: "task", description: "WCAG 2.1 AA compliance review and fixes.", estimatedHours: 12 },
      ],
    },
    {
      name: "Releases",
      type: "summary",
      description: "Release milestones and deployment activities.",
      tasks: [
        { title: "Develop v1.0", type: "summary", description: "Complete core feature development for initial release.", estimatedHours: 80 },
        { title: "Release v1.0", type: "milestone", description: "First production release with core features." },
        { title: "Develop v1.1", type: "summary", description: "Bug fixes and minor improvements from v1.0 feedback.", estimatedHours: 40 },
        { title: "Release v1.1", type: "milestone", description: "Patch release with bug fixes and UX improvements." },
        { title: "Develop v2.0", type: "summary", description: "Major feature additions: auth, search, analytics.", estimatedHours: 120 },
        { title: "Release v2.0", type: "milestone", description: "Major release with full feature set." },
      ],
    },
  ],
};

const projectTemplatesRouter = router({
  list: protectedProcedure
    .input(z.object({ workspaceId: z.number() }))
    .query(async ({ input }) => {
      await requireModule(input.workspaceId, "pmt");
      const db = getDb();
      if (!db) return [];
      return db.select().from(pmProjectTemplates)
        .where(eq(pmProjectTemplates.workspaceId, input.workspaceId))
        .orderBy(desc(pmProjectTemplates.createdAt));
    }),

  get: protectedProcedure
    .input(z.object({ id: z.number(), workspaceId: z.number() }))
    .query(async ({ input }) => {
      await requireModule(input.workspaceId, "pmt");
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const rows = await db.select().from(pmProjectTemplates)
        .where(and(eq(pmProjectTemplates.id, input.id), eq(pmProjectTemplates.workspaceId, input.workspaceId)))
        .limit(1);
      if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Project template not found" });
      return rows[0];
    }),

  create: governedProcedure
    .input(z.object({
      workspaceId: z.number(),
      name: z.string().min(1).max(255),
      description: z.string().optional(),
      templateData: z.record(z.unknown()),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireModule(input.workspaceId, "pmt");
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [created] = await db.insert(pmProjectTemplates).values({
        workspaceId: input.workspaceId,
        name: input.name,
        description: input.description,
        templateData: input.templateData,
        createdBy: ctx.user.id,
      }).returning();
      await logActivity({ workspaceId: input.workspaceId, moduleKey: "pmt", actorId: ctx.user.id, action: "projectTemplate.create", targetType: "project_template", targetId: created.id });
      return created;
    }),

  update: governedProcedure
    .input(z.object({
      id: z.number(),
      workspaceId: z.number(),
      name: z.string().min(1).max(255).optional(),
      description: z.string().optional(),
      templateData: z.record(z.unknown()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireModule(input.workspaceId, "pmt");
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const { id, workspaceId, ...updates } = input;
      await db.update(pmProjectTemplates).set(updates)
        .where(and(eq(pmProjectTemplates.id, id), eq(pmProjectTemplates.workspaceId, workspaceId)));
      await logActivity({ workspaceId, moduleKey: "pmt", actorId: ctx.user.id, action: "projectTemplate.update", targetType: "project_template", targetId: id });
      return { success: true };
    }),

  delete: governedProcedure
    .input(z.object({ id: z.number(), workspaceId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await requireModule(input.workspaceId, "pmt");
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      await db.delete(pmProjectTemplates)
        .where(and(eq(pmProjectTemplates.id, input.id), eq(pmProjectTemplates.workspaceId, input.workspaceId)));
      await logActivity({ workspaceId: input.workspaceId, moduleKey: "pmt", actorId: ctx.user.id, action: "projectTemplate.delete", targetType: "project_template", targetId: input.id });
      return { success: true };
    }),

  useTemplate: governedProcedure
    .input(z.object({ id: z.number(), workspaceId: z.number(), name: z.string().min(1).max(255) }))
    .mutation(async ({ ctx, input }) => {
      await requireModule(input.workspaceId, "pmt");
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const rows = await db.select().from(pmProjectTemplates)
        .where(and(eq(pmProjectTemplates.id, input.id), eq(pmProjectTemplates.workspaceId, input.workspaceId)))
        .limit(1);
      if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Project template not found" });
      const tpl = rows[0].templateData as Record<string, unknown>;

      // 1. Create the project
      const [created] = await db.insert(projects).values({
        workspaceId: input.workspaceId,
        name: input.name,
        description: (tpl.description as string) || undefined,
        status: (tpl.status as string) || "active",
        ownerId: ctx.user.id,
      }).returning();

      // 2. Seed statuses
      const statusArr = tpl.statuses as Array<{ name: string; color: string; isClosed?: boolean; isDefault?: boolean; position: number }> | undefined;
      if (statusArr && statusArr.length > 0) {
        await db.insert(pmStatuses).values(
          statusArr.map((s) => ({
            workspaceId: input.workspaceId,
            name: s.name,
            color: s.color,
            isClosed: s.isClosed ?? false,
            isDefault: s.isDefault ?? false,
            position: s.position,
          }))
        );
      }

      // 3. Seed types
      const typeArr = tpl.types as Array<{ name: string; color: string; icon?: string; isMilestone?: boolean; position: number }> | undefined;
      if (typeArr && typeArr.length > 0) {
        await db.insert(pmTypes).values(
          typeArr.map((t) => ({
            workspaceId: input.workspaceId,
            name: t.name,
            color: t.color,
            icon: t.icon,
            isMilestone: t.isMilestone ?? false,
            position: t.position,
          }))
        );
      }

      // 4. Seed phases + tasks (parent-child, supports nested children)
      type TemplateTask = { title: string; type?: string; description?: string; estimatedHours?: number; storyPoints?: number; children?: TemplateTask[] };
      type TemplatePhase = { name: string; type?: string; description?: string; tasks?: TemplateTask[] };
      const phasesArr = tpl.phases as TemplatePhase[] | undefined;
      if (phasesArr && phasesArr.length > 0) {
        let position = 1;

        const insertTask = async (t: TemplateTask, parentId: number | null): Promise<void> => {
          const [row] = await db.insert(tasks).values({
            workspaceId: input.workspaceId,
            projectId: created.id,
            title: t.title,
            description: t.description || undefined,
            type: t.type || "task",
            status: "todo",
            priority: "medium",
            parentId,
            estimatedHours: t.estimatedHours || undefined,
            storyPoints: t.storyPoints || undefined,
            position: position++,
          }).returning();
          // Recurse for nested children
          if (t.children && t.children.length > 0) {
            for (const child of t.children) {
              await insertTask(child, row.id);
            }
          }
        };

        for (const phase of phasesArr) {
          // Create parent phase/summary task
          const [parentTask] = await db.insert(tasks).values({
            workspaceId: input.workspaceId,
            projectId: created.id,
            title: phase.name,
            description: phase.description || undefined,
            type: phase.type || "task",
            status: "todo",
            priority: "medium",
            position: position++,
          }).returning();

          // Create child tasks (with recursive nesting)
          if (phase.tasks && phase.tasks.length > 0) {
            for (const child of phase.tasks) {
              await insertTask(child, parentTask.id);
            }
          }
        }
      }

      await logActivity({ workspaceId: input.workspaceId, moduleKey: "pmt", actorId: ctx.user.id, action: "projectTemplate.apply", targetType: "project", targetId: created.id, metadata: { templateId: input.id } });
      return created;
    }),

  seed: governedProcedure
    .input(z.object({ workspaceId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await requireModule(input.workspaceId, "pmt");
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      // Seed both PM² Lifecycle and Scrum templates
      const [pmTemplate] = await db.insert(pmProjectTemplates).values({
        workspaceId: input.workspaceId,
        name: "PM² Lifecycle (OpenProject)",
        description: "Complete PM² lifecycle — 4 phases (Initiating → Planning → Executing → Closing), 3 phase gates (RfP, RfE, RfC), 14 statuses, 7 work package types, PM² deliverables, and monitoring activities. Based on OpenProject standard data.",
        templateData: PM_LIFECYCLE_TEMPLATE_DATA,
        createdBy: ctx.user.id,
      }).returning();

      const [scrumTemplate] = await db.insert(pmProjectTemplates).values({
        workspaceId: input.workspaceId,
        name: "Scrum / Agile Project",
        description: "Agile project with product backlog, sprints, epics, user stories, bugs, and release milestones. Based on OpenProject Scrum demo project.",
        templateData: SCRUM_TEMPLATE_DATA,
        createdBy: ctx.user.id,
      }).returning();

      await logActivity({ workspaceId: input.workspaceId, moduleKey: "pmt", actorId: ctx.user.id, action: "projectTemplate.seed", targetType: "project_template", targetId: pmTemplate.id, metadata: { templates: [pmTemplate.id, scrumTemplate.id] } });
      return { pm: pmTemplate, scrum: scrumTemplate };
    }),
});

const workItemTemplatesRouter = router({
  list: protectedProcedure
    .input(z.object({ workspaceId: z.number() }))
    .query(async ({ input }) => {
      await requireModule(input.workspaceId, "pmt");
      const db = getDb();
      if (!db) return [];
      return db.select().from(pmWorkItemTemplates)
        .where(eq(pmWorkItemTemplates.workspaceId, input.workspaceId))
        .orderBy(desc(pmWorkItemTemplates.createdAt));
    }),

  get: protectedProcedure
    .input(z.object({ id: z.number(), workspaceId: z.number() }))
    .query(async ({ input }) => {
      await requireModule(input.workspaceId, "pmt");
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const rows = await db.select().from(pmWorkItemTemplates)
        .where(and(eq(pmWorkItemTemplates.id, input.id), eq(pmWorkItemTemplates.workspaceId, input.workspaceId)))
        .limit(1);
      if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Work item template not found" });
      return rows[0];
    }),

  create: governedProcedure
    .input(z.object({
      workspaceId: z.number(),
      name: z.string().min(1).max(255),
      description: z.string().optional(),
      templateData: z.record(z.unknown()),
      typeId: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireModule(input.workspaceId, "pmt");
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [created] = await db.insert(pmWorkItemTemplates).values({
        workspaceId: input.workspaceId,
        name: input.name,
        description: input.description,
        templateData: input.templateData,
        typeId: input.typeId,
        createdBy: ctx.user.id,
      }).returning();
      await logActivity({ workspaceId: input.workspaceId, moduleKey: "pmt", actorId: ctx.user.id, action: "workItemTemplate.create", targetType: "work_item_template", targetId: created.id });
      return created;
    }),

  update: governedProcedure
    .input(z.object({
      id: z.number(),
      workspaceId: z.number(),
      name: z.string().min(1).max(255).optional(),
      description: z.string().optional(),
      templateData: z.record(z.unknown()).optional(),
      typeId: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireModule(input.workspaceId, "pmt");
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const { id, workspaceId, ...updates } = input;
      await db.update(pmWorkItemTemplates).set(updates)
        .where(and(eq(pmWorkItemTemplates.id, id), eq(pmWorkItemTemplates.workspaceId, workspaceId)));
      await logActivity({ workspaceId, moduleKey: "pmt", actorId: ctx.user.id, action: "workItemTemplate.update", targetType: "work_item_template", targetId: id });
      return { success: true };
    }),

  delete: governedProcedure
    .input(z.object({ id: z.number(), workspaceId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await requireModule(input.workspaceId, "pmt");
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      await db.delete(pmWorkItemTemplates)
        .where(and(eq(pmWorkItemTemplates.id, input.id), eq(pmWorkItemTemplates.workspaceId, input.workspaceId)));
      await logActivity({ workspaceId: input.workspaceId, moduleKey: "pmt", actorId: ctx.user.id, action: "workItemTemplate.delete", targetType: "work_item_template", targetId: input.id });
      return { success: true };
    }),

  useTemplate: governedProcedure
    .input(z.object({ id: z.number(), workspaceId: z.number(), projectId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await requireModule(input.workspaceId, "pmt");
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const rows = await db.select().from(pmWorkItemTemplates)
        .where(and(eq(pmWorkItemTemplates.id, input.id), eq(pmWorkItemTemplates.workspaceId, input.workspaceId)))
        .limit(1);
      if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Work item template not found" });
      const tpl = rows[0].templateData as Record<string, unknown>;
      const [created] = await db.insert(tasks).values({
        workspaceId: input.workspaceId,
        projectId: input.projectId,
        title: (tpl.title as string) || rows[0].name,
        description: (tpl.description as string) || undefined,
        priority: (tpl.priority as string) || "medium",
        type: (tpl.type as string) || "task",
        status: "todo",
      }).returning();
      await logActivity({ workspaceId: input.workspaceId, moduleKey: "pmt", actorId: ctx.user.id, action: "workItemTemplate.apply", targetType: "task", targetId: created.id, metadata: { templateId: input.id } });
      return created;
    }),
});

export const templatesRouter = router({
  projectTemplates: projectTemplatesRouter,
  workItemTemplates: workItemTemplatesRouter,
});
