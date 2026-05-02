/**
 * Code Studio — Module navigation.
 *
 * Pure data. The platform's nav composer reads this; modules do not
 * render their own top-level sidebar (the in-capsule S1 sidebar
 * inside `CodeStudioShell` is module-internal navigation).
 *
 * All hrefs MUST be canonical Code Studio routes under
 * `/code-studio/*`. Pointing nav at the legacy `/code` editor or at
 * Agent Studio / Sandbox WF / Governance routes from Code Studio is
 * a boundary violation enforced by `check:cross-module-links` and
 * `check:module-route-inventory`.
 */

export interface CodeStudioNavEntry {
  label: string;
  href: string;
  /** Optional grouping for sidebar ordering. */
  group?: string;
  order?: number;
}

export const codeStudioNav: CodeStudioNavEntry[] = [
  { label: "Dashboard", href: "/code-studio", group: "build", order: 0 },
  { label: "Jobs", href: "/code-studio/jobs", group: "build", order: 1 },
  { label: "Templates", href: "/code-studio/templates", group: "build", order: 2 },
  { label: "Sessions", href: "/code-studio/sessions", group: "build", order: 3 },
  { label: "Approvals", href: "/code-studio/approvals", group: "build", order: 4 },
  { label: "Repositories", href: "/code-studio/repos", group: "build", order: 5 },
  { label: "Agents", href: "/code-studio/agents", group: "build", order: 6 },
  { label: "AI Catalog", href: "/code-studio/ai-catalog", group: "build", order: 7 },
  { label: "Policies", href: "/code-studio/policies", group: "build", order: 8 },
  { label: "Control Panel", href: "/code-studio/control-panel", group: "build", order: 9 },
  { label: "OpenCode Settings", href: "/code-studio/opencode-settings", group: "build", order: 10 },
  { label: "How To", href: "/code-studio/how-to", group: "build", order: 11 },
];
