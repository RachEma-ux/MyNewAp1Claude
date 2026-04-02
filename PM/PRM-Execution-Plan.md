# PRM Problem Resolution Methods — Execution Plan

## Module: PRM (Problem Resolution Methods)
## Database: PRMDB (dedicated PostgreSQL)
## Target: MyNewAp1Claude repo — standalone top-level module

---

## Source Documents

All implementation decisions trace to the V4 document package:

| Doc | Role | Key content |
|-----|------|-------------|
| A — Master Document | Method reference | 7 method families, selection guide, governance rules |
| B — Module Spec | Technical spec | Routes, tables, lifecycle, backend structure, acceptance criteria |
| C — Troubleshooting Framework | Workflow spec | 7-stage workflow, stage-by-stage PRMDB persistence, domain playbooks |
| D — Maturity Toolkit | Capability spec | 5-level maturity model, assessment questionnaire, training manual |
| E — ResolveIQ GTM | Product vision | Pricing, roadmap, brand (external reference, not built) |
| Roadmap | Delivery plan | 9 phases, 5 waves, table groups, definition of done |

Location: `/storage/emulated/0/Download/pRM/`

---

## Team Structure

```
┌─────────────────────────────────────────────┐
│                 LEAD AGENT                  │
│          Coordination + Integration         │
│    Routing, composition, quality gates      │
└──────────┬──────────────────┬───────────────┘
           │                  │
    ┌──────▼──────┐    ┌──────▼──────┐
    │   BACKEND   │    │  FRONTEND   │
    │    AGENT    │    │    AGENT    │
    │ Schema, API │    │  Pages, UX  │
    │  Services   │    │ Components  │
    │   PRMDB     │    │             │
    └─────────────┘    └─────────────┘
```

---

## Enforcement Rules (non-negotiable)

1. **PRMDB isolation** — All PRM-owned data persists in PRMDB, never in `mynewap1claude`
2. **No cross-DB joins** — Use adapters, service calls, or stored external references
3. **Dedicated connection** — `server/prm/connection.ts` with `getPrmDb()`, env var `DATABASE_URL_PRMDB`
4. **Governed writes** — State-changing mutations use `governedProcedure` or equivalent pattern
5. **Audit trail** — Every lifecycle transition creates a `prm_case_events` record
6. **Evidence-first closure** — `verified_closed` status requires at least one verification record
7. **No hard-delete** — Evidence, verification, and closure records are never deleted
8. **Adapter pattern** — Cross-module lookups go through `server/prm/adapters/` — never import `getDb()` inside `server/prm/` service files
9. **Clone-only UI** — No cross-module component imports; clone existing patterns (Shell, sidebar, etc.)
10. **Standard stack** — shadcn/ui, Radix, lucide-react, Tailwind 4, wouter, sonner toasts

---

## PRMDB Table Plan (20 tables, 6 groups)

### Group 1 — Core Case Management (Phase 3)

```
prm_cases
  id                  serial PK
  title               varchar(255) NOT NULL
  description         text
  severity            varchar(30) — critical | high | medium | low
  priority            varchar(30) — p1 | p2 | p3 | p4
  status              varchar(30) NOT NULL DEFAULT 'draft'
                      — draft | intake | triage | analysis | decision_pending
                      — in_resolution | resolved | verification_pending
                      — verified_closed | reopened | cancelled
  source_type         varchar(50) — incident | defect | complaint | process | operational | other
  owner_user_id       integer — soft ref to users table in main DB
  reporter_user_id    integer — soft ref
  confidence          numeric(5,2)
  impact_statement    text
  scope               text
  closure_reason      text
  reopen_reason       text
  ext_project_id      integer — soft ref to ps_systems in main DB
  ext_pm_work_id      integer — soft ref to PM Central
  ext_workspace_id    integer — soft ref to workspaces in main DB
  created_at          timestamp DEFAULT now()
  updated_at          timestamp DEFAULT now()
  closed_at           timestamp
  reopened_at         timestamp

prm_case_events
  id                  serial PK
  case_id             integer FK → prm_cases
  event_type          varchar(50) — status_change | assignment | comment | reopen | close | etc.
  from_status         varchar(30)
  to_status           varchar(30)
  actor_user_id       integer — soft ref
  reason              text
  metadata            json
  created_at          timestamp DEFAULT now()

prm_case_links (replaced by prm_external_refs in Phase 6)
```

### Group 2 — Methods and Analysis (Phase 4)

```
prm_method_templates
  id                  serial PK
  method_type         varchar(50) NOT NULL
                      — five_whys | fishbone | rca | a3 | eight_d_lite
                      — decision_matrix | verification_checklist | prevention_plan
                      — hypothesis_testing | fault_isolation
  name                varchar(255)
  description         text
  template_data       json — default structure/schema for this method
  category            varchar(50) — analytical | creative | scientific | optimization | process | design
  is_system           boolean DEFAULT true — system-provided vs user-created
  published           boolean DEFAULT false
  created_at          timestamp DEFAULT now()
  updated_at          timestamp DEFAULT now()

prm_method_runs
  id                  serial PK
  case_id             integer FK → prm_cases
  template_id         integer FK → prm_method_templates (nullable)
  method_type         varchar(50) NOT NULL
  workspace_data      json — structured investigation content (5 Whys steps, Fishbone branches, etc.)
  narrative_summary   text — durable text summary for search/analytics
  status              varchar(30) — in_progress | completed | abandoned
  started_by          integer — soft ref
  created_at          timestamp DEFAULT now()
  updated_at          timestamp DEFAULT now()
  completed_at        timestamp

prm_decisions
  id                  serial PK
  case_id             integer FK → prm_cases
  title               varchar(255) NOT NULL
  chosen_path         text
  rationale           text NOT NULL — governance: decision rationale is mandatory
  alternatives        json — options considered
  constraints         json
  approved_by         integer — soft ref
  approved_at         timestamp
  created_at          timestamp DEFAULT now()
```

### Group 3 — Execution and Closure (Phase 5)

```
prm_actions
  id                  serial PK
  case_id             integer FK → prm_cases
  action_type         varchar(30) NOT NULL — containment | corrective | preventive
  title               varchar(255) NOT NULL
  description         text
  owner_user_id       integer — soft ref
  due_date            timestamp
  status              varchar(30) DEFAULT 'pending' — pending | in_progress | completed | reopened | blocked
  dependency_note     text
  effectiveness_result text
  completed_at        timestamp
  created_at          timestamp DEFAULT now()
  updated_at          timestamp DEFAULT now()

prm_evidence
  id                  serial PK
  case_id             integer FK → prm_cases
  evidence_type       varchar(30) — file | url | screenshot | log | observation | governance
  title               varchar(255)
  file_url            text — path or URL to stored file
  external_url        text
  notes               text
  is_validated        boolean DEFAULT false
  validated_by        integer — soft ref
  validated_at        timestamp
  created_at          timestamp DEFAULT now()

prm_verifications
  id                  serial PK
  case_id             integer FK → prm_cases
  test_condition      text NOT NULL
  expected_result     text NOT NULL
  actual_result       text
  passed              boolean
  approver_user_id    integer — soft ref
  signed_off_at       timestamp
  created_at          timestamp DEFAULT now()

prm_prevention_plans
  id                  serial PK
  case_id             integer FK → prm_cases
  control_change      text
  sop_update          text
  training_need       text
  monitoring_rule     text
  status              varchar(30) DEFAULT 'draft' — draft | active | completed
  owner_user_id       integer — soft ref
  created_at          timestamp DEFAULT now()
  updated_at          timestamp DEFAULT now()
```

### Group 4 — Learning and Reuse (Phase 7)

```
prm_lessons
  id                  serial PK
  case_id             integer FK → prm_cases (nullable — can exist independently)
  title               varchar(255) NOT NULL
  what_happened       text
  why_it_mattered     text
  what_changed        text
  reuse_notes         text
  published           boolean DEFAULT false
  published_at        timestamp
  created_at          timestamp DEFAULT now()
  updated_at          timestamp DEFAULT now()

prm_playbooks
  id                  serial PK
  title               varchar(255) NOT NULL
  description         text
  domain              varchar(50) — it_service | manufacturing | customer | cross_functional | general
  method_type         varchar(50) — optional link to a method type
  template_data       json — steps, checklists, guidance
  source_lesson_id    integer FK → prm_lessons (nullable)
  published           boolean DEFAULT false
  published_at        timestamp
  created_by          integer — soft ref
  created_at          timestamp DEFAULT now()
  updated_at          timestamp DEFAULT now()

prm_catalog_items
  id                  serial PK
  item_type           varchar(30) — method | lesson | playbook | standard | template
  title               varchar(255) NOT NULL
  description         text
  content_data        json
  source_id           integer — FK to originating lesson, playbook, or method
  source_type         varchar(30)
  publication_state   varchar(30) — draft | reviewed | approved | published | archived
  reviewed_by         integer — soft ref
  published_at        timestamp
  created_at          timestamp DEFAULT now()
  updated_at          timestamp DEFAULT now()

prm_training_assets
  id                  serial PK
  title               varchar(255) NOT NULL
  module_number       integer — training module 1-7
  content_data        json — exercises, reference material
  asset_type          varchar(30) — module | exercise | reference | assessment
  created_at          timestamp DEFAULT now()
  updated_at          timestamp DEFAULT now()
```

### Group 5 — Assessment and Analytics (Phase 7-8)

```
prm_maturity_runs
  id                  serial PK
  run_date            timestamp DEFAULT now()
  assessor_user_id    integer — soft ref
  dimension_scores    json — { intake: 4, diagnosis: 3, decision: 5, ... }
  total_score         integer
  maturity_level      integer — 1-5
  gap_notes           text
  next_actions        text
  created_at          timestamp DEFAULT now()

prm_kpi_snapshots
  id                  serial PK
  snapshot_date       timestamp DEFAULT now()
  open_cases          integer
  overdue_actions     integer
  mean_time_to_resolution numeric
  recurrence_rate     numeric
  verification_rate   numeric
  method_usage        json — { five_whys: 12, fishbone: 5, ... }
  created_at          timestamp DEFAULT now()

prm_reporting_jobs
  id                  serial PK
  job_type            varchar(50) — recurrence_analysis | closure_quality | action_debt | method_usage
  parameters          json
  result_data         json
  status              varchar(30) — pending | running | completed | failed
  started_at          timestamp
  completed_at        timestamp
  created_at          timestamp DEFAULT now()
```

### Group 6 — Integration Control (Phase 6)

```
prm_external_refs
  id                  serial PK
  case_id             integer FK → prm_cases
  target_module       varchar(30) NOT NULL — ps | pm_central | hr | documents | governance | collaboration | hq
  target_id           integer NOT NULL — ID in the external module's DB
  ref_type            varchar(30) — link | escalation | spawn | evidence_source
  label               varchar(255)
  notes               text
  created_at          timestamp DEFAULT now()

prm_sync_events
  id                  serial PK
  case_id             integer FK → prm_cases (nullable)
  direction           varchar(10) — inbound | outbound
  target_module       varchar(30)
  event_type          varchar(50)
  payload             json
  status              varchar(30) — pending | sent | received | failed
  created_at          timestamp DEFAULT now()

prm_publication_states
  id                  serial PK
  entity_type         varchar(30) — lesson | playbook | catalog_item | method_template
  entity_id           integer
  state               varchar(30) — draft | under_review | approved | published | rejected | archived
  reviewer_user_id    integer — soft ref
  review_notes        text
  state_changed_at    timestamp DEFAULT now()
  created_at          timestamp DEFAULT now()
```

---

## Route Family

```
/prm                    → PRMTopLevelPage (landing / redirect to dashboard)
/prm/dashboard          → PRMDashboardPage
/prm/new                → PRMNewCasePage (intake form)
/prm/cases              → PRMCaseListPage (queue, filters, saved views)
/prm/cases/:id          → PRMCaseWorkspacePage (tabbed: overview, diagnosis, decisions, actions, evidence, verification, lessons)
/prm/methods            → PRMMethodsLibraryPage
/prm/playbooks          → PRMPlaybooksPage
/prm/catalog            → PRMCatalogPage
/prm/control-panel      → PRMControlPanelPage (analytics, maturity, training, publishing, admin)
```

---

## Server File Map

```
server/prm/
├── connection.ts           — getPrmDb(), DATABASE_URL_PRMDB, lazy singleton
├── prm.router.ts           — top-level tRPC router (mounted as `prm` in appRouter)
├── prm.service.ts          — lifecycle orchestration, status machine, validation
├── prm.repository.ts       — PRMDB queries for cases, events, actions, evidence, etc.
├── prm.types.ts            — enums, status types, method types, shared interfaces
├── prm.validation.ts       — Zod schemas for all inputs
├── prm.methods.ts          — method catalog, template registry, selection logic
├── prm.governance.ts       — preflight checks, closure gates, freeze awareness, publish controls
├── prm.analytics.ts        — KPI calculations, dashboard queries, reporting jobs
├── prm.catalog.ts          — catalog/playbook/lesson promotion and publishing logic
├── seed.ts                 — PRMDB bootstrap: create tables, seed method templates & playbooks
├── migrate.ts              — PRMDB migration runner (independent of main DB migrations)
└── adapters/
    ├── users-adapter.ts    — resolve user IDs/names from main DB via getDb()
    ├── ps-adapter.ts       — resolve PS project references from main DB
    ├── pm-adapter.ts       — resolve PM Central work item references
    ├── governance-adapter.ts — check freeze state, submit evidence to Governance Center
    └── documents-adapter.ts  — resolve document references from main DB
```

---

## Client File Map

```
client/src/pages/prm/
├── PRMTopLevelPage.tsx         — landing page, redirect or dashboard summary
├── PRMShellPage.tsx            — IBM Shell (Fragment pattern: sidebar + content)
├── PRMDashboardPage.tsx        — open cases, overdue actions, severity mix, KPIs
├── PRMNewCasePage.tsx           — intake form: title, description, severity, source type, owner
├── PRMCaseListPage.tsx         — filterable table with status, severity, owner, dates
├── PRMCaseWorkspacePage.tsx    — tabbed workspace (overview | diagnosis | decisions | actions | evidence | verification | lessons)
├── PRMMethodsLibraryPage.tsx   — method cards with category, description, when-to-use
├── PRMPlaybooksPage.tsx        — domain playbooks (IT, manufacturing, customer, cross-functional)
├── PRMCatalogPage.tsx          — published lessons, templates, standards
└── PRMControlPanelPage.tsx     — analytics, maturity assessment, training, publishing controls

client/src/components/prm/
├── PRMSidebar.tsx              — left nav (Dashboard, New Case, Cases, Methods, Playbooks, Catalog, Control Panel)
├── PRMCaseCard.tsx             — reusable case summary card
├── PRMStatusBadge.tsx          — color-coded status badge
├── PRMSeverityBadge.tsx        — severity indicator
├── PRMMethodWorkspace.tsx      — renders method-specific UI (5 Whys steps, Fishbone branches, etc.)
├── PRMActionLedger.tsx         — action list with ownership, due dates, status
├── PRMEvidencePanel.tsx        — evidence list with upload/link capability
├── PRMVerificationChecklist.tsx — verification checks with pass/fail and sign-off
├── PRMTimelineView.tsx         — case event history (audit trail)
└── PRMDecisionLog.tsx          — decision entries with rationale
```

---

## tRPC Namespace

All PRM procedures mount at `trpc.prm.*`:

```
trpc.prm.cases.list / getById / create / update / setStatus / reopen / close
trpc.prm.events.list                                    — case timeline
trpc.prm.methods.listTemplates / getRun / createRun / updateRun / completeRun
trpc.prm.decisions.list / add / update / approve
trpc.prm.actions.list / add / update / complete / reopen
trpc.prm.evidence.list / add / remove / validate
trpc.prm.verifications.list / add / signOff
trpc.prm.prevention.list / add / update
trpc.prm.lessons.list / add / update / publish
trpc.prm.playbooks.list / getById / create / update / publish
trpc.prm.catalog.list / publish / archive
trpc.prm.maturity.runAssessment / getHistory
trpc.prm.analytics.dashboard / queueSummary / recurrenceTrends / kpiSnapshot
trpc.prm.refs.list / add / remove                       — external references
trpc.prm.health                                         — PRMDB connection check
```

---

## Phase Execution Plan

### Phase 0 — Architecture Lock (Wave 1)

**Objective:** Freeze the module boundary and PRMDB strategy before any code.

**LEAD tasks:**
- [ ] 0.1 Write PRM module charter documenting: objective, ownership, route family, backend domain, non-goals, dependencies, acceptance criteria
- [ ] 0.2 Define PRMDB connection strategy (clone `sandbox-wf/connection.ts` pattern)
- [ ] 0.3 Define env var naming: `DATABASE_URL_PRMDB` with fallback from `DATABASE_URL`
- [ ] 0.4 Define migration strategy: `server/prm/seed.ts` + `server/prm/migrate.ts` (independent of main DB)
- [ ] 0.5 Define adapter contracts: which main-DB lookups are needed, how they're called
- [ ] 0.6 Define the no-cross-DB-join rule in writing
- [ ] 0.7 Define backup/restore expectations for PRMDB
- [ ] 0.8 Confirm table plan (20 tables, 6 groups) with phased delivery
- [ ] 0.9 Get approval before Phase 1 starts

**Exit gate:** Module charter and PRMDB strategy approved. No ambiguity on ownership, integration, or environment.

---

### Phase 1 — Client Shell and Routing (Wave 1)

**Objective:** PRM is visible as a top-level module in the app. All routes render.

**LEAD tasks:**
- [ ] 1.1 Add PRM entry to hamburger menu in `MainLayout.tsx` (sorted A-Z among existing modules)
- [ ] 1.2 Register all `/prm/*` routes in `App.tsx` following PS pattern
- [ ] 1.3 Verify shell renders on all 9 routes

**FRONTEND tasks:**
- [ ] 1.4 Create `PRMShellPage.tsx` — IBM Shell Fragment pattern (clone from `PSShellPage.tsx`)
- [ ] 1.5 Create `PRMSidebar.tsx` — left nav with 7 items (clone from `PMProjectSidebar.tsx`)
- [ ] 1.6 Create `PRMTopLevelPage.tsx` — landing page
- [ ] 1.7 Create `PRMDashboardPage.tsx` — placeholder with module description and empty-state cards
- [ ] 1.8 Create `PRMNewCasePage.tsx` — placeholder intake form (no persistence yet)
- [ ] 1.9 Create `PRMCaseListPage.tsx` — placeholder table with empty state
- [ ] 1.10 Create `PRMCaseWorkspacePage.tsx` — placeholder with 7 tabs (overview, diagnosis, decisions, actions, evidence, verification, lessons)
- [ ] 1.11 Create `PRMMethodsLibraryPage.tsx` — placeholder
- [ ] 1.12 Create `PRMPlaybooksPage.tsx` — placeholder
- [ ] 1.13 Create `PRMCatalogPage.tsx` — placeholder
- [ ] 1.14 Create `PRMControlPanelPage.tsx` — placeholder

**Rules:**
- No DB calls, no fake data in main DB
- Empty states must say "Connect to PRMDB to begin" or similar
- Shell must work on mobile (sidebar collapsed to w-12)

**Exit gate:** PRM module is reachable in the UI, all 9 routes render, sidebar works, no shared-DB leakage.

---

### Phase 2 — Backend Domain and PRMDB Foundation (Wave 2)

**Objective:** `server/prm/` exists, PRMDB is provisioned and connected, initial schema applied.

**BACKEND tasks:**
- [ ] 2.1 Create `server/prm/connection.ts` — `getPrmDb()` with `DATABASE_URL_PRMDB` (clone `sandbox-wf/connection.ts`)
- [ ] 2.2 Create `drizzle/tables/prmdb.ts` — all 20 table definitions using `pgTable()`
- [ ] 2.3 Create `server/prm/seed.ts` — PRMDB bootstrap: create tables if not exist, seed method templates
- [ ] 2.4 Create `server/prm/prm.types.ts` — TypeScript enums/types for statuses, severities, method types
- [ ] 2.5 Create `server/prm/prm.validation.ts` — Zod schemas for all procedure inputs
- [ ] 2.6 Create `server/prm/prm.router.ts` — scaffold with `health` procedure (checks PRMDB connectivity)
- [ ] 2.7 Create `server/prm/prm.repository.ts` — scaffold with basic case CRUD stubs
- [ ] 2.8 Create `server/prm/prm.service.ts` — scaffold with lifecycle validation stubs
- [ ] 2.9 Create `server/prm/prm.governance.ts` — scaffold with closure gate stubs
- [ ] 2.10 Create adapter scaffolds: `server/prm/adapters/users-adapter.ts`, `ps-adapter.ts`

**LEAD tasks:**
- [ ] 2.11 Mount `prmRouter` in `server/routers.ts` as `prm: prmRouter`
- [ ] 2.12 Add `createdb prmdb` to local launch procedure and CI workflow
- [ ] 2.13 Verify: `trpc.prm.health` returns connected status

**Seed data (method templates to pre-load):**
- 5 Whys, Fishbone/Ishikawa, Root Cause Analysis (RCA), A3 Report, 8D Lite
- Decision Matrix, Verification Checklist, Prevention Plan
- Hypothesis Testing, Fault Isolation, Divide-and-Conquer

**Exit gate:** PRMDB provisioned, `getPrmDb()` connects, migrations apply, health endpoint returns OK.

---

### Phase 3 — Core Case Lifecycle (Wave 3)

**Objective:** Cases can be created, advanced through all statuses, reopened, and closed with full event history.

**BACKEND tasks:**
- [ ] 3.1 Implement `prm.cases.create` — intake form → new case in PRMDB
- [ ] 3.2 Implement `prm.cases.list` — filterable by status, severity, owner, date range
- [ ] 3.3 Implement `prm.cases.getById` — full case with related counts
- [ ] 3.4 Implement `prm.cases.update` — edit title, description, severity, owner, etc.
- [ ] 3.5 Implement `prm.cases.setStatus` — status machine with validation + event creation
- [ ] 3.6 Implement `prm.cases.reopen` — requires reason, preserves closure context
- [ ] 3.7 Implement `prm.events.list` — chronological case timeline
- [ ] 3.8 Implement status machine rules:
  - `draft` → `intake` → `triage` → `analysis` → `decision_pending` → `in_resolution` → `resolved` → `verification_pending` → `verified_closed`
  - `verified_closed` → `reopened` (with reason)
  - `reopened` → `analysis` (re-enters diagnosis)
  - Any status → `cancelled` (with reason)
  - `verified_closed` requires ≥1 verification record with `passed = true`
- [ ] 3.9 Implement users-adapter: resolve user names/IDs from main DB for display

**FRONTEND tasks:**
- [ ] 3.10 Wire `PRMNewCasePage.tsx` — real intake form → `trpc.prm.cases.create`
- [ ] 3.11 Wire `PRMCaseListPage.tsx` — real table → `trpc.prm.cases.list` with filters
- [ ] 3.12 Wire `PRMCaseWorkspacePage.tsx` Overview tab — status, severity, owner, timeline
- [ ] 3.13 Create `PRMStatusBadge.tsx` — color-coded per status
- [ ] 3.14 Create `PRMSeverityBadge.tsx` — severity indicator
- [ ] 3.15 Create `PRMTimelineView.tsx` — event history in the case workspace
- [ ] 3.16 Wire `PRMDashboardPage.tsx` — open cases count, severity mix, overdue summary

**Exit gate:** A case can be created, advanced, resolved, fail verification, reopen, and close again with full history in PRMDB.

---

### Phase 4 — Method Workspaces (Wave 3)

**Objective:** Users can run structured methods inside a case and save investigation state to PRMDB.

**BACKEND tasks:**
- [ ] 4.1 Implement `prm.methods.listTemplates` — all available method templates
- [ ] 4.2 Implement `prm.methods.createRun` — start a method workspace on a case
- [ ] 4.3 Implement `prm.methods.updateRun` — save workspace state (partial saves)
- [ ] 4.4 Implement `prm.methods.completeRun` — mark method as completed with summary
- [ ] 4.5 Implement `prm.methods.getRun` — load saved method workspace

**FRONTEND tasks:**
- [ ] 4.6 Wire Diagnosis tab in `PRMCaseWorkspacePage.tsx` — method selection + active runs
- [ ] 4.7 Create `PRMMethodWorkspace.tsx` — renders method-specific UI based on `method_type`:
  - **5 Whys:** sequential why-because chain (5 rows)
  - **Fishbone:** category → cause input (6 categories: People, Process, Equipment, Materials, Environment, Management)
  - **RCA:** free-form investigation with evidence links
  - **A3:** single-page structured report (background, current state, goal, analysis, countermeasures, plan, follow-up)
  - **8D Lite:** 8 disciplined steps
  - **Decision Matrix:** options × criteria scoring grid
  - **Verification Checklist:** condition → expected → actual → pass/fail
  - **Prevention Plan:** control changes + SOP updates + training needs
- [ ] 4.8 Create method template card view for `PRMMethodsLibraryPage.tsx`

**Exit gate:** Users can run at least 3 methods inside a case, save progress, and convert results into tracked next steps.

---

### Phase 5 — Actions, Evidence, Verification, Closure (Wave 4)

**Objective:** Evidence-based closure is enforced. Actions have ownership and tracking.

**BACKEND tasks:**
- [ ] 5.1 Implement `prm.actions.*` — full CRUD with ownership, due dates, status, completion
- [ ] 5.2 Implement `prm.evidence.*` — add, remove, validate (no hard-delete on validated evidence)
- [ ] 5.3 Implement `prm.verifications.*` — add checks, record results, sign-off
- [ ] 5.4 Implement `prm.prevention.*` — CRUD for prevention plans
- [ ] 5.5 Implement closure gate in `prm.governance.ts`:
  - Block `verified_closed` if no verification records exist
  - Block `verified_closed` if no verification has `passed = true`
  - Require closure_reason on close
  - Log all closure attempts (successful and blocked) as events

**FRONTEND tasks:**
- [ ] 5.6 Wire Actions tab — `PRMActionLedger.tsx` with add/edit/complete
- [ ] 5.7 Wire Evidence tab — `PRMEvidencePanel.tsx` with upload/link/validate
- [ ] 5.8 Wire Verification tab — `PRMVerificationChecklist.tsx` with pass/fail and sign-off
- [ ] 5.9 Wire Lessons tab — lesson draft linked to case
- [ ] 5.10 Create `PRMDecisionLog.tsx` — decisions with rationale (Decisions tab)
- [ ] 5.11 Add action debt and verification backlog to dashboard

**Exit gate:** Cases can only reach `verified_closed` through persisted evidence and verification records. Closure without evidence is blocked.

---

### Phase 6 — Cross-Module Integrations (Wave 4)

**Objective:** PRM links safely to other modules without breaking the PRMDB boundary.

**BACKEND tasks:**
- [ ] 6.1 Implement `prm.refs.*` — add/list/remove external references
- [ ] 6.2 Implement `server/prm/adapters/ps-adapter.ts` — resolve PS project name/status by ID
- [ ] 6.3 Implement `server/prm/adapters/pm-adapter.ts` — resolve PM Central work items
- [ ] 6.4 Implement `server/prm/adapters/governance-adapter.ts` — check freeze state, submit evidence
- [ ] 6.5 Implement `server/prm/adapters/documents-adapter.ts` — resolve document metadata
- [ ] 6.6 Implement freeze-awareness: if governance freeze is active, block status transitions and show banner
- [ ] 6.7 Implement `prm_sync_events` logging for outbound integration calls

**FRONTEND tasks:**
- [ ] 6.8 Add "Link to..." button in case workspace → select module + target
- [ ] 6.9 Show linked items in Overview tab with resolved names (via adapters)
- [ ] 6.10 Show governance freeze banner when active

**Exit gate:** PRM can link to PS, PM Central, Governance, and Documents. No cross-DB joins. PRMDB stores all references.

---

### Phase 7 — Learning, Maturity, Training, Catalog (Wave 5)

**Objective:** PRM becomes a reusable organizational capability, not just a case queue.

**BACKEND tasks:**
- [ ] 7.1 Implement `prm.lessons.*` — extract from cases, publish to catalog
- [ ] 7.2 Implement `prm.playbooks.*` — CRUD + publish flow
- [ ] 7.3 Implement `prm.catalog.*` — publish/archive with publication state machine
- [ ] 7.4 Implement `prm.maturity.runAssessment` — questionnaire scoring, level calculation
- [ ] 7.5 Implement `prm.maturity.getHistory` — assessment trend over time
- [ ] 7.6 Implement publication governance: draft → under_review → approved → published
- [ ] 7.7 Seed training assets: 7 modules from Doc D, 4 exercises

**FRONTEND tasks:**
- [ ] 7.8 Wire `PRMPlaybooksPage.tsx` — playbook cards by domain, guided workflows
- [ ] 7.9 Wire `PRMCatalogPage.tsx` — published lessons, templates, standards with search
- [ ] 7.10 Add maturity assessment to `PRMControlPanelPage.tsx` — questionnaire + score history
- [ ] 7.11 Add training section to control panel — modules, exercises, reference material
- [ ] 7.12 Add publishing controls to control panel — review queue, approve/reject

**Exit gate:** Playbooks, lessons, and catalog items can be published through a governed path. Maturity assessments produce scores stored in PRMDB.

---

### Phase 8 — Analytics, Hardening, Release (Wave 5)

**Objective:** PRM is release-ready with proven observability, recoverability, and governance.

**BACKEND tasks:**
- [ ] 8.1 Implement `prm.analytics.dashboard` — open cases, severity mix, action debt, verification backlog
- [ ] 8.2 Implement `prm.analytics.recurrenceTrends` — repeat issues after closure
- [ ] 8.3 Implement `prm.analytics.kpiSnapshot` — periodic KPI capture
- [ ] 8.4 Implement `prm_reporting_jobs` runner for scheduled analytics
- [ ] 8.5 Add PRMDB monitoring: connection health, migration state, storage growth
- [ ] 8.6 Document PRMDB backup/restore procedure
- [ ] 8.7 Test PRMDB restore from backup (prove it, not just create it)
- [ ] 8.8 Define data retention policy for PRMDB

**FRONTEND tasks:**
- [ ] 8.9 Wire full dashboard in `PRMDashboardPage.tsx` — charts, KPIs, quick actions
- [ ] 8.10 Wire analytics section in `PRMControlPanelPage.tsx` — recurrence, closure quality, method usage
- [ ] 8.11 Final polish: loading states, empty states, error states, mobile responsiveness

**LEAD tasks:**
- [ ] 8.12 Run governance checklist: boundary preservation, lifecycle correctness, evidence requirements
- [ ] 8.13 Verify all 10 enforcement rules are met
- [ ] 8.14 Write operational runbook for PRM + PRMDB support

**Exit gate:** PRM and PRMDB both pass release validation, governance sign-off, and operational readiness.

---

## Verification Anchors (per Phase)

Before starting each phase, LEAD verifies these repo anchors:

| Anchor | File | What to check |
|--------|------|---------------|
| Route registration | `client/src/App.tsx` | All `/prm/*` routes present |
| Main nav | `client/src/components/MainLayout.tsx` | PRM entry in hamburger menu |
| App router mount | `server/routers.ts` | `prm: prmRouter` mounted |
| Shell pattern | `PSShellPage.tsx` | Clone pattern for PRM shell |
| Sidebar pattern | `PMProjectSidebar.tsx` | Clone pattern for PRM sidebar |
| Dedicated DB pattern | `server/sandbox-wf/connection.ts` | Clone pattern for PRMDB connection |
| Table definition pattern | `drizzle/tables/wfdb.ts` | Clone pattern for PRMDB tables |
| Seed pattern | `server/sandbox-wf/seed.ts` | Clone pattern for PRMDB seed |
| Adapter pattern | `server/sandbox-wf/seed-orchestrator.ts` | How wfdb reads main DB through `getDb()` |

---

## Definition of Done

- [ ] PRM exists as a standalone top-level module with stable `/prm` route family
- [ ] `server/prm/` exists as an independent backend domain
- [ ] PRMDB exists as a dedicated PostgreSQL database with isolated migrations and seed
- [ ] Cases move from intake through verified closure with full history in PRMDB
- [ ] Methods, actions, evidence, verification, prevention, and learning surfaces all backed by PRMDB
- [ ] Cross-module integrations work through adapters, not cross-DB joins
- [ ] Analytics, governance checks, and operational runbooks cover both PRM and PRMDB
- [ ] No PRM-owned tables exist in `mynewap1claude` database
- [ ] Backup and restore of PRMDB proven independently
- [ ] All 10 enforcement rules pass

---

## Naming Conventions

```
Schema file:      drizzle/tables/prmdb.ts
Connection file:  server/prm/connection.ts
Router files:     server/prm/prm.router.ts
Service files:    server/prm/prm.service.ts
Repository:       server/prm/prm.repository.ts
Adapter files:    server/prm/adapters/{module}-adapter.ts
Page files:       client/src/pages/prm/PRM{Feature}Page.tsx
Component files:  client/src/components/prm/PRM{Feature}.tsx
```

---

## Risk Register

| Risk | Impact | Mitigation |
|------|--------|------------|
| Adapter calls add latency to case loads | Medium | Cache user/project lookups; batch resolve on list views |
| PRMDB migration out of sync with deploys | High | Gate every phase on migration validation; test rollback |
| Method workspace JSON schemas break over time | Medium | Version templates; keep old runs readable after changes |
| User deletion in main DB orphans PRMDB references | Low | Soft-ref by design; show "Unknown user" gracefully |
| PRMDB grows large (evidence metadata) | Low | Retention policy defined in Phase 8; binary files stay external |
| CI/CD needs second DB provisioning step | Medium | Add `createdb prmdb` to GitHub Actions workflow early (Phase 2) |
