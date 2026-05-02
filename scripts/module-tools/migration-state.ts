/**
 * Module Client Capsule — Migration State
 *
 * The frontend modularity checks are *phase-aware*. They run in two
 * modes per module:
 *
 *   strict       — the module has been migrated to the capsule pattern
 *                  and every check must pass against it.
 *   report-only  — the module is still on the legacy shape; checks
 *                  emit baseline findings but never fail the build.
 *
 * This file is the single source of truth for which modules are in
 * which mode. Adding a module to `MIGRATED_MODULES` flips every
 * frontend check from report-only to strict for that module.
 *
 * Phase 0 (this PR / "guardrails-only"):
 *   MIGRATED_MODULES = []  — no module has been migrated; every
 *   capsule check runs in report-only mode against unmigrated RTLMs.
 *
 * Phase 1 (Communication pilot, the next PR):
 *   MIGRATED_MODULES = ["communication"]
 *
 * Order beyond the pilot is captured in
 * `docs/architecture/frontend/MODULE_CLIENT_CAPSULE_ROADMAP.md`.
 */

/**
 * Canonical list of every Real-Time Lifecycle Module (RTLM) that
 * owns a frontend surface. Order here mirrors the documented
 * migration order so logs read naturally.
 */
export const RTLM_LIST = [
  "dataAnalysis",
  "communication",
  "pmCentral",
  "codeStudio",
  "ps",
  "prm",
  "psm",
  "hr",
  "organizationManagement",
  "cultureValues",
  "aiTypes",
  "openRouter",
  "agentStudio",
  "sandboxWf",
  "kgraAgent",
] as const;

export type RtlmKey = (typeof RTLM_LIST)[number];

/**
 * RTLM key → on-disk folder name under `client/src/modules/` and
 * `server/`. Folders use kebab-case; manifest keys use camelCase.
 */
export const RTLM_FOLDER_MAP: Record<RtlmKey, string> = {
  dataAnalysis: "data-analysis",
  communication: "communication",
  pmCentral: "pm-central",
  codeStudio: "code-studio",
  ps: "ps",
  prm: "prm",
  psm: "psm",
  hr: "hr",
  organizationManagement: "organization-management",
  cultureValues: "culture-values",
  aiTypes: "ai-types",
  openRouter: "openrouter",
  agentStudio: "agent-studio",
  sandboxWf: "sandbox-wf",
  kgraAgent: "kgra-agent",
};

/**
 * RTLMs that have been migrated to the Module Client Capsule pattern.
 * Frontend modularity checks run in *strict* mode for these and in
 * *report-only* mode for the rest.
 *
 * IMPORTANT: only edit this list as part of the migration PR for the
 * specific module being added. Do not add modules speculatively.
 *
 * Phase 2 (Communication pilot, merged in PR #59): the first
 * capsule migration. Every frontend modularity check runs strict
 * for `communication`.
 *
 * Phase 3.1 (Data Analysis, merged in PR #60): added `dataAnalysis`
 * as the second migrated module. Data Analysis owns the GraphRAG,
 * Data Acquisition, and Data Warehouse subdomains. KGRA Agent is a
 * separate RTLM and remains outside strict mode.
 *
 * Phase 3.2 (PM Central, merged in PR #61): added `pmCentral` as
 * the third migrated module. PM Central owns project management
 * planning and delivery execution. Projects System (`ps`) remains
 * separate — PS → PM Central is a backend handoff. PM Central's
 * canonical baseRoute moved from `/pm-central/rtlm/*` to `/pm/*`;
 * the legacy `/pm-central/*` shell routes are not RTLM canonical
 * and continue to be mounted directly in App.tsx.
 *
 * Phase 3.3 (Code Studio, merged in PR #62): added `codeStudio` as
 * the fourth migrated module. Code Studio owns the code execution /
 * build / development workbench UI (jobs, sessions, approvals,
 * repos, agents, policies, control panel, how-to, and the AI catalog
 * / OpenCode settings / templates sub-surfaces that pre-date the
 * canonical roadmap list). Port reservations remain backend-mediated
 * through the Port Registry lane; Governance enforcement remains on
 * the backend. Code Studio does not own the legacy `/code` Monaco
 * editor — that route serves a separate non-RTLM page.
 *
 * Phase 3.4 (Projects System, merged in PR #63): added `ps` as the
 * fifth migrated module. PS owns intake, ideation (incl. detail and
 * convert deep links), classification, wizard execution, PS project
 * records, catalog/reference views, and the PS control panel. PS →
 * PM Central is a backend handoff.
 *
 * Phase 3.5 (PR #65): PRM migrated to the capsule shape, adding
 * `prm` as the sixth migrated module. PRM owns problem-resolution
 * cases (incl. case workspace deep link), method library, playbooks,
 * catalog, AI catalog, and control panel.
 *
 * Phase 3.6 (this PR): PSM migrates to the capsule shape, adding
 * `psm` as the seventh migrated module. PSM owns problem-solving
 * methods: dashboard, method library, selector, cases (incl. case
 * detail deep link), method detail and run detail deep links, AI
 * catalog, admin, and analytics. Frontend modularity checks now run
 * strict for the seven migrated modules; the remaining 8 RTLMs
 * continue in report-only mode until their own migration PRs land.
 */
export const MIGRATED_MODULES: RtlmKey[] = [
  "communication",
  "dataAnalysis",
  "pmCentral",
  "codeStudio",
  "ps",
  "prm",
  "psm",
];

/**
 * Platform Core route prefixes that are mounted directly in App.tsx.
 * These are *not* RTLMs and are explicitly exempt from capsule checks.
 *
 * Anything outside this list and outside `RTLM_FOLDER_MAP` should be
 * surfaced by the route ownership map as either platform-core (if it
 * is a known central concern) or unknown.
 */
export const PLATFORM_CORE_PREFIXES: readonly string[] = [
  "/auth",
  "/login",
  "/logout",
  "/system",
  "/diagnostic",
  "/diagnostics",
  "/governance",
  "/hq",
  "/digital-hq",
  "/ws",
  "/workspace",
  "/workspaces",
  "/ws-catalog",
  "/modules",
  "/orchestrator",
  "/secrets",
  "/policies",
  "/key-rotation",
  "/keys",
];

/**
 * `true` when the module is in strict mode for this PR. Wrappers in
 * each check script call this to decide whether a finding should be
 * a build failure or a baseline-warning entry in the generated
 * report.
 */
export function isMigrated(key: string): boolean {
  return (MIGRATED_MODULES as string[]).includes(key);
}

/**
 * Helper for generators that want a deterministic ordering: emit
 * migrated modules first, then everything else, both in `RTLM_LIST`
 * order. Keeps generated docs stable.
 */
export function rtlmsByMigrationStatus(): {
  migrated: RtlmKey[];
  pending: RtlmKey[];
} {
  const migrated = RTLM_LIST.filter((k) => isMigrated(k));
  const pending = RTLM_LIST.filter((k) => !isMigrated(k));
  return { migrated, pending };
}
