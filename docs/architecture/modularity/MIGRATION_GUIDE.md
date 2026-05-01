# Module Migration Guide

This guide is for engineers migrating an existing module into the modular
platform.

## Steps

1. **Add a manifest.** Create `server/<module>/manifest.ts` exporting the
   module manifest. Register it in `server/platform/modules/manifests.ts`.
2. **Declare DB ownership.** If the module owns a database, set
   `database: { kind: "owned", key: "<module>db", connection: getXxxDb }`. If it
   shares the platform DB, set `kind: "shared"` and list the schema/tables.
3. **Expose public surface.** Add the canonical files under the module folder:
   - `public-api.ts` — re-exports for other modules to import.
   - `contracts.ts` — Zod schemas / DTOs.
   - `ports.ts` — interfaces this module **provides** to others.
   - `events.ts` — event types this module emits / consumes.
   - `handoffs.ts` — handoff types this module accepts / produces.
   - `types.ts` — shared TypeScript types (already exist for most modules).
4. **Mark private files.** Anything not in the public surface is private.
   `*.repository.ts`, `connection.ts`, `seed.ts`, internal `*.service.ts`,
   `worker/`, `boot.ts` are private.
5. **Remove illegal cross-module imports.** Replace any
   `import ... from "../<other>/repository"` with a call into the other
   module's `public-api.ts` or via Module Gateway.
6. **Add health.** Implement `health()` in the manifest — return a `ModuleHealthReport`.
7. **Declare governance actions.** List `governanceActions` in the manifest
   for any sensitive cross-module mutations the module performs or accepts.
8. **Connect to the registry.** Confirm the module appears in
   `getModuleRegistry()` and `runtimeManager.list()`.
9. **Validate.** Run `npm run check:architecture` and resolve any failures.
10. **Document migration status.** Update `MODULE_BOUNDARY_MAP.md`.

## Pilot module checklist

For each pilot, mark the box when complete:

- [ ] Manifest registered.
- [ ] DB ownership declared.
- [ ] `public-api.ts` exists and is the only allowed import surface.
- [ ] `contracts.ts` exists.
- [ ] `ports.ts` exists.
- [ ] `events.ts` exists.
- [ ] `handoffs.ts` exists.
- [ ] No cross-module repository / connection / private-service / private-schema
      imports remain.
- [ ] Health check returns `ok` in dev.
- [ ] Governance actions declared.
- [ ] Manifest router replaces the entry in `server/routers.ts`.
