# PM Central Module

Top-level RTLM module that owns canonical project management state:
projects, plans, milestones, tasks, risks, issues, decisions, and the PS → PM
handoff inbox. Distinct from the legacy `pmt` platform engine — this module
is the canonical owner of all PM data going forward.

## Identity

| Field        | Value                |
|--------------|----------------------|
| `key`        | `pmCentral`          |
| `name`       | PM Central           |
| `routerKey`  | `pmCentral`          |
| `runtime`    | `embedded`           |
| `database`   | `pmdb` (owned)       |
| `baseRoute`  | `/pm-central`        |
| RTLM frontend| `/pm-central/rtlm/*` |

> **Base-route deviation.** The RTLM brief proposed `/pm`, but the existing
> live UI already uses `/pm-central` (30+ routes wired before this module was
> registered). To avoid breaking the live UI, the canonical base route is
> `/pm-central`. The new RTLM-managed pages live under `/pm-central/rtlm/*` to
> avoid collisions with the legacy `PMCentralShellPage` routes.

## Folder layout

```
server/pm-central/
  manifest.ts                 — ModuleManifest registered with the platform
  router.ts                   — tRPC router (mounted at appRouter.pmCentral)
  public-api.ts               — re-exports for other modules
  contracts.ts                — Zod schemas + DTOs
  events.ts                   — emitted event constants + payload types
  handoffs.ts                 — accepted handoff constants + payload types
  ports.ts                    — provided port interfaces
  connection.ts               — getPmDb()
  seed.ts                     — CREATE TABLE IF NOT EXISTS for the 9 tables
  pm.repository.ts            — pure PMDB queries
  pm.service.ts               — business logic + audit + event emission
  pm.validation.ts            — lifecycle transition rules
  pm.health.ts                — health() implementation
  __tests__/                  — unit tests

client/src/modules/pm-central/
  manifest.ts                 — ClientModuleManifest (routes + nav)
  pages/                      — 10 pages
    PMCentralDashboardPage.tsx
    PMProjectsPage.tsx
    PMProjectDetailPage.tsx
    PMTasksPage.tsx
    PMMilestonesPage.tsx
    PMRisksPage.tsx
    PMIssuesPage.tsx
    PMDecisionsPage.tsx
    PMHandoffsPage.tsx
    PMSettingsPage.tsx
  components/                 — 6 shared UI bits
    PMStatusCards.tsx
    PMProjectList.tsx
    PMTaskBoard.tsx
    PMMilestoneList.tsx
    PMRiskList.tsx
    PMIssueList.tsx
    PMHandoffQueue.tsx

drizzle/tables/pmdb.ts        — Drizzle schema for the 9 tables
```

## Database

Dedicated DB `pmdb`. Connected via `getPmDb()` (private to the module). Env
var `DATABASE_URL_PMDB` overrides; default replaces the database name in
`DATABASE_URL` with `/pmdb`.

Tables (all owned, all private to PM Central):

| Table             | Purpose                                          |
|-------------------|--------------------------------------------------|
| `pm_projects`     | Top-level project records (incl. PS provenance) |
| `pm_plans`        | Plans for a project (draft → approved → active) |
| `pm_milestones`   | Milestones inside a project                      |
| `pm_tasks`        | Tasks (board-style, optionally tied to milestone)|
| `pm_risks`        | Risks (severity + probability + mitigation)      |
| `pm_issues`       | Issues with optional owner                       |
| `pm_decisions`    | Recorded decisions with rationale                |
| `pm_handoffs`     | PS → PM handoff inbox (received / accepted / converted) |
| `pm_activity_log` | Per-project activity log                         |

## Public API (Module Gateway)

Other modules call these via `gatewayCall("pmCentral.<action>", payload)`.

| Action                                  | Risk    | Receipt |
|-----------------------------------------|---------|---------|
| `pmCentral.health`                      | low     | no      |
| `pmCentral.summary`                     | low     | no      |
| `pmCentral.projects.create`             | low     | no      |
| `pmCentral.projects.get`                | low     | no      |
| `pmCentral.projects.list`               | low     | no      |
| `pmCentral.projects.updateStatus`       | medium  | yes     |
| `pmCentral.tasks.create`                | low     | no      |
| `pmCentral.tasks.updateStatus`          | low     | no      |
| `pmCentral.handoffs.receiveFromPS`      | low     | no      |
| `pmCentral.handoffs.accept`             | low     | no      |
| `pmCentral.handoffs.reject`             | low     | no      |
| `pmCentral.handoffs.convertToProject`   | medium  | yes     |

Sensitive write actions (`pmCentral.project.archive`, `pmCentral.project.status.update`,
`pmCentral.plan.approve`, `pmCentral.handoff.convert`) are governance-listed in the manifest
with `receiptRequired: true` and exposed via `governedProcedure` paths.

## Events emitted

Names live in `events.ts → PM_CENTRAL_EVENTS`. All envelopes carry
`sourceModule: "pmCentral"` and `workspaceId`.

| Event                              | Where                                  |
|------------------------------------|----------------------------------------|
| `pm.project.created`               | `createProject`                        |
| `pm.project.status.changed`        | `updateProjectStatus`                  |
| `pm.project.archived`              | (alias of status.changed→archived)     |
| `pm.plan.created`                  | `createPlan`                           |
| `pm.plan.approved`                 | `approvePlan`                          |
| `pm.milestone.created`             | `createMilestone`                      |
| `pm.milestone.completed`           | `updateMilestoneStatus(...,'completed')` |
| `pm.task.created`                  | `createTask`                           |
| `pm.task.status.changed`           | `updateTaskStatus`                     |
| `pm.risk.created`                  | `createRisk`                           |
| `pm.issue.created`                 | `createIssue`                          |
| `pm.decision.recorded`             | `recordDecision`                       |
| `pm.handoff.received`              | `receivePsHandoff`                     |
| `pm.handoff.accepted`              | `acceptHandoff`                        |
| `pm.handoff.rejected`              | `rejectHandoff`                        |
| `pm.handoff.converted`             | `convertHandoffToProject`              |

## Handoffs accepted

PS submits handoffs via `submitHandoff({ targetModule: "pmCentral", type })`.

| Type                                  | Use                                   |
|---------------------------------------|---------------------------------------|
| `pmCentral.project.receiveFromPS`     | Record the handoff in `pm_handoffs`. |
| `pmCentral.project.convertFromPS`     | Receive **and** convert to a `pm_projects` row in one shot. |

## Ports provided

`ports.ts` declares `PmCentralReadPort` and `PmCentralHandoffPort` for
in-process callers that need a typed interface (no gateway round-trip).

## Frontend routes (RTLM module pages)

| Path                                  | Page                       |
|---------------------------------------|----------------------------|
| `/pm-central/rtlm`                    | PMCentralDashboardPage     |
| `/pm-central/rtlm/projects`           | PMProjectsPage             |
| `/pm-central/rtlm/projects/:id`       | PMProjectDetailPage        |
| `/pm-central/rtlm/tasks`              | PMTasksPage                |
| `/pm-central/rtlm/milestones`         | PMMilestonesPage           |
| `/pm-central/rtlm/risks`              | PMRisksPage                |
| `/pm-central/rtlm/issues`             | PMIssuesPage               |
| `/pm-central/rtlm/decisions`          | PMDecisionsPage            |
| `/pm-central/rtlm/handoffs`           | PMHandoffsPage             |
| `/pm-central/rtlm/settings`           | PMSettingsPage             |

The legacy `/pm-central/*` shell routes (PMCentralShellPage, ProjectPage,
WizardPage, …) continue to work for back-compat. The MainLayout PM Central
nav group lists both: canonical RTLM entries first, then a `Legacy:` section
for the old PM_NAV_CONFIG-driven sections.

## PS → PM boundary (the cross-module rule)

```
PS                                           PM Central
─────────                                    ─────────────
ideation, classification, wizard, lifecycle  pm_projects, pm_plans,
                                             pm_milestones, pm_tasks,
                                             pm_risks, pm_issues,
                                             pm_decisions
```

Simple ownership transfer = **handoff only**. PS does **not** write any
PM Central table. The flow:

1. PS approves a project (status = `VALIDATED`).
2. PS calls `server/ps/ps.pm-bridge.ts → createPMProjectFromPS`.
3. The bridge calls `pm.service.receivePsHandoff(...)` → records in
   `pm_handoffs`.
4. The bridge calls `pm.service.convertHandoffToProject(handoffId, actor)` →
   creates a `pm_projects` row + emits `pm.handoff.converted`.
5. PS updates its own `psProjects.pmProjectId` to the new PM Central id and
   transitions to `SENT_TO_PM`.

The legacy direct insert into `pmt_projects` was removed in this PR. The
`pmt_projects` table still exists for the legacy `pmt` platform engine, but
PS no longer writes to it.

Coordinator is **not** used for the simple PS → PM handoff. It would only be
used for multi-module flows like `PS → PM Central → Code Studio → Governance`.

## Observability

- Hamburger menu: PM Central group with canonical RTLM entries
  (`Module Dashboard`, `Projects (RTLM)`, `Tasks (RTLM)`, …) plus legacy shell
  entries prefixed with `Legacy:` for back-compat.
- Digital HQ module page picks up the manifest automatically.
- Application Wiring Inventory (AWI) lists the module's routes, public APIs,
  events, handoffs, and ports.

## Known follow-ups

1. **Add a `handoffs.list` query** so the inbox UI can show real records
   (current view leans on `dashboard.summary.pendingHandoffs`).
2. **Migrate legacy `pmt_projects` consumers** off the platform-engine
   schema and onto PM Central reads. Not required for this PR — `pmt` lives
   as an internal subsystem with no PS coupling now.
3. **Decide whether to alias `/pm` → `/pm-central`** for cosmetic alignment
   with the brief; punted to avoid breaking links.
