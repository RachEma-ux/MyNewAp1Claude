# PM Module as a Governed Workspace App — Architectural Guide

---

## 1. Purpose

Implement Project Management (PM) as a **standalone, governed Workspace App** inside MyApp.

**This is not about cloning OpenProject.**
It is about adapting its structural strengths (work items, views, per-project modules) into:

- **Digital HQ** (control plane)
- **Workspaces** (execution domains)
- **Governance Center** (non-bypassable authority)
- **Humans + AI** participant model

PM must feel native to the platform while remaining **strictly modular**.

---

## 2. Strategic Positioning

PM is added value **only if implemented with hard boundaries**.

### Why It Adds Value

- Positions MyApp as a **tool hub platform**
- Strengthens governance consistency across modules
- Enables monetization / tier control
- Prevents long-term coupling inside workspace core
- Establishes reusable **Workspace App architecture**

### When It Becomes a Burden

- Permission model fragmentation
- UX inconsistency with other modules
- Cross-module data coupling
- Overbuilding OpenProject-level complexity too early
- Allowing PM to define its own role system

**This document prevents those failures.**

---

## 3. Core Architectural Principles

### 3.1 Hard Module Boundaries

PM must:

- Live in its own service/module
- Have its own API layer
- Have its own background workers
- Have its own DB tables (workspace-scoped)
- **Never directly access other module tables**

Cross-module interaction must happen via **contracts** (API/service calls).

---

### 3.2 Workspace App Model

PM is not embedded inside workspace logic.

It is:

- **Registered** as a Workspace App
- **Enabled/disabled** per workspace
- **Governed** by centralized capability + freeze enforcement

PM is the **first consumer** of the Workspace Apps framework.

---

### 3.3 Unified Permission Model (Single Source of Truth)

**No PM-specific role system.**

Access is granted only if:

1. User has global capability `pm:use`
2. Workspace feature `pm` is enabled
3. User is workspace member
4. Governance state allows action

Optional capability:

- `pm:configure` (for enabling/disabling PM per workspace)

**No additional permission layers** unless absolutely required.

All checks must pass through **one unified middleware**.

---

### 3.4 Governance Is Non-Bypassable

PM must:

- Respect freeze state (`OK` / `Warn` / `Frozen`)
- Block writes when frozen
- Emit evidence for all sensitive actions
- Never self-approve elevated operations

**Governance Center remains the authority.**

---

## 4. Concept Mapping (Adapted from OpenProject)

We copy **patterns** — not the product.

| OpenProject | MyApp |
|---|---|
| Project | Workspace |
| Work Package | Work Item |
| Modules | Workspace Apps |
| Roles | Global capabilities + workspace role |
| Activity log | Audit + timeline stream |
| Views | Saved views |

**We adopt:**

- Work items as center of gravity
- Relations (parent/child, blocks)
- Activity timeline
- Saved views
- Per-workspace module enablement

**We delay:**

- Full Gantt engine
- Cost tracking
- Meeting systems
- Advanced workflow engines

Those can later become separate Workspace Apps.

---

## 5. Functional Scope (Phase 1 — Controlled)

PM v1 must remain **narrow**.

### 5.1 Work Items

- Types: `Task`, `Bug`, `Story`, `Decision`, `Risk`, `Approval`
- Status
- Priority
- Assignee (human or agent)
- Due date
- Labels

### 5.2 Relations

- Parent / child
- Blocks / blocked-by

### 5.3 Collaboration

- Threaded comments
- Activity stream (system + user events)

### 5.4 Views

- Saved table views
- Filters
- Column configuration
- Sorting

### 5.5 Board

- Kanban board view

**That is enough for V1.**

---

## 6. Humans + AI Integration (Platform Differentiator)

PM must support:

- **Assignee = human OR agent**
- Agent actions require **capability token** (not role)
- Agent-generated output attached to work items
- Evidence linkage
- Full audit trace of agent activity

**This is where MyApp exceeds traditional PM tools.**

---

## 7. Data Architecture

All PM tables must be **workspace-scoped**.

Example structure:

```
pm_work_items    (workspace_id, ...)
pm_comments      (workspace_id, ...)
pm_relations     (workspace_id, ...)
pm_saved_views   (workspace_id, ...)
```

- No cross-workspace leakage.
- `workspace_id` is **mandatory** in every table.

---

## 8. UX Integration (IBM-Style Consistency)

Navigation pattern:

```
Digital HQ
  → Workspace
    → Apps
      → If PM enabled:   Show PM entry (Table / Board)
      → If not enabled:  Show "Enable PM" (only visible to users with pm:configure)
```

UI must reuse:

- Standard App Shell
- Governance banner
- Permission indicators
- Consistent sidebar behavior

**PM must not feel like a foreign app.**

---

## 9. Technical Runtime Pattern

Adopt runtime separation similar to mature systems:

- **PM API layer**
- **Background workers** (notifications, recalculation, indexing)
- **Postgres storage** (workspace-scoped)
- **Optional cache layer**
- **Clear separation** of web vs jobs

This ensures scalability without overengineering.

---

## 10. Implementation Phases

### Phase 0 — Workspace Apps Foundation

- Tool registry abstraction
- `workspace_features` table
- Unified permission middleware
- UI "Apps" container

**PM becomes first registered app.**

---

### Phase 1 — PM Core Engine

- Work item CRUD
- Comments
- Activity stream
- Basic permission checks

**Deployable MVP.**

---

### Phase 2 — Views & Board

- Saved views
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

PM is **added value** when:

- It strengthens the platform model
- It reinforces governance
- It follows Workspace App abstraction
- It remains controlled in scope

It becomes a **burden** only if we violate boundaries.

**This document is the architectural guide for implementation at our current phase.**
