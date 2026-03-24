# Workspace Sidebar / Toolbar Component Comparison

## Routing Context

`/w/:workspaceId/*` → **WorkspaceExecutionShell** (`client/src/components/workspace-shell/WorkspaceExecutionShell.tsx`)

The shell currently renders **WorkspaceUnifiedSidebarV2** (left). The other sidebar/toolbar components are commented out (kept for rollback).

---

## Component Status in WorkspaceExecutionShell

| Component | Status | Position |
|---|---|---|
| `WorkspaceUnifiedSidebarV2` | **ACTIVE** — currently rendered | Left sidebar |
| `WorkspaceContextManagerSidebar` | **HIDDEN** — commented out (rollback) | Was left sidebar |
| `WorkspaceToolsManagerToolbar` | **HIDDEN** — commented out (rollback) | Was left, inside `<main>` |
| `WorkspaceShellHeader` | **HIDDEN** — commented out (rollback) | Was top header |
| `WorkspaceManagerControls` | **ACTIVE** — rendered | Right drawer |

---

## 1. WorkspaceContextSidebar vs WorkspaceContextManagerSidebar

| Aspect | WorkspaceContextSidebar | WorkspaceContextManagerSidebar |
|---|---|---|
| **File** | `client/src/components/workspace/WorkspaceContextSidebar.tsx` | `client/src/components/workspace-shell/WorkspaceContextManagerSidebar.tsx` |
| **Role** | Standalone operational-awareness sidebar | Shell-integrated context/awareness panel |
| **Props interface** | 12 individual props (`workspaceId`, `workspaceName`, `collapsed`, `onToggle`, etc.) | `{ shell: ShellViewData; open: boolean; onClose: () => void }` |
| **Data source** | Props passed individually from parent | `ShellViewData` object (single prop) |
| **Collapse model** | `collapsed` boolean — toggles between 64px icon-only and 256px expanded | `open` boolean — toggles between 0px (hidden) and 280px visible |
| **Desktop behavior** | Always inline, togglable via chevron | Always-visible 280px inline panel when `open` |
| **Mobile behavior** | Same as desktop (no mobile drawer) | Slide-out `<Sheet>` drawer from left |
| **Collapsed state** | Shows icon-only navigation (Home, Overview, Team, Crew, Rules, Settings) | Fully hidden (`w-0`, no icons) |
| **Layout zones** | 3 informal zones: Top (Identity/Purpose/Mission), Middle (Participants/Activity/Alerts), Bottom (Guide/Health/Settings) | 3 labeled zones with visual dividers: **MEANING** (Identity/Purpose/Mission), **AWARENESS** (Current Work/Activity/Alerts/Quick Actions), **ANCHORS** (Guide/Health/Settings) |
| **Zone dividers** | `border-b` simple line | `ZoneDivider` component with labeled text ("Awareness", "Anchors") |
| **Section headers** | Inline `Section` component (icon + uppercase text + children) | `SectionLabel` component (icon + 11px bold uppercase tracking-widest) |
| **Identity display** | Name + status in header bar; Type badge + description in section | Name as `text-base font-semibold`; Type badge + status color + description |
| **Purpose display** | Badge with `purposeType` + text ref | `text-sm` with capitalized type + dash-separated ref |
| **Mission display** | Simple `text-xs font-medium text-primary` | Styled card with `border-primary/30 bg-primary/5` or role-based fallback box |
| **Current Work** | Shows team/crew counts inline | 3-column grid with stat cards (Team / AI Crew / Modules) |
| **Activity query** | `trpc.workspaces.activity.list` (limit 5, disabled when collapsed) | `trpc.workspaces.activity.list` (limit 5, staleTime 30s) |
| **Activity display** | Clock icon + truncated text (3 items) | Dot bullet + text + timestamp (4 items) |
| **Alerts section** | Plain text "No active alerts" | Styled green banner with CheckCircle2 icon |
| **Quick Actions** | Not included | Yes — dynamic from `shell.quickActions` or fallback links (Manage team, Configure, Projects, Collaboration) |
| **Guide/Health/Settings** | Plain button links at bottom | Same pattern, uses `HeartPulse` instead of `Heart` |
| **Visibility control** | `sidebar.show*` flags: none (renders all sections always) | Uses `shell.sidebar.show*` flags to conditionally render each section |
| **Icons** | lucide: `Target, Activity, Bell, Zap, BookOpen, Heart, Settings, ChevronLeft/Right, Users, Bot, Shield, Clock, ArrowRight, Home` | lucide: `Target, Compass, Crosshair, Activity, Bell, Zap, BookOpen, HeartPulse, Settings, Users, Bot, Clock, ChevronRight, CheckCircle2` |
| **Scroll** | Native `overflow-y-auto` on `<aside>` | Radix `<ScrollArea>` component |
| **Used by** | Not currently used in the shell (standalone) | Referenced in `WorkspaceExecutionShell` (commented out) |
| **Generation** | V1 — original design | V2 — redesigned for shell integration |

---

## 2. WorkspaceManagerContextSidebar

**Does not exist.** No file or reference found for `WorkspaceManagerContextSidebar`. This name is not used anywhere in the codebase. It may be confused with `WorkspaceContextManagerSidebar` (word order swapped).

---

## 3. WorkspaceToolsManagerToolbar

| Aspect | Detail |
|---|---|
| **File** | `client/src/components/workspace-shell/WorkspaceToolsManagerToolbar.tsx` |
| **Role** | Collapsible tool navigation sidebar (despite "toolbar" in name, it's a vertical sidebar) |
| **Props** | `{ shell: ShellViewData; basePath: string; open: boolean; collapsed: boolean; onToggle: () => void; onClose: () => void }` |
| **Position** | Left side, inside `<main>`, after context sidebar |
| **Desktop** | Inline panel: 220px expanded, 48px icon-only collapsed |
| **Mobile** | Was designed for drawer but Sheet import removed — currently always inline |
| **Collapse model** | `collapsed` toggles between 48px (icon-only with tooltips) and 220px (full labels) |
| **Header** | "TOOLS" label with `PanelLeftOpen/Close` toggle button |
| **Content** | Overview link + dynamic tool domains from `shell.toolbar.visibleItems` + always-visible Governance & Reports |
| **Tool domains** | 9 defined: Resources, Team, AI Crew, Documents, Collaboration, Workflow Designer, PM Toolbox, Knowledge Base, Rules |
| **Active highlight** | Primary fill + shadow on active route |
| **Priority items** | Ring accent via `shell.toolbar.priorityItems` |
| **Data source** | `shell.toolbar.visibleItems` and `shell.toolbar.priorityItems` |
| **Scroll** | Radix `<ScrollArea>` |
| **Status** | **HIDDEN** — commented out in WorkspaceExecutionShell |

---

## 4. WorkspaceUnifiedSidebarV2 (Current Active Replacement)

| Aspect | Detail |
|---|---|
| **File** | `client/src/components/workspace/WorkspaceUnifiedSidebarV2.tsx` |
| **Role** | Unified sidebar combining Tools + Context + Settings into 3 equal sections |
| **Props** | `{ shell: ShellViewData; collapsed: boolean; onToggle: () => void }` |
| **Position** | Left side (replaced both ContextManagerSidebar and ToolsManagerToolbar) |
| **Desktop expanded** | 256px (`w-64`), 3 sections with dropdown headers |
| **Desktop collapsed** | 48px (`w-12`), icon-only with dropdown menus on section headers |
| **Sections** | **Tools** (blue) → **Context** (emerald) → **Settings** (orange) |
| **Section pattern** | Each section: dropdown header (full list) + scrollable pinned items |
| **Tools section** | Dashboard, Team, Crew, Modules (pinned) + 14 items in dropdown |
| **Context section** | Identity, Purpose, Mission, Activity, Health+Alerts (inline content) |
| **Settings section** | Oversight, Rules, Governance (pinned) + 5 items in dropdown |
| **Scroll** | Each section independently scrollable (`overflow-y-auto`) |
| **Status** | **ACTIVE** — currently rendered in WorkspaceExecutionShell |

---

## Cross-Comparison Summary

| Feature | WorkspaceContextSidebar | WorkspaceContextManagerSidebar | WorkspaceToolsManagerToolbar | WorkspaceUnifiedSidebarV2 |
|---|---|---|---|---|
| **Status** | Unused standalone | Hidden (rollback) | Hidden (rollback) | **Active** |
| **Concern** | Context only | Context only | Navigation only | Context + Navigation + Settings |
| **Data input** | Individual props | `ShellViewData` | `ShellViewData` | `ShellViewData` |
| **Mobile support** | No | Sheet drawer | No (removed) | No (desktop only) |
| **Collapsed width** | 48px (icons) | 0px (hidden) | 48px (icons) | 48px (icons) |
| **Expanded width** | 256px | 280px | 220px | 256px |
| **Collapse UX** | Chevron toggle → icon nav | Open/close → fully hidden | Panel toggle → icon nav | Chevron toggle → icon+dropdown nav |
| **Sections** | 3 informal | 3 labeled zones | 1 (tools list) | 3 color-coded dropdown sections |
| **Activity query** | Yes (disabled when collapsed) | Yes (staleTime 30s) | No | Yes (staleTime 30s) |
| **Quick Actions** | No | Yes | No | No |
| **Dynamic tools** | No | No | Yes (`toolbar.visibleItems`) | Yes (dropdown items) |
| **Visibility flags** | No | Yes (`sidebar.show*`) | No | Yes (`sidebar.show*`) |
| **Route highlighting** | No | No | Yes (primary fill) | Yes (primary/15 bg) |
| **Dropdown menus** | No | No | No | Yes (per-section) |
