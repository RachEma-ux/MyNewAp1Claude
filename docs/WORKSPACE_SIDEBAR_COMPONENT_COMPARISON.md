# Workspace Sidebar Component Comparison

## Shell Context: `/w/:id/overview` routes to `WorkspaceExecutionShell`

**Current state**: Both `WorkspaceContextManagerSidebar` and `WorkspaceToolsManagerToolbar` are **commented out** in `WorkspaceExecutionShell.tsx` (lines 199–215). They have been replaced by `WorkspaceUnifiedSidebarV2`. The commented-out code is kept for rollback.

---

## Comparison 1: WorkspaceContextSidebar vs WorkspaceContextManagerSidebar

| Dimension | WorkspaceContextSidebar (V1) | WorkspaceContextManagerSidebar (V2) |
|---|---|---|
| **File** | `client/src/components/workspace/WorkspaceContextSidebar.tsx` | `client/src/components/workspace-shell/WorkspaceContextManagerSidebar.tsx` |
| **Lines** | 247 | 313 |
| **Side** | Left (`border-r`) | Left (`border-r`) |
| **Purpose** | Operational awareness sidebar | Context / awareness panel (NOT navigation) |
| **Shell usage** | Not used in ExecutionShell (standalone component) | Commented out in ExecutionShell (replaced by UnifiedSidebarV2) |
| **Props model** | 14 individual props (`workspaceId`, `workspaceName`, `status`, etc.) | Single `ShellViewData` object prop (`shell`) + `open` + `onClose` |
| **Width (open)** | `w-64` (256px) | `w-[280px]` (280px) |
| **Width (collapsed)** | `w-12` (48px, icon-only nav) | `w-0 border-r-0` (fully hidden) |
| **Collapse behavior** | Inline toggle button (ChevronLeft/Right), shows icon-only nav when collapsed | No collapse toggle — panel is either fully visible or fully hidden |
| **Collapsed icon nav** | Yes — Home, Overview, Team, Crew, Rules, Settings (6 icons with tooltips) | No — collapses to zero width |
| **Mobile** | No mobile-specific handling | `Sheet` drawer from left (`SheetContent side="left"`) |
| **Desktop** | Always visible as inline aside | `hidden md:flex` — visible only on md+ |
| **Background** | `bg-card` | `bg-card/80 backdrop-blur-sm` |
| **Scrolling** | Native `overflow-y-auto` on aside | `ScrollArea` component (Radix) |
| **Zone structure** | 3 implicit zones (TOP/MIDDLE/BOTTOM) separated by `border-b` dividers | 3 explicit zones with `ZoneDivider` labels: MEANING, AWARENESS, ANCHORS |
| **Zone 1 (top)** | Identity + Purpose + Mission (3 Sections) | Identity + Global Purpose + Your Mission (3 SectionLabels) |
| **Zone 2 (middle)** | Participants + Recent Activity + Alerts (3 Sections) | Current Work (stats grid) + Recent Activity (with timestamps) + Alerts (status pill) + Quick Actions (4 items) |
| **Zone 3 (bottom)** | Guide + Health + Settings (raw HTML) | Guide + Health (with module count) + Settings (same structure, better styling) |
| **Section headers** | Inline `Section` component — plain text, same styling for all | `SectionLabel` component — bold uppercase tracking-widest with primary color icon |
| **Dividers** | Simple `border-b mx-3` horizontal lines | `ZoneDivider` component with centered label between two border lines |
| **Current Work display** | Flat text: `{teamCount} team / {crewCount} crew` with icons | 3-column stats grid: Team count, AI Crew count, Modules count — card-style `bg-muted/50` |
| **Activity display** | 3 items, Clock icon + truncated action text | 4 items, colored dot + action text + formatted timestamp |
| **Alerts display** | Plain text: "No active alerts" | Styled pill: green border + green CheckCircle2 icon + text |
| **Quick Actions** | None | Yes — dynamic from `shell.quickActions` or fallback role-based links (Manage team, Configure workspace, Open projects, Collaboration) |
| **Mission display** | Plain `text-primary` paragraph | Styled card with `border-primary/30 bg-primary/5` — or role-description fallback |
| **Conditional sections** | Only `missionEmphasis` and `alertsEnabled` conditionals | Fine-grained: `shell.sidebar.showCurrentWork`, `.showActivityLog`, `.showAlerts`, `.showQuickActions`, `.showGuide`, `.showHealth` |
| **Data fetching** | `trpc.workspaces.activity.list.useQuery` (enabled when not collapsed) | Same query, `staleTime: 30000`, `enabled: workspaceId > 0` |
| **Participant classification** | Direct `participantRole` display | `classifyParticipant()` helper → manager/member/viewer with role descriptions |
| **Health indicator** | `Heart` icon (static green) + "Healthy" text | `HeartPulse` icon (animated) + "Healthy" + module count |
| **Type safety** | Interface with individual fields | `ShellViewData` shared type from `./types` |

---

## Comparison 2: WorkspaceContextManagerSidebar vs WorkspaceToolsManagerToolbar

| Dimension | WorkspaceContextManagerSidebar | WorkspaceToolsManagerToolbar |
|---|---|---|
| **File** | `client/src/components/workspace-shell/WorkspaceContextManagerSidebar.tsx` | `client/src/components/workspace-shell/WorkspaceToolsManagerToolbar.tsx` |
| **Lines** | 313 | 290 |
| **Side** | Left (`border-r`) | Left (`border-r`, positioned after context sidebar) |
| **Purpose** | Context / awareness — answers "What is this? Why? What's my mission?" | Tool navigation — answers "What tools can I use here?" |
| **Shell usage** | Commented out in ExecutionShell | Commented out in ExecutionShell |
| **Content type** | Informational — displays workspace identity, purpose, status, activity, alerts | Navigational — links to workspace tool pages (Resources, Team, Crew, etc.) |
| **Props** | `shell: ShellViewData`, `open: boolean`, `onClose: () => void` | `shell: ShellViewData`, `basePath: string`, `open: boolean`, `collapsed: boolean`, `onToggle: () => void`, `onClose: () => void` |
| **Width (open)** | `w-[280px]` (280px) | `w-[220px]` (220px) |
| **Width (collapsed)** | `w-0` (fully hidden) | `w-[48px]` (icon-only) |
| **Collapse behavior** | Binary show/hide (no in-between) | Toggle between full-width labels and icon-only mode |
| **Toggle button** | None (controlled externally) | `PanelLeftOpen`/`PanelLeftClose` toggle in header |
| **Mobile** | `Sheet` drawer from left | No mobile sheet — always inline |
| **Desktop** | `hidden md:flex` (md+ only) | Always visible inline `aside` |
| **Background** | `bg-card/80 backdrop-blur-sm` | `bg-card/80 backdrop-blur-sm` |
| **Scrolling** | `ScrollArea` | `ScrollArea` |
| **Header** | None (content starts immediately) | "TOOLS" label with wrench icon + collapse toggle button |
| **Navigation links** | None — purely informational display | Yes — `ToolLink` components linking to workspace sub-routes |
| **Active state** | No active route tracking | Active tool highlighted with `bg-primary text-primary-foreground shadow-sm` |
| **Route awareness** | No `useLocation()` | `useLocation()` for active route matching |
| **Data displayed** | Identity, purpose, mission, participants, activity, alerts, health, settings | Tool list: Overview + 9 dynamic domains + Governance + Reports |
| **Dynamic items** | Sections conditional via `shell.sidebar.show*` flags | Tools from `shell.toolbar.visibleItems` array |
| **Priority highlighting** | No priority concept | `shell.toolbar.priorityItems` → accent ring on priority tools |
| **Static items** | All sections are static (conditional but always same structure) | 3 always-visible: Overview, Governance, Reports |
| **Dynamic items source** | Activity from `trpc.workspaces.activity.list` query | Tool list from `shell.toolbar.visibleItems` (no API call) |
| **Tooltips** | No tooltips | Tooltips on icon-only mode (collapsed state) |
| **TOOL_DOMAINS map** | N/A | 9 tools: resources, team, crew, documents, collaboration, workflow-designer, pm-toolbox, knowledge, rules |
| **Icon strategy** | Fixed icons per section (Target, Compass, Crosshair, Activity, etc.) | Fixed icons per tool domain (Package, Users, Bot, FileText, etc.) |
| **Separator style** | `ZoneDivider` with centered label | Simple `border-t` horizontal lines |
| **User interaction** | Read-only display (except quick action buttons + links at bottom) | Click-to-navigate tool links |
| **Type import** | `ShellViewData` + `classifyParticipant` from `./types` | `ShellViewData` from `./types` |

---

## Summary

| Attribute | ContextSidebar (V1) | ContextManagerSidebar (V2) | ToolsManagerToolbar |
|---|---|---|---|
| Role | Awareness (old) | Awareness (new) | Navigation |
| Position | Left | Left | Left (after context) |
| Open width | 256px | 280px | 220px |
| Collapsed width | 48px (icons) | 0px (hidden) | 48px (icons) |
| Mobile support | None | Sheet drawer | None |
| API calls | Activity list | Activity list | None |
| Active in shell | No | Commented out | Commented out |
| Replaced by | V2 | UnifiedSidebarV2 | UnifiedSidebarV2 |

### Current Architecture (WorkspaceExecutionShell)

```
WorkspaceExecutionShell
  [WorkspaceShellHeader]                    ← COMMENTED OUT
  [WorkspaceContextManagerSidebar (left)]   ← COMMENTED OUT
  [WorkspaceUnifiedSidebarV2 (left)]        ← ACTIVE (replaces both sidebars)
  [WorkspaceToolsManagerToolbar (left)]     ← COMMENTED OUT
  [Main Content (routes)]                   ← ACTIVE
  [WorkspaceManagerControls (right drawer)] ← ACTIVE
```
