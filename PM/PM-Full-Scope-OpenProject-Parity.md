# PM Add-On Module — Full Scope for OpenProject Feature Parity

## Standalone Plug & Play Module for MyNewAppClaude1

---

## 1. What This Document Is

The previous PM documents focused on architecture philosophy, guardrails, and cautious phasing.

This document is different. It is a **complete feature scope** based on one fact:

> **We are building a standalone, plug & play PM add-on module that delivers every OpenProject tool and feature to our users — with the same or better experience — inside MyNewAppClaude1.**

No features are "delayed indefinitely." Everything OpenProject offers is in scope. The only question is **build order**.

---

## 2. What We Already Have (Codebase Reality)

Before listing what to build, here is what exists and works today:

| Component | Status | Files |
|---|---|---|
| Module registry + per-workspace toggle | **Done** | `server/modules/registry.ts`, `workspace_modules` table |
| PMT schema (projects, tasks, dependencies) | **Done** | `server/modules/pmt/schema.ts` |
| PMT tRPC router (full CRUD, governance-gated) | **Done** | `server/modules/pmt/router.ts` |
| Projects list page | **Done** | `PMTProjectsPage.tsx` |
| Kanban board (5 columns, no DnD) | **Done** | `PMTKanbanPage.tsx` |
| Timeline view (sorted by due date) | **Done** | `PMTTimelinePage.tsx` |
| Project detail page | **Done** | `PMTProjectDetailPage.tsx` |
| WorkspaceShell with module sidebar | **Done** | `WorkspaceShell.tsx` |
| RBAC (capabilities, roles, overrides) | **Done** | `workspace-rbac.ts` |
| Governance (scorecards, freezes, evidence, drift) | **Done** | `governance.ts`, `enforcement.ts` |
| Human + AI assignee fields | **Done** | `pmt_tasks.assigneeType`, `confidenceScore` |
| Activity logging | **Done** | `workspace_activity_log` table |

**Current state: ~40% of a production PM module.** The skeleton is governance-aware and workspace-scoped. What's missing is feature depth.

---

## 3. Complete Feature Map: OpenProject vs MyNewAppClaude1 PM

Every OpenProject feature, mapped to our module. Nothing excluded.

### 3.1 Work Packages (Work Items)

| OpenProject Feature | Our Implementation | Status |
|---|---|---|
| Create / edit / delete work packages | `pmt_tasks` CRUD via tRPC | **Done** |
| Work package types (Task, Bug, Feature, Milestone, Phase, Epic) | Add `type` column + type registry | **To Build** |
| Custom fields (text, number, date, list, user) | `pm_custom_fields` + `pm_custom_values` tables | **To Build** |
| Status workflows (allowed transitions per type + role) | `pm_workflows` table (type → from_status → to_status) | **To Build** |
| Priority levels | Exists in schema (low/medium/high/critical) | **Done** |
| Assignee (single + accountable) | `assigneeId` exists; add `accountableId` | **Partial** |
| Start date + due date + duration | `dueDate` exists; add `startDate`, `duration` | **Partial** |
| Estimated time + remaining time | Add `estimatedHours`, `remainingHours` columns | **To Build** |
| % complete (progress) | Add `percentComplete` column | **To Build** |
| Relations (parent/child, blocks, follows, relates, duplicates) | `pmt_task_dependencies` exists with `blocks`; expand types | **Partial** |
| Watchers (follow a work item) | `pm_watchers` table | **To Build** |
| File attachments | `pm_attachments` table + file upload endpoint | **To Build** |
| Work package templates | `pm_work_item_templates` table | **To Build** |
| Bulk edit / bulk move / bulk delete | Batch mutation endpoints | **To Build** |
| Copy / duplicate work item | Duplicate mutation | **To Build** |
| Export (CSV, PDF, XLS) | Export endpoints with format param | **To Build** |
| Rich text description (markdown) | Already text field; add markdown renderer | **Partial** |

### 3.2 Views

| OpenProject Feature | Our Implementation | Status |
|---|---|---|
| Table view (work package list) | `PMTProjectsPage` shows project list; need task table | **Partial** |
| Kanban board | `PMTKanbanPage` (5 columns) | **Done** |
| Gantt chart | Upgrade `PMTTimelinePage` to real Gantt with bars + dependencies | **To Build** |
| Calendar view | New `PMTCalendarPage` (month/week grid) | **To Build** |
| Team planner (resource view) | New `PMTTeamPlannerPage` (rows = people, cols = time) | **To Build** |
| Saved views (filters, columns, grouping, sorting) | `pm_saved_views` table + UI | **To Build** |
| Baseline comparison (snapshot diff) | `pm_baselines` table (snapshot JSON + diff engine) | **To Build** |
| Split screen (list + detail) | Task detail drawer alongside list/board | **To Build** |

### 3.3 Projects

| OpenProject Feature | Our Implementation | Status |
|---|---|---|
| Create / edit / archive projects | `pmt_projects` CRUD | **Done** |
| Project templates | `pm_project_templates` table | **To Build** |
| Project hierarchy (sub-projects) | Add `parentProjectId` to `pmt_projects` | **To Build** |
| Project status / lifecycle phases | `status` column exists; add lifecycle enum | **Partial** |
| Project home page (widgets dashboard) | New `PMTProjectHomePage` with configurable widgets | **To Build** |
| Portfolio view (cross-project overview) | New `PMTPortfolioPage` (aggregate across projects) | **To Build** |
| Versions / releases | `pm_versions` table (name, start, due, status) | **To Build** |
| Roadmap view | Group work items by version/milestone | **To Build** |

### 3.4 Agile & Scrum

| OpenProject Feature | Our Implementation | Status |
|---|---|---|
| Agile boards (basic Kanban) | `PMTKanbanPage` | **Done** |
| Action boards (status, assignee, version, subproject) | Configurable board columns from any field | **To Build** |
| Product backlog | Filtered view: unassigned to sprint, ordered by priority | **To Build** |
| Sprint planning | `pm_sprints` table (name, start, end, velocity) | **To Build** |
| Sprint taskboard | Board filtered to sprint scope | **To Build** |
| Burndown chart | Reporting widget (story points remaining over time) | **To Build** |
| Velocity tracking | Reporting widget (points completed per sprint) | **To Build** |

### 3.5 Time & Cost Management

| OpenProject Feature | Our Implementation | Status |
|---|---|---|
| Time entries (log hours per work item) | `pm_time_entries` table | **To Build** |
| Time tracking widget (timer) | UI timer component + auto-log | **To Build** |
| Cost entries (unit costs per work item) | `pm_cost_entries` table | **To Build** |
| Budgets (planned vs actual) | `pm_budgets` table + variance calc | **To Build** |
| Cost reports (filterable, exportable) | Reporting page with cost aggregation | **To Build** |
| Activity types (billable, non-billable, etc.) | `pm_activity_types` config table | **To Build** |

### 3.6 Collaboration

| OpenProject Feature | Our Implementation | Status |
|---|---|---|
| Comments on work items (threaded) | `pm_comments` table | **To Build** |
| Activity stream (system + user events) | `workspace_activity_log` exists; add PM-specific events | **Partial** |
| Meetings (agenda + minutes + outcomes) | `pm_meetings` + `pm_meeting_items` tables | **To Build** |
| Wiki (pages, hierarchy, rich text) | Wiki system exists globally (`/wiki`); scope to workspace PM | **Partial** |
| Forums / discussions | `pm_discussions` + `pm_discussion_posts` tables | **To Build** |
| News / announcements | `pm_news` table | **To Build** |
| Notifications (in-app + email) | Notification triggers on PM events | **To Build** |
| @mentions in comments | Parse mentions, trigger notification | **To Build** |

### 3.7 File & Document Management

| OpenProject Feature | Our Implementation | Status |
|---|---|---|
| File attachments on work items | `pm_attachments` table + upload endpoint | **To Build** |
| Documents module (categorized files) | `pm_documents` table (title, description, category, file) | **To Build** |
| External storage (Nextcloud, OneDrive, S3) | Integration config + OAuth flow | **To Build (Later)** |

### 3.8 Configuration & Customization

| OpenProject Feature | Our Implementation | Status |
|---|---|---|
| Custom fields | `pm_custom_fields` (name, type, options) + `pm_custom_values` | **To Build** |
| Custom types (work item types) | `pm_types` registry table | **To Build** |
| Status definitions | `pm_statuses` table (name, color, is_closed, position) | **To Build** |
| Workflow configuration (type → status transitions) | `pm_workflows` table | **To Build** |
| Custom actions (buttons that set multiple fields) | `pm_custom_actions` table (conditions + changes) | **To Build** |
| Roles & permissions within PM | Reuse existing RBAC capabilities system | **Done** |
| Attribute help texts | `pm_field_help_texts` table | **To Build** |

### 3.9 Reporting & Analytics

| OpenProject Feature | Our Implementation | Status |
|---|---|---|
| Status distribution chart | Widget on project home / reporting page | **To Build** |
| Overdue items report | Filtered query | **To Build** |
| Workload distribution | Group by assignee, sum estimated hours | **To Build** |
| Burndown chart | Sprint-scoped time series | **To Build** |
| Velocity chart | Points per sprint | **To Build** |
| Cost reports | Filterable cost aggregation | **To Build** |
| Time reports | Filterable time aggregation | **To Build** |
| Export (CSV, PDF, XLS) | Multi-format export endpoints | **To Build** |

### 3.10 Integrations

| OpenProject Feature | Our Implementation | Status |
|---|---|---|
| GitHub integration (link PRs to work items) | `pm_git_references` table | **To Build** |
| GitLab integration | Same pattern as GitHub | **To Build** |
| Webhooks (outgoing on PM events) | Extend existing webhook system | **To Build** |
| REST API | tRPC already provides typed API | **Done** |
| Calendar sync (iCal export) | iCal generation endpoint | **To Build** |
| Email notifications | Trigger emails on PM events | **To Build** |

### 3.11 Our Exclusive Advantages (OpenProject Does NOT Have These)

| Feature | Description |
|---|---|
| **AI Agent assignees** | Work items can be assigned to AI agents, not just humans |
| **Agent capability tokens** | Agent writes require validated capability tokens |
| **Agent Plan / Agent Output** | Work items carry agent-generated plans and outputs |
| **Governance Center integration** | Every PM mutation is governance-gated (freeze, evidence, scorecard) |
| **Evidence-linked audit trail** | All PM actions produce cryptographically-linked evidence bundles |
| **Drift detection on PM state** | Governance detects unexpected PM state changes |
| **Cross-module governance** | Same freeze/unfreeze applies to PM, Agents, LLMs consistently |
| **AI confidence scoring** | Tasks show agent confidence level (0-100) |
| **Workspace Apps framework** | PM is one of many plug & play apps, not a separate product |

---

## 4. Database Schema (Complete)

### Core Tables

```
pm_work_items          — Central work item table (tasks, bugs, stories, etc.)
pm_projects            — Projects within a workspace
pm_comments            — Threaded comments on work items
pm_relations           — Work item relationships (blocks, parent, follows, etc.)
pm_saved_views         — User-saved view configurations
pm_attachments         — File attachments on work items
pm_watchers            — Users watching a work item
```

### Configuration Tables

```
pm_types               — Work item type definitions (Task, Bug, Epic, etc.)
pm_statuses            — Status definitions (name, color, is_closed, position)
pm_workflows           — Allowed status transitions per type + role
pm_custom_fields       — Custom field definitions
pm_custom_values       — Custom field values per work item
pm_custom_actions      — Automated field-setting buttons
pm_field_help_texts    — Help text for fields
```

### Planning Tables

```
pm_versions            — Versions / releases / milestones
pm_sprints             — Scrum sprints (name, start, end, velocity)
pm_baselines           — Snapshot baselines for comparison
pm_project_templates   — Reusable project blueprints
pm_work_item_templates — Reusable work item blueprints
```

### Time & Cost Tables

```
pm_time_entries        — Time logged per work item
pm_cost_entries        — Cost entries per work item
pm_budgets             — Budget definitions (planned labor + units)
pm_activity_types      — Activity categories (billable, non-billable)
```

### Collaboration Tables

```
pm_meetings            — Meeting records (date, location, agenda)
pm_meeting_items       — Agenda/minutes items per meeting
pm_discussions         — Forum-style discussion threads
pm_discussion_posts    — Posts within discussions
pm_news                — Project news / announcements
pm_notifications       — PM-specific notification queue
```

### Integration Tables

```
pm_git_references      — Links to GitHub/GitLab PRs, commits, branches
pm_webhooks            — PM-specific outgoing webhook configs
```

**Every table has `workspace_id` as a mandatory, indexed column.**

---

## 5. UI Pages (Complete)

### Project Level

```
PMTProjectsPage        — Project list with CRUD                    (exists)
PMTProjectHomePage     — Project dashboard with widgets             (to build)
PMTProjectSettingsPage — Project config (types, statuses, workflows)(to build)
PMTPortfolioPage       — Cross-project portfolio overview           (to build)
```

### Work Item Views

```
PMTTablePage           — Filterable, sortable work item table       (to build)
PMTKanbanPage          — Kanban board with DnD                      (exists, needs DnD)
PMTGanttPage           — Interactive Gantt chart with dependencies   (to build)
PMTCalendarPage        — Month/week calendar view                    (to build)
PMTTeamPlannerPage     — Resource allocation view                    (to build)
PMTBacklogPage         — Product backlog + sprint planning           (to build)
```

### Detail & Collaboration

```
PMTTaskDetailDrawer    — Full work item detail (split screen)        (to build)
PMTMeetingsPage        — Meetings list + create                      (to build)
PMTMeetingDetailPage   — Agenda, minutes, outcomes                   (to build)
PMTWikiPage            — Project-scoped wiki                         (to build)
PMTDiscussionsPage     — Forum threads                               (to build)
PMTNewsPage            — Project announcements                       (to build)
```

### Reporting

```
PMTReportingPage       — Dashboards: status, workload, burndown      (to build)
PMTTimeReportPage      — Time entry reports with filters              (to build)
PMTCostReportPage      — Cost reports with filters                    (to build)
```

### Configuration

```
PMTTypesConfigPage     — Manage work item types                      (to build)
PMTStatusConfigPage    — Manage statuses + colors                    (to build)
PMTWorkflowConfigPage  — Status transition rules                     (to build)
PMTCustomFieldsPage    — Manage custom fields                        (to build)
```

---

## 6. Build Phases (Everything In Scope, Ordered by User Impact)

### Phase 1 — Core Usability (Make It Work)

**Goal:** Users can manage real projects end-to-end.

1. Comments + activity stream on work items
2. Task detail drawer (split screen with tabs)
3. Kanban drag-and-drop
4. Work item types (Task, Bug, Story, Epic, Milestone)
5. Table view (filterable, sortable work item list)
6. Rich text descriptions (markdown rendering)
7. File attachments on work items
8. Watchers + @mentions + basic notifications

### Phase 2 — Views & Planning (Make It Powerful)

**Goal:** Multiple ways to see and plan work.

1. Saved views engine (filters, columns, grouping, sorting)
2. Gantt chart (interactive bars, dependency arrows, date dragging)
3. Calendar view
4. Status definitions + workflow configuration (transition rules)
5. Custom fields (text, number, date, list, user)
6. Versions / releases + roadmap view
7. Project hierarchy (sub-projects)
8. Baseline snapshots + comparison

### Phase 3 — Agile & Collaboration (Make It a Team Tool)

**Goal:** Full Scrum/Kanban + team collaboration.

1. Sprints (create, plan, close)
2. Backlog management + sprint planning
3. Burndown + velocity charts
4. Team planner (resource allocation view)
5. Action boards (group by any field)
6. Meetings (agenda, minutes, outcomes)
7. Wiki (project-scoped)
8. Forums / discussions
9. News / announcements

### Phase 4 — Time, Cost & Reporting (Make It Enterprise)

**Goal:** Full financial tracking + reporting.

1. Time entries (log hours, timer widget)
2. Cost entries
3. Budgets (planned vs actual)
4. Activity types (billable/non-billable)
5. Time reports + cost reports (filterable, exportable)
6. Export (CSV, PDF, XLS) for work items + reports
7. Portfolio view (cross-project executive dashboard)
8. Workload reports

### Phase 5 — Integrations & Advanced (Make It Connected)

**Goal:** External tool connections + power features.

1. GitHub integration (link PRs/commits to work items)
2. GitLab integration
3. Webhooks (outgoing on PM events)
4. Calendar sync (iCal export)
5. Email notifications
6. Custom actions (automated multi-field updates)
7. Project templates
8. Work item templates
9. Bulk operations (edit, move, delete)
10. External storage integrations (S3, Nextcloud)

### Phase 6 — AI Advantage (Make It Better Than OpenProject)

**Goal:** Features OpenProject cannot offer.

1. Agent assignment UX (selector, capability token display)
2. Agent Plan / Agent Output sections on work items
3. AI-generated task suggestions (from project description)
4. AI-powered status reports (summarize sprint progress)
5. AI triage (auto-classify type + priority from description)
6. Governance mode indicators (OK / Warn / Frozen) on all PM pages
7. Evidence-linked audit for every PM mutation
8. AI workload balancing suggestions

---

## 7. What Makes Our PM Module Better Than OpenProject

| Dimension | OpenProject | MyNewAppClaude1 PM |
|---|---|---|
| **Architecture** | Rails monolith, tightly coupled | Plug & play module, hot-swappable |
| **AI Participants** | None | First-class agent assignees with capability tokens |
| **Governance** | Basic roles + permissions | Full governance engine (freeze, evidence, drift, scorecard) |
| **Multi-tool Platform** | PM is the whole product | PM is one app alongside Agents, LLMs, Knowledge, Automation |
| **Audit Trail** | Activity log | Cryptographic evidence bundles + drift detection |
| **Deployment** | Separate server required | Activates inside existing workspace with one toggle |
| **Permission Model** | Own role system | Unified capability model shared with all platform modules |
| **AI Assistance** | None | Task suggestions, auto-triage, AI status reports, workload balancing |
| **Modern Stack** | Ruby/Rails + Angular | TypeScript end-to-end (React + Node + tRPC + Drizzle) |

---

## 8. Non-Negotiable Rules

These apply across all phases:

1. **Every table has `workspace_id`** — no exceptions
2. **Every mutation uses `governedProcedure`** — no bypasses
3. **No PM-specific role engine** — use existing capabilities
4. **No cross-module direct DB access** — contracts only
5. **UI uses existing component library** (shadcn/ui, Radix) — no foreign design
6. **Module is toggleable** — workspace works fine without PM enabled
7. **All features work for both human and AI assignees**

---

## 9. Summary

**Previous documents said:** "Don't clone OpenProject. Keep scope narrow. Delay Gantt, costs, meetings."

**This document says:** Build all of it. Every feature OpenProject has, plus AI capabilities they can never have. The difference is **build order, not build scope.**

Phase 1-2 delivers a usable PM tool. Phase 3-4 reaches OpenProject parity. Phase 5-6 surpasses it.

The module stays plug & play. The architecture stays clean. The governance stays non-bypassable. But the feature set is complete.
