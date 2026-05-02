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

## Case study: Communication (chat / conversations / video-meeting / notifications)

**Driver.** Chat, conversations, video-meeting, and notifications were spread
across `server/chat/`, `server/routers/conversations.ts`, and
`server/routers/notifications.ts`, all writing into the platform DB. Multiple
features wrote to the same tables with different invariants. We promoted the
domain into a single owned module, **Communication**.

**Result.**

- New module `server/communication/` owns `communicationdb` (5 tables:
  `communication_conversations`, `communication_messages`,
  `communication_meetings`, `communication_participants`,
  `communication_notifications`).
- One canonical service: `server/communication/communication.service.ts`. The
  tRPC router (`appRouter.communication`) and the gateway public-API both call
  into it — there is no second writer.
- Old `server/chat/router.ts` and `server/routers/conversations.ts` are now
  thin **deprecated compatibility shims** that delegate every write to the
  Communication service. They keep the legacy response shape so existing
  clients (`AgentChat`, `CatalogAgentChat`, `useChat`) keep working.
- Frontend canonicalised at `/communication/{chat,conversations,video-meeting,notifications}`.
  Old routes (`/chat`, `/conversations`, `/video-meeting`) `<Redirect>` to the
  canonical paths.
- Agent-linked threads are routed through Communication with
  `conversationType="agent"`, `sourceModule="agents"`, `sourceRefId=agentId`.

**Lessons for the next migration.**

1. **Convert old routers to compatibility shims, don't delete.** A long-tail
   of clients still calls `trpc.chat.*` and `trpc.conversations.*`. Deleting
   them breaks the UI; replacing the bodies with `await svc.x()` keeps them
   working while making Communication the single owner.
2. **Preserve legacy response shape at the shim layer.** The old conversation
   shape was `{id, workspaceId, userId, agentId, title}` — the new
   Communication record is richer. The shim maps before returning so callers
   don't need to be updated in lock-step.
3. **Static wiring requires literal strings.** The `check:wiring` scripts
   parse source — handoff acceptors and gateway registrations must use
   string literals like `"communication.conversation.open"`, not constants.
4. **Update three scripts together.** New strong module → add to
   `STRONG_MODULES` in `scripts/check-modules.ts` and
   `scripts/check-module-db-ownership.ts`, plus `MODULE_MAP` in
   `scripts/lib/module-graph.ts`. Forgetting one makes the architecture
   check ambiguous about what "owned" means.
5. **Follow-up landed: agents/db.ts.** Agent-domain internal use of the
   legacy `conversations`/`messages` tables in `server/agents/db.ts` was
   migrated in a follow-up PR. The 9 conversation/message helpers there now
   delegate to the Communication service; agent-table CRUD stays. Agent-linked
   threads are written with `sourceModule="agents" + sourceRefId=agentId`,
   and the legacy response shape (`{id, workspaceId, agentId, userId, title,
   modelId, temperature, ...}`) is preserved by adapter functions
   (`toLegacyConversation` / `toLegacyMessage`) so `server/agents/router.ts`
   and `server/agents/executor.ts` keep working unchanged. After this
   migration, no application code reads or writes the legacy
   `conversations`/`messages` tables — Communication is the sole writer.

## Case study: PM Central (project management RTLM)

**Driver.** PM Central existed only as a UI/navigation section
(`PM_NAV_CONFIG`, `client/src/pages/pm-central/*`, `PMCentralShellPage`) with
no registered backend module. PS → PM bridge wrote directly into
`pmt_projects` (a `server/modules/pmt/schema` table belonging to a different
platform engine). This violated the modular boundary: PS was writing PM data
through a non-PM owner, and there was no canonical PM RTLM.

**Result.**

- New module `server/pm-central/` owns dedicated `pmdb` (9 tables: `pm_projects`,
  `pm_plans`, `pm_milestones`, `pm_tasks`, `pm_risks`, `pm_issues`,
  `pm_decisions`, `pm_handoffs`, `pm_activity_log`).
- One canonical service: `server/pm-central/pm.service.ts`. The tRPC router
  (`appRouter.pmCentral`) and the gateway public-API both call into it.
- Twelve gateway public-API actions; four governance-receipted
  (`pm.project.archive`, `pm.project.status.update`, `pm.plan.approve`,
  `pm.handoff.convert`).
- Two accepted handoff types (`pmCentral.project.receiveFromPS`,
  `pmCentral.project.convertFromPS`).
- Sixteen emitted events, all namespaced `pm.*`.
- Frontend RTLM module mounted at `/pm-central/rtlm/*` (10 pages + 6 shared
  components). Existing `PMCentralShellPage` routes stay intact for back-compat.
- `server/ps/ps.pm-bridge.ts` rewritten so it (a) submits a handoff payload,
  (b) calls the convert path, (c) links the new `pm_projects.id` onto the PS
  row. PS no longer writes any PM table directly.

**Deviations from spec, with rationale.**

1. **Base route `/pm-central` instead of `/pm`.** Existing UI had 30+ live
   `/pm-central/*` routes wired before this module was registered. Switching
   to `/pm` would have broken the live UI. New canonical RTLM pages live
   under `/pm-central/rtlm/*` to avoid colliding with the legacy
   `PMCentralShellPage` catch-all.
2. **Legacy `pmt_projects` retained.** The `server/modules/pmt` platform
   engine (a different subsystem) keeps its `pmt_projects` table. PS no
   longer writes there — only the pmt engine itself does. Migrating the pmt
   engine to PM Central reads is tracked as a separate follow-up.

**Lessons for the next migration.**

1. **Audit existing UI before picking a base route.** A naïve `/pm` would
   have orphaned every `/pm-central/*` link. The architecture-consistent
   choice was to keep the existing prefix and namespace new RTLM pages
   under `/<base>/rtlm/*`.
2. **Refactor cross-module write paths first.** The PS pm-bridge had to flip
   from direct write to handoff *before* anything else could trust the
   boundary. The five-place registration came second.
3. **Two handoff types are sometimes worth it.** `receiveFromPS` is for
   queued review; `convertFromPS` is the auto-accept variant for trusted
   producers. PS bridge uses the second; UIs that queue work for review
   would use the first.
