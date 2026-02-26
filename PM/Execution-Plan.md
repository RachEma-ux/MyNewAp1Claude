# PM Module as a Governed Workspace App — Execution Plan

No philosophy. No repetition. Only execution structure.

---

## Phase 0 — Workspace Apps Foundation (Mandatory Before PM)

**PM cannot start until this exists.**

### 0.1 Create Tool Registry

**Deliverables:**

- `tool_registry` table
  - `id`
  - `key` (e.g. `"pm"`)
  - `name`
  - `description`
  - `version`
  - `enabled_globally` (bool)
  - `metadata_json`
- Seed entry for `"pm"`

**Purpose:** Central source of truth for all workspace apps.

---

### 0.2 Create Workspace Feature Toggle System

**Deliverables:**

- `workspace_features` table
  - `workspace_id`
  - `feature_key`
  - `state` (`enabled` | `disabled`)
  - `enabled_by`
  - `enabled_at`
- Unique constraint (`workspace_id` + `feature_key`)

---

### 0.3 Implement Unified Permission Middleware

Create a single guard layer:

**Checks:**

1. Global capability (`pm:use`)
2. Workspace feature enabled
3. Workspace membership
4. Governance freeze state

This middleware must:

- Be reusable for future apps
- Block at API layer (not UI only)
- Support read vs write gating

---

### 0.4 Build Workspace "Apps" UI Container

**Deliver:**

- Apps panel inside workspace
- Conditional rendering:
  - Show PM if enabled
  - Show "Enable PM" if user has `pm:configure`
- Governance banner integration

**After Phase 0:** Workspace Apps framework is live. PM is only a registry entry.

---

## Phase 1 — PM Core Engine (MVP)

**Goal:** Internal usable version.

### 1.1 Database Schema (Workspace-Scoped)

**Create tables:**

**`pm_work_items`**
- `id`
- `workspace_id`
- `type`
- `title`
- `description`
- `status`
- `priority`
- `assignee_type` (`human` | `agent`)
- `assignee_id`
- `due_date`
- `created_by`
- `created_at`
- `updated_at`

**`pm_comments`**
- `id`
- `workspace_id`
- `work_item_id`
- `author_type`
- `author_id`
- `content`
- `created_at`

**`pm_relations`**
- `id`
- `workspace_id`
- `source_id`
- `target_id`
- `relation_type`

**`pm_saved_views`**
- `id`
- `workspace_id`
- `name`
- `config_json`
- `owner_id`

All tables require `workspace_id` index.

---

### 1.2 PM API Layer

**Implement endpoints:**

**Work Items:**
- `POST   /pm/work-items`
- `GET    /pm/work-items`
- `GET    /pm/work-items/:id`
- `PATCH  /pm/work-items/:id`
- `DELETE /pm/work-items/:id`

**Comments:**
- `POST   /pm/work-items/:id/comments`
- `GET    /pm/work-items/:id/comments`

**Views:**
- `POST   /pm/views`
- `GET    /pm/views`
- `PATCH  /pm/views/:id`
- `DELETE /pm/views/:id`

**All endpoints must pass through unified middleware.**

---

### 1.3 Activity Stream

**Implement:**

- Event emission on:
  - create
  - update
  - status change
  - comment
- Store events in existing audit system or `pm_activity` table.

---

### 1.4 Basic Filters

**Implement server-side filtering:**

- `status`
- `assignee`
- `priority`
- `due_date`

---

**Deliverable:** Internal PM MVP usable in enabled workspaces.

---

## Phase 2 — Views & Board

### 2.1 Saved Views Engine

- Persist table config (columns, filters, sort)
- Load per workspace
- Support default view

---

### 2.2 Kanban Board

- Column = status
- Drag & drop
- Status change triggers:
  - Permission check
  - Governance check
  - Evidence emission

---

### 2.3 Notifications (Basic)

**Trigger on:**

- Assignee change
- Comment added
- Status change

Use existing notification infrastructure.

---

**Deliverable:** PM becomes collaborative tool.

---

## Phase 3 — Governance Hardening

### 3.1 Freeze Write Gate

**Extend middleware:**

- If governance state = `Frozen`:
  - Block all write operations
  - Allow reads
- If `Warn`:
  - Allow but log

---

### 3.2 Evidence Emission

**For each mutation:**

- Emit evidence record:
  - `actor`
  - `workspace`
  - `action`
  - `entity`
  - `timestamp`
- Send to Governance Center service.

---

### 3.3 Permission Request Flow

**When blocked:**

- Provide "Request permission" action
- Send structured request to Governance Center

---

**Deliverable:** Enterprise-grade governance enforcement.

---

## Phase 4 — AI Integration Hardening

### 4.1 Agent Assignment Support

- `assignee_type` = `agent`
- Validate capability token
- Record agent execution trace

---

### 4.2 Agent Action Logging

**When agent modifies work item:**

- Record action origin
- Store output
- Link evidence

---

**Deliverable:** Human + AI co-execution model.

---

## Phase 5 — Optional Expansion (Only After Validation)

**Do NOT implement unless validated:**

- Gantt
- Time tracking
- Cost tracking
- Meetings
- Docs integration
- Advanced workflow engine

Each as separate Workspace App if possible.

---

## Enforcement Rules (Must Be Respected During Execution)

- **No** additional permission system
- **No** direct cross-module DB access
- **No** bypassing unified middleware
- **No** feature creep before Phase 3 complete
- **No** separate PM role engine

---

## Definition of Done (Per Phase)

### Phase 0 Done When:

- Tool registry exists
- Workspace feature toggle works
- Middleware blocks correctly

### Phase 1 Done When:

- Work items fully CRUD
- Permissions enforced
- Activity logged

### Phase 2 Done When:

- Board functional
- Views persistent

### Phase 3 Done When:

- Freeze fully enforced
- Evidence emitted
- Permission requests wired

### Phase 4 Done When:

- Agents can operate safely
- All actions auditable

---

## Final Execution Order

1. Build Workspace Apps framework.
2. Implement PM MVP (CRUD + comments).
3. Add board + saved views.
4. Enforce governance hardening.
5. Add AI support.
6. Evaluate before expanding scope.

---

**This is now an actionable execution plan.**

**Next steps available:**

1. Claude team execution master prompt
2. Task breakdown mapped to exact repo structure (Node/TS + Postgres)
