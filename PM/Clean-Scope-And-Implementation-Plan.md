# PM Module as a Governed Workspace App — Clean Scope & Implementation Plan

---

## 1. Strategic Positioning

### 1.1 Objective

Implement Project Management (PM) as a **standalone, governed workspace app** inside MyApp.

The goal is not to replicate OpenProject fully, but to adapt its core patterns into your:

- **Digital HQ** (control plane)
- **Workspace model** (execution domains)
- **Governance Center** (enforcement authority)
- **Humans + AI** participants architecture

---

### 1.2 Strategic Value

This is added value **if implemented correctly**.

#### Benefits

1. **Platform positioning**
   MyApp becomes a tool hub where workspaces activate governed apps.

2. **Governance consistency**
   PM becomes just another controlled module like Agents or LLMs.

3. **Monetization flexibility**
   PM can be tied to plans, tiers, org limits, or per-seat allocation.

4. **Architectural cleanliness**
   PM stays decoupled from core workspace logic.

---

### 1.3 Risks (Must Be Avoided)

PM becomes a burden if:

- There are multiple overlapping permission systems.
- UX differs from other modules.
- Permission checks are scattered across layers.
- PM directly references Agents/LLMs without contracts.
- Scope explodes into full OpenProject-level complexity too early.

---

## 2. Architectural Model

### 2.1 Core Principle

PM is a **Workspace App**, not a workspace feature hardcoded into the core.

It must follow the same structural model as:

- Agents
- LLMs
- Future tools (Docs, CRM, Tickets, etc.)

---

### 2.2 Concept Mapping (OpenProject → MyApp)

| OpenProject Concept | MyApp Equivalent |
|---|---|
| Project | Workspace |
| Work Package | Work Item |
| Modules per project | Workspace Apps (feature toggle) |
| Roles & permissions | Global capabilities + workspace role |
| Activity log | Audit + timeline stream |
| Views (table/board) | Saved views |

**We copy the pattern — not the product.**

---

## 3. Permission & Gating Model (Single Source of Truth)

### 3.1 Global Capabilities

Admin-level allocation:

- `pm:use`
- `pm:configure`

Optional future:

- `pm:export`
- `pm:integrations`

**No PM-specific role system beyond this.**

---

### 3.2 Workspace-Level Enablement

Table:

```
workspace_features
  - workspace_id
  - feature_key = "pm"
  - state = enabled | disabled
  - enabled_by
  - enabled_at
```

---

### 3.3 Final Access Gate

A user can use PM inside a workspace **only if**:

1. User has `pm:use`
2. Workspace has `pm` enabled
3. User is workspace member
4. Governance freeze does not block writes

**This logic must exist in a single middleware/guard layer.**

---

## 4. Governance Integration (Non-Bypassable)

PM must:

- **Never** grant its own power.
- **Always** read freeze state from Governance Center.
- **Emit evidence** for sensitive writes.
- **Respect** `OK` / `Warn` / `Frozen` modes.

**Governance remains centralized.**

---

## 5. Functional Scope (Phase 1 Only)

**Do NOT implement full OpenProject scope initially.**

### 5.1 Core Scope (V1)

1. **Work Items**
   - Types: `Task`, `Bug`, `Story`, `Decision`, `Risk`, `Approval`
   - Status
   - Priority
   - Assignee (human or agent)
   - Due date
   - Labels

2. **Relations**
   - Parent / child
   - Blocks / blocked-by

3. **Comments**
   - Threaded
   - Activity stream

4. **Saved Views**
   - Filters
   - Columns
   - Sorting

5. **Board View (Kanban)**

6. **Basic Reporting**
   - Status distribution
   - Overdue items
   - Assigned items

---

### 5.2 Delayed Scope (Future Apps or V2)

- Gantt
- Time tracking
- Cost management
- Meetings
- Wiki
- Budget tracking
- Advanced workflow engines

These can later become **independent workspace apps**.

---

## 6. Data Architecture

All PM data must be **workspace-scoped**.

Core tables:

```
pm_work_items     (workspace_id, ...)
pm_comments       (workspace_id, ...)
pm_relations      (workspace_id, ...)
pm_saved_views    (workspace_id, ...)
pm_projects       (optional, if multi-project per workspace)
```

**No cross-workspace access.**

---

## 7. Humans + AI Participants (Differentiator)

Enhancements beyond OpenProject:

- **Assignee** can be human OR agent
- Agent execution requires **capability token**
- Work items may contain:
  - Agent Plan
  - Agent Output
  - Evidence reference
- Agent actions are **auditable**

**This is a platform advantage.**

---

## 8. UX Integration Model

### 8.1 Navigation

```
Digital HQ
  → Workspace
    → Apps Panel
      → If PM enabled:   Show PM entry (Table / Board)
      → If PM disabled:  Show "Enable PM" (only for pm:configure)
```

- Consistent IBM-style sidebar.
- **No separate "PM world".**

---

## 9. Technical Architecture Pattern

Copy the **shape** of OpenProject's runtime separation (not the stack).

PM module must include:

- **PM API layer**
- **Background workers** (notifications, recalculation)
- **Postgres storage** (workspace-scoped)
- **Optional cache layer**
- **Clear separation** between:
  - Web handlers
  - Background jobs

---

## 10. Implementation Phases

### Phase 0 — Workspace App Framework (Reusable)

- `tool_registry` table
- `workspace_features` table
- Capability middleware
- UI "Apps" container

**PM becomes the first registered tool.**

---

### Phase 1 — Enablement Layer

- Admin capability allocation
- Workspace feature toggle
- Unified middleware guard

---

### Phase 2 — Core PM Engine

- Work items CRUD
- Comments
- Activity stream
- Basic filters

---

### Phase 3 — Views

- Saved table views
- Board view

---

### Phase 4 — Governance Modes

- `OK` → full access
- `Warn` → warning state
- `Frozen` → write blocked

---

### Phase 5 — Enhancements

- Relations
- Advanced reporting
- Agent-specific extensions

---

## 11. Success Criteria

PM is successful if:

- It behaves like a governed workspace app.
- It uses the same permission model as other tools.
- It does not introduce a new role system.
- It does not break modular boundaries.
- It feels native to Digital HQ.
- It remains smaller than OpenProject V1.

---

## Final Position

**PM is added value if:**

- It follows the Workspace Apps pattern.
- Governance stays centralized.
- Scope is controlled.
- Permission model remains unified.

**It becomes a burden if:**

- You overbuild too early.
- You fragment permission logic.
- You allow UX inconsistency.
- You create tight coupling between modules.

---

## Next Steps

Ready to produce:

1. **Workspace Apps Framework specification** — tool registry schema + enablement flow + UI pattern + middleware guard
2. **PM Module v1 technical contract** — DB schema + API + guards
