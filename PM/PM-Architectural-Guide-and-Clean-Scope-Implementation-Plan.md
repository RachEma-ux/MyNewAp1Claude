# PM Architectural Guide + Clean Scope & Implementation Plan

## PM Module as a Governed Workspace App

---

## 1. Purpose & Strategic Positioning

### 1.1 Objective

Implement Project Management (PM) as a **standalone, governed Workspace App** inside MyApp.

**This is not about cloning OpenProject.**
It is about adapting its structural strengths (work items, views, per-project modules) into:

- **Digital HQ** (control plane)
- **Workspaces** (execution domains)
- **Governance Center** (non-bypassable authority)
- **Humans + AI** participant architecture

PM must feel native to the platform while remaining **strictly modular**.

---

### 1.2 Strategic Value

PM is added value **only if implemented with hard boundaries**.

#### Benefits

1. **Platform Positioning**
   MyApp becomes a hub where workspaces activate governed apps.

2. **Governance Consistency**
   PM becomes another controlled module like Agents or LLMs.

3. **Monetization Flexibility**
   PM can be tied to plans, tiers, org limits, or per-seat allocation.

4. **Architectural Cleanliness**
   PM stays decoupled from core workspace logic.

5. **Reusable Foundation**
   Establishes a generic Workspace Apps framework for future tools (Docs, CRM, Tickets, etc.).

---

### 1.3 Risks (Must Be Avoided)

PM becomes a burden if:

- Multiple overlapping permission systems emerge.
- UX differs from other modules.
- Permission checks are scattered across layers.
- PM directly references Agents/LLMs without contracts.
- Scope explodes into OpenProject-level complexity too early.
- PM defines its own internal role engine.

**This document prevents those failures.**

---

## 2. Core Architectural Model

### 2.1 Core Principle

PM is a **Workspace App**, not a workspace feature hardcoded into the core.

It must follow the same structural model as:

- Agents
- LLMs
- Future Workspace Apps

**PM is the first consumer of the Workspace Apps framework.**

---

### 2.2 Concept Mapping (OpenProject → MyApp)

**We copy the pattern — not the product.**

| OpenProject | MyApp Equivalent |
|---|---|
| Project | Workspace |
| Work Package | Work Item |
| Modules per project | Workspace Apps (feature toggle) |
| Roles & permissions | Global capabilities + workspace role |
| Activity log | Audit + timeline stream |
| Views (table/board) | Saved views |

**We adopt:**

- Work items as center of gravity
- Relations (parent/child, blocks)
- Activity stream
- Saved views
- Per-workspace module enablement

**We delay:**

- Full Gantt engine
- Cost tracking
- Meetings / wiki
- Advanced workflow engines

Those may later become separate Workspace Apps.

---

## 3. Permission & Gating Model (Single Source of Truth)

### 3.1 Global Capabilities

Admin-level allocation:

- `pm:use`
- `pm:configure`

Optional future (strictly controlled):

- `pm:export`
- `pm:integrations`

**No PM-specific role system beyond this.**

---

### 3.2 Workspace-Level Enablement

```
workspace_features
  - workspace_id
  - feature_key = "pm"
  - state = enabled | disabled
  - enabled_by
  - enabled_at
```

PM is toggleable per workspace.

---

### 3.3 Final Access Gate

A user can use PM inside a workspace **only if**:

1. User has `pm:use`
2. Workspace has PM enabled
3. User is workspace member
4. Governance state allows the action (freeze-aware)

**All checks must pass through one unified middleware/guard layer.**

No scattered permission logic.

---

## 4. Governance Integration (Non-Bypassable)

PM must:

- **Never** grant its own authority
- **Always** read freeze state from Governance Center
- **Emit evidence** for sensitive writes
- **Respect** `OK` / `Warn` / `Frozen` modes
- **Block writes** when frozen
- **Never** self-approve elevated operations

**Governance remains centralized and authoritative.**

---

## 5. Functional Scope (Phase 1 — Controlled)

**Do NOT implement full OpenProject scope initially.**

### 5.1 Core Scope (V1)

**Work Items**
- Types: `Task`, `Bug`, `Story`, `Decision`, `Risk`, `Approval`
- Status
- Priority
- Assignee (human or agent)
- Due date
- Labels

**Relations**
- Parent / child
- Blocks / blocked-by

**Comments**
- Threaded
- Activity stream (user + system events)

**Saved Views**
- Filters
- Columns
- Sorting

**Board View**
- Kanban board

**Basic Reporting**
- Status distribution
- Overdue items
- Assigned items

**That is sufficient for V1.**

---

### 5.2 Delayed Scope (Future Apps or V2)

- Gantt
- Time tracking
- Cost management
- Meetings
- Wiki
- Budget tracking
- Advanced workflow engines

These may become separate Workspace Apps.

---

## 6. Humans + AI Integration (Platform Differentiator)

PM must support:

- **Assignee = human OR agent**
- Agent execution requires **capability token**
- Agent-generated output attached to work items
- **Agent Plan** / **Agent Output** sections
- Evidence linkage
- Full audit trace of agent actions

**This is where MyApp exceeds traditional PM tools.**

---

## 7. Data Architecture

All PM data must be **workspace-scoped**.

Core tables:

```
pm_work_items     (workspace_id, ...)
pm_comments       (workspace_id, ...)
pm_relations      (workspace_id, ...)
pm_saved_views    (workspace_id, ...)
pm_projects       (optional, multi-project per workspace)
```

Rules:

- `workspace_id` mandatory in every table
- No cross-workspace access
- No direct cross-module table references

---

## 8. UX Integration Model (IBM-Style Consistency)

### Navigation

```
Digital HQ
  → Workspace
    → Apps Panel
      → If PM enabled:   Show PM entry (Table / Board)
      → If PM disabled:  Show "Enable PM" (visible only to pm:configure)
```

PM must:

- Reuse standard App Shell
- Display governance banner
- Show permission indicators
- Follow consistent sidebar behavior

**No separate "PM world".**

---

## 9. Technical Runtime Pattern

Adopt runtime separation similar to mature systems:

- **PM API layer**
- **Background workers** (notifications, recalculation, evidence emission)
- **Postgres storage** (workspace-scoped)
- **Optional cache layer**
- **Clear separation** between:
  - Web handlers
  - Background jobs

This ensures scalability without overengineering.

---

## 10. Implementation Phases

### Phase 0 — Workspace Apps Foundation (Reusable)

- Tool registry abstraction
- `workspace_features` table
- Unified permission middleware
- UI "Apps" container

**PM becomes first registered tool.**

---

### Phase 1 — PM Core Engine (MVP)

- Work items CRUD
- Comments
- Activity stream
- Basic permission checks

**Deployable internal MVP.**

---

### Phase 2 — Views & Board

- Saved table views
- Kanban board
- Filtering system

---

### Phase 3 — Governance Hardening

- Freeze write-gate middleware
- Evidence emission
- Permission request flows

**Enterprise-ready state.**

---

### Phase 4 — Optional Expansion

- Gantt
- Time tracking
- Costs
- Meetings
- Docs (as separate Workspace Apps)

**Only after validation.**

---

## 11. Guardrails (Non-Negotiable)

- **No** duplicate permission systems
- **No** PM-specific role engine
- **No** direct cross-module table access
- **No** scope creep beyond Phase 1 prematurely
- **No** governance bypass
- **No** UI inconsistency
- **No** hidden privilege escalation

These rules protect long-term platform health.

---

## 12. Success Criteria

PM is successful if:

- It behaves like any other Workspace App
- It respects unified capability model
- Governance applies consistently
- It supports both humans and AI
- It remains modular and scalable
- It avoids OpenProject-level complexity in V1

---

## Final Position

**PM is added value when:**

- It strengthens the Workspace App model
- It reinforces governance
- It follows unified capability + feature toggle architecture
- It remains controlled in scope

**It becomes a burden only if boundaries are violated.**

**This document is the official architectural guide for implementing PM at our current platform phase.**
