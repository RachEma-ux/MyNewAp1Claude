/**
 * Plan v3 Phase 47 — Legacy `<domain>.importToCatalog` deprecation helper.
 *
 * The five `<domain>.importToCatalog` procedures (agents, bots, llm,
 * models, providers) bypass `aiTypes.catalog.register` and write to
 * `catalog_entries` directly. Plan v3 Phase 47 marks them as legacy
 * and surfaces a deprecation signal on each call.
 *
 * Three signals are wired:
 *
 *   1. JSDoc `@deprecated` — IDE-visible at the call site.
 *   2. First-call `console.warn` — server log alert without spamming
 *      every call.
 *   3. Audit-event `deprecated: true` payload field — added by each
 *      procedure inside its existing `createCatalogAuditEvent` call.
 *
 * Removal happens when all callers are migrated (Phase 26.1 barrel-strip
 * follow-up). Until then, the procedures continue to function.
 *
 * See `docs/architecture/provider-model-binding/LEGACY_PATH_DEPRECATION.md`
 * for the migration recipe and `LEGACY_EXCEPTION_REGISTER.md` rows
 * LA-01 and LA-02 for the broader caller-migration tracking.
 */

const warned = new Set<string>();

/**
 * Logs a one-time deprecation warning the first time a given legacy
 * procedure is invoked in this process. Subsequent calls in the same
 * process are silent — the audit-event flag carries the per-call
 * signal forward.
 *
 * Pass the procedure key (`"agents.importToCatalog"`,
 * `"bots.importToCatalog"`, etc.) as the deduplication key.
 */
export function warnLegacyImportToCatalog(procedureKey: string): void {
  if (warned.has(procedureKey)) return;
  warned.add(procedureKey);
  console.warn(
    `[deprecated] ${procedureKey} bypasses aiTypes.catalog.register and ` +
      `will be removed when its callers migrate (Phase 26.1). ` +
      `See docs/architecture/provider-model-binding/LEGACY_PATH_DEPRECATION.md`,
  );
}

/**
 * Test-only — clears the seen-set so unit tests can verify the
 * first-call-warns / subsequent-calls-quiet behavior.
 */
export function __resetLegacyWarnSetForTests(): void {
  warned.clear();
}
