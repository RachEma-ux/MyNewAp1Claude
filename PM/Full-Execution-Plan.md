# PM Module — Full Execution Plan

## OpenProject Parity + AI Advantage

Every task. Every file. Every table. Ordered by user impact.

---

## Current State (Starting Point)

**Exists and works:**

```
server/modules/pmt/schema.ts        → pmt_projects, pmt_tasks, pmt_task_dependencies
server/modules/pmt/router.ts        → Full CRUD (projects, tasks, dependencies) — governance-gated
server/modules/registry.ts           → requireModule(), seedWorkspaceModules(), setModuleEnabled()
server/modules/router.ts             → modulesRouter composing pmtRouter
drizzle/tables/workspace-modules.ts  → workspace_modules table, MODULE_KEYS includes "pmt"
drizzle/tables/workspace-rbac.ts     → capabilities, workspace_roles, role_capabilities, principal_capabilities
drizzle/tables/governance.ts         → governance_scorecards
drizzle/tables/enforcement.ts        → subject_freezes, drift_events, evidence_bundles

client/src/pages/workspace/PMTProjectsPage.tsx      → Project list with create/delete
client/src/pages/workspace/PMTKanbanPage.tsx         → 5-column kanban (no drag-and-drop)
client/src/pages/workspace/PMTTimelinePage.tsx       → Timeline sorted by due date
client/src/pages/workspace/PMTProjectDetailPage.tsx  → Project detail view
client/src/pages/WorkspaceShell.tsx                  → IBM-style shell with module sidebar
client/src/components/workspace/WorkspaceSidebar.tsx → Module navigation
```

**pmt_tasks columns that already exist:** `id`, `workspaceId`, `projectId`, `title`, `description`, `status`, `priority`, `assigneeId`, `assigneeType` (human|ai), `riskLevel`, `confidenceScore`, `governanceStage`, `dueDate`, `completedAt`, `metadata`, `createdAt`, `updatedAt`

---

## PHASE 1 — Core Usability (Make It Work)

**Goal:** Users can manage real projects end-to-end with comments, detail views, and drag-and-drop.

---

### 1.1 Extend Work Item Schema

**File:** `server/modules/pmt/schema.ts`

Add columns to `pmt_tasks`:

- [ ] `type` VARCHAR(30) DEFAULT `'task'` — task, bug, story, epic, milestone, feature, decision, risk, approval
- [ ] `startDate` TIMESTAMP — project scheduling
- [ ] `estimatedHours` INTEGER — time estimation
- [ ] `remainingHours` INTEGER — remaining effort
- [ ] `percentComplete` INTEGER DEFAULT 0 — progress tracking
- [ ] `accountableId` INTEGER REFERENCES users(id) — accountable person
- [ ] `parentId` INTEGER REFERENCES pmt_tasks(id) — hierarchy
- [ ] `storyPoints` INTEGER — agile estimation
- [ ] `labels` JSON — tag array
- [ ] `position` INTEGER — ordering within status column

Add columns to `pmt_projects`:

- [ ] `parentProjectId` INTEGER REFERENCES pmt_projects(id) — sub-project hierarchy
- [ ] `lifecycle` VARCHAR(30) DEFAULT `'active'` — initiation, planning, executing, closing, archived

Add index on `pmt_tasks.type`
Add index on `pmt_tasks.parentId`
Add index on `pmt_tasks.assigneeId`

---

### 1.2 Comments Table

**New file:** `server/modules/pmt/comments-schema.ts`

```
pm_comments
  id             SERIAL PRIMARY KEY
  workspaceId    INTEGER NOT NULL REFERENCES workspaces(id)
  workItemId     INTEGER NOT NULL REFERENCES pmt_tasks(id)
  parentId       INTEGER REFERENCES pm_comments(id)     — threading
  authorId       INTEGER REFERENCES users(id)
  authorType     VARCHAR(20) DEFAULT 'human'             — human | ai | system
  content        TEXT NOT NULL
  mentions       JSON                                    — [@user_id, ...]
  metadata       JSON
  createdAt      TIMESTAMP DEFAULT NOW()
  updatedAt      TIMESTAMP DEFAULT NOW()
```

Indexes: `workItemId`, `workspaceId`, `parentId`

---

### 1.3 Attachments Table

**New file:** `server/modules/pmt/attachments-schema.ts`

```
pm_attachments
  id             SERIAL PRIMARY KEY
  workspaceId    INTEGER NOT NULL REFERENCES workspaces(id)
  workItemId     INTEGER NOT NULL REFERENCES pmt_tasks(id)
  fileName       VARCHAR(500) NOT NULL
  fileSize       INTEGER NOT NULL
  mimeType       VARCHAR(100)
  storagePath    TEXT NOT NULL
  uploadedBy     INTEGER REFERENCES users(id)
  createdAt      TIMESTAMP DEFAULT NOW()
```

Index: `workItemId`, `workspaceId`

---

### 1.4 Watchers Table

**New file:** `server/modules/pmt/watchers-schema.ts`

```
pm_watchers
  id             SERIAL PRIMARY KEY
  workspaceId    INTEGER NOT NULL REFERENCES workspaces(id)
  workItemId     INTEGER NOT NULL REFERENCES pmt_tasks(id)
  userId         INTEGER NOT NULL REFERENCES users(id)
  createdAt      TIMESTAMP DEFAULT NOW()
```

Unique constraint: (`workItemId`, `userId`)

---

### 1.5 Comments Router

**New file:** `server/modules/pmt/comments-router.ts`

- [ ] `modules.pmt.comments.list` — query by workItemId (protectedProcedure)
- [ ] `modules.pmt.comments.create` — create comment (governedProcedure)
- [ ] `modules.pmt.comments.update` — edit own comment (governedProcedure)
- [ ] `modules.pmt.comments.delete` — delete own comment (governedProcedure)
- [ ] Parse `@mentions` from content, store in `mentions` JSON
- [ ] Emit activity via `logActivity()` on create

**Modify:** `server/modules/pmt/router.ts` — add `comments: commentsRouter`

---

### 1.6 Attachments Router

**New file:** `server/modules/pmt/attachments-router.ts`

- [ ] `modules.pmt.attachments.list` — query by workItemId
- [ ] `modules.pmt.attachments.upload` — file upload mutation
- [ ] `modules.pmt.attachments.delete` — remove attachment
- [ ] File upload endpoint at `/api/pm/upload`

---

### 1.7 Watchers Router

**New file:** `server/modules/pmt/watchers-router.ts`

- [ ] `modules.pmt.watchers.list` — who watches this item
- [ ] `modules.pmt.watchers.add` — start watching
- [ ] `modules.pmt.watchers.remove` — stop watching

---

### 1.8 Extend Tasks Router

**Modify:** `server/modules/pmt/router.ts`

- [ ] Add `type` filter to `tasks.list` input
- [ ] Add `parentId` filter to `tasks.list` input
- [ ] Add `assigneeId` filter to `tasks.list` input
- [ ] Support `startDate`, `estimatedHours`, `remainingHours`, `percentComplete`, `storyPoints`, `labels`, `parentId`, `accountableId` in create/update
- [ ] Add `tasks.duplicate` mutation — copy work item with new ID
- [ ] Add `tasks.bulkUpdate` mutation — update multiple items at once
- [ ] Add `tasks.bulkDelete` mutation — delete multiple items
- [ ] Add `tasks.move` mutation — move to different project
- [ ] Pagination: add `limit`, `offset`, `cursor` to list query

---

### 1.9 Notifications Service

**New file:** `server/modules/pmt/notifications.ts`

- [ ] `notifyWatchers(workItemId, event, actor)` — notify all watchers
- [ ] `notifyAssignee(workItemId, event, actor)` — notify assignee
- [ ] `notifyMentioned(userIds, workItemId, comment)` — notify @mentioned users
- [ ] Trigger on: create, status change, comment, assignee change
- [ ] Store in `pm_notifications` table or reuse platform notification system

---

### 1.10 Task Detail Drawer (Frontend)

**New file:** `client/src/pages/workspace/PMTTaskDetailDrawer.tsx`

- [ ] Split-screen drawer (list/board left, detail right)
- [ ] Header: type badge, title (editable inline), status pill
- [ ] Fields: assignee, priority, due date, start date, estimated hours, % complete, labels
- [ ] Tabs: Details | Comments | Attachments | Dependencies | Activity
- [ ] Comments tab: threaded comment list + compose box with @mention autocomplete
- [ ] Attachments tab: file list + upload button
- [ ] Dependencies tab: list blocked-by and blocks items + add/remove
- [ ] Activity tab: timeline of all events from `workspace_activity_log`
- [ ] Governance banner: show OK/Warn/Frozen state, disable edits when frozen

---

### 1.11 Table View Page

**New file:** `client/src/pages/workspace/PMTTablePage.tsx`

- [ ] Full work item table (all columns configurable)
- [ ] Column headers: click to sort
- [ ] Filter bar: status, type, priority, assignee, due date range
- [ ] Row click opens task detail drawer
- [ ] Inline editing for status, priority, assignee
- [ ] Bulk select + bulk action bar (change status, assign, delete)

---

### 1.12 Kanban Drag-and-Drop

**Modify:** `client/src/pages/workspace/PMTKanbanPage.tsx`

- [ ] Add `@dnd-kit/core` + `@dnd-kit/sortable`
- [ ] Drag card between status columns
- [ ] Drop triggers `tasks.update` mutation with new status
- [ ] Optimistic UI update (move card immediately, rollback on error)
- [ ] Disable drag when governance state = Frozen
- [ ] Show type badge + priority indicator on each card
- [ ] Click card opens task detail drawer

---

### 1.13 Rich Text

- [ ] Render `description` as markdown in detail drawer (use `react-markdown` or existing markdown component)
- [ ] Markdown toolbar in description edit mode

---

### Phase 1 Done When:

- [ ] Work items have types, comments, attachments, watchers
- [ ] Task detail drawer shows full info with tabbed sections
- [ ] Kanban supports drag-and-drop with governance respect
- [ ] Table view works with filters, sort, inline edit
- [ ] @mentions trigger notifications
- [ ] Rich text rendering works in descriptions and comments
- [ ] Frozen workspaces block all writes with banner

---

## PHASE 2 — Views & Planning (Make It Powerful)

---

### 2.1 Status Definitions Table

**New file:** `server/modules/pmt/config-schema.ts`

```
pm_statuses
  id             SERIAL PRIMARY KEY
  workspaceId    INTEGER NOT NULL REFERENCES workspaces(id)
  name           VARCHAR(100) NOT NULL
  color          VARCHAR(7) NOT NULL             — hex color
  isClosed       BOOLEAN DEFAULT false
  isDefault      BOOLEAN DEFAULT false
  position       INTEGER NOT NULL                — display order
  createdAt      TIMESTAMP DEFAULT NOW()
```

```
pm_types
  id             SERIAL PRIMARY KEY
  workspaceId    INTEGER NOT NULL REFERENCES workspaces(id)
  name           VARCHAR(100) NOT NULL
  color          VARCHAR(7)
  icon           VARCHAR(50)                     — lucide icon name
  isDefault      BOOLEAN DEFAULT false
  isMilestone    BOOLEAN DEFAULT false
  position       INTEGER NOT NULL
  createdAt      TIMESTAMP DEFAULT NOW()
```

```
pm_workflows
  id             SERIAL PRIMARY KEY
  workspaceId    INTEGER NOT NULL REFERENCES workspaces(id)
  typeId         INTEGER NOT NULL REFERENCES pm_types(id)
  fromStatusId   INTEGER NOT NULL REFERENCES pm_statuses(id)
  toStatusId     INTEGER NOT NULL REFERENCES pm_statuses(id)
  roleId         INTEGER REFERENCES workspace_roles(id)      — NULL = all roles
```

Unique constraint on workflows: (`workspaceId`, `typeId`, `fromStatusId`, `toStatusId`, `roleId`)

---

### 2.2 Custom Fields

**New file:** `server/modules/pmt/custom-fields-schema.ts`

```
pm_custom_fields
  id             SERIAL PRIMARY KEY
  workspaceId    INTEGER NOT NULL REFERENCES workspaces(id)
  name           VARCHAR(255) NOT NULL
  fieldType      VARCHAR(30) NOT NULL            — text, number, date, list, user, bool
  options        JSON                            — for list type: ["opt1","opt2"]
  required       BOOLEAN DEFAULT false
  position       INTEGER NOT NULL
  helpText       TEXT
  createdAt      TIMESTAMP DEFAULT NOW()
```

```
pm_custom_values
  id             SERIAL PRIMARY KEY
  workspaceId    INTEGER NOT NULL REFERENCES workspaces(id)
  workItemId     INTEGER NOT NULL REFERENCES pmt_tasks(id)
  fieldId        INTEGER NOT NULL REFERENCES pm_custom_fields(id)
  value          TEXT                             — serialized value
```

Unique constraint: (`workItemId`, `fieldId`)

---

### 2.3 Saved Views

**New file:** `server/modules/pmt/views-schema.ts`

```
pm_saved_views
  id             SERIAL PRIMARY KEY
  workspaceId    INTEGER NOT NULL REFERENCES workspaces(id)
  projectId      INTEGER REFERENCES pmt_projects(id)
  name           VARCHAR(255) NOT NULL
  viewType       VARCHAR(20) NOT NULL            — table, kanban, gantt, calendar, timeline
  config         JSON NOT NULL                   — filters, columns, groupBy, sortBy, wipLimits
  isDefault      BOOLEAN DEFAULT false
  isPublic       BOOLEAN DEFAULT true            — visible to all workspace members
  ownerId        INTEGER REFERENCES users(id)
  createdAt      TIMESTAMP DEFAULT NOW()
  updatedAt      TIMESTAMP DEFAULT NOW()
```

---

### 2.4 Versions / Releases

**New file:** `server/modules/pmt/versions-schema.ts`

```
pm_versions
  id             SERIAL PRIMARY KEY
  workspaceId    INTEGER NOT NULL REFERENCES workspaces(id)
  projectId      INTEGER NOT NULL REFERENCES pmt_projects(id)
  name           VARCHAR(255) NOT NULL
  description    TEXT
  status         VARCHAR(30) DEFAULT 'open'      — open, locked, closed
  startDate      TIMESTAMP
  dueDate        TIMESTAMP
  createdAt      TIMESTAMP DEFAULT NOW()
```

---

### 2.5 Baselines

**New file:** `server/modules/pmt/baselines-schema.ts`

```
pm_baselines
  id             SERIAL PRIMARY KEY
  workspaceId    INTEGER NOT NULL REFERENCES workspaces(id)
  projectId      INTEGER NOT NULL REFERENCES pmt_projects(id)
  name           VARCHAR(255) NOT NULL
  snapshot       JSON NOT NULL                   — full work item state at capture time
  createdBy      INTEGER REFERENCES users(id)
  createdAt      TIMESTAMP DEFAULT NOW()
```

---

### 2.6 Config, Views, Versions Routers

**New files:**

- [ ] `server/modules/pmt/config-router.ts` — CRUD for statuses, types, workflows
- [ ] `server/modules/pmt/views-router.ts` — CRUD for saved views
- [ ] `server/modules/pmt/versions-router.ts` — CRUD for versions + roadmap query
- [ ] `server/modules/pmt/baselines-router.ts` — create snapshot, list, compare
- [ ] `server/modules/pmt/custom-fields-router.ts` — CRUD for custom fields + values

**Modify:** `server/modules/pmt/router.ts` — compose all sub-routers

---

### 2.7 Gantt Chart Page

**New file:** `client/src/pages/workspace/PMTGanttPage.tsx`

- [ ] Horizontal timeline with task bars (startDate → dueDate)
- [ ] Dependency arrows between linked tasks
- [ ] Drag to resize (change dates)
- [ ] Drag to move (shift dates)
- [ ] Group by: project, assignee, type, version
- [ ] Zoom levels: day, week, month, quarter
- [ ] Library options: `frappe-gantt`, `dhtmlx-gantt`, or custom SVG

---

### 2.8 Calendar View

**New file:** `client/src/pages/workspace/PMTCalendarPage.tsx`

- [ ] Month view (grid with work items on due dates)
- [ ] Week view (more detail)
- [ ] Click date to create work item
- [ ] Drag work item to change due date
- [ ] Color by type or priority

---

### 2.9 Configuration Pages

**New files:**

- [ ] `client/src/pages/workspace/PMTTypesConfigPage.tsx` — manage work item types
- [ ] `client/src/pages/workspace/PMTStatusConfigPage.tsx` — manage statuses + colors
- [ ] `client/src/pages/workspace/PMTWorkflowConfigPage.tsx` — configure allowed transitions
- [ ] `client/src/pages/workspace/PMTCustomFieldsPage.tsx` — manage custom fields
- [ ] `client/src/pages/workspace/PMTProjectSettingsPage.tsx` — project-level settings

---

### 2.10 Roadmap View

**New file:** `client/src/pages/workspace/PMTRoadmapPage.tsx`

- [ ] Group work items by version/release
- [ ] Show version progress bar (% items closed)
- [ ] Version header with dates + status

---

### Phase 2 Done When:

- [ ] Custom statuses with colors and workflow transitions work
- [ ] Custom fields render on work items and are filterable
- [ ] Saved views persist and load per workspace
- [ ] Gantt chart renders with dependency arrows and drag support
- [ ] Calendar view shows work items on dates
- [ ] Versions/releases exist with roadmap view
- [ ] Sub-projects work via parentProjectId
- [ ] Baselines can be captured and compared

---

## PHASE 3 — Agile & Collaboration (Make It a Team Tool)

---

### 3.1 Sprints Table

**New file:** `server/modules/pmt/sprints-schema.ts`

```
pm_sprints
  id             SERIAL PRIMARY KEY
  workspaceId    INTEGER NOT NULL REFERENCES workspaces(id)
  projectId      INTEGER NOT NULL REFERENCES pmt_projects(id)
  name           VARCHAR(255) NOT NULL
  goal           TEXT
  status         VARCHAR(20) DEFAULT 'planning'  — planning, active, closed
  startDate      TIMESTAMP NOT NULL
  endDate        TIMESTAMP NOT NULL
  velocity       INTEGER                         — computed on close
  createdAt      TIMESTAMP DEFAULT NOW()
```

Add to `pmt_tasks`: `sprintId` INTEGER REFERENCES pm_sprints(id)

---

### 3.2 Collaboration Tables

**New file:** `server/modules/pmt/collaboration-schema.ts`

```
pm_meetings
  id             SERIAL PRIMARY KEY
  workspaceId    INTEGER NOT NULL REFERENCES workspaces(id)
  projectId      INTEGER REFERENCES pmt_projects(id)
  title          VARCHAR(500) NOT NULL
  location       VARCHAR(500)
  startTime      TIMESTAMP NOT NULL
  endTime        TIMESTAMP
  createdBy      INTEGER REFERENCES users(id)
  createdAt      TIMESTAMP DEFAULT NOW()

pm_meeting_items
  id             SERIAL PRIMARY KEY
  meetingId      INTEGER NOT NULL REFERENCES pm_meetings(id)
  itemType       VARCHAR(20) NOT NULL             — agenda, minutes, action, decision
  content        TEXT NOT NULL
  assigneeId     INTEGER REFERENCES users(id)
  position       INTEGER NOT NULL
  done           BOOLEAN DEFAULT false

pm_discussions
  id             SERIAL PRIMARY KEY
  workspaceId    INTEGER NOT NULL REFERENCES workspaces(id)
  projectId      INTEGER REFERENCES pmt_projects(id)
  title          VARCHAR(500) NOT NULL
  pinned         BOOLEAN DEFAULT false
  locked         BOOLEAN DEFAULT false
  createdBy      INTEGER REFERENCES users(id)
  createdAt      TIMESTAMP DEFAULT NOW()

pm_discussion_posts
  id             SERIAL PRIMARY KEY
  discussionId   INTEGER NOT NULL REFERENCES pm_discussions(id)
  authorId       INTEGER REFERENCES users(id)
  content        TEXT NOT NULL
  createdAt      TIMESTAMP DEFAULT NOW()
  updatedAt      TIMESTAMP DEFAULT NOW()

pm_news
  id             SERIAL PRIMARY KEY
  workspaceId    INTEGER NOT NULL REFERENCES workspaces(id)
  projectId      INTEGER REFERENCES pmt_projects(id)
  title          VARCHAR(500) NOT NULL
  summary        TEXT
  content        TEXT
  authorId       INTEGER REFERENCES users(id)
  createdAt      TIMESTAMP DEFAULT NOW()
```

---

### 3.3 Sprint Router

**New file:** `server/modules/pmt/sprints-router.ts`

- [ ] `sprints.list` — list by project
- [ ] `sprints.create` — create sprint
- [ ] `sprints.update` — edit sprint
- [ ] `sprints.start` — activate sprint
- [ ] `sprints.close` — close sprint, compute velocity
- [ ] `sprints.addItems` — assign work items to sprint
- [ ] `sprints.removeItems` — remove work items from sprint
- [ ] `sprints.burndown` — query: story points remaining per day

---

### 3.4 Collaboration Routers

**New files:**

- [ ] `server/modules/pmt/meetings-router.ts` — CRUD for meetings + items
- [ ] `server/modules/pmt/discussions-router.ts` — CRUD for discussions + posts
- [ ] `server/modules/pmt/news-router.ts` — CRUD for news

---

### 3.5 Agile & Collaboration UI Pages

**New files:**

- [ ] `client/src/pages/workspace/PMTBacklogPage.tsx` — backlog list + sprint planning (drag items into sprint)
- [ ] `client/src/pages/workspace/PMTSprintBoardPage.tsx` — kanban filtered to active sprint
- [ ] `client/src/pages/workspace/PMTTeamPlannerPage.tsx` — rows = assignees, columns = days/weeks, cells = assigned items
- [ ] `client/src/pages/workspace/PMTMeetingsPage.tsx` — meetings list + create
- [ ] `client/src/pages/workspace/PMTMeetingDetailPage.tsx` — agenda, minutes, action items
- [ ] `client/src/pages/workspace/PMTDiscussionsPage.tsx` — forum thread list
- [ ] `client/src/pages/workspace/PMTDiscussionDetailPage.tsx` — posts within discussion
- [ ] `client/src/pages/workspace/PMTNewsPage.tsx` — project news list
- [ ] `client/src/pages/workspace/PMTBurndownChart.tsx` — sprint burndown widget
- [ ] `client/src/pages/workspace/PMTVelocityChart.tsx` — velocity across sprints

---

### 3.6 Action Boards

**Modify:** `client/src/pages/workspace/PMTKanbanPage.tsx`

- [ ] Board mode selector: group by `status` (default), `assignee`, `priority`, `type`, `version`, `sprint`
- [ ] Dynamic column generation from selected field values

---

### 3.7 Wiki (Project-Scoped)

**New file:** `client/src/pages/workspace/PMTWikiPage.tsx`

- [ ] Reuse existing wiki infrastructure (`/wiki`) scoped to workspace + project
- [ ] Wiki pages table already exists; add `projectId` filter

---

### Phase 3 Done When:

- [ ] Sprints can be created, planned, started, and closed
- [ ] Backlog page shows unplanned items with drag into sprint
- [ ] Sprint board filters kanban to active sprint items
- [ ] Burndown chart tracks story points over sprint duration
- [ ] Velocity chart shows points completed across sprints
- [ ] Team planner shows resource allocation grid
- [ ] Meetings with agenda, minutes, and action items work
- [ ] Discussions (forums) with threaded posts work
- [ ] News announcements can be created per project
- [ ] Boards can group by any field (not just status)

---

## PHASE 4 — Time, Cost & Reporting (Make It Enterprise)

---

### 4.1 Time & Cost Tables

**New file:** `server/modules/pmt/time-cost-schema.ts`

```
pm_activity_types
  id             SERIAL PRIMARY KEY
  workspaceId    INTEGER NOT NULL REFERENCES workspaces(id)
  name           VARCHAR(100) NOT NULL
  billable       BOOLEAN DEFAULT true
  position       INTEGER NOT NULL

pm_time_entries
  id             SERIAL PRIMARY KEY
  workspaceId    INTEGER NOT NULL REFERENCES workspaces(id)
  workItemId     INTEGER REFERENCES pmt_tasks(id)
  projectId      INTEGER NOT NULL REFERENCES pmt_projects(id)
  userId         INTEGER NOT NULL REFERENCES users(id)
  activityTypeId INTEGER REFERENCES pm_activity_types(id)
  hours          REAL NOT NULL
  comment        TEXT
  spentOn        TIMESTAMP NOT NULL              — date the work was done
  createdAt      TIMESTAMP DEFAULT NOW()
  updatedAt      TIMESTAMP DEFAULT NOW()

pm_cost_entries
  id             SERIAL PRIMARY KEY
  workspaceId    INTEGER NOT NULL REFERENCES workspaces(id)
  workItemId     INTEGER REFERENCES pmt_tasks(id)
  projectId      INTEGER NOT NULL REFERENCES pmt_projects(id)
  userId         INTEGER NOT NULL REFERENCES users(id)
  units          REAL NOT NULL
  unitCost       REAL NOT NULL
  comment        TEXT
  spentOn        TIMESTAMP NOT NULL
  createdAt      TIMESTAMP DEFAULT NOW()

pm_budgets
  id             SERIAL PRIMARY KEY
  workspaceId    INTEGER NOT NULL REFERENCES workspaces(id)
  projectId      INTEGER NOT NULL REFERENCES pmt_projects(id)
  name           VARCHAR(255) NOT NULL
  description    TEXT
  plannedLabor   REAL DEFAULT 0                  — planned labor cost
  plannedUnits   REAL DEFAULT 0                  — planned unit cost
  createdAt      TIMESTAMP DEFAULT NOW()
  updatedAt      TIMESTAMP DEFAULT NOW()
```

---

### 4.2 Time & Cost Routers

**New files:**

- [ ] `server/modules/pmt/time-entries-router.ts` — CRUD + report queries
- [ ] `server/modules/pmt/cost-entries-router.ts` — CRUD + report queries
- [ ] `server/modules/pmt/budgets-router.ts` — CRUD + variance calculation
- [ ] `server/modules/pmt/activity-types-router.ts` — CRUD for activity types

---

### 4.3 Export Engine

**New file:** `server/modules/pmt/export.ts`

- [ ] `exportWorkItems(format, filters)` — CSV, JSON
- [ ] `exportTimeReport(format, filters)` — CSV, JSON
- [ ] `exportCostReport(format, filters)` — CSV, JSON
- [ ] PDF export using existing PDF generation infrastructure
- [ ] XLS export using `xlsx` or `exceljs` library

---

### 4.4 Reporting & Enterprise UI Pages

**New files:**

- [ ] `client/src/pages/workspace/PMTReportingPage.tsx` — dashboard with widgets: status distribution, overdue, workload, assignee breakdown
- [ ] `client/src/pages/workspace/PMTTimeReportPage.tsx` — filterable time entries with totals
- [ ] `client/src/pages/workspace/PMTCostReportPage.tsx` — filterable cost entries with totals
- [ ] `client/src/pages/workspace/PMTBudgetPage.tsx` — budget list with planned vs actual variance
- [ ] `client/src/pages/workspace/PMTPortfolioPage.tsx` — cross-project overview (aggregate status, risk, progress)
- [ ] `client/src/pages/workspace/PMTProjectHomePage.tsx` — project dashboard with configurable widgets
- [ ] `client/src/components/workspace/PMTTimeTracker.tsx` — floating timer widget (start/stop/log)

---

### Phase 4 Done When:

- [ ] Users can log time entries per work item with activity type
- [ ] Timer widget tracks time and auto-logs
- [ ] Cost entries can be recorded with unit costs
- [ ] Budgets show planned vs actual variance
- [ ] Time and cost reports are filterable and exportable
- [ ] Portfolio page shows cross-project executive view
- [ ] Project home page shows configurable widget dashboard
- [ ] Export works for CSV, JSON, PDF, XLS

---

## PHASE 5 — Integrations & Advanced (Make It Connected)

---

### 5.1 Git Integration Table

**New file:** `server/modules/pmt/integrations-schema.ts`

```
pm_git_references
  id             SERIAL PRIMARY KEY
  workspaceId    INTEGER NOT NULL REFERENCES workspaces(id)
  workItemId     INTEGER NOT NULL REFERENCES pmt_tasks(id)
  provider       VARCHAR(20) NOT NULL             — github, gitlab
  refType        VARCHAR(20) NOT NULL             — pr, commit, branch
  refId          VARCHAR(255) NOT NULL            — PR number, commit SHA, branch name
  refUrl         TEXT NOT NULL
  refTitle       TEXT
  refState       VARCHAR(30)                      — open, merged, closed
  createdAt      TIMESTAMP DEFAULT NOW()
  updatedAt      TIMESTAMP DEFAULT NOW()
```

---

### 5.2 Templates Tables

```
pm_project_templates
  id             SERIAL PRIMARY KEY
  workspaceId    INTEGER NOT NULL REFERENCES workspaces(id)
  name           VARCHAR(255) NOT NULL
  description    TEXT
  templateData   JSON NOT NULL                   — project structure + default items
  createdBy      INTEGER REFERENCES users(id)
  createdAt      TIMESTAMP DEFAULT NOW()

pm_work_item_templates
  id             SERIAL PRIMARY KEY
  workspaceId    INTEGER NOT NULL REFERENCES workspaces(id)
  name           VARCHAR(255) NOT NULL
  description    TEXT
  templateData   JSON NOT NULL                   — default field values
  typeId         INTEGER REFERENCES pm_types(id)
  createdBy      INTEGER REFERENCES users(id)
  createdAt      TIMESTAMP DEFAULT NOW()
```

---

### 5.3 Integration & Advanced Routers

**New files:**

- [ ] `server/modules/pmt/git-router.ts` — CRUD for git references + webhook receiver
- [ ] `server/modules/pmt/templates-router.ts` — CRUD for project + work item templates
- [ ] `server/modules/pmt/ical-router.ts` — iCal export endpoint (`/api/pm/calendar.ics`)
- [ ] `server/modules/pmt/webhooks-router.ts` — outgoing PM event webhooks
- [ ] `server/modules/pmt/email-notifications.ts` — email notification service

---

### 5.4 Custom Actions

```
pm_custom_actions
  id             SERIAL PRIMARY KEY
  workspaceId    INTEGER NOT NULL REFERENCES workspaces(id)
  name           VARCHAR(255) NOT NULL
  description    TEXT
  conditions     JSON NOT NULL                   — when to show button
  changes        JSON NOT NULL                   — fields to set on click
  position       INTEGER NOT NULL
```

- [ ] `server/modules/pmt/custom-actions-router.ts` — CRUD + execute

---

### Phase 5 Done When:

- [ ] GitHub PRs/commits can be linked to work items
- [ ] GitLab MRs/commits can be linked to work items
- [ ] Outgoing webhooks fire on PM events
- [ ] iCal export provides calendar subscription URL
- [ ] Email notifications send on key events
- [ ] Custom actions (multi-field update buttons) work
- [ ] Project templates can be created and applied
- [ ] Work item templates can be created and applied
- [ ] Bulk edit, move, and delete work correctly

---

## PHASE 6 — AI Advantage (Make It Better Than OpenProject)

---

### 6.1 Agent Assignment UX

**New file:** `client/src/components/workspace/AgentAssigneeSelector.tsx`

- [ ] Dropdown showing workspace members + enabled AI agents
- [ ] Agent entries show capability tokens + model info
- [ ] When agent assigned, show confidence score slider
- [ ] Validate capability token on assignment via backend

---

### 6.2 Agent Output on Work Items

**Modify:** `client/src/pages/workspace/PMTTaskDetailDrawer.tsx`

- [ ] Add "Agent Plan" collapsible section (when assigneeType = ai)
- [ ] Add "Agent Output" collapsible section
- [ ] Link to evidence bundle from governance audit
- [ ] Show agent execution trace in activity tab

---

### 6.3 AI Services

**New file:** `server/modules/pmt/ai-services.ts`

- [ ] `suggestTasks(projectDescription)` — generate task list from project description using LLM
- [ ] `triageWorkItem(title, description)` — auto-classify type + priority
- [ ] `generateStatusReport(sprintId)` — summarize sprint progress in natural language
- [ ] `suggestWorkloadBalance(workspaceId)` — identify overloaded assignees + suggest redistribution

---

### 6.4 Governance Mode Indicators

**New file:** `client/src/components/workspace/PMGovernanceBadge.tsx`

- [ ] Query `subject_freezes` for current workspace
- [ ] Badge: green OK / yellow Warn / red Frozen
- [ ] Display on all PM page headers
- [ ] When Frozen: disable all create/edit/delete buttons, show "Workspace frozen" banner

**Modify:** all PM pages to include `<PMGovernanceBadge />`

---

### Phase 6 Done When:

- [ ] Agent assignee selector works with capability validation
- [ ] Agent Plan + Output sections render on work items
- [ ] AI task suggestion generates work items from project description
- [ ] AI triage auto-classifies type + priority
- [ ] AI status report summarizes sprint in natural language
- [ ] Governance badges appear on all PM pages
- [ ] Evidence bundles link to PM mutations
- [ ] All AI actions are fully auditable

---

## WORKSPACE SHELL ROUTING

**Modify:** `client/src/pages/WorkspaceShell.tsx`

Add routes for all new pages under `/w/:workspaceId/pm/`:

```
/pm/projects          → PMTProjectsPage (exists)
/pm/projects/:id      → PMTProjectDetailPage (exists)
/pm/projects/:id/home → PMTProjectHomePage
/pm/projects/:id/settings → PMTProjectSettingsPage
/pm/table             → PMTTablePage
/pm/kanban            → PMTKanbanPage (exists)
/pm/gantt             → PMTGanttPage
/pm/calendar          → PMTCalendarPage
/pm/timeline          → PMTTimelinePage (exists)
/pm/backlog           → PMTBacklogPage
/pm/sprint-board      → PMTSprintBoardPage
/pm/team-planner      → PMTTeamPlannerPage
/pm/roadmap           → PMTRoadmapPage
/pm/portfolio         → PMTPortfolioPage
/pm/reporting         → PMTReportingPage
/pm/time-report       → PMTTimeReportPage
/pm/cost-report       → PMTCostReportPage
/pm/budgets           → PMTBudgetPage
/pm/meetings          → PMTMeetingsPage
/pm/meetings/:id      → PMTMeetingDetailPage
/pm/discussions       → PMTDiscussionsPage
/pm/discussions/:id   → PMTDiscussionDetailPage
/pm/news              → PMTNewsPage
/pm/wiki              → PMTWikiPage
/pm/config/types      → PMTTypesConfigPage
/pm/config/statuses   → PMTStatusConfigPage
/pm/config/workflows  → PMTWorkflowConfigPage
/pm/config/fields     → PMTCustomFieldsPage
```

---

## FILE COUNT SUMMARY

| Category | New Files | Modified Files |
|---|---|---|
| **Schema files** | 10 | 1 |
| **Router files** | 14 | 1 |
| **Service files** | 3 | 0 |
| **UI pages** | 25 | 3 |
| **UI components** | 4 | 0 |
| **Total** | **56 new** | **5 modified** |

---

## TABLE COUNT SUMMARY

| Phase | Tables |
|---|---|
| Existing | 3 (pmt_projects, pmt_tasks, pmt_task_dependencies) |
| Phase 1 | +3 (pm_comments, pm_attachments, pm_watchers) |
| Phase 2 | +6 (pm_statuses, pm_types, pm_workflows, pm_custom_fields, pm_custom_values, pm_saved_views, pm_versions, pm_baselines) |
| Phase 3 | +6 (pm_sprints, pm_meetings, pm_meeting_items, pm_discussions, pm_discussion_posts, pm_news) |
| Phase 4 | +4 (pm_time_entries, pm_cost_entries, pm_budgets, pm_activity_types) |
| Phase 5 | +4 (pm_git_references, pm_project_templates, pm_work_item_templates, pm_custom_actions) |
| **Total** | **26 new tables** + 3 existing = **29 tables** |

---

## ENFORCEMENT RULES

Apply to every line of code across all phases:

1. Every table has `workspaceId` — indexed, mandatory
2. Every mutation uses `governedProcedure`
3. Every router calls `requireModule(workspaceId, "pmt")`
4. Every write emits `logActivity()`
5. No PM-specific role engine — use existing capabilities
6. No cross-module direct DB access
7. UI uses shadcn/ui + Radix only
8. All features support human + AI assignees
