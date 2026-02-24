# Shell Template — Plug & Play Reference

## What Is a Shell?

A **Shell** is a self-contained, workspace-scoped execution container that renders inside the app's `MainLayout`. It has its own sidebar, status bar, oversight drawer, modular sub-pages, and a pin/unpin toggle that controls whether it appears as an inset panel or fills the entire content area.

Think of it as an **app-within-the-app**: each workspace gets its own mini-application with its own navigation, modules, and governance layer.

---

## Quick Start — Copy & Adapt

To create a new Shell (e.g. `ProjectShell`):

1. **Copy the template files** from this directory into your project
2. **Find-and-replace** `Workspace` → `YourEntity` (e.g. `Project`)
3. **Register routes** in `App.tsx`
4. **Add backend router** in `server/routers.ts`
5. **Create DB table + modules table** in `drizzle/tables/`

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│ MainLayout (App sidebar + top bar)                      │
│  ┌───────────────────────────────────────────────────┐  │
│  │ Shell Container (-m-6 to fill content area)       │  │
│  │  ┌──── Title Bar (pin/close) ─────────────────┐   │  │
│  │  │ [Workspace Name]              [Pin] [Close] │   │  │
│  │  ├────────────────────────────────────────────┤   │  │
│  │  │ ┌─────────┬──────────────────────────────┐ │   │  │
│  │  │ │Sidebar  │  Main Content (sub-routes)   │ │   │  │
│  │  │ │         │                              │ │   │  │
│  │  │ │Overview │  <Switch>                    │ │   │  │
│  │  │ │Projects │    /projects → PMTPage       │ │   │  │
│  │  │ │Knowledge│    /knowledge → KnowledgePage│ │   │  │
│  │  │ │Agents   │    /agents → AgentsPage      │ │   │  │
│  │  │ │Collab   │    /collab → CollabPage      │ │   │  │
│  │  │ │Reports  │    /reports → ReportsPage    │ │   │  │
│  │  │ │         │    / → OverviewPage          │ │   │  │
│  │  │ │─────────│                              │ │   │  │
│  │  │ │Oversight│                              │ │   │  │
│  │  │ │Settings │                              │ │   │  │
│  │  │ └─────────┴──────────────────────────────┘ │   │  │
│  │  ├────────────────────────────────────────────┤   │  │
│  │  │ Status Bar (WS-id | modules | gov health)  │   │  │
│  │  └────────────────────────────────────────────┘   │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

---

## File Map

### Frontend

| File | Purpose |
|------|---------|
| `client/src/pages/WorkspaceShell.tsx` | **Shell entry point** — pin/unpin, routing, ModuleGate, overview |
| `client/src/components/workspace/WorkspaceSidebar.tsx` | Collapsible sidebar (48px ↔ 240px) |
| `client/src/components/workspace/WorkspaceStatusBar.tsx` | Bottom bar (ID, module count, governance health) |
| `client/src/components/workspace/OversightDrawer.tsx` | Right-side Sheet (governance checks, activity) |
| `client/src/components/workspace/ModuleDisabled.tsx` | Placeholder when a module is disabled |
| `client/src/pages/workspace/*.tsx` | Sub-pages (13 pages across 5 modules + governance) |

### Backend

| File | Purpose |
|------|---------|
| `server/modules/router.ts` | Combined tRPC router (`modules.*`) |
| `server/modules/registry.ts` | Module CRUD, presets, activity logging, guards |
| `server/modules/pmt/router.ts` | PMT engine sub-router |
| `server/modules/knowledge/router.ts` | Knowledge engine sub-router |
| `server/modules/agents/router.ts` | Agent orchestration sub-router |
| `server/modules/collaboration/router.ts` | Collaboration sub-router |
| `server/modules/reporting/router.ts` | Reporting sub-router |
| `server/routers.ts` | Main app router (workspaces CRUD at `workspaces.*`) |

### Database

| File | Purpose |
|------|---------|
| `drizzle/tables/users.ts` | `workspaces` table definition |
| `drizzle/tables/workspace-modules.ts` | `workspace_modules` + `workspace_activity_log` tables |

---

## Frontend Deep Dive

### 1. Route Registration (`App.tsx`)

```tsx
// Shell routes use ProtectedRoute (renders inside MainLayout)
<Route path="/w/:workspaceId/*" component={() => <ProtectedRoute component={WorkspaceShell} />} />
<Route path="/w/:workspaceId" component={() => <ProtectedRoute component={WorkspaceShell} />} />
```

**Key**: Use `ProtectedRoute`, NOT `ShellRoute`. The shell renders INSIDE `MainLayout` so the app's hamburger sidebar is available behind it.

### 2. Shell Component (`WorkspaceShell.tsx`)

#### State

```tsx
const [sidebarCollapsed, setSidebarCollapsed] = useState(true);   // Sidebar starts collapsed
const [oversightOpen, setOversightOpen] = useState(false);         // Oversight drawer
const [pinned, setPinned] = useState(false);                       // Pin/unpin toggle
```

#### Data Fetching

```tsx
// Fetch workspace metadata
const { data: workspace } = trpc.workspaces.get.useQuery({ id: workspaceId });

// Fetch enabled modules
const { data: modules } = trpc.modules.manage.list.useQuery({ workspaceId });
```

#### ModuleGate Pattern

Controls access to module sub-pages. If a module is disabled, shows `ModuleDisabled` placeholder:

```tsx
function ModuleGate({ moduleKey, moduleName, children }) {
  if (!enabledModules.has(moduleKey)) {
    return <ModuleDisabled moduleName={moduleName} workspaceId={workspaceId} />;
  }
  return <>{children}</>;
}

// Usage in routes:
<Route path={`${basePath}/projects`}>
  <ModuleGate moduleKey="pmt" moduleName="Project Management">
    <PMTProjectsPage workspaceId={workspaceId} />
  </ModuleGate>
</Route>
```

#### Pin/Unpin Layout

Two render modes sharing the same `shellContent`:

**Unpinned (default)** — inset panel with border:
```tsx
<div className="-m-6 p-3 flex flex-col" style={{ height: "calc(100vh - 4rem)" }}>
  <div className="rounded-lg border border-border bg-background shadow-sm overflow-hidden">
    {/* Title bar with Pin + Close buttons */}
    {shellContent}
  </div>
</div>
```

**Pinned** — fills entire content area edge-to-edge:
```tsx
<div className="-m-6 flex flex-col relative" style={{ height: "calc(100vh - 4rem)" }}>
  {/* PinOff button in top-right corner */}
  {shellContent}
</div>
```

**Critical CSS**: `-m-6` counteracts MainLayout's `<main className="p-6">` padding.

### 3. Sidebar (`WorkspaceSidebar.tsx`)

**Props:**
```tsx
interface SidebarProps {
  workspaceId: number;
  workspaceName: string;
  enabledModules: Set<string>;
  collapsed: boolean;
  onToggle: () => void;
  onOversightOpen: () => void;
}
```

**Behavior:**
- Collapsed: 48px (icon-only with tooltips)
- Expanded: 240px (icons + labels)
- Auto-collapses on nav click
- Shows sub-items when parent route is active
- "All Workspaces" link at top, "Oversight" + "Settings" at bottom

### 4. Status Bar (`WorkspaceStatusBar.tsx`)

**Props:**
```tsx
interface StatusBarProps {
  workspaceId: number;
  enabledModuleCount: number;
  onOversightOpen?: () => void;
}
```

Shows: `WS-{id}` | `{n} modules` | governance health dot | connection indicator.

### 5. Oversight Drawer (`OversightDrawer.tsx`)

Radix Sheet sliding from the right. Fetches governance self-check and recent activity timeline. Only queries when open (`enabled: open`).

### 6. Sub-Pages (13 pages)

All accept `{ workspaceId: number }` as props:

| Page | Module | Route |
|------|--------|-------|
| `PMTProjectsPage` | pmt | `/w/:id/projects` |
| `PMTKanbanPage` | pmt | `/w/:id/projects/board` |
| `PMTTimelinePage` | pmt | `/w/:id/projects/timeline` |
| `PMTProjectDetailPage` | pmt | `/w/:id/projects/:projectId` |
| `KnowledgeDocsPage` | knowledge | `/w/:id/knowledge` |
| `KnowledgeDecisionsPage` | knowledge | `/w/:id/knowledge/decisions` |
| `KnowledgeSearchPage` | knowledge | `/w/:id/knowledge/search` |
| `AgentsRosterPage` | agents | `/w/:id/agents` |
| `AgentRunsPage` | agents | `/w/:id/agents/runs` |
| `AgentRunDetailPage` | agents | `/w/:id/agents/runs/:runId` |
| `CollabThreadsPage` | collaboration | `/w/:id/collaboration` |
| `ReportingDashboardPage` | reporting | `/w/:id/reports` |
| `GovernancePage` | (always on) | `/w/:id/governance` |

---

## Backend Deep Dive

### 1. Workspace CRUD (`server/routers.ts` → `workspaces.*`)

| Procedure | Type | Input | Description |
|-----------|------|-------|-------------|
| `workspaces.list` | query | (none) | List user's workspaces |
| `workspaces.get` | query | `{ id }` | Get workspace by ID |
| `workspaces.create` | mutation | `{ name, description?, ... }` | Create workspace |
| `workspaces.update` | mutation | `{ id, name?, description?, ... }` | Update workspace |
| `workspaces.getRoutingProfile` | query | `{ id }` | Get LLM routing config |
| `workspaces.updateRoutingProfile` | mutation | `{ id, profile }` | Update routing config |

### 2. Module Management (`server/modules/router.ts` → `modules.manage.*`)

| Procedure | Type | Input | Description |
|-----------|------|-------|-------------|
| `modules.manage.list` | query | `{ workspaceId }` | Get all module bindings |
| `modules.manage.setEnabled` | mutation | `{ workspaceId, moduleKey, enabled }` | Toggle module |
| `modules.manage.seed` | mutation | `{ workspaceId, workspaceType? }` | Seed default modules |

### 3. Module Engine Routers (`modules.*`)

| Router | Namespace | Contains |
|--------|-----------|----------|
| `pmtRouter` | `modules.pmt.*` | Projects, tasks, boards, timelines |
| `knowledgeRouter` | `modules.knowledge.*` | Documents, decisions, search |
| `agentOrchRouter` | `modules.agentOrch.*` | Agent roster, runs, execution |
| `collaborationRouter` | `modules.collaboration.*` | Threads, messages |
| `reportingRouter` | `modules.reporting.*` | Dashboard summaries, activity timeline |

### 4. Module Registry (`server/modules/registry.ts`)

Core functions:

```tsx
seedWorkspaceModules(workspaceId, workspaceType)  // Apply preset modules
getWorkspaceModules(workspaceId)                   // List all module bindings
isModuleEnabled(workspaceId, moduleKey)            // Check single module
setModuleEnabled(workspaceId, moduleKey, enabled)  // Toggle module
requireModule(workspaceId, moduleKey)              // Guard — throws if disabled
logActivity(params)                                // Audit trail
```

**Module Presets:**
```tsx
const MODULE_PRESETS = {
  personal:   ["pmt", "knowledge", "reporting"],
  team:       ["pmt", "knowledge", "agents", "collaboration", "reporting"],
  enterprise: ["pmt", "knowledge", "agents", "collaboration", "reporting"],
  sandbox:    ["pmt", "knowledge", "agents"],
  readonly:   ["reporting"],
};
```

---

## Database Schema

### `workspaces` table
```
id              serial PK
name            varchar(255) NOT NULL
description     text
ownerId         integer FK → users.id
embeddingModel  varchar(255) default 'bge-small-en-v1.5'
chunkingStrategy varchar(50) default 'semantic'
chunkSize       integer default 512
chunkOverlap    integer default 50
vectorDb        varchar(50) default 'qdrant'
collectionName  varchar(255)
routingProfile  json
createdAt       timestamp
updatedAt       timestamp
```

### `workspace_modules` table
```
id              serial PK
workspaceId     integer FK → workspaces.id
moduleKey       varchar(50) NOT NULL
enabled         boolean default true
mode            varchar(50) default 'standard'
config          json
createdAt       timestamp
updatedAt       timestamp
UNIQUE(workspaceId, moduleKey)
```

### `workspace_activity_log` table
```
id              serial PK
workspaceId     integer FK → workspaces.id
moduleKey       varchar(50)
actorId         integer
action          varchar(100) NOT NULL
targetType      varchar(50)
targetId        integer
metadata        json
createdAt       timestamp
```

---

## How to Create a New Shell

### Step 1: Define Your Modules

In `drizzle/tables/your-modules.ts`:
```tsx
export const MY_MODULE_KEYS = ["dashboard", "settings", "reports"] as const;
export type MyModuleKey = typeof MY_MODULE_KEYS[number];
```

### Step 2: Create Sub-Pages

In `client/src/pages/my-shell/`:
```tsx
// DashboardPage.tsx
export function DashboardPage({ entityId }: { entityId: number }) {
  return <div>Dashboard for entity {entityId}</div>;
}
```

### Step 3: Create Shell Component

Copy `WorkspaceShell.tsx` and adapt:
- Change `workspaceId` → `entityId`
- Change `trpc.workspaces.get` → your entity query
- Change `trpc.modules.manage.list` → your modules query
- Update `navItems` and `<Switch>` routes

### Step 4: Create Shell Components

Copy the 4 components from `client/src/components/workspace/`:
- `Sidebar.tsx` — update nav entries
- `StatusBar.tsx` — update status indicators
- `OversightDrawer.tsx` — update governance queries
- `ModuleDisabled.tsx` — reusable as-is

### Step 5: Register Routes

In `App.tsx`:
```tsx
<Route path="/my-shell/:entityId/*" component={() => <ProtectedRoute component={MyShell} />} />
<Route path="/my-shell/:entityId" component={() => <ProtectedRoute component={MyShell} />} />
```

### Step 6: Add Backend Router

In `server/routers.ts`, add your entity CRUD router. In `server/modules/`, add engine sub-routers.

---

## Key Patterns to Preserve

1. **`-m-6` padding hack** — MainLayout wraps children in `p-6`; the shell uses `-m-6` to fill edge-to-edge
2. **`calc(100vh - 4rem)`** — accounts for MainLayout's 64px top bar
3. **ModuleGate** — never render a module page without checking `enabledModules`
4. **shellContent extraction** — define content once, render in two wrappers (pinned/unpinned)
5. **Sidebar auto-collapse** — collapse on nav click for mobile-friendly UX
6. **Lazy loading** — shell entry point should be lazy-loaded in `App.tsx`
7. **Protected route** — always use `ProtectedRoute`, not `ShellRoute`
