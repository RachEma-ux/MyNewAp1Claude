/**
 * Automation — Canonical Navigation Configuration
 *
 * Phase 12 deliverable — Wave 1 adoption of the shared module-nav standard.
 *
 * This file is the SINGLE SOURCE OF TRUTH for the Automation module navigation.
 * All sidebar rendering, route resolution, and governance documentation
 * should derive from this configuration.
 *
 * Automation is simpler than HR:
 * - No field-level masking (no PII)
 * - No sensitive-read audit logging
 * - No scope narrowing (self/team/all)
 * - Simpler permission model (workspace-role based)
 * - 3 sections, 7 leaf items (all live)
 *
 * Uses the shared ModuleNavConfig contract from navigation/moduleNavTypes.ts.
 */

import type { ModuleNavConfig } from "../navigation/moduleNavTypes";

// ---------------------------------------------------------------------------
// Backend Domain Constants
// ---------------------------------------------------------------------------

export const AUTOMATION_BACKEND_DOMAINS = {
  WORKFLOWS: "workflows",
  COMPONENTS: "components",
  CONFIG: "config",
} as const;

export type AutomationBackendDomain =
  typeof AUTOMATION_BACKEND_DOMAINS[keyof typeof AUTOMATION_BACKEND_DOMAINS];

// ---------------------------------------------------------------------------
// Canonical Navigation Model
// ---------------------------------------------------------------------------

export const AUTOMATION_NAV_CONFIG: ModuleNavConfig = {
  id: "automation",
  label: "Automation",
  baseRoute: "/automation",

  sections: [
    // -----------------------------------------------------------------------
    // 1. Workflows
    // -----------------------------------------------------------------------
    {
      id: "workflows",
      label: "Workflows",
      iconHint: "zap",
      purpose:
        "Create, manage, and execute automation workflows and WCP pipelines.",
      href: "/automation/workflows",
      requiredAction: "automation.workflows.read",
      scopeType: "all",
      visibilityMode: "show",
      backedBy: "existing-page",
      backendDomain: "workflows",
      implementationStatus: "live",
      currentRoute: "/automation",
      currentComponent: "Automation",
      items: [
        {
          id: "workflow-list",
          label: "Workflow List",
          href: "/automation/workflows/list",
          section: "workflows",
          iconHint: "zap",
          purpose: "Browse and manage automation workflows.",
          requiredAction: "automation.workflows.read",
          scopeType: "all",
          visibilityMode: "show",
          backedBy: "existing-page",
          backendDomain: "workflows",
          implementationStatus: "live",
          currentRoute: "/automation",
          currentComponent: "Automation",
        },
        {
          id: "workflow-builder",
          label: "Workflow Builder",
          href: "/automation/workflows/builder",
          section: "workflows",
          iconHint: "edit",
          purpose: "Visual workflow builder for creating automation pipelines.",
          requiredAction: "automation.workflows.write",
          scopeType: "all",
          visibilityMode: "show",
          backedBy: "existing-page",
          backendDomain: "workflows",
          implementationStatus: "live",
          currentRoute: "/automation/builder",
          currentComponent: "AutomationBuilder",
        },
        {
          id: "workflow-executions",
          label: "Executions",
          href: "/automation/workflows/executions",
          section: "workflows",
          iconHint: "activity",
          purpose: "View workflow execution history and status.",
          requiredAction: "automation.workflows.read",
          scopeType: "all",
          visibilityMode: "show",
          backedBy: "existing-page",
          backendDomain: "workflows",
          implementationStatus: "live",
          currentRoute: "/automation/executions",
          currentComponent: "AutomationExecutions",
        },
      ],
    },

    // -----------------------------------------------------------------------
    // 2. Components
    // -----------------------------------------------------------------------
    {
      id: "components",
      label: "Components",
      iconHint: "package",
      purpose:
        "Manage reusable automation building blocks: triggers, actions, and templates.",
      href: "/automation/components",
      requiredAction: "automation.components.read",
      scopeType: "all",
      visibilityMode: "show",
      backedBy: "existing-page",
      backendDomain: "components",
      implementationStatus: "live",
      currentRoute: "/automation/triggers",
      currentComponent: "TriggersStore",
      items: [
        {
          id: "triggers-store",
          label: "Triggers Store",
          href: "/automation/components/triggers",
          section: "components",
          iconHint: "activity",
          purpose: "Browse and configure available workflow triggers.",
          requiredAction: "automation.components.read",
          scopeType: "all",
          visibilityMode: "show",
          backedBy: "existing-page",
          backendDomain: "components",
          implementationStatus: "live",
          currentRoute: "/automation/triggers",
          currentComponent: "TriggersStore",
        },
        {
          id: "actions-store",
          label: "Actions Store",
          href: "/automation/components/actions",
          section: "components",
          iconHint: "package",
          purpose: "Browse and configure available workflow actions.",
          requiredAction: "automation.components.read",
          scopeType: "all",
          visibilityMode: "show",
          backedBy: "existing-page",
          backendDomain: "components",
          implementationStatus: "live",
          currentRoute: "/automation/actions",
          currentComponent: "ActionsStore",
        },
      ],
    },

    // -----------------------------------------------------------------------
    // 3. Configuration
    // -----------------------------------------------------------------------
    {
      id: "config",
      label: "Configuration",
      iconHint: "settings",
      purpose:
        "Manage automation secrets, settings, and platform-level configuration.",
      href: "/automation/config",
      requiredAction: "automation.config.read",
      scopeType: "all",
      visibilityMode: "show",
      backedBy: "existing-page",
      backendDomain: "config",
      implementationStatus: "live",
      currentRoute: "/automation/settings",
      currentComponent: "AutomationSettings",
      items: [
        {
          id: "automation-secrets",
          label: "Secrets",
          href: "/automation/config/secrets",
          section: "config",
          iconHint: "key",
          purpose: "Manage API keys and secrets used by automation workflows.",
          requiredAction: "automation.config.write",
          scopeType: "sensitive",
          visibilityMode: "show",
          backedBy: "existing-page",
          backendDomain: "config",
          implementationStatus: "live",
          currentRoute: "/automation/secrets",
          currentComponent: "SecretsPage",
        },
        {
          id: "automation-settings",
          label: "Settings",
          href: "/automation/config/settings",
          section: "config",
          iconHint: "settings",
          purpose: "Configure automation module global settings.",
          requiredAction: "automation.config.write",
          scopeType: "all",
          visibilityMode: "show",
          backedBy: "existing-page",
          backendDomain: "config",
          implementationStatus: "live",
          currentRoute: "/automation/settings",
          currentComponent: "AutomationSettings",
        },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// Derived Helpers
// ---------------------------------------------------------------------------

/** Flatten all nav items across all sections */
export function getAllAutomationNavItems() {
  return AUTOMATION_NAV_CONFIG.sections.flatMap((s) => s.items);
}

/** Find a section by ID */
export function findAutomationSectionById(sectionId: string) {
  return AUTOMATION_NAV_CONFIG.sections.find((s) => s.id === sectionId);
}

/** Find a nav item by href */
export function findAutomationNavItemByHref(href: string) {
  return getAllAutomationNavItems().find((i) => i.href === href);
}
