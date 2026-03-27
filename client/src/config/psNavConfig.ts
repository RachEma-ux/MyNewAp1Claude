/**
 * PS — Canonical Navigation Configuration
 *
 * Follows the shared ModuleNavConfig contract pattern (same as PM Central).
 * PS Ideation is a sub-module of the Projects System.
 */

import type { ModuleNavConfig, ModuleNavItem } from "./moduleNavTypes";

export const PS_NAV_CONFIG: ModuleNavConfig = {
  id: "projects-system",
  label: "Projects System",
  baseRoute: "/ps",

  sections: [
    {
      id: "catalog",
      label: "Catalog",
      iconHint: "book-open",
      purpose: "Browse available project system types and templates.",
      href: "/ps/catalog",
      requiredAction: "ps.catalog.read",
      scopeType: "all",
      visibilityMode: "show",
      backedBy: "existing-page",
      backendDomain: "catalog",
      implementationStatus: "live",
      currentRoute: "/ps/catalog",
      currentComponent: "PSCatalogPage",
      items: [
        {
          id: "ps-catalog",
          label: "PS Catalog",
          href: "/ps/catalog",
          section: "catalog",
          iconHint: "book-open",
          purpose: "Browse project system types.",
          requiredAction: "ps.catalog.read",
          scopeType: "all",
          visibilityMode: "show",
          backedBy: "existing-page",
          backendDomain: "catalog",
          implementationStatus: "live",
          currentRoute: "/ps/catalog",
          currentComponent: "PSCatalogPage",
        },
      ],
    },
    {
      id: "ideation",
      label: "Ideation",
      iconHint: "lightbulb",
      purpose: "Pre-project intake, concept framing, and ideation workflow.",
      href: "/ps/ideation",
      requiredAction: "ps.ideation.read",
      scopeType: "all",
      visibilityMode: "show",
      backedBy: "new-page",
      backendDomain: "ideation",
      implementationStatus: "live",
      currentRoute: "/ps/ideation",
      currentComponent: "PSIdeationPage",
      items: [
        {
          id: "ps-ideation-list",
          label: "Ideation Records",
          href: "/ps/ideation",
          section: "ideation",
          iconHint: "lightbulb",
          purpose: "List and manage ideation records.",
          requiredAction: "ps.ideation.read",
          scopeType: "all",
          visibilityMode: "show",
          backedBy: "new-page",
          backendDomain: "ideation",
          implementationStatus: "live",
          currentRoute: "/ps/ideation",
          currentComponent: "PSIdeationPage",
        },
        {
          id: "ps-ideation-new",
          label: "New Ideation",
          href: "/ps/ideation/new",
          section: "ideation",
          iconHint: "plus",
          purpose: "Start a new ideation record.",
          requiredAction: "ps.ideation.write",
          scopeType: "all",
          visibilityMode: "show",
          backedBy: "new-page",
          backendDomain: "ideation",
          implementationStatus: "live",
          currentRoute: "/ps/ideation/new",
          currentComponent: "PSIdeationDetailPage",
        },
      ],
    },
    {
      id: "wizard",
      label: "Wizard",
      iconHint: "wand-2",
      purpose: "Classify and create project systems via the guided wizard.",
      href: "/ps/wizard",
      requiredAction: "ps.wizard.read",
      scopeType: "all",
      visibilityMode: "show",
      backedBy: "existing-page",
      backendDomain: "wizard",
      implementationStatus: "live",
      currentRoute: "/ps/wizard",
      currentComponent: "PSWizardPage",
      items: [
        {
          id: "ps-wizard",
          label: "PS Wizard",
          href: "/ps/wizard",
          section: "wizard",
          iconHint: "wand-2",
          purpose: "Run the PS classification wizard.",
          requiredAction: "ps.wizard.read",
          scopeType: "all",
          visibilityMode: "show",
          backedBy: "existing-page",
          backendDomain: "wizard",
          implementationStatus: "live",
          currentRoute: "/ps/wizard",
          currentComponent: "PSWizardPage",
        },
      ],
    },
    {
      id: "list",
      label: "Projects",
      iconHint: "list",
      purpose: "View all created PS projects.",
      href: "/ps/list",
      requiredAction: "ps.list.read",
      scopeType: "all",
      visibilityMode: "show",
      backedBy: "existing-page",
      backendDomain: "projects",
      implementationStatus: "live",
      currentRoute: "/ps/list",
      currentComponent: "PSListPage",
      items: [
        {
          id: "ps-list",
          label: "PS Projects",
          href: "/ps/list",
          section: "list",
          iconHint: "list",
          purpose: "Browse created PS projects.",
          requiredAction: "ps.list.read",
          scopeType: "all",
          visibilityMode: "show",
          backedBy: "existing-page",
          backendDomain: "projects",
          implementationStatus: "live",
          currentRoute: "/ps/list",
          currentComponent: "PSListPage",
        },
      ],
    },
    {
      id: "control-panel",
      label: "Control Panel",
      iconHint: "settings",
      purpose: "PS monitoring, KPIs, and administrative operations.",
      href: "/ps/control-panel",
      requiredAction: "ps.admin.read",
      scopeType: "all",
      visibilityMode: "show",
      backedBy: "existing-page",
      backendDomain: "monitoring",
      implementationStatus: "live",
      currentRoute: "/ps/control-panel",
      currentComponent: "PSControlPanelPage",
      items: [
        {
          id: "ps-control-panel",
          label: "Control Panel",
          href: "/ps/control-panel",
          section: "control-panel",
          iconHint: "settings",
          purpose: "Monitor PS system health and KPIs.",
          requiredAction: "ps.admin.read",
          scopeType: "all",
          visibilityMode: "show",
          backedBy: "existing-page",
          backendDomain: "monitoring",
          implementationStatus: "live",
          currentRoute: "/ps/control-panel",
          currentComponent: "PSControlPanelPage",
        },
      ],
    },
  ],
};

export function getAllPsNavItems(): ModuleNavItem[] {
  return PS_NAV_CONFIG.sections.flatMap((s) => s.items);
}

// ── PS Ideation Shell Configs ────────────────────────────────────────
// Centralized display configs for the ideation shell components.
// Keeps presentation logic out of shell code.

export interface IdeationSourceConfig {
  key: string;
  label: string;
  badgeClass: string;
}

export const IDEATION_SOURCE_CONFIGS: Record<string, IdeationSourceConfig> = {
  manual: { key: "manual", label: "Manual", badgeClass: "bg-gray-500/10 text-gray-500 border-gray-500/30" },
  import: { key: "import", label: "Import", badgeClass: "bg-cyan-500/10 text-cyan-600 border-cyan-500/30" },
  template: { key: "template", label: "Template", badgeClass: "bg-violet-500/10 text-violet-600 border-violet-500/30" },
  ai: { key: "ai", label: "AI", badgeClass: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30" },
};

export interface IdeationLifecycleConfig {
  key: string;
  label: string;
  badgeClass: string;
  description: string;
}

export const IDEATION_LIFECYCLE_CONFIGS: Record<string, IdeationLifecycleConfig> = {
  draft: {
    key: "draft",
    label: "Draft",
    badgeClass: "bg-gray-500/10 text-gray-500 border-gray-500/30",
    description: "Initial state — no steps completed yet",
  },
  in_exploration: {
    key: "in_exploration",
    label: "In Exploration",
    badgeClass: "bg-blue-500/10 text-blue-600 border-blue-500/30",
    description: "Intake steps have been started or completed",
  },
  screening: {
    key: "screening",
    label: "Screening",
    badgeClass: "bg-amber-500/10 text-amber-600 border-amber-500/30",
    description: "Ideas are being evaluated and screened",
  },
  concept_selected: {
    key: "concept_selected",
    label: "Concept Selected",
    badgeClass: "bg-purple-500/10 text-purple-600 border-purple-500/30",
    description: "A concept has been chosen — finalizing before handoff",
  },
  ready_for_wizard: {
    key: "ready_for_wizard",
    label: "Ready for Wizard",
    badgeClass: "bg-green-500/10 text-green-600 border-green-500/30",
    description: "All readiness checks pass — can be handed off to PS Wizard",
  },
  deferred: {
    key: "deferred",
    label: "Deferred",
    badgeClass: "bg-orange-500/10 text-orange-600 border-orange-500/30",
    description: "Paused for later — can be resumed",
  },
  rejected: {
    key: "rejected",
    label: "Rejected",
    badgeClass: "bg-red-500/10 text-red-600 border-red-500/30",
    description: "Abandoned — marked as not viable",
  },
  converted: {
    key: "converted",
    label: "Converted",
    badgeClass: "bg-indigo-500/10 text-indigo-600 border-indigo-500/30",
    description: "Handed off to PS Wizard — ideation is complete",
  },
};
