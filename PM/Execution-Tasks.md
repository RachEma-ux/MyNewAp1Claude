# PM Module as a Governed Workspace App — Exhaustive Execution Task List

Structured so a team can execute without ambiguity.

---

## PHASE 0 — Workspace Apps Foundation

### 0.1 Tool Registry

#### Database

- [ ] Create `tool_registry` migration
- [ ] Define schema:
  - `id` (uuid)
  - `key` (unique)
  - `name`
  - `description`
  - `version`
  - `enabled_globally` (bool)
  - `metadata_json`
  - `created_at`
  - `updated_at`
- [ ] Add unique index on `key`
- [ ] Seed entry for `"pm"`

#### Backend

- [ ] Create `ToolRegistry` service
- [ ] Implement:
  - `getToolByKey()`
  - `listTools()`
  - `isToolGloballyEnabled()`

#### API

- [ ] `GET /tools`
- [ ] `GET /tools/:key`

#### Tests

- [ ] Migration test
- [ ] Tool lookup test
- [ ] Global enable/disable test

---

### 0.2 Workspace Feature Toggle System

#### Database

- [ ] Create `workspace_features` migration
  - `workspace_id`
  - `feature_key`
  - `state` (`enabled` | `disabled`)
  - `enabled_by`
  - `enabled_at`
  - `created_at`
- [ ] Unique constraint (`workspace_id`, `feature_key`)
- [ ] Index on `workspace_id`

#### Backend

- [ ] Create `WorkspaceFeature` service:
  - `enableFeature()`
  - `disableFeature()`
  - `isFeatureEnabled()`
  - `listWorkspaceFeatures()`

#### API

- [ ] `POST /workspaces/:id/features/:key/enable`
- [ ] `POST /workspaces/:id/features/:key/disable`
- [ ] `GET /workspaces/:id/features`

#### Permissions

- [ ] Require `pm:configure` for enable/disable
- [ ] Validate workspace membership

#### Tests

- [ ] Enable feature test
- [ ] Disable feature test
- [ ] Duplicate enable prevention test

---

### 0.3 Unified Permission Middleware

#### Middleware Responsibilities

- [ ] Check global capability
- [ ] Check workspace feature enabled
- [ ] Check workspace membership
- [ ] Check governance freeze state
- [ ] Support read vs write gating

#### Implementation

- [ ] Create `requireWorkspaceAppAccess(appKey, mode)` middleware
- [ ] Integrate with governance client
- [ ] Cache capability lookups (if Redis exists)

#### Tests

- [ ] Blocks if capability missing
- [ ] Blocks if feature disabled
- [ ] Blocks if not member
- [ ] Blocks writes when frozen
- [ ] Allows read when frozen (if policy says so)

---

### 0.4 Workspace Apps UI Container

#### Frontend

- [ ] Create `AppsPanel` component
- [ ] Fetch workspace features
- [ ] Conditional rendering of PM entry
- [ ] Show "Enable PM" button (only if `pm:configure`)
- [ ] Show governance banner

#### Tests

- [ ] PM hidden when not enabled
- [ ] PM visible when enabled
- [ ] Enable button gated properly

---

## PHASE 1 — PM Core Engine (MVP)

### 1.1 Database Schema

#### `pm_work_items`

- [ ] Migration
- [ ] Index on `workspace_id`
- [ ] Index on `status`
- [ ] Index on `assignee_id`
- [ ] Foreign key checks

#### `pm_comments`

- [ ] Migration
- [ ] Index on `work_item_id`
- [ ] Index on `workspace_id`

#### `pm_relations`

- [ ] Migration
- [ ] Index on `source_id`
- [ ] Index on `target_id`

#### `pm_saved_views`

- [ ] Migration
- [ ] Index on `workspace_id`

#### Tests

- [ ] Migration integrity test
- [ ] FK constraint validation

---

### 1.2 Work Item Service

#### CRUD Logic

- [ ] `createWorkItem()`
- [ ] `updateWorkItem()`
- [ ] `deleteWorkItem()`
- [ ] `getWorkItem()`
- [ ] `listWorkItems()`

#### Business Rules

- [ ] Validate type enum
- [ ] Validate assignee (human or agent)
- [ ] Enforce `workspace_id` scoping
- [ ] Enforce permission middleware

#### Tests

- [ ] Create valid work item
- [ ] Reject invalid type
- [ ] Reject cross-workspace access
- [ ] Permission blocked test

---

### 1.3 Comment Service

- [ ] `addComment()`
- [ ] `listComments()`
- [ ] Enforce workspace scoping
- [ ] Enforce permission

#### Tests

- [ ] Comment attached to correct workspace
- [ ] Permission blocked test

---

### 1.4 Activity Stream

- [ ] Emit activity event on:
  - create
  - update
  - status change
  - comment
- [ ] Persist in audit system or `pm_activity` table
- [ ] Link to governance evidence emitter

#### Tests

- [ ] Activity created per action
- [ ] Correct actor recorded

---

### 1.5 Filtering

- [ ] Server-side filtering:
  - `status`
  - `assignee`
  - `priority`
  - `due_date`
- [ ] Pagination support
- [ ] Sorting support

#### Tests

- [ ] Filter combinations
- [ ] Pagination accuracy

---

## PHASE 2 — Views & Board

### 2.1 Saved Views Engine

- [ ] Save view config (filters, columns, sort)
- [ ] Update view
- [ ] Delete view
- [ ] Default view logic
- [ ] Share within workspace

#### Tests

- [ ] View persists correctly
- [ ] View scoped per workspace

---

### 2.2 Kanban Board

#### Backend

- [ ] Group work items by status
- [ ] Status transition validation

#### Frontend

- [ ] Drag & drop implementation
- [ ] Status update call
- [ ] Optimistic UI update
- [ ] Error rollback

#### Tests

- [ ] Drag triggers status change
- [ ] Write blocked when frozen

---

### 2.3 Notifications

- [ ] Trigger on:
  - Assignee change
  - New comment
  - Status change
- [ ] Integrate with notification system
- [ ] Deduplicate events

#### Tests

- [ ] Correct notification recipients
- [ ] No duplicate notifications

---

## PHASE 3 — Governance Hardening

### 3.1 Freeze Write Gate

- [ ] Extend middleware
- [ ] Define policy:
  - `OK` → full access
  - `Warn` → log + allow
  - `Frozen` → block writes
- [ ] Unit tests per mode

---

### 3.2 Evidence Emission

- [ ] Emit structured evidence:
  - `actor`
  - `workspace`
  - `action`
  - `entity`
  - `timestamp`
  - `diff` (if applicable)
- [ ] Ensure async reliability
- [ ] Retry mechanism

#### Tests

- [ ] Evidence emitted on every mutation
- [ ] Failure handling test

---

### 3.3 Permission Request Flow

- [ ] Create request object schema
- [ ] `POST /governance/requests`
- [ ] UI fallback when blocked
- [ ] Link to governance workflow

#### Tests

- [ ] Request created correctly
- [ ] Blocked actions produce request option

---

## PHASE 4 — AI Integration

### 4.1 Agent Assignment

- [ ] Support `assignee_type` = `agent`
- [ ] Validate capability token
- [ ] Enforce governance for agent writes

---

### 4.2 Agent Execution Logging

- [ ] Record:
  - Action origin
  - Generated output
  - Evidence reference
- [ ] Ensure audit linkage

#### Tests

- [ ] Agent write blocked if no token
- [ ] Agent action logged correctly

---

## CROSS-CUTTING TASKS

### Security

- [ ] Validate all inputs
- [ ] Prevent ID enumeration
- [ ] Enforce workspace isolation
- [ ] Add rate limiting

### Performance

- [ ] Add DB indexes
- [ ] Query optimization
- [ ] Add caching layer where needed

### Documentation

- [ ] API documentation
- [ ] Architecture diagram
- [ ] Permission flow diagram
- [ ] Governance integration documentation

### QA

- [ ] Integration tests
- [ ] Permission matrix test
- [ ] Freeze mode simulation
- [ ] Multi-workspace isolation test

---

## FINAL ACCEPTANCE CHECKLIST

- [ ] PM appears only when enabled
- [ ] Permissions enforced everywhere
- [ ] Freeze blocks writes
- [ ] Evidence emitted for every mutation
- [ ] No cross-workspace access possible
- [ ] No new role system introduced
- [ ] No direct DB coupling to other modules
- [ ] Phase 1 usable internally
- [ ] Phase 3 enterprise-ready

---

**This is now an execution-grade task breakdown.**

**Next steps available:**

1. Convert into a Claude master execution prompt for a 3-agent coding team
2. Break into sprint planning format (2-week cycles with story points)
