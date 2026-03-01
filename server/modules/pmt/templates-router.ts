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
// Shared OpenProject-aligned constants
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

const OP_ACTIVITIES = [
  { name: "Management",    isDefault: true },
  { name: "Specification", isDefault: false },
  { name: "Development",   isDefault: false },
  { name: "Testing",       isDefault: false },
  { name: "Support",       isDefault: false },
  { name: "Other",         isDefault: false },
];

// ============================================================================
// ABSTRACT TEMPLATES (reusable project structures — no concrete data)
// ============================================================================

/** PM² Waterfall Lifecycle — 5 phases with gates and standard PM deliverables */
const PM_LIFECYCLE_TEMPLATE = {
  description: "PM² Waterfall project lifecycle with 5 phases, gate reviews, and standard PM deliverables. Follows the EU PM² methodology (Initiating → Planning → Executing → Monitor & Control → Closing).",
  status: "active",
  statuses: OP_STATUSES,
  types: OP_TYPES,
  priorities: OP_PRIORITIES,
  projectPhases: OP_PHASES,
  phases: [
    { name: "Initiating", type: "summary", tasks: [
      { title: "Define project scope & objectives", type: "task" },
      { title: "Identify stakeholders", type: "task" },
      { title: "Create project charter", type: "task" },
      { title: "Feasibility assessment", type: "task" },
      { title: "Business case", type: "task" },
      { title: "Initiation Gate — Ready for Planning (RfP)", type: "milestone" },
    ]},
    { name: "Planning", type: "summary", tasks: [
      { title: "Work breakdown structure (WBS)", type: "task" },
      { title: "Schedule & timeline planning", type: "task" },
      { title: "Resource allocation", type: "task" },
      { title: "Budget estimation", type: "task" },
      { title: "Risk identification & mitigation plan", type: "task" },
      { title: "Quality management plan", type: "task" },
      { title: "Communication plan", type: "task" },
      { title: "Procurement plan", type: "task" },
      { title: "Planning Gate — Ready for Executing (RfE)", type: "milestone" },
    ]},
    { name: "Executing", type: "summary", tasks: [
      { title: "Team kickoff", type: "task" },
      { title: "Development / implementation", type: "task" },
      { title: "Quality assurance & testing", type: "task" },
      { title: "Stakeholder communication", type: "task" },
      { title: "Change request management", type: "task" },
      { title: "Execution Gate — Ready for Closing (RfC)", type: "milestone" },
    ]},
    { name: "Monitor & Control", type: "summary", tasks: [
      { title: "KPI tracking & dashboard", type: "task" },
      { title: "Budget vs. actual monitoring", type: "task" },
      { title: "Risk register updates", type: "task" },
      { title: "Scope change control", type: "task" },
      { title: "Progress status reports", type: "task" },
    ]},
    { name: "Closing", type: "summary", tasks: [
      { title: "Final deliverable review", type: "task" },
      { title: "Acceptance sign-off", type: "task" },
      { title: "Lessons learned documentation", type: "task" },
      { title: "Archive project artifacts", type: "task" },
      { title: "Team release & recognition", type: "task" },
      { title: "Project Closure", type: "milestone" },
    ]},
  ],
  activities: OP_ACTIVITIES,
};

/** Scrum / Agile — Sprint-based structure with product backlog */
const SCRUM_AGILE_TEMPLATE = {
  description: "Scrum / Agile project template with product backlog, sprint iterations, retrospectives, and release milestones. Ideal for software development and iterative delivery.",
  status: "active",
  statuses: OP_STATUSES,
  types: OP_TYPES,
  priorities: OP_PRIORITIES,
  phases: [
    { name: "Product Backlog", type: "epic", tasks: [
      { title: "User story 1", type: "user_story" },
      { title: "User story 2", type: "user_story" },
      { title: "User story 3", type: "user_story" },
      { title: "User story 4", type: "user_story" },
      { title: "User story 5", type: "user_story" },
    ]},
    { name: "Sprint 1", type: "summary", tasks: [
      { title: "Sprint 1 planning", type: "task" },
      { title: "Story implementation", type: "user_story", children: [
        { title: "Design", type: "task" },
        { title: "Development", type: "task" },
        { title: "Code review", type: "task" },
      ]},
      { title: "Sprint 1 review & demo", type: "task" },
      { title: "Sprint 1 retrospective", type: "task" },
    ]},
    { name: "Sprint 2", type: "summary", tasks: [
      { title: "Sprint 2 planning", type: "task" },
      { title: "Story implementation", type: "user_story", children: [
        { title: "Design", type: "task" },
        { title: "Development", type: "task" },
        { title: "Code review", type: "task" },
      ]},
      { title: "Sprint 2 review & demo", type: "task" },
      { title: "Sprint 2 retrospective", type: "task" },
    ]},
    { name: "Sprint 3", type: "summary", tasks: [
      { title: "Sprint 3 planning", type: "task" },
      { title: "Story implementation", type: "user_story", children: [
        { title: "Design", type: "task" },
        { title: "Development", type: "task" },
        { title: "Testing", type: "task" },
      ]},
      { title: "Sprint 3 review & demo", type: "task" },
      { title: "Sprint 3 retrospective", type: "task" },
    ]},
    { name: "Release Planning", type: "summary", tasks: [
      { title: "Release v1.0", type: "milestone" },
      { title: "Release v1.1", type: "milestone" },
      { title: "Release v2.0", type: "milestone" },
    ]},
  ],
  activities: OP_ACTIVITIES,
};

/** Kanban — Continuous flow with simple statuses */
const KANBAN_TEMPLATE = {
  description: "Kanban continuous-flow template with simplified statuses, WIP limits concept, and lean workflow. Best for support teams, maintenance, and continuous delivery.",
  status: "active",
  statuses: [
    { name: "Backlog",     color: "#868E96", isClosed: false, isDefault: true,  position: 1, doneRatio: 0 },
    { name: "Ready",       color: "#4DABF7", isClosed: false, isDefault: false, position: 2, doneRatio: 10 },
    { name: "In Progress", color: "#CC5DE8", isClosed: false, isDefault: false, position: 3, doneRatio: 50 },
    { name: "In Review",   color: "#FFD43B", isClosed: false, isDefault: false, position: 4, doneRatio: 80 },
    { name: "Done",        color: "#51CF66", isClosed: true,  isDefault: false, position: 5, doneRatio: 100 },
    { name: "Blocked",     color: "#FF6B6B", isClosed: false, isDefault: false, position: 6, doneRatio: 0 },
  ],
  types: [
    { name: "Task",        color: "#1C7ED6", icon: "check-square", isMilestone: false, isDefault: true,  position: 1 },
    { name: "Bug",         color: "#F03E3E", icon: "bug",          isMilestone: false, isDefault: false, position: 2 },
    { name: "Feature",     color: "#5C7CFA", icon: "star",         isMilestone: false, isDefault: false, position: 3 },
    { name: "Improvement", color: "#20C997", icon: "trending-up",  isMilestone: false, isDefault: false, position: 4 },
  ],
  priorities: OP_PRIORITIES,
  phases: [
    { name: "Backlog", type: "summary", tasks: [
      { title: "Item 1", type: "task" },
      { title: "Item 2", type: "task" },
      { title: "Item 3", type: "task" },
    ]},
    { name: "In Progress (WIP limit: 3)", type: "summary", tasks: [
      { title: "Active work item", type: "task" },
    ]},
    { name: "Done", type: "summary", tasks: [] },
  ],
  activities: OP_ACTIVITIES,
};

/** Product Launch — Go-to-market structure */
const PRODUCT_LAUNCH_TEMPLATE = {
  description: "Product launch template covering pre-launch research, go-to-market planning, launch execution, and post-launch analysis. Ideal for SaaS products, physical product releases, and feature launches.",
  status: "active",
  statuses: OP_STATUSES,
  types: OP_TYPES,
  priorities: OP_PRIORITIES,
  phases: [
    { name: "Pre-Launch Research", type: "summary", tasks: [
      { title: "Market research & competitive analysis", type: "task" },
      { title: "Customer persona development", type: "task" },
      { title: "Value proposition & messaging", type: "task" },
      { title: "Pricing strategy", type: "task" },
      { title: "Research complete", type: "milestone" },
    ]},
    { name: "Go-to-Market Planning", type: "summary", tasks: [
      { title: "Marketing channel strategy", type: "task" },
      { title: "Content calendar & assets", type: "task" },
      { title: "Sales enablement materials", type: "task" },
      { title: "PR & media outreach plan", type: "task" },
      { title: "Launch event planning", type: "task" },
      { title: "GTM plan approved", type: "milestone" },
    ]},
    { name: "Launch Execution", type: "summary", tasks: [
      { title: "Landing page & website updates", type: "task" },
      { title: "Email campaign deployment", type: "task" },
      { title: "Social media launch", type: "task" },
      { title: "Press release distribution", type: "task" },
      { title: "Launch day", type: "milestone" },
    ]},
    { name: "Post-Launch Analysis", type: "summary", tasks: [
      { title: "Performance metrics review", type: "task" },
      { title: "Customer feedback collection", type: "task" },
      { title: "Iteration & optimization plan", type: "task" },
      { title: "Post-launch report", type: "task" },
      { title: "Post-launch review complete", type: "milestone" },
    ]},
  ],
  activities: OP_ACTIVITIES,
};

/** Software Development Lifecycle (SDLC) */
const SDLC_TEMPLATE = {
  description: "Software Development Lifecycle (SDLC) template with requirements, design, implementation, testing, deployment, and maintenance phases. Structured for traditional or hybrid software projects.",
  status: "active",
  statuses: OP_STATUSES,
  types: OP_TYPES,
  priorities: OP_PRIORITIES,
  phases: [
    { name: "Requirements", type: "summary", tasks: [
      { title: "Stakeholder interviews", type: "task" },
      { title: "Requirements document (SRS)", type: "task" },
      { title: "Use case diagrams", type: "task" },
      { title: "Requirements sign-off", type: "milestone" },
    ]},
    { name: "Design", type: "summary", tasks: [
      { title: "Architecture design", type: "task" },
      { title: "Database schema design", type: "task" },
      { title: "UI/UX wireframes & prototypes", type: "task" },
      { title: "API contract definition", type: "task" },
      { title: "Design review", type: "milestone" },
    ]},
    { name: "Implementation", type: "summary", tasks: [
      { title: "Development environment setup", type: "task" },
      { title: "Backend development", type: "task" },
      { title: "Frontend development", type: "task" },
      { title: "API integration", type: "task" },
      { title: "Code review & refactoring", type: "task" },
      { title: "Development complete", type: "milestone" },
    ]},
    { name: "Testing", type: "summary", tasks: [
      { title: "Unit testing", type: "task" },
      { title: "Integration testing", type: "task" },
      { title: "User acceptance testing (UAT)", type: "task" },
      { title: "Performance & load testing", type: "task" },
      { title: "Security audit", type: "task" },
      { title: "Testing sign-off", type: "milestone" },
    ]},
    { name: "Deployment", type: "summary", tasks: [
      { title: "Staging environment validation", type: "task" },
      { title: "Production deployment plan", type: "task" },
      { title: "Rollback strategy", type: "task" },
      { title: "Go-live", type: "milestone" },
    ]},
    { name: "Maintenance", type: "summary", tasks: [
      { title: "Monitoring & alerting setup", type: "task" },
      { title: "Bug triage process", type: "task" },
      { title: "Documentation & knowledge transfer", type: "task" },
      { title: "Post-deployment review", type: "task" },
    ]},
  ],
  activities: OP_ACTIVITIES,
};

// ============================================================================
// CONCRETE EXAMPLES (real-world projects with specific data)
// ============================================================================

/** Example 1: Open Source Conference — from OpenProject's demo project */
const CONFERENCE_EXAMPLE = {
  description: "This is a demo project to organize an open source conference. It demonstrates project management from initiation through closing with concrete tasks, milestones, and deliverables.",
  status: "active",
  statuses: OP_STATUSES,
  types: OP_TYPES,
  priorities: OP_PRIORITIES,
  projectPhases: OP_PHASES,
  phases: [
    { name: "Start of project", type: "milestone", description: "Project kickoff milestone — marks the official beginning of the conference organization effort.", status: "closed" },
    { name: "Organize open source conference", type: "summary", description: "Main phase: plan and execute all activities needed to organize the open source conference, from venue selection to attendee invitations.", status: "in_progress", tasks: [
      { title: "Set date and location of conference", type: "task", status: "in_progress", description: "Research and book a venue. Confirm dates that avoid conflicts with other major tech events. Consider capacity for 200+ attendees, AV equipment, and catering options.", estimatedHours: 16, children: [
        { title: "Send invitation to speakers", type: "task", status: "in_progress", description: "Draft and send CFP (Call for Proposals) to potential speakers. Include submission deadline, talk formats (keynote 45min, talk 25min, lightning 10min), and travel reimbursement policy.", estimatedHours: 8 },
        { title: "Contact sponsoring partners", type: "task", status: "new", description: "Reach out to potential sponsors (Gold €5,000, Silver €2,500, Bronze €1,000). Prepare sponsorship tiers with benefits: logo placement, booth space, attendee list access, speaking slots.", estimatedHours: 12 },
        { title: "Create sponsorship brochure and hand-outs", type: "task", status: "new", description: "Design a professional sponsorship brochure (PDF + print) with event details, expected attendance demographics, sponsor tier benefits, and past event highlights.", estimatedHours: 16 },
      ]},
      { title: "Invite attendees to conference", type: "task", status: "new", description: "Set up registration system (Eventbrite or custom). Send email invitations to mailing lists, post on social media, and coordinate with local tech meetup groups. Early-bird pricing: €49, regular: €79.", estimatedHours: 8 },
      { title: "Setup conference website", type: "task", status: "new", description: "Build a responsive conference website with: schedule/agenda, speaker bios, venue map and directions, registration link, sponsor logos, code of conduct, and FAQ section. Deploy on conference.example.org.", estimatedHours: 24 },
    ]},
    { name: "Conference", type: "milestone", description: "The conference day itself — all preparation complete, event takes place. Keynote at 9:00, tracks run until 17:00, networking reception 17:00-19:00.", status: "scheduled" },
    { name: "Follow-up tasks", type: "summary", description: "Post-conference activities: publish materials, thank participants, and close out the project.", status: "to_be_scheduled", tasks: [
      { title: "Upload presentations to website", type: "task", status: "new", description: "Collect slide decks from all speakers (PDF + source). Upload to conference website with speaker permission. Add video recordings once edited. Target: within 2 weeks of event.", estimatedHours: 12 },
      { title: "Party for conference supporters :-)", type: "task", status: "new", description: "Organize a thank-you party for the organizing committee, volunteers, and key sponsors.\n\nChecklist:\n- [ ] Beer\n- [ ] Snacks\n- [ ] Music\n- [ ] Even more beer", estimatedHours: 4 },
    ]},
    { name: "End of project", type: "milestone", description: "Final milestone — all follow-up tasks complete, budget reconciled, lessons learned documented. Project formally closed.", status: "new" },
  ],
  activities: OP_ACTIVITIES,
};

/** Example 2: Company Website Rebuild — from OpenProject's Scrum demo */
const WEBSITE_EXAMPLE = {
  description: "This is a demo Scrum project for rebuilding the company website. It includes a product backlog, sprint iterations, bug tracking, and release milestones with concrete user stories and tasks.",
  status: "active",
  statuses: OP_STATUSES,
  types: OP_TYPES,
  priorities: OP_PRIORITIES,
  phases: [
    { name: "New website", type: "epic", description: "Epic: Complete redesign and rebuild of the company website with modern stack, improved UX, and new features.", status: "specified", tasks: [
      { title: "New login screen", type: "user_story", status: "in_specification", description: "As a user, I want a redesigned login page so that I can sign in with SSO (Google, GitHub) in addition to email/password. The new design should match our updated brand guidelines and include 'Remember me' and 'Forgot password' links.", storyPoints: 5 },
      { title: "Password reset does not send email", type: "bug", status: "confirmed", description: "BUG: When clicking 'Forgot password' and entering a valid email, the system shows 'Reset link sent' but no email is delivered. Checked spam folders. Likely a misconfigured SMTP relay or missing SendGrid API key in production.", storyPoints: 2 },
      { title: "Newsletter registration form", type: "user_story", status: "in_progress", description: "As a visitor, I want to sign up for the company newsletter so that I receive product updates and blog posts. Requirements: email validation, double opt-in confirmation, GDPR consent checkbox, Mailchimp integration.", storyPoints: 3 },
      { title: "Implement product tour", type: "user_story", status: "in_specification", description: "As a new user, I want an interactive guided tour of the application so that I can quickly understand the key features. Use Shepherd.js or Intro.js. Tour should cover: dashboard, project creation, task management, and settings.", storyPoints: 5 },
    ]},
    { name: "Sprint 1 — Core Website", type: "summary", description: "First sprint (2 weeks): Build the core website pages — landing page, navigation, contact form, and feature showcase.", status: "in_progress", tasks: [
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
    ]},
    { name: "Product Backlog", type: "summary", description: "Prioritized backlog of user stories and features not yet assigned to a sprint. Items are groomed and estimated, ready for sprint planning.", status: "new", tasks: [
      { title: "SSL certificate", type: "user_story", status: "specified", description: "As the DevOps lead, I want to install a Let's Encrypt SSL certificate so that all traffic is served over HTTPS. Set up auto-renewal via certbot cron job. Update nginx config to redirect HTTP → HTTPS. Test with SSL Labs (target: A+ rating).", storyPoints: 3 },
      { title: "Set-up staging environment", type: "user_story", status: "in_specification", description: "As a developer, I want a staging environment that mirrors production so that we can QA features before release. Provision on AWS (t3.medium), replicate production DB schema (sanitized data), configure CI/CD pipeline to auto-deploy develop branch.", storyPoints: 5 },
      { title: "Choose a content management system", type: "user_story", status: "specified", description: "As the content team, we need a CMS so that we can publish blog posts and update website content without developer involvement. Evaluate: Strapi (headless, self-hosted), Contentful (headless, SaaS), WordPress (traditional). Decision criteria: cost, API quality, editorial UX, plugin ecosystem.", storyPoints: 3 },
      { title: "Internal link structure", type: "user_story", status: "closed", description: "As the SEO lead, I want a clean URL hierarchy so that search engines can crawl the site effectively. Implemented: /products/{slug}, /blog/{year}/{slug}, /docs/{category}/{page}. Added 301 redirects from old URLs. Updated XML sitemap.", storyPoints: 3 },
    ]},
    { name: "Releases", type: "summary", description: "Release milestones tracking development progress from v1.0 through v2.0.", status: "in_progress", tasks: [
      { title: "Develop v1.0", type: "summary", status: "in_progress", description: "Core feature development for the initial website launch: landing page, navigation, contact form, basic CMS integration, SSL setup, and CI/CD pipeline.", estimatedHours: 80 },
      { title: "Release v1.0", type: "milestone", status: "new", description: "First production release — go-live with the new company website. Includes: landing page, product pages, contact form, blog (5 launch posts), and analytics (GA4 + Plausible)." },
      { title: "Develop v1.1", type: "summary", status: "new", description: "Post-launch iteration: fix bugs from user feedback, add newsletter signup, implement product tour, and optimize Core Web Vitals (LCP < 2.5s, CLS < 0.1).", estimatedHours: 40 },
      { title: "Release v1.1", type: "milestone", status: "new", description: "Patch release with bug fixes, newsletter integration, and performance improvements based on v1.0 user feedback." },
      { title: "Develop v2.0", type: "summary", status: "new", description: "Major feature release: user authentication (OAuth + email), full-text search (Algolia), customer portal, analytics dashboard, and A/B testing framework.", estimatedHours: 120 },
      { title: "Release v2.0", type: "milestone", status: "new", description: "Major release with full feature set — customer portal, search, auth, and analytics. Target: 3 months after v1.0 launch." },
    ]},
  ],
};

/** Example 3: Mobile App Launch — "TaskFlow" productivity app */
const MOBILE_APP_EXAMPLE = {
  description: "Launch 'TaskFlow', a productivity app for iOS and Android. Covers beta testing, App Store submission, press outreach, Product Hunt launch, and post-launch iteration.",
  status: "active",
  statuses: OP_STATUSES,
  types: OP_TYPES,
  priorities: OP_PRIORITIES,
  phases: [
    { name: "Pre-Launch Preparation", type: "summary", status: "in_progress", description: "Finalize the app, prepare all marketing assets, and set up distribution channels.", tasks: [
      { title: "Finalize app icon and splash screen", type: "task", status: "closed", description: "Final icon: 1024x1024 PNG for App Store, adaptive icon for Android. Splash screen: centered logo with gradient background (#667EEA → #764BA2). Delivered by design team on Feb 10.", estimatedHours: 8 },
      { title: "Write App Store listing copy", type: "task", status: "in_progress", description: "Title: 'TaskFlow — Smart To-Do Lists & Habits'. Subtitle: 'Plan your day in 30 seconds'. Write 4000-char description, prepare 6 screenshots (iPhone 15 Pro, Pixel 8), feature graphic for Google Play. Include keywords: productivity, todo, habits, planner.", estimatedHours: 12 },
      { title: "Create demo video (30s)", type: "task", status: "new", description: "Record a 30-second app preview for App Store. Show: (1) quick task creation, (2) drag-and-drop prioritization, (3) habit tracking streak, (4) weekly review. Use screen recording + After Effects motion graphics. Music: royalty-free upbeat track.", estimatedHours: 16 },
      { title: "Set up TestFlight & Google Play Internal Testing", type: "task", status: "closed", description: "TestFlight: uploaded build 1.2.0 (247), added 50 beta testers from waitlist. Google Play: internal testing track configured, AAB uploaded, 20 testers added. Both tracks active since Feb 5.", estimatedHours: 6 },
      { title: "Press kit & media outreach", type: "task", status: "new", description: "Prepare a press kit ZIP: app icon (PNG, SVG), screenshots, founder headshots, logo, one-page fact sheet. Send personalized pitches to: TechCrunch, The Verge, 9to5Mac, Android Authority, and 10 productivity bloggers.", estimatedHours: 10 },
    ]},
    { name: "Beta Testing", type: "summary", status: "in_progress", description: "Collect feedback from beta testers, fix critical bugs, and validate core user flows.", tasks: [
      { title: "Collect beta feedback (survey)", type: "task", status: "in_progress", description: "Send Typeform survey to 50 beta testers. Questions: NPS score, top 3 liked features, top 3 pain points, would they pay $4.99/month, feature requests. Target: 30+ responses by Feb 20.", estimatedHours: 4 },
      { title: "Fix: Tasks not syncing across devices", type: "bug", status: "confirmed", description: "BUG: 8 beta testers reported tasks created on iPhone not appearing on iPad. Root cause: CloudKit sync failing silently when user has iCloud Drive disabled. Fix: add explicit check + user-facing error message.", estimatedHours: 8 },
      { title: "Fix: Android back button closes app", type: "bug", status: "in_progress", description: "BUG: On Android, pressing hardware back button from task detail screen closes the app instead of going back to task list. Expected: navigate back in stack. Cause: missing onBackPressed override in TaskDetailActivity.", estimatedHours: 4 },
      { title: "Beta milestone — ready for submission", type: "milestone", status: "new" },
    ]},
    { name: "Launch Day — March 15", type: "summary", status: "new", description: "Coordinate all launch activities for a simultaneous iOS + Android release.", tasks: [
      { title: "Submit to App Store (allow 3-day review)", type: "task", status: "new", description: "Submit build 1.3.0 to App Store Connect by March 12. Include: updated screenshots, privacy nutrition labels, age rating questionnaire. Set release to 'Manual Release' so we can time it with Android.", estimatedHours: 3 },
      { title: "Publish on Google Play", type: "task", status: "new", description: "Promote from internal testing to production on Google Play Console. Update store listing with final screenshots. Set up staged rollout (25% → 50% → 100% over 3 days).", estimatedHours: 2 },
      { title: "Product Hunt launch post", type: "task", status: "new", description: "Schedule Product Hunt launch for 12:01 AM PT on March 15. Prepare: tagline, description, maker comment, first comment from founder. Ask 20 early supporters to upvote + leave genuine comments.", estimatedHours: 6 },
      { title: "Social media announcement", type: "task", status: "new", description: "Post on Twitter/X, LinkedIn, Instagram, and Reddit (r/productivity, r/apps). Each platform gets a unique post. Twitter: thread with GIFs. LinkedIn: professional angle. Instagram: carousel of screenshots.", estimatedHours: 4 },
      { title: "Launch day", type: "milestone", status: "new" },
    ]},
    { name: "Post-Launch (Week 1-4)", type: "summary", status: "new", description: "Monitor metrics, respond to reviews, and iterate based on real user data.", tasks: [
      { title: "Monitor crash reports (Crashlytics)", type: "task", status: "new", description: "Check Firebase Crashlytics daily for 2 weeks. Target: crash-free rate > 99.5%. Set up PagerDuty alerts for crash rate spikes. Triage and fix any P0 crashes within 24 hours.", estimatedHours: 8 },
      { title: "Respond to App Store reviews", type: "task", status: "new", description: "Respond to every review (1-5 stars) within 24 hours for the first 2 weeks. For negative reviews: acknowledge the issue, give a timeline for fix, ask them to email support@taskflow.app for direct help.", estimatedHours: 6 },
      { title: "Analyze Day 1/7/30 retention", type: "task", status: "new", description: "Pull retention cohort data from Mixpanel. Targets: Day 1 retention > 40%, Day 7 > 20%, Day 30 > 10%. If below target, run user interviews with churned users to identify drop-off reasons.", estimatedHours: 8 },
      { title: "v1.1 patch with launch bug fixes", type: "task", status: "new", description: "Batch all bugs from first 2 weeks into v1.1 patch. Target release: March 29. Include crash fixes, UI polish from user feedback, and any App Store Review team rejections.", estimatedHours: 20 },
    ]},
  ],
  activities: OP_ACTIVITIES,
};

/** Example 4: Marketing Campaign — "Spring Product Launch" */
const MARKETING_CAMPAIGN_EXAMPLE = {
  description: "Execute the Q2 spring launch campaign for CloudSync Pro, a SaaS file collaboration platform. Covers content creation, paid ads, email sequences, influencer partnerships, and webinar.",
  status: "active",
  statuses: OP_STATUSES,
  types: OP_TYPES,
  priorities: OP_PRIORITIES,
  phases: [
    { name: "Campaign Strategy & Planning", type: "summary", status: "closed", description: "Define campaign goals, target audience, channels, and budget. Approved by CMO on Feb 1.", tasks: [
      { title: "Define campaign goals & KPIs", type: "task", status: "closed", description: "Goals: 500 trial signups, 50 paid conversions, 10,000 landing page visits, 2,000 webinar registrations. Campaign budget: $15,000. Timeline: March 1 – April 15.", estimatedHours: 4 },
      { title: "Audience segmentation", type: "task", status: "closed", description: "Three segments: (1) SMB founders (25-45, tech-savvy, <50 employees), (2) IT managers (enterprise, evaluating alternatives to Dropbox/Box), (3) Freelancers (designers, developers, content creators). Create Lookalike audiences from existing customer list.", estimatedHours: 6 },
      { title: "Channel mix & budget allocation", type: "task", status: "closed", description: "Budget split: Google Ads $5,000 (search + display), LinkedIn Ads $3,000 (sponsored content + InMail), Facebook/Instagram $2,000, Influencer partnerships $3,000, Webinar platform $1,000, Contingency $1,000.", estimatedHours: 4 },
      { title: "Campaign brief approved", type: "milestone", status: "closed" },
    ]},
    { name: "Content Creation", type: "summary", status: "in_progress", description: "Produce all campaign assets: landing page, emails, ad creatives, blog posts, and webinar materials.", tasks: [
      { title: "Landing page — cloudsync.pro/spring-launch", type: "task", status: "in_progress", description: "Design and build a dedicated landing page. Above the fold: headline 'Collaborate 3x Faster', hero image, CTA 'Start Free Trial'. Below: feature comparison table, 3 customer testimonials, pricing (Free / Pro $12/mo / Team $8/user/mo), FAQ.", estimatedHours: 16 },
      { title: "Email drip sequence (5 emails)", type: "task", status: "in_progress", description: "Email 1 (Day 0): Welcome + quick start guide. Email 2 (Day 2): Top 3 features video. Email 3 (Day 5): Customer success story (Acme Corp reduced file sharing time by 60%). Email 4 (Day 8): Webinar invitation. Email 5 (Day 12): Limited-time 20% discount.", estimatedHours: 10 },
      { title: "Google Ads — 10 search campaigns", type: "task", status: "new", description: "Create 10 search campaigns targeting: 'file sharing tool', 'team collaboration software', 'Dropbox alternative', 'secure file sharing', etc. Write 3 ad variations per campaign. Set up conversion tracking with Google Tag Manager.", estimatedHours: 8 },
      { title: "LinkedIn sponsored content (4 posts)", type: "task", status: "new", description: "Post 1: Product announcement with demo video. Post 2: Customer testimonial carousel. Post 3: 'How CloudSync saved Acme Corp $50K/year' case study. Post 4: Webinar invitation. Target: IT Managers, 200-5000 employees, Tech industry.", estimatedHours: 6 },
      { title: "Blog post: '10 Signs Your File Sharing Tool is Holding You Back'", type: "task", status: "specified", description: "Write a 1,500-word SEO-optimized blog post. Target keyword: 'best file sharing tools 2026'. Include comparison table, custom graphics, and soft CTA for trial signup. Publish 1 week before launch.", estimatedHours: 6 },
    ]},
    { name: "Launch Week — March 1-7", type: "summary", status: "new", description: "Execute the campaign across all channels simultaneously.", tasks: [
      { title: "Activate all ad campaigns", type: "task", status: "new", description: "March 1 at 9:00 AM EST: Go live with Google Ads, LinkedIn Ads, and Facebook/Instagram ads simultaneously. Monitor CPM, CPC, and CTR hourly for first day. Kill any ad set with CPC > $3.00.", estimatedHours: 4 },
      { title: "Send launch email to 12,000 subscribers", type: "task", status: "new", description: "Segment blast: 8,000 free users (upgrade pitch), 2,000 trial users (conversion offer), 2,000 newsletter subscribers (awareness). Subject line A/B test: 'CloudSync Pro is here' vs 'Your files just got superpowers'. Send at 10:30 AM EST Tuesday.", estimatedHours: 3 },
      { title: "Influencer posts go live", type: "task", status: "new", description: "Three tech influencers publish reviews: @TechReviewSam (YouTube, 150K subs, $1,500), @ProductivityPro (Twitter, 80K followers, $800), @SaaSWeekly (newsletter, 25K subscribers, $700). All include affiliate links with 20% commission.", estimatedHours: 2 },
      { title: "Webinar: 'Future of Team Collaboration'", type: "task", status: "new", description: "Live webinar on March 5 at 2 PM EST via Zoom Webinar. Speakers: CEO + Head of Product. Agenda: industry trends (10min), CloudSync demo (20min), Q&A (15min), special offer (5min). Target: 500 attendees from 2,000 registrations.", estimatedHours: 12 },
      { title: "Campaign launch day", type: "milestone", status: "new" },
    ]},
    { name: "Post-Campaign Analysis (April)", type: "summary", status: "new", description: "Measure results, calculate ROI, and document learnings.", tasks: [
      { title: "Compile campaign metrics report", type: "task", status: "new", description: "Pull data from Google Analytics, Mixpanel, HubSpot, and ad platforms. Key metrics: total spend, signups, paid conversions, CAC, landing page conversion rate, email open/click rates, webinar attendance rate, ROAS. Compare to KPIs set in planning.", estimatedHours: 8 },
      { title: "Calculate ROI & CAC", type: "task", status: "new", description: "Total budget: $15,000. Calculate: Cost Per Trial Signup (target < $30), Cost Per Paid Conversion (target < $300), Return On Ad Spend (target > 3x), Lifetime Value / CAC ratio (target > 3). Break down by channel.", estimatedHours: 4 },
      { title: "Lessons learned & next campaign recommendations", type: "task", status: "new", description: "Document: which channels performed best/worst, which ad creatives had highest CTR, email subject line winner, webinar conversion rate, influencer ROI ranking. Recommend budget reallocation for Q3 campaign.", estimatedHours: 4 },
      { title: "Post-campaign review meeting", type: "milestone", status: "new" },
    ]},
  ],
  activities: OP_ACTIVITIES,
};

/** Example 5: Office Relocation */
const OFFICE_RELOCATION_EXAMPLE = {
  description: "Relocate a 50-person team from current office (456 Oak Ave) to new HQ at 123 Innovation Way. Covers lease negotiation, IT infrastructure, furniture procurement, moving logistics, and first-week settling.",
  status: "active",
  statuses: OP_STATUSES,
  types: OP_TYPES,
  priorities: OP_PRIORITIES,
  phases: [
    { name: "Planning & Lease", type: "summary", status: "closed", description: "Finalize new office lease, negotiate terms, and plan the overall move timeline.", tasks: [
      { title: "Sign lease for 123 Innovation Way, Suite 400", type: "task", status: "closed", description: "3-year lease signed on Jan 15. Terms: 4,200 sq ft, $42/sq ft/year ($176,400 annually), 3 months free rent, $50,000 tenant improvement allowance. Landlord covers HVAC upgrade. Move-in ready by March 1.", estimatedHours: 20 },
      { title: "Create floor plan & seating chart", type: "task", status: "closed", description: "Used SmartDraw to design layout: 35 desks (open plan), 4 meeting rooms (Everest, K2, Denali, Rainier), 1 phone booth row (6 pods), kitchen/break area, server room (8x10 ft). Seating chart approved by department heads.", estimatedHours: 12 },
      { title: "Budget approval ($85,000)", type: "task", status: "closed", description: "Budget breakdown: Moving company $8,000, New furniture $35,000, IT infrastructure $22,000, Painting & signage $5,000, Temporary storage $3,000, Contingency $12,000. Approved by CFO on Jan 20.", estimatedHours: 6 },
      { title: "Lease signed & budget approved", type: "milestone", status: "closed" },
    ]},
    { name: "IT Infrastructure", type: "summary", status: "in_progress", description: "Set up networking, server room, phone system, and access control at the new office.", tasks: [
      { title: "Install network cabling (Cat6a)", type: "task", status: "in_progress", description: "CableTech Co. running 48 Cat6a drops to desk locations + 12 drops to meeting rooms + 8 drops to server room. Also pulling 6 fiber runs (OM4) between server room and IDF closets. Scheduled: Feb 15-17.", estimatedHours: 24 },
      { title: "Set up server room", type: "task", status: "new", description: "Rack: 42U APC NetShelter. UPS: APC Smart-UPS 3000VA. Switches: 2x Cisco Catalyst 9200 (48-port PoE). Firewall: Fortinet FortiGate 60F. NAS: Synology RS1221+ (4x 8TB). Patch panel: 48-port. Target: operational by Feb 25.", estimatedHours: 16 },
      { title: "Configure WiFi (Ubiquiti)", type: "task", status: "new", description: "Install 6x Ubiquiti U6 Pro access points for full coverage. SSIDs: 'InnoWay-Corp' (802.1x, RADIUS auth), 'InnoWay-Guest' (captive portal, 50Mbps limit). Controller: CloudKey Gen2 Plus. Heat map survey completed.", estimatedHours: 8 },
      { title: "Migrate phone system", type: "task", status: "new", description: "Current: on-prem Avaya IP Office. Moving to RingCentral cloud PBX. Port 50 phone numbers (main: 555-0100). Set up auto-attendant, voicemail-to-email, call groups. Training session for all staff on new system.", estimatedHours: 12 },
      { title: "Access control & security cameras", type: "task", status: "new", description: "Install Kisi access control on 4 doors (main entrance, server room, executive suite, storage). 8 employee badges initial batch. 4x Verkada security cameras (lobby, parking, server room, back entrance). 30-day cloud recording.", estimatedHours: 10 },
    ]},
    { name: "Furniture & Setup", type: "summary", status: "new", description: "Procure and install all office furniture and fixtures.", tasks: [
      { title: "Order desks and chairs", type: "task", status: "specified", description: "35x Uplift V2 standing desks ($599 each = $20,965). 35x Herman Miller Aeron chairs ($1,395 each = $48,825... over budget → switched to Branch Ergonomic Chair at $449 each = $15,715). Total furniture: $36,680.", estimatedHours: 6 },
      { title: "Meeting room equipment", type: "task", status: "new", description: "4 meeting rooms each get: 55\" LG display, Logitech Rally Bar for video calls, whiteboard (4x6 ft), conference table (seats 8/6/6/4). Everest room (largest) also gets a 75\" display and surround sound for all-hands.", estimatedHours: 8 },
      { title: "Kitchen & break area setup", type: "task", status: "new", description: "Order: commercial coffee machine (Jura Z10, $3,200), full-size fridge, microwave, dishwasher, water cooler. Stock initial supplies: coffee, tea, snacks, plates, cutlery. Set up snack subscription with SnackNation ($300/month).", estimatedHours: 4 },
      { title: "Signage and branding", type: "task", status: "new", description: "Exterior: illuminated logo sign (36\" wide) on building directory and suite door. Interior: reception wall logo (brushed aluminum, backlit), meeting room name plates, wayfinding signs. Vendor: FastSigns, quote: $4,200.", estimatedHours: 6 },
    ]},
    { name: "Moving Day — March 8-9 (Weekend)", type: "summary", status: "new", description: "Execute the physical move over a weekend to minimize business disruption.", tasks: [
      { title: "Moving company: TwoMenAndATruck (confirmed)", type: "task", status: "scheduled", description: "Booked for Saturday March 8, 7:00 AM. Quote: $7,500 for 2-day move. Includes: 3 trucks, 8 movers, packing materials. Items: 35 existing desks (being donated), file cabinets, personal boxes (labeled by employee), server rack (handle with care).", estimatedHours: 16 },
      { title: "Employee packing instructions", type: "task", status: "new", description: "Email all staff by Feb 28: each person gets 2 labeled moving boxes (provided). Pack personal items, label clearly with name + new desk number. IT will handle all monitors and docking stations. Leave old desk empty by Friday 5 PM.", estimatedHours: 2 },
      { title: "IT cutover (Saturday evening)", type: "task", status: "new", description: "After movers finish Saturday: (1) rack servers in new server room, (2) connect switches and firewall, (3) verify all 48 desk drops active, (4) test WiFi coverage, (5) VPN connectivity check, (6) print test on all 3 printers. Go/no-go by 10 PM.", estimatedHours: 8 },
      { title: "Sunday: final setup & walkthrough", type: "task", status: "new", description: "Place personal boxes at assigned desks. Set up monitors and docking stations. Test every workstation (power, network, phone). Final walkthrough with facilities manager. Stock kitchen. Take 'before' photos for social media post.", estimatedHours: 6 },
      { title: "Move complete", type: "milestone", status: "new" },
    ]},
    { name: "First Week at New Office", type: "summary", status: "new", description: "Settle in, handle teething issues, and celebrate the new space.", tasks: [
      { title: "Monday all-hands welcome (9 AM)", type: "task", status: "new", description: "CEO welcome speech in Everest room. Office tour led by facilities manager (meeting rooms, kitchen, phone booths, parking, emergency exits). Hand out new access badges. IT help desk set up in lobby for the day.", estimatedHours: 2 },
      { title: "IT troubleshooting (first 3 days)", type: "task", status: "new", description: "Dedicated IT support person on-site Mon-Wed. Common issues to expect: monitor not detected (USB-C dock driver), WiFi not connecting (need 802.1x certificate), printer not found (add new IP). Keep spare cables, adapters, and a spare dock.", estimatedHours: 12 },
      { title: "Update address everywhere", type: "task", status: "new", description: "Update address on: Google Business listing, company website footer, LinkedIn company page, business cards (order 500 new), bank accounts, insurance policies, USPS mail forwarding (12 months), vendor contracts (notify top 10 vendors).", estimatedHours: 4 },
      { title: "Office warming party (Friday 4 PM)", type: "task", status: "new", description: "Casual office warming celebration. Order: pizza (10 large from Tony's, $180), drinks (beer, wine, soda, sparkling water), and a custom cake with new office photo. Set up playlist on Everest room speakers. Invite remote team members via Zoom.", estimatedHours: 3 },
    ]},
  ],
  activities: OP_ACTIVITIES,
};

/** Example 6: HR Onboarding Program — 90-day new hire program */
const HR_ONBOARDING_EXAMPLE = {
  description: "90-day structured onboarding program for new hires. Covers pre-boarding, Day 1 setup, first week orientation, 30/60/90 day milestones, buddy program, and manager check-ins.",
  status: "active",
  statuses: [
    { name: "Not started",  color: "#868E96", isClosed: false, isDefault: true,  position: 1, doneRatio: 0 },
    { name: "In progress",  color: "#CC5DE8", isClosed: false, isDefault: false, position: 2, doneRatio: 50 },
    { name: "Completed",    color: "#51CF66", isClosed: true,  isDefault: false, position: 3, doneRatio: 100 },
    { name: "Overdue",      color: "#FF6B6B", isClosed: false, isDefault: false, position: 4, doneRatio: 0 },
    { name: "Skipped",      color: "#FFA94D", isClosed: true,  isDefault: false, position: 5, doneRatio: 0 },
  ],
  types: [
    { name: "Task",         color: "#1C7ED6", icon: "check-square", isMilestone: false, isDefault: true,  position: 1 },
    { name: "Milestone",    color: "#69DB7C", icon: "flag",         isMilestone: true,  isDefault: false, position: 2 },
    { name: "Meeting",      color: "#845EF7", icon: "users",        isMilestone: false, isDefault: false, position: 3 },
    { name: "Document",     color: "#FF922B", icon: "file-text",    isMilestone: false, isDefault: false, position: 4 },
  ],
  priorities: OP_PRIORITIES,
  phases: [
    { name: "Pre-Boarding (Before Day 1)", type: "summary", status: "completed", description: "Everything that needs to happen before the new hire walks through the door.", tasks: [
      { title: "Send welcome email with first-day logistics", type: "task", status: "completed", description: "Email sent 1 week before start date. Contents: office address (123 Innovation Way, Suite 400), parking info (visitor pass first day), dress code (smart casual), what to bring (ID for I-9, bank details for direct deposit), schedule for Day 1, manager's phone number.", estimatedHours: 1 },
      { title: "Set up workstation (laptop, monitor, peripherals)", type: "task", status: "completed", description: "IT prep: MacBook Pro 14\" M3 (from inventory), 27\" Dell monitor, USB-C dock, keyboard, mouse, headset. Pre-installed: Slack, Zoom, Chrome, VS Code, 1Password. Created accounts: Google Workspace, Slack, GitHub, Jira, Confluence.", estimatedHours: 3 },
      { title: "Create accounts and access permissions", type: "task", status: "completed", description: "Accounts created: Google Workspace (email: firstname@company.com), Slack (added to #general, #team-engineering, #random), GitHub (added to org, team repos), Jira (added to Engineering board), VPN (GlobalProtect profile configured).", estimatedHours: 2 },
      { title: "Assign onboarding buddy", type: "task", status: "completed", description: "Buddy assigned: Sarah Chen (Senior Engineer, 2 years at company). Buddy responsibilities: lunch on Day 1, answer questions, weekly 1:1 for first month, introduce to key people. Buddy received $50 lunch budget.", estimatedHours: 0.5 },
      { title: "Prepare onboarding swag kit", type: "task", status: "completed", description: "Kit contents: branded t-shirt (size confirmed), water bottle, notebook, sticker pack, welcome card signed by the team, company handbook (printed), and a $25 Starbucks gift card.", estimatedHours: 1 },
    ]},
    { name: "Day 1", type: "summary", status: "in_progress", description: "The new hire's first day — focused on welcome, logistics, and making them feel at home.", tasks: [
      { title: "9:00 AM — Welcome & office tour", type: "meeting", status: "in_progress", description: "HR meets new hire at reception. Tour: workstation, kitchen (coffee machine demo!), meeting rooms, phone booths, restrooms, emergency exits, parking garage. Introduce to immediate team members. Hand over swag kit and access badge.", estimatedHours: 1 },
      { title: "10:00 AM — HR paperwork & benefits enrollment", type: "meeting", status: "not_started", description: "Complete: I-9 verification (bring passport or license + SSN card), W-4 tax form, direct deposit setup, emergency contacts, NDA signature (DocuSign), benefits enrollment (medical: Aetna PPO, dental: Guardian, 401k: Fidelity with 4% match). Benefits effective Day 1.", estimatedHours: 1.5 },
      { title: "11:30 AM — Laptop setup & tool walkthrough", type: "task", status: "not_started", description: "IT walks through: login credentials, email setup, Slack tour, VPN connection, printer setup, 1Password vault, how to submit IT tickets. Verify access to all required systems. Set up 2FA on all accounts.", estimatedHours: 1 },
      { title: "12:30 PM — Team lunch with buddy", type: "meeting", status: "not_started", description: "Lunch at Milano's Italian (team favorite, 5 min walk). Budget: $25/person, charged to team expense. Buddy introduces the new hire to 4-5 team members in a casual setting. Menu recommendation: the carbonara.", estimatedHours: 1.5 },
      { title: "2:00 PM — Manager 1:1 (45 min)", type: "meeting", status: "not_started", description: "Agenda: (1) Welcome and personal intro, (2) Team structure and how your role fits, (3) First week expectations, (4) 30/60/90 day goals overview, (5) Communication preferences, (6) Questions. Manager shares team wiki page and key docs.", estimatedHours: 0.75 },
      { title: "3:00 PM — Development environment setup", type: "task", status: "not_started", description: "Follow README.md setup guide. Clone monorepo, install dependencies (Node 20, pnpm, Docker). Run local dev environment. Verify: app builds, tests pass, can connect to staging DB. Buddy available for troubleshooting.", estimatedHours: 2 },
    ]},
    { name: "Week 1 (Days 2-5)", type: "summary", status: "not_started", description: "Ramp-up week: learn the codebase, attend key meetings, and complete first small task.", tasks: [
      { title: "Read team documentation & architecture guide", type: "document", status: "not_started", description: "Required reading: ARCHITECTURE.md, team wiki (Confluence), API documentation, coding standards guide, PR review checklist, deployment runbook. Take notes and prepare questions for buddy 1:1.", estimatedHours: 6 },
      { title: "Attend team standup (daily, 9:30 AM)", type: "meeting", status: "not_started", description: "Join daily standup on Zoom (15 min). Format: what I did yesterday, what I'm doing today, blockers. For first week: 'I'm ramping up on [X], no blockers'. Get familiar with team rhythm and current sprint goals.", estimatedHours: 1 },
      { title: "Shadow a senior engineer on a feature", type: "task", status: "not_started", description: "Pair with Sarah (buddy) for 2 hours as she works on the notification service refactor. Observe: how she reads the codebase, her debugging workflow, how she writes PR descriptions, and how she communicates with the team.", estimatedHours: 2 },
      { title: "Complete first 'good first issue' PR", type: "task", status: "not_started", description: "Pick a task labeled 'good-first-issue' from the Jira board. Suggested: 'Update error message on login timeout' (EST-234). Write code, run tests, submit PR with description following team template. Get 2 approvals and merge.", estimatedHours: 6 },
      { title: "Friday — buddy check-in (30 min)", type: "meeting", status: "not_started", description: "Informal chat with buddy Sarah. Topics: how was the week, any confusion about processes, any tools you're struggling with, who else should you meet, any social events coming up. Buddy notes any concerns to share with manager.", estimatedHours: 0.5 },
      { title: "Week 1 complete", type: "milestone", status: "not_started" },
    ]},
    { name: "30-Day Checkpoint", type: "summary", status: "not_started", description: "First month milestone — assess ramp-up progress and adjust plan if needed.", tasks: [
      { title: "30-day manager review (1 hour)", type: "meeting", status: "not_started", description: "Agenda: (1) How are you feeling? (2) Review completed tasks/PRs (target: 5+ merged PRs), (3) What's going well, (4) What's challenging, (5) Adjust 60-day goals if needed. Manager fills out 30-day review form in BambooHR.", estimatedHours: 1 },
      { title: "Complete mandatory compliance training", type: "task", status: "not_started", description: "Complete in LMS (KnowBe4) by Day 30: Security Awareness Training (45 min), Anti-Harassment Training (30 min), Data Privacy & GDPR (20 min), Code of Conduct acknowledgement. All modules have quizzes — must score > 80%.", estimatedHours: 2 },
      { title: "Meet 3 people outside your team", type: "task", status: "not_started", description: "Schedule 30-min coffee chats with: (1) Someone from Product (understand roadmap), (2) Someone from Design (understand design process), (3) Someone from another engineering team (learn cross-team collaboration). Add them on Slack.", estimatedHours: 1.5 },
      { title: "30-day milestone achieved", type: "milestone", status: "not_started" },
    ]},
    { name: "60-Day Checkpoint", type: "summary", status: "not_started", description: "Second month — new hire should be contributing independently on medium-complexity tasks.", tasks: [
      { title: "60-day manager review (1 hour)", type: "meeting", status: "not_started", description: "Review: independent task completion, code quality (PR feedback trends), participation in code reviews, team collaboration. Target: owning 1-2 features independently. Discuss upcoming projects and areas of interest.", estimatedHours: 1 },
      { title: "Lead a sprint ticket end-to-end", type: "task", status: "not_started", description: "Pick a medium-complexity ticket from sprint planning. Own it fully: design, implement, test, get reviews, deploy to staging, verify in staging, deploy to production. Document any architectural decisions made.", estimatedHours: 16 },
      { title: "Give a 10-min knowledge share presentation", type: "task", status: "not_started", description: "Present at Friday tech talk (10 min + 5 min Q&A). Topic: something you learned during onboarding — a cool pattern in the codebase, a debugging technique, or a comparison of how things were done at your previous company.", estimatedHours: 3 },
      { title: "60-day milestone achieved", type: "milestone", status: "not_started" },
    ]},
    { name: "90-Day Checkpoint (Onboarding Complete)", type: "summary", status: "not_started", description: "Final onboarding milestone — new hire is fully integrated and productive.", tasks: [
      { title: "90-day manager review (1 hour)", type: "meeting", status: "not_started", description: "Comprehensive review: technical skills, teamwork, communication, initiative, culture fit. Set goals for next quarter. Confirm probation period completion (if applicable). Celebrate with team shout-out in #general Slack channel.", estimatedHours: 1 },
      { title: "Write onboarding feedback", type: "task", status: "not_started", description: "Fill out onboarding feedback survey (Google Form). Questions: what was most helpful, what was confusing, what was missing, rate buddy program, rate manager support. HR uses this to improve the program for future hires.", estimatedHours: 0.5 },
      { title: "Onboarding complete — welcome to the team!", type: "milestone", status: "not_started" },
    ]},
  ],
  activities: [
    { name: "Onboarding",    isDefault: true },
    { name: "Training",      isDefault: false },
    { name: "Documentation", isDefault: false },
    { name: "Meeting",       isDefault: false },
    { name: "Development",   isDefault: false },
    { name: "Other",         isDefault: false },
  ],
};

/** Map example IDs to their data */
const EXAMPLE_DATA_MAP: Record<string, object> = {
  conference: CONFERENCE_EXAMPLE,
  website: WEBSITE_EXAMPLE,
  mobile_app: MOBILE_APP_EXAMPLE,
  marketing: MARKETING_CAMPAIGN_EXAMPLE,
  office_relocation: OFFICE_RELOCATION_EXAMPLE,
  hr_onboarding: HR_ONBOARDING_EXAMPLE,
};

// ============================================================================
// Routers
// ============================================================================

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

  /** Apply a DB-stored template to create a project */
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
      return applyTemplateData(db, ctx.user.id, input.workspaceId, input.name, rows[0].templateData as Record<string, unknown>);
    }),

  /** Apply a built-in example by ID (no DB template needed) */
  applyExample: governedProcedure
    .input(z.object({ workspaceId: z.number(), exampleId: z.string(), name: z.string().min(1).max(255) }))
    .mutation(async ({ ctx, input }) => {
      await requireModule(input.workspaceId, "pmt");
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const tplData = EXAMPLE_DATA_MAP[input.exampleId];
      if (!tplData) throw new TRPCError({ code: "NOT_FOUND", message: `Example '${input.exampleId}' not found` });
      const project = await applyTemplateData(db, ctx.user.id, input.workspaceId, input.name, tplData as Record<string, unknown>);
      await logActivity({ workspaceId: input.workspaceId, moduleKey: "pmt", actorId: ctx.user.id, action: "projectTemplate.apply", targetType: "project", targetId: project.id, metadata: { exampleId: input.exampleId } });
      return project;
    }),

  /** Seed abstract reusable templates (PM Lifecycle, Scrum, Kanban, Product Launch, SDLC) */
  seed: governedProcedure
    .input(z.object({ workspaceId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await requireModule(input.workspaceId, "pmt");
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const templateDefs = [
        { name: "PM² Waterfall Lifecycle",           description: "Complete PM² methodology: 5 phases (Initiating → Planning → Executing → Monitor & Control → Closing), gate reviews, and standard PM deliverables.", data: PM_LIFECYCLE_TEMPLATE },
        { name: "Scrum / Agile",                     description: "Sprint-based Agile structure with product backlog, 3 sprints, retrospectives, and release milestones. For software and iterative delivery.", data: SCRUM_AGILE_TEMPLATE },
        { name: "Kanban",                            description: "Continuous-flow Kanban board with simplified statuses (Backlog → Ready → In Progress → Review → Done) and WIP limit concept.", data: KANBAN_TEMPLATE },
        { name: "Product Launch",                    description: "Go-to-market launch template: pre-launch research, GTM planning, launch execution, and post-launch analysis.", data: PRODUCT_LAUNCH_TEMPLATE },
        { name: "Software Development Lifecycle",    description: "SDLC template: Requirements → Design → Implementation → Testing → Deployment → Maintenance. For traditional or hybrid software projects.", data: SDLC_TEMPLATE },
      ];

      const created = [];
      for (const def of templateDefs) {
        const [row] = await db.insert(pmProjectTemplates).values({
          workspaceId: input.workspaceId,
          name: def.name,
          description: def.description,
          templateData: def.data,
          createdBy: ctx.user.id,
        }).returning();
        created.push(row);
      }

      await logActivity({ workspaceId: input.workspaceId, moduleKey: "pmt", actorId: ctx.user.id, action: "projectTemplate.seed", targetType: "project_template", targetId: created[0].id, metadata: { templateIds: created.map(c => c.id) } });
      return { templates: created };
    }),
});

/** Shared helper: apply template data to create a project with statuses, types, and tasks */
async function applyTemplateData(db: any, userId: number, workspaceId: number, projectName: string, tpl: Record<string, unknown>) {
  // 1. Create the project
  const [created] = await db.insert(projects).values({
    workspaceId,
    name: projectName,
    description: (tpl.description as string) || undefined,
    status: "draft",
    ownerId: userId,
  }).returning();

  // 2. Seed statuses
  const statusArr = tpl.statuses as Array<{ name: string; color: string; isClosed?: boolean; isDefault?: boolean; position: number }> | undefined;
  if (statusArr && statusArr.length > 0) {
    await db.insert(pmStatuses).values(
      statusArr.map((s) => ({
        workspaceId,
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
        workspaceId,
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
        workspaceId,
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
      if (t.children && t.children.length > 0) {
        for (const child of t.children) {
          await insertTask(child, row.id);
        }
      }
    };

    for (const phase of phasesArr) {
      const [parentTask] = await db.insert(tasks).values({
        workspaceId,
        projectId: created.id,
        title: phase.name,
        description: phase.description || undefined,
        type: phase.type || "task",
        status: phase.status || "todo",
        priority: "medium",
        position: position++,
      }).returning();

      if (phase.tasks && phase.tasks.length > 0) {
        for (const child of phase.tasks) {
          await insertTask(child, parentTask.id);
        }
      }
    }
  }

  await logActivity({ workspaceId, moduleKey: "pmt", actorId: userId, action: "projectTemplate.apply", targetType: "project", targetId: created.id });
  return created;
}

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
