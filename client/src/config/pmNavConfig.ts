/**
 * PM Central — Canonical Navigation Configuration
 *
 * Phase 11 deliverable — first pilot adoption of the shared module-nav standard
 * beyond the HR reference implementation.
 *
 * This file is the SINGLE SOURCE OF TRUTH for PM Central's navigation model.
 * All sidebar rendering, route resolution, and governance documentation
 * should derive from this configuration.
 *
 * PM Central's nav is simpler than HR's:
 * - No field-level masking (no PII)
 * - No sensitive-read audit logging
 * - Simpler permission model (project-role based, not org-hierarchy based)
 * - Fewer sections (8 vs HR's 13)
 *
 * Uses the shared ModuleNavConfig contract from moduleNavTypes.ts.
 */

import type { ModuleNavConfig, ModuleNavItem } from "./moduleNavTypes";

// ---------------------------------------------------------------------------
// Backend Domain Constants
// ---------------------------------------------------------------------------

export const PM_BACKEND_DOMAINS = {
  PORTFOLIO: "portfolio",
  PLANNING: "planning",
  EXECUTION: "execution",
  CONTROL: "control",
  COLLABORATION: "collaboration",
  REPORTING: "reporting",
  AI: "ai",
  METHODOLOGY: "methodology",
} as const;

export type PmBackendDomain = typeof PM_BACKEND_DOMAINS[keyof typeof PM_BACKEND_DOMAINS];

// ---------------------------------------------------------------------------
// Canonical Navigation Model
// ---------------------------------------------------------------------------

export const PM_NAV_CONFIG: ModuleNavConfig = {
  id: "pm-central",
  label: "PM Central",
  baseRoute: "/pm-central",

  sections: [
    // -----------------------------------------------------------------------
    // 1. Portfolio & Projects
    // -----------------------------------------------------------------------
    {
      id: "portfolio",
      label: "Portfolio & Projects",
      iconHint: "folder-kanban",
      purpose:
        "Central view of all projects, their health, pipeline status, and portfolio-level governance.",
      href: "/pm-central/dashboard",
      requiredAction: "pm.portfolio.read",
      scopeType: "all",
      visibilityMode: "show",
      backedBy: "existing-page",
      backendDomain: "portfolio",
      implementationStatus: "live",
      currentRoute: "/pm-central/dashboard",
      currentComponent: "DashboardPanel",
      items: [
        {
          id: "projects-dashboard",
          label: "Projects Dashboard",
          href: "/pm-central/portfolio/dashboard",
          section: "portfolio",
          iconHint: "layout-dashboard",
          purpose: "Portfolio-level project pipeline and health overview.",
          requiredAction: "pm.portfolio.read",
          scopeType: "all",
          visibilityMode: "show",
          backedBy: "existing-page",
          backendDomain: "portfolio",
          implementationStatus: "live",
          currentRoute: "/pm-central/dashboard",
          currentComponent: "DashboardPanel",
        },
        {
          id: "project-shells",
          label: "Project Shells",
          href: "/pm-central/portfolio/shells",
          section: "portfolio",
          iconHint: "terminal",
          purpose: "Create and manage project shells (templates for new projects).",
          requiredAction: "pm.portfolio.write",
          scopeType: "all",
          visibilityMode: "show",
          backedBy: "existing-page",
          backendDomain: "portfolio",
          implementationStatus: "live",
          currentRoute: "/pm-central/shell",
          currentComponent: "PMShellPanel",
        },
        {
          id: "pm-inbox",
          label: "PM Inbox",
          href: "/pm-central/portfolio/inbox",
          section: "portfolio",
          iconHint: "inbox",
          purpose: "Centralized inbox for project notifications, approvals, and action items.",
          requiredAction: "pm.portfolio.read",
          scopeType: "self",
          visibilityMode: "show",
          backedBy: "existing-page",
          backendDomain: "portfolio",
          implementationStatus: "live",
          currentRoute: "/pm-central/inbox",
          currentComponent: "InboxPage",
        },
        {
          id: "pm-templates",
          label: "Templates & Examples",
          href: "/pm-central/portfolio/templates",
          section: "portfolio",
          iconHint: "file-text",
          purpose: "Browse and manage project templates and example configurations.",
          requiredAction: "pm.portfolio.read",
          scopeType: "all",
          visibilityMode: "show",
          backedBy: "existing-page",
          backendDomain: "portfolio",
          implementationStatus: "live",
          currentRoute: "/pm-central/templates",
          currentComponent: "TemplatesPanel",
        },
      ],
    },

    // -----------------------------------------------------------------------
    // 2. Planning
    // -----------------------------------------------------------------------
    {
      id: "planning",
      label: "Planning",
      iconHint: "file-text",
      purpose:
        "Define project plans, charters, scope, milestones, budgets, and resource allocations.",
      href: "/pm-central/planning",
      requiredAction: "pm.planning.read",
      scopeType: "all",
      visibilityMode: "show",
      backedBy: "existing-page",
      backendDomain: "planning",
      implementationStatus: "live",
      currentRoute: "/pm-central/plans",
      currentComponent: "PlansPanel",
      items: [
        {
          id: "plans-overview",
          label: "Plans",
          href: "/pm-central/planning/plans",
          section: "planning",
          iconHint: "file-text",
          purpose: "Create and manage project plans.",
          requiredAction: "pm.planning.read",
          scopeType: "all",
          visibilityMode: "show",
          backedBy: "existing-page",
          backendDomain: "planning",
          implementationStatus: "live",
          currentRoute: "/pm-central/plans",
          currentComponent: "PlansPanel",
        },
        {
          id: "idea-builder",
          label: "Idea Builder",
          href: "/pm-central/planning/idea-builder",
          section: "planning",
          iconHint: "sparkles",
          purpose: "AI-assisted project ideation and scoping wizard.",
          requiredAction: "pm.planning.write",
          scopeType: "all",
          visibilityMode: "show",
          backedBy: "existing-page",
          backendDomain: "planning",
          implementationStatus: "live",
          currentRoute: "/pm-central/idea-builder",
          currentComponent: "IdeaBuilderWizard",
        },
      ],
    },

    // -----------------------------------------------------------------------
    // 3. Execution
    // -----------------------------------------------------------------------
    {
      id: "execution",
      label: "Execution",
      iconHint: "activity",
      purpose:
        "Track project execution progress, tasks, deliverables, and iterations.",
      href: "/pm-central/execution",
      requiredAction: "pm.execution.read",
      scopeType: "all",
      visibilityMode: "show",
      backedBy: "existing-page",
      backendDomain: "execution",
      implementationStatus: "live",
      currentRoute: "/pm-central/execution",
      currentComponent: "ExecutionPanel",
      items: [
        {
          id: "execution-overview",
          label: "Execution Overview",
          href: "/pm-central/execution/overview",
          section: "execution",
          iconHint: "activity",
          purpose: "Track active project execution and progress.",
          requiredAction: "pm.execution.read",
          scopeType: "all",
          visibilityMode: "show",
          backedBy: "existing-page",
          backendDomain: "execution",
          implementationStatus: "live",
          currentRoute: "/pm-central/execution",
          currentComponent: "ExecutionPanel",
        },
      ],
    },

    // -----------------------------------------------------------------------
    // 4. Control & Risk
    // -----------------------------------------------------------------------
    {
      id: "control",
      label: "Control & Risk",
      iconHint: "alert-triangle",
      purpose:
        "Manage project risks, issues, change requests, and approval workflows.",
      href: "/pm-central/control",
      requiredAction: "pm.control.read",
      scopeType: "all",
      visibilityMode: "show",
      backedBy: "existing-page",
      backendDomain: "control",
      implementationStatus: "live",
      currentRoute: "/pm-central/risks",
      currentComponent: "RisksPanel",
      items: [
        {
          id: "risks",
          label: "Risks",
          href: "/pm-central/control/risks",
          section: "control",
          iconHint: "alert-triangle",
          purpose: "Identify, assess, and track project risks.",
          requiredAction: "pm.control.read",
          scopeType: "all",
          visibilityMode: "show",
          backedBy: "existing-page",
          backendDomain: "control",
          implementationStatus: "live",
          currentRoute: "/pm-central/risks",
          currentComponent: "RisksPanel",
        },
        {
          id: "changes",
          label: "Change Requests",
          href: "/pm-central/control/changes",
          section: "control",
          iconHint: "git-pull-request",
          purpose: "Submit and track project change requests.",
          requiredAction: "pm.control.write",
          scopeType: "all",
          visibilityMode: "show",
          backedBy: "existing-page",
          backendDomain: "control",
          implementationStatus: "live",
          currentRoute: "/pm-central/changes",
          currentComponent: "ChangesPanel",
        },
      ],
    },

    // -----------------------------------------------------------------------
    // 5. Collaboration
    // -----------------------------------------------------------------------
    {
      id: "collaboration",
      label: "Collaboration",
      iconHint: "messages-square",
      purpose:
        "Team communication, participant management, and shared documentation.",
      href: "/pm-central/collaboration",
      requiredAction: "pm.collaboration.read",
      scopeType: "all",
      visibilityMode: "show",
      backedBy: "existing-page",
      backendDomain: "collaboration",
      implementationStatus: "live",
      currentRoute: "/pm-central/collaboration",
      currentComponent: "ParticipantsPanel",
      items: [
        {
          id: "pm-collaboration",
          label: "Team & Participants",
          href: "/pm-central/collaboration/team",
          section: "collaboration",
          iconHint: "users",
          purpose: "Manage project team members and stakeholders.",
          requiredAction: "pm.collaboration.read",
          scopeType: "all",
          visibilityMode: "show",
          backedBy: "existing-page",
          backendDomain: "collaboration",
          implementationStatus: "live",
          currentRoute: "/pm-central/collaboration",
          currentComponent: "ParticipantsPanel",
        },
      ],
    },

    // -----------------------------------------------------------------------
    // 6. Reports & Analytics
    // -----------------------------------------------------------------------
    {
      id: "reporting",
      label: "Reports & Analytics",
      iconHint: "bar-chart-3",
      purpose:
        "Project-level and portfolio-level reporting, status dashboards, and analytics.",
      href: "/pm-central/reporting",
      requiredAction: "pm.reporting.read",
      scopeType: "all",
      visibilityMode: "show",
      backedBy: "existing-page",
      backendDomain: "reporting",
      implementationStatus: "live",
      currentRoute: "/pm-central/reports",
      currentComponent: "ReportsPanel",
      items: [
        {
          id: "pm-reports",
          label: "Reports",
          href: "/pm-central/reporting/reports",
          section: "reporting",
          iconHint: "bar-chart-3",
          purpose: "Generate and view project status reports.",
          requiredAction: "pm.reporting.read",
          scopeType: "all",
          visibilityMode: "show",
          backedBy: "existing-page",
          backendDomain: "reporting",
          implementationStatus: "live",
          currentRoute: "/pm-central/reports",
          currentComponent: "ReportsPanel",
        },
      ],
    },

    // -----------------------------------------------------------------------
    // 7. Methodology
    // -----------------------------------------------------------------------
    {
      id: "methodology",
      label: "Methodology",
      iconHint: "book-open",
      purpose:
        "Project management methodology library with frameworks, process guides, and best practices.",
      href: "/pm-central/methodology",
      requiredAction: "pm.methodology.read",
      scopeType: "all",
      visibilityMode: "show",
      backedBy: "existing-page",
      backendDomain: "methodology",
      implementationStatus: "live",
      currentRoute: "/pm-central/methodes",
      currentComponent: "MethodesPage",
      items: [
        {
          id: "methodes",
          label: "Méthodes",
          href: "/pm-central/methodology/methodes",
          section: "methodology",
          iconHint: "book-open",
          purpose: "Browse and apply project management methodologies.",
          requiredAction: "pm.methodology.read",
          scopeType: "all",
          visibilityMode: "show",
          backedBy: "existing-page",
          backendDomain: "methodology",
          implementationStatus: "live",
          currentRoute: "/pm-central/methodes",
          currentComponent: "MethodesPage",
        },
      ],
    },

    // -----------------------------------------------------------------------
    // 8. AI & Agent Engine
    // -----------------------------------------------------------------------
    {
      id: "ai-engine",
      label: "AI & Agent Engine",
      iconHint: "bot",
      purpose:
        "AI-powered project assistance, agent runs, and automated project intelligence.",
      href: "/pm-central/ai-engine",
      requiredAction: "pm.ai.read",
      scopeType: "all",
      visibilityMode: "show",
      backedBy: "existing-page",
      backendDomain: "ai",
      implementationStatus: "live",
      currentRoute: "/pm-central/agent-engine",
      currentComponent: "AgentEnginePanel",
      items: [
        {
          id: "agent-engine",
          label: "Agent Engine",
          href: "/pm-central/ai-engine/agent-engine",
          section: "ai-engine",
          iconHint: "bot",
          purpose: "Manage and run AI agents for project tasks.",
          requiredAction: "pm.ai.read",
          scopeType: "all",
          visibilityMode: "show",
          backedBy: "existing-page",
          backendDomain: "ai",
          implementationStatus: "live",
          currentRoute: "/pm-central/agent-engine",
          currentComponent: "AgentEnginePanel",
        },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// Derived Helpers
// ---------------------------------------------------------------------------

/** Flatten all nav items across all sections */
export function getAllPmNavItems(): ModuleNavItem[] {
  return PM_NAV_CONFIG.sections.flatMap((s) => s.items);
}

/** Find a section by ID */
export function findPmSectionById(sectionId: string) {
  return PM_NAV_CONFIG.sections.find((s) => s.id === sectionId);
}

/** Find a nav item by href */
export function findPmNavItemByHref(href: string) {
  return getAllPmNavItems().find((i) => i.href === href);
}
