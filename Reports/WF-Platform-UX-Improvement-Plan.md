# Workflow Platform UX/UI Improvement Plan

**Date:** 2026-03-31
**Scope:** Sandbox WF + WFCreationShell (Designer)
**Baseline:** Commit `69fb2e3` — current operational state
**Reference docs:** `AppDescription.docx`, `AppDesign-ReadyBlueprint.docx`, `Reports/AppDescription-AppDesign-Report.md`

---

## Executive Summary

The Sandbox WF platform has a solid backend (8.5/10) but the frontend Designer and execution layers are at early prototype stage. This plan addresses **7 critical UX gaps** and **5 missing platform features** to bring the platform from ~25-30% alignment with the AppDescription/AppDesign Blueprint to ~75%+ coverage.

Organized into **5 phases** of increasing complexity, each phase delivers independently testable value.

---

## Phase 1: Node Library Overhaul (Priority: CRITICAL)

### Problem
The Designer's NODE_PALETTE contains 5 admin/editor tools (WF Editor, Triggers, Debug Console, Deploy, Metrics) instead of workflow building blocks. Users cannot create real workflows — they can only place copies of the editor panels themselves.

### Solution
Replace `NODE_PALETTE` with proper workflow node types that map to the 6 platform pillars.

### Tasks

#### 1.1 Define Workflow Node Types
Replace `NODE_PALETTE` in `WFCreationShell.tsx` with:

| Category | Node Types |
|---|---|
| **Triggers** | Manual, Schedule (Cron), Webhook, Event, File Watch, API Poll |
| **Actions** | HTTP Request, Database Query, Transform Data, Send Email, Call API, Run Script |
| **Logic** | If/Else Branch, Switch (Multi-branch), Loop (ForEach), Wait/Delay, Merge |
| **AI** | LLM Prompt, RAG Query, Document Extract, Classify, Summarize |
| **Integration** | Slack, Teams, Jira, GitHub, S3, Custom Connector |
| **Governance** | Approval Gate, Policy Check, Audit Log, Human Review, Escalation |

Minimum: 24 node types across 6 categories (vs current 5 mismatched tools).

#### 1.2 Implement Categorized Node Palette
- Group nodes by category in sidebar with collapsible sections
- Each category has an icon + color (matching existing CATEGORIES)
- Show count badge per category
- Add search/filter at top of palette
- Support drag-to-canvas (not just click-to-add)

#### 1.3 Node Shape Differentiation
Different visual shapes per category:
- Triggers: rounded pill shape with lightning bolt
- Actions: standard rectangle
- Logic: diamond/rhombus for decision points
- AI: hexagon
- Integration: rectangle with connector dots
- Governance: shield-bordered rectangle

### Files to Modify
- `client/src/pages/automation/WFCreationShell.tsx` — NODE_PALETTE, N8nNode component, addNodeFromPalette

### Acceptance Criteria
- [ ] 24+ node types available in palette
- [ ] Nodes grouped by 6 categories
- [ ] Each category has distinct visual style
- [ ] Drag-and-drop from palette to canvas works
- [ ] Search/filter in palette works

---

## Phase 2: Node Properties Panel (Priority: CRITICAL)

### Problem
Nodes have no configuration panel. Clicking a node does nothing. Users cannot set parameters, map data, configure conditions, or define any behavior. The nodes are purely visual labels.

### Solution
Add a right-side properties panel that opens when a node is selected, showing editable configuration specific to the node type.

### Tasks

#### 2.1 Create Properties Panel Component
- Right-side panel (w-72, collapsible)
- Opens on node selection, closes on deselect or canvas click
- Header: node icon + type + name (editable)
- Sections: General, Parameters, Input/Output, Advanced

#### 2.2 Node-Type-Specific Configuration Forms

| Node Type | Configuration Fields |
|---|---|
| **HTTP Request** | URL, Method, Headers, Body, Auth, Timeout, Retry |
| **If/Else** | Condition field, Operator (equals, contains, >/<), Value, Else behavior |
| **LLM Prompt** | Provider, Model, System prompt, User prompt, Temperature, Max tokens |
| **Database Query** | Connection, Query text, Parameters, Timeout |
| **Approval Gate** | Approvers (user/role), Timeout, Escalation, Rejection behavior |
| **Schedule** | Cron expression, Timezone, Start date, End date |
| **Transform** | Input mapping, Expression editor, Output schema |
| **Loop** | Collection source, Iterator variable, Concurrency, Break condition |

#### 2.3 Data Mapping UI
- Input/Output tabs on each node showing data schema
- Visual data mapper: drag output field from upstream node to input field
- Expression editor with autocomplete for `{{node.fieldName}}` syntax
- JSON schema viewer for complex data structures

#### 2.4 Validation Indicators
- Red border on nodes with missing required fields
- Warning icon for nodes with potential issues
- Green check for fully configured nodes
- Tooltip on hover showing validation messages

### Files to Create
- `client/src/components/automation/NodePropertiesPanel.tsx`
- `client/src/components/automation/DataMapper.tsx`
- `client/src/components/automation/ExpressionEditor.tsx`

### Files to Modify
- `client/src/pages/automation/WFCreationShell.tsx` — add panel, node selection handler
- `drizzle/tables/wfdb.ts` — add `config` JSON column to steps/nodes

### Acceptance Criteria
- [ ] Clicking a node opens properties panel on right
- [ ] Each node type shows relevant configuration fields
- [ ] Configuration persists when switching between nodes
- [ ] Validation shows missing required fields
- [ ] Data mapping UI functional for at least 3 node types

---

## Phase 3: Execution Engine & Monitoring (Priority: HIGH)

### Problem
The "Run" button creates an execution record in the database but does nothing. No steps execute, no logs are generated, no output appears. The Debug Console tool in the old palette was a static placeholder.

### Solution
Build a real step-by-step execution engine with live monitoring.

### Tasks

#### 3.1 Server-Side Execution Engine
Create `server/sandbox-wf/executor.ts`:

```
ExecutionEngine
├── executeWorkflow(workflowId) → executionId
├── executeStep(executionId, stepKey, config) → stepResult
├── evaluateCondition(expression, context) → boolean
├── resolveDataMapping(template, context) → resolved
└── handleError(executionId, stepKey, error) → void
```

- Sequential step execution following edge connections
- Context object passed between steps (accumulates outputs)
- Conditional branching based on If/Else node config
- Timeout per step (configurable, default 30s)
- Error handling: retry, skip, abort options
- Execution status updates via WebSocket or polling

#### 3.2 Built-In Executors
At minimum, implement these executors:

| Executor | What It Does |
|---|---|
| `manual-trigger` | Starts execution, passes trigger data to context |
| `http-request` | Makes HTTP call, returns response |
| `transform-data` | Applies JSONPath/expression transforms |
| `if-else` | Evaluates condition, routes to true/false branch |
| `delay` | Waits configured duration |
| `log-message` | Writes to execution log |
| `approval-gate` | Creates approval request, pauses until approved/rejected |

#### 3.3 Live Execution Monitor Panel
Replace the static Debug Console with a real-time execution viewer:

- Split view: canvas (top) + execution log (bottom, resizable)
- Canvas highlights currently executing node (animated border)
- Completed nodes show green check, failed show red X
- Log panel: timestamped entries, step name, duration, input/output JSON
- Auto-scroll to latest, with pause button
- Filter by step, by log level (info/warn/error)
- Execution timeline: horizontal bar showing step durations

#### 3.4 Execution History
- List of past executions per workflow
- Click to replay: see logged data at each step
- Compare two execution runs side-by-side
- Export execution log as JSON/CSV

### Files to Create
- `server/sandbox-wf/executor.ts` — execution engine
- `server/sandbox-wf/executors/` — individual step executors
- `client/src/components/automation/ExecutionMonitor.tsx`
- `client/src/components/automation/ExecutionTimeline.tsx`

### Files to Modify
- `server/sandbox-wf/router.ts` — add execute endpoint with real engine
- `server/sandbox-wf/service.ts` — execution log helpers
- `client/src/pages/automation/WFCreationShell.tsx` — integrate monitor
- `client/src/pages/automation/SandboxWFPage.tsx` — execution history tab

### Acceptance Criteria
- [ ] Click "Run" on a workflow → steps execute sequentially
- [ ] Each step writes logs with timestamps
- [ ] Canvas highlights current step during execution
- [ ] Execution log shows real-time updates
- [ ] Failed steps show error details
- [ ] HTTP Request executor makes real HTTP calls
- [ ] If/Else branching works based on condition

---

## Phase 4: Data Flow Visualization (Priority: HIGH)

### Problem
Edges between nodes are purely visual (animated arrows). They don't represent data flow — there's no indication of what data passes between nodes, no data preview, no schema validation.

### Solution
Make edges data-aware with visual indicators and inline preview.

### Tasks

#### 4.1 Edge Data Labels
- Show small label on each edge: data type/count (e.g., "1 item", "array[5]", "object")
- Color edges by data state: grey (no data), blue (data flowing), green (complete), red (error)
- Edge thickness proportional to data volume (optional)

#### 4.2 Edge Click Preview
- Click an edge → popup showing last data that flowed through
- JSON tree view with collapse/expand
- Copy button for data
- Timestamp of last execution

#### 4.3 Data Flow Animation During Execution
- During live execution: animated dots flowing along edges
- Dot color matches data type
- Speed proportional to data size
- Pause at each node for processing

#### 4.4 Schema Validation on Connect
- When connecting two nodes: validate output schema → input schema compatibility
- Show warning if types don't match
- Suggest auto-transform if possible (string → number, etc.)
- Prevent connection if fundamentally incompatible

### Files to Create
- `client/src/components/automation/EdgeDataLabel.tsx`
- `client/src/components/automation/DataPreviewPopup.tsx`

### Files to Modify
- `client/src/pages/automation/WFCreationShell.tsx` — custom edge types, edge rendering

### Acceptance Criteria
- [ ] Edges show data type labels after execution
- [ ] Clicking an edge shows data preview
- [ ] During execution, edges animate to show data flow
- [ ] Schema mismatch shows warning on connection

---

## Phase 5: Platform Features (Priority: MEDIUM)

### Problem
Several platform-level features from the AppDescription/AppDesign Blueprint are missing entirely: versioning, templates, keyboard shortcuts, error handling UX, and trigger management.

### Tasks

#### 5.1 Workflow Versioning
- Each save creates a version (v1, v2, v3...)
- Version history panel: list all versions with timestamps
- Diff viewer: side-by-side comparison of two versions
- Rollback: restore any previous version
- Auto-save drafts every 60s

**DB changes:** Add `version` column to `wf_workflows`, create `wf_workflow_versions` table.

#### 5.2 Workflow Templates
- Template gallery: 10+ pre-built workflow templates
- Categories: Approval, Data Pipeline, AI Processing, Integration, Governance
- "Use Template" button → creates new workflow pre-populated
- "Save as Template" → save current workflow as reusable template
- Template preview with description and node count

**Templates to create:**
1. Simple Approval (3 steps: request → approve/reject → notify)
2. Data ETL Pipeline (extract → transform → validate → load)
3. AI Document Processing (upload → extract → classify → store)
4. Multi-Approver Chain (request → L1 approve → L2 approve → execute)
5. Webhook Handler (receive → validate → process → respond)
6. Scheduled Report (cron → query → format → email)
7. Error Recovery (try → catch → retry/alert → escalate)
8. Integration Sync (poll → compare → update → log)
9. Policy Compliance Check (gather → evaluate → score → report)
10. Human-in-the-Loop AI (AI suggest → human review → approve/modify → apply)

#### 5.3 Keyboard Shortcuts
| Shortcut | Action |
|---|---|
| `Ctrl+S` | Save workflow |
| `Ctrl+Z` / `Ctrl+Shift+Z` | Undo / Redo |
| `Delete` / `Backspace` | Delete selected node(s) |
| `Ctrl+D` | Duplicate selected node |
| `Ctrl+A` | Select all nodes |
| `Ctrl+Shift+N` | Add new node (opens palette) |
| `Space` | Toggle Form ↔ Designer mode |
| `Ctrl+Enter` | Run workflow |
| `Ctrl+Shift+L` | Toggle execution log |
| `Escape` | Deselect / Close panel |

#### 5.4 Trigger Management UI
- Dedicated trigger configuration panel
- List all triggers for current workflow
- Create/edit/delete triggers with type-specific forms:
  - Manual: button label, confirmation
  - Schedule: cron builder with visual calendar
  - Webhook: URL display, secret key, payload schema
  - Event: event source, filter expression
- Enable/disable triggers without deleting
- Trigger test: fire trigger manually to test workflow

#### 5.5 Error Handling UX
- Toast notifications for save/execute success/failure
- Inline error banners with actionable messages
- Retry button on failed executions
- Error node highlighting with click-to-fix
- Undo support for destructive actions (delete node/workflow)
- Confirmation dialogs for delete operations
- Autosave indicator in status bar

#### 5.6 Collaboration Features (Future)
- WebSocket-based real-time cursor sharing
- CRDT-based concurrent editing
- Comments on nodes
- @mentions in comments
- Activity log per workflow

*(Note: Collaboration is a major feature from the Blueprint. Marking as future — requires WebSocket infrastructure.)*

### Files to Create
- `client/src/components/automation/VersionHistory.tsx`
- `client/src/components/automation/TemplateGallery.tsx`
- `client/src/components/automation/TriggerConfig.tsx`
- `client/src/components/automation/KeyboardShortcuts.tsx`
- `server/sandbox-wf/templates.ts` — template definitions

### Files to Modify
- `drizzle/tables/wfdb.ts` — add version table, template table
- `server/sandbox-wf/service.ts` — version CRUD, template CRUD
- `server/sandbox-wf/router.ts` — version/template endpoints
- `client/src/pages/automation/WFCreationShell.tsx` — integrate all

### Acceptance Criteria
- [ ] Save creates version, version history visible
- [ ] 10 templates available in gallery
- [ ] Keyboard shortcuts functional
- [ ] Trigger CRUD with type-specific config forms
- [ ] Toast notifications for all actions
- [ ] Undo for node deletion

---

## Cross-Cutting: Design System Alignment

### Current Issues
1. **Inconsistent spacing** — some sections use `p-3`, others `p-4`, some `px-2 py-1`
2. **Font size variance** — mix of `text-xs`, `text-[10px]`, `text-sm` without clear hierarchy
3. **Color inconsistency** — hardcoded hex (`#60a5fa`, `#facc15`) vs Tailwind classes
4. **Dark mode gaps** — canvas background hardcoded `#0a0a0a`, should use theme token
5. **Mobile incomplete** — Designer canvas unusable on mobile, no touch gestures

### Fixes
- Standardize spacing: `p-3` for card content, `px-3 py-1.5` for sidebar items, `px-4` for main content
- Use Tailwind color classes everywhere (no hardcoded hex except for ReactFlow node borders)
- Canvas background: `bg-zinc-950 dark:bg-zinc-950` with theme-aware grid
- Add `@media (max-width: 768px)` rules for Designer: pinch-to-zoom, tap-to-select
- Status bar: consistent height `h-8` with `text-xs` only

---

## Implementation Priority Matrix

| Phase | Effort | Impact | Priority |
|---|---|---|---|
| Phase 1: Node Library | Medium (2-3 days) | Critical | **P0 — Do First** |
| Phase 2: Properties Panel | High (3-5 days) | Critical | **P0 — Do Second** |
| Phase 3: Execution Engine | High (5-7 days) | High | **P1** |
| Phase 4: Data Flow Viz | Medium (2-3 days) | High | **P1** |
| Phase 5: Platform Features | High (5-8 days) | Medium | **P2** |
| Design System Alignment | Low (1-2 days) | Medium | **P2** |

**Total estimated effort:** 18-28 days of focused development

---

## Blueprint Coverage Projection

| Feature Area | Current | After Plan | Blueprint Target |
|---|---|---|---|
| Workflow Builder (basic) | 30% | 80% | 100% |
| Decision Engine / Rules | 10% | 50% | 100% |
| Node Library | 5% | 70% | 100% |
| Execution Engine | 10% | 60% | 100% |
| Data Flow / Mapping | 0% | 40% | 100% |
| Trigger Management | 15% | 60% | 100% |
| Versioning | 0% | 70% | 100% |
| Templates | 0% | 60% | 100% |
| Infinite Canvas | 20% | 40% | 100% |
| Real-time Collaboration | 0% | 0% | 100% |
| Offline Execution | 0% | 0% | 100% |
| Governance | 15% | 40% | 100% |
| **Overall** | **~25%** | **~55%** | **100%** |

---

## Appendix: Current Strengths to Preserve

1. **Backend architecture** — WfDB pattern is clean and extensible
2. **Simple IBM Shell layout** — proven, responsive, consistent with rest of app
3. **tRPC type safety** — end-to-end typed, React Query caching
4. **ReactFlow foundation** — solid canvas with MiniMap, Controls, snap-to-grid
5. **Form ↔ Designer sync** — bidirectional state sync between modes
6. **Save-in-place pattern** — `savedId` state avoids navigation disruption
7. **Seed data** — 12 workflows across 6 categories with 76 steps provides good test data
