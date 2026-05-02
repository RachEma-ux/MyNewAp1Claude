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
 */
export const MIGRATED_MODULES: RtlmKey[] = [];

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
