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

/**
 * Demo Project — "Organize Open Source Conference"
 * Concrete example data from OpenProject's standard.yml seed
 * This is a REAL project example, not a generic template.
 */
const DEMO_PROJECT_DATA = {
  description: "This is a demo project to organize an open source conference. It demonstrates project management from initiation through closing with concrete tasks, milestones, and deliverables.",
  status: "active",
  statuses: OP_STATUSES,
  types: OP_TYPES,
  priorities: OP_PRIORITIES,
  projectPhases: OP_PHASES,
  phases: [
    {
      name: "Start of project",
      type: "milestone",
      description: "Project kickoff milestone — marks the official beginning of the conference organization effort.",
      status: "closed",
    },
    {
      name: "Organize open source conference",
      type: "summary",
      description: "Main phase: plan and execute all activities needed to organize the open source conference, from venue selection to attendee invitations.",
      status: "in_progress",
      tasks: [
        { title: "Set date and location of conference", type: "task", status: "in_progress", description: "Research and book a venue. Confirm dates that avoid conflicts with other major tech events. Consider capacity for 200+ attendees, AV equipment, and catering options.", estimatedHours: 16, children: [
          { title: "Send invitation to speakers", type: "task", status: "in_progress", description: "Draft and send CFP (Call for Proposals) to potential speakers. Include submission deadline, talk formats (keynote 45min, talk 25min, lightning 10min), and travel reimbursement policy.", estimatedHours: 8 },
          { title: "Contact sponsoring partners", type: "task", status: "new", description: "Reach out to potential sponsors (Gold €5,000, Silver €2,500, Bronze €1,000). Prepare sponsorship tiers with benefits: logo placement, booth space, attendee list access, speaking slots.", estimatedHours: 12 },
          { title: "Create sponsorship brochure and hand-outs", type: "task", status: "new", description: "Design a professional sponsorship brochure (PDF + print) with event details, expected attendance demographics, sponsor tier benefits, and past event highlights.", estimatedHours: 16 },
        ]},
        { title: "Invite attendees to conference", type: "task", status: "new", description: "Set up registration system (Eventbrite or custom). Send email invitations to mailing lists, post on social media, and coordinate with local tech meetup groups. Early-bird pricing: €49, regular: €79.", estimatedHours: 8 },
        { title: "Setup conference website", type: "task", status: "new", description: "Build a responsive conference website with: schedule/agenda, speaker bios, venue map and directions, registration link, sponsor logos, code of conduct, and FAQ section. Deploy on conference.example.org.", estimatedHours: 24 },
      ],
    },
    {
      name: "Conference",
      type: "milestone",
      description: "The conference day itself — all preparation complete, event takes place. Keynote at 9:00, tracks run until 17:00, networking reception 17:00-19:00.",
      status: "scheduled",
    },
    {
      name: "Follow-up tasks",
      type: "summary",
      description: "Post-conference activities: publish materials, thank participants, and close out the project.",
      status: "to_be_scheduled",
      tasks: [
        { title: "Upload presentations to website", type: "task", status: "new", description: "Collect slide decks from all speakers (PDF + source). Upload to conference website with speaker permission. Add video recordings once edited. Target: within 2 weeks of event.", estimatedHours: 12 },
        { title: "Party for conference supporters :-)", type: "task", status: "new", description: "Organize a thank-you party for the organizing committee, volunteers, and key sponsors.\n\nChecklist:\n- [ ] Beer\n- [ ] Snacks\n- [ ] Music\n- [ ] Even more beer", estimatedHours: 4 },
      ],
    },
    {
      name: "End of project",
      type: "milestone",
      description: "Final milestone — all follow-up tasks complete, budget reconciled, lessons learned documented. Project formally closed.",
      status: "new",
    },
  ],
  activities: [
    { name: "Management",    isDefault: true },
    { name: "Specification", isDefault: false },
    { name: "Development",   isDefault: false },
    { name: "Testing",       isDefault: false },
    { name: "Support",       isDefault: false },
    { name: "Other",         isDefault: false },
  ],
};

/**
 * Scrum Project — "New Company Website"
 * Concrete example data from OpenProject's standard.yml seed
 * This is a REAL project example, not a generic template.
 */
const SCRUM_PROJECT_DATA = {
  description: "This is a demo Scrum project for rebuilding the company website. It includes a product backlog, sprint iterations, bug tracking, and release milestones with concrete user stories and tasks.",
  status: "active",
  statuses: OP_STATUSES,
  types: OP_TYPES,
  priorities: OP_PRIORITIES,
  phases: [
    {
      name: "New website",
      type: "epic",
      description: "Epic: Complete redesign and rebuild of the company website with modern stack, improved UX, and new features.",
      status: "specified",
      tasks: [
        { title: "New login screen", type: "user_story", status: "in_specification", description: "As a user, I want a redesigned login page so that I can sign in with SSO (Google, GitHub) in addition to email/password. The new design should match our updated brand guidelines and include 'Remember me' and 'Forgot password' links.", storyPoints: 5 },
        { title: "Password reset does not send email", type: "bug", status: "confirmed", description: "BUG: When clicking 'Forgot password' and entering a valid email, the system shows 'Reset link sent' but no email is delivered. Checked spam folders. Likely a misconfigured SMTP relay or missing SendGrid API key in production.", storyPoints: 2 },
        { title: "Newsletter registration form", type: "user_story", status: "in_progress", description: "As a visitor, I want to sign up for the company newsletter so that I receive product updates and blog posts. Requirements: email validation, double opt-in confirmation, GDPR consent checkbox, Mailchimp integration.", storyPoints: 3 },
        { title: "Implement product tour", type: "user_story", status: "in_specification", description: "As a new user, I want an interactive guided tour of the application so that I can quickly understand the key features. Use Shepherd.js or Intro.js. Tour should cover: dashboard, project creation, task management, and settings.", storyPoints: 5 },
      ],
    },
    {
      name: "Sprint 1 — Core Website",
      type: "summary",
      description: "First sprint (2 weeks): Build the core website pages — landing page, navigation, contact form, and feature showcase.",
      status: "in_progress",
      tasks: [
        { title: "New landing page", type: "user_story", status: "specified", description: "As a visitor, I want an attractive landing page so that I understand what the product does within 5 seconds. Must include: hero section with CTA, feature highlights (3 columns), testimonials carousel, pricing table, and footer with social links.", storyPoints: 3, children: [
          { title: "Create wireframes for new landing page", type: "task", status: "in_progress", description: "Create wireframes in Figma for desktop (1440px), tablet (768px), and mobile (375px) breakpoints. Include: hero section with illustration, 3-column feature grid, testimonial slider, pricing cards, and sticky CTA button on mobile.", estimatedHours: 8 },
          { title: "Implement landing page HTML/CSS", type: "task", status: "new", description: "Code the landing page from approved Figma wireframes using React + Tailwind CSS. Implement responsive breakpoints, lazy-load images, add subtle scroll animations with Framer Motion. Target Lighthouse score: 90+.", estimatedHours: 16 },
        ]},
        { title: "Feature carousel", type: "user_story", status: "specified", description: "As a visitor, I want to see an interactive feature showcase on the homepage so that I can understand the product's capabilities through screenshots and descriptions.", storyPoints: 5, children: [
          { title: "Make screenshots for feature tour", type: "task", status: "closed", description: "Capture 6 annotated screenshots of key features: (1) Dashboard overview, (2) Project board, (3) Gantt chart, (4) Time tracking, (5) Team collaboration, (6) Reporting. Use 1280x720 resolution, add callout annotations in Figma.", estimatedHours: 4 },
          { title: "Build carousel component", type: "task", status: "new", description: "Build a React carousel component with: auto-advance every 5s, pause on hover, dot indicators, swipe support on mobile (react-swipeable), keyboard navigation (arrow keys), and preloaded images to prevent layout shift.", estimatedHours: 12 },
        ]},
        { title: "Contact form", type: "user_story", status: "specified", description: "As a visitor, I want to submit a contact form so that I can reach the sales team. Fields: name, email, company, message. Validation with react-hook-form + zod. Email delivery via SendGrid API. Success toast + redirect to thank-you page.", storyPoints: 1 },
        { title: "Website navigation structure", type: "user_story", status: "specified", description: "As a visitor, I want clear site navigation so that I can find any page within 2 clicks. Implement: sticky top nav with logo, mega-menu for Products, hamburger menu on mobile, breadcrumbs on inner pages.", storyPoints: 3, children: [
          { title: "Set up navigation concept for website", type: "task", status: "in_specification", description: "Design the information architecture: Home, Products (dropdown with 4 items), Pricing, Blog, Docs, Contact. Create a sitemap diagram. Define mobile navigation behavior (slide-out drawer vs. full-screen overlay).", estimatedHours: 6 },
        ]},
        { title: "Wrong hover color", type: "bug", status: "rejected", description: "BUG (rejected — works as designed): Reported that button hover color is orange instead of blue. Checked brand guidelines v2.3 — orange (#FF922B) is the correct hover color for primary CTAs. The reporter was referencing the old v1 guidelines.", storyPoints: 1 },
      ],
    },
    {
      name: "Product Backlog",
      type: "summary",
      description: "Prioritized backlog of user stories and features not yet assigned to a sprint. Items are groomed and estimated, ready for sprint planning.",
      status: "new",
      tasks: [
        { title: "SSL certificate", type: "user_story", status: "specified", description: "As the DevOps lead, I want to install a Let's Encrypt SSL certificate so that all traffic is served over HTTPS. Set up auto-renewal via certbot cron job. Update nginx config to redirect HTTP → HTTPS. Test with SSL Labs (target: A+ rating).", storyPoints: 3 },
        { title: "Set-up staging environment", type: "user_story", status: "in_specification", description: "As a developer, I want a staging environment that mirrors production so that we can QA features before release. Provision on AWS (t3.medium), replicate production DB schema (sanitized data), configure CI/CD pipeline to auto-deploy develop branch.", storyPoints: 5 },
        { title: "Choose a content management system", type: "user_story", status: "specified", description: "As the content team, we need a CMS so that we can publish blog posts and update website content without developer involvement. Evaluate: Strapi (headless, self-hosted), Contentful (headless, SaaS), WordPress (traditional). Decision criteria: cost, API quality, editorial UX, plugin ecosystem.", storyPoints: 3 },
        { title: "Internal link structure", type: "user_story", status: "closed", description: "As the SEO lead, I want a clean URL hierarchy so that search engines can crawl the site effectively. Implemented: /products/{slug}, /blog/{year}/{slug}, /docs/{category}/{page}. Added 301 redirects from old URLs. Updated XML sitemap.", storyPoints: 3 },
      ],
    },
    {
      name: "Releases",
      type: "summary",
      description: "Release milestones tracking development progress from v1.0 through v2.0.",
      status: "in_progress",
      tasks: [
        { title: "Develop v1.0", type: "summary", status: "in_progress", description: "Core feature development for the initial website launch: landing page, navigation, contact form, basic CMS integration, SSL setup, and CI/CD pipeline.", estimatedHours: 80 },
        { title: "Release v1.0", type: "milestone", status: "new", description: "First production release — go-live with the new company website. Includes: landing page, product pages, contact form, blog (5 launch posts), and analytics (GA4 + Plausible)." },
        { title: "Develop v1.1", type: "summary", status: "new", description: "Post-launch iteration: fix bugs from user feedback, add newsletter signup, implement product tour, and optimize Core Web Vitals (LCP < 2.5s, CLS < 0.1).", estimatedHours: 40 },
        { title: "Release v1.1", type: "milestone", status: "new", description: "Patch release with bug fixes, newsletter integration, and performance improvements based on v1.0 user feedback." },
        { title: "Develop v2.0", type: "summary", status: "new", description: "Major feature release: user authentication (OAuth + email), full-text search (Algolia), customer portal, analytics dashboard, and A/B testing framework.", estimatedHours: 120 },
        { title: "Release v2.0", type: "milestone", status: "new", description: "Major release with full feature set — customer portal, search, auth, and analytics. Target: 3 months after v1.0 launch." },
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
      type TemplateTask = { title: string; type?: string; status?: string; description?: string; estimatedHours?: number; storyPoints?: number; children?: TemplateTask[] };
      type TemplatePhase = { name: string; type?: string; status?: string; description?: string; tasks?: TemplateTask[] };
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
            status: t.status || "todo",
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
            status: phase.status || "todo",
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

      // Seed both demo project templates (concrete examples from OpenProject)
      const [pmTemplate] = await db.insert(pmProjectTemplates).values({
        workspaceId: input.workspaceId,
        name: "Open Source Conference (Demo)",
        description: "Concrete example: Organize an open source conference — venue booking, speaker invitations, sponsor outreach, website setup, and post-event follow-up. Based on OpenProject's demo project.",
        templateData: DEMO_PROJECT_DATA,
        createdBy: ctx.user.id,
      }).returning();

      const [scrumTemplate] = await db.insert(pmProjectTemplates).values({
        workspaceId: input.workspaceId,
        name: "Company Website Rebuild (Scrum Demo)",
        description: "Concrete example: Rebuild company website using Scrum — product backlog with real user stories, 2 sprints, bug tracking, and release milestones v1.0 → v2.0. Based on OpenProject's Scrum demo project.",
        templateData: SCRUM_PROJECT_DATA,
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
