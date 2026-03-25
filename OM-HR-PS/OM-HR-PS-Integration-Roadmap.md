# OM–HR–PS Integration Roadmap

## Objective

Build a coherent enterprise operating model in the app where:

- **OM** owns organizational structure
- **HR** owns people and workforce capability
- **PS / PM Central** owns project demand, assignment, and delivery
- **Workspace** consumes OM/HR/PS outputs as the execution environment
- **AI Types** provides the governed AI-side participant source for Crew

The central integration principle is:

```text
OM defines the structure
HR defines the people
PS defines the demand
Resource Request + Resource Assignment connect them
Workspace executes the work
```

---

## Guiding rules

1. One source of truth per object  
2. Do not duplicate master data across modules  
3. PM Central must request resources, not own employees  
4. HR must validate people and capability, not own project demand  
5. OM must own positions, jobs, reporting lines, entities, and authority chain  
6. Workspace consumes structure, people, demand, and assignments — it does not own them  
7. AI participation must stay parallel to human participation:
   - Team from HR
   - Crew from AI Types  
8. Build the bridge layer first-class:
   - `resource_request`
   - `resource_assignment`

---

## Current state summary

### Already exists
- HR module
- PM Central
- Workspace
- AI Types

### Exists but is in the wrong ownership bucket
- organizational structure inside HR
- job architecture inside HR
- position management inside HR

### Missing
- OM module
- resource request model
- resource assignment model
- staffing approval workflow
- cross-linked staffing views
- formal shared reference layer
- utilization / feedback loop

---

# Phase 1 — Freeze the operating model

## Goal
Lock the conceptual model before implementation spreads across modules.

## Deliverables
- official OM / HR / PS ownership doctrine
- module boundary statement
- bridge definition for:
  - resource request
  - resource assignment
- authority-chain rule:
  - PS requests
  - HR validates
  - OM authority approves
- Workspace consumption rule
- Team vs Crew interaction rule

## Key decisions to freeze
- OM is a real module, not Digital HQ
- HR may temporarily host OM-like capabilities, but OM owns them conceptually
- PM Central is the PS base
- resource assignment is the integration center
- Workspace is execution-only, not master-data ownership

## Exit criteria
- ownership map approved
- no ambiguity about who owns what
- no ambiguity about the bridge layer

---

# Phase 2 — Create the shared reference layer

## Goal
Establish the minimal shared catalogs used by OM, HR, and PS.

## Deliverables
- `skills_catalog`
- `functions_catalog`
- `worker_types`
- `approval_statuses`
- optional:
  - `job_families`
  - `position_classes`
  - `assignment_statuses`

## Why this phase comes early
Without shared references:
- HR skills do not map cleanly to PS demand
- OM structures do not connect cleanly to staffing logic
- approvals and function tracking drift across modules

## Exit criteria
- shared references defined
- naming aligned across modules
- reusable IDs/codes available for cross-module linking

---

# Phase 3 — Stabilize HR as the people backbone

## Goal
Keep HR as the authoritative people/capability module while preparing for OM separation.

## What stays owned by HR
- employees
- contracts
- worker classification
- skills
- certifications
- calendars
- availability
- performance
- employee status

## What must be marked as “future OM ownership”
- organizational structure
- job architecture
- position management

## Deliverables
- explicit HR ownership map
- employee master profile model
- availability model
- skill/certification model
- employee profile ready for cross-linking

## Exit criteria
- HR is cleanly defined as the people backbone
- workforce capability data is reusable by PS
- OM-owned concepts are identified and ready to move later

---

# Phase 4 — Create OM as a real module

## Goal
Introduce OM as a first-class module for organizational structure.

## OM must own
- org units
- jobs
- positions
- reporting relationships
- company entities
- cost centers
- organizational roles
- vacancy / filled / frozen / temporary states

## Initial deliverables
- OM module shell
- OM data model
- Position detail model
- Job detail model
- Org unit hierarchy model
- company entity model
- reporting chain model

## Transitional rule
During transition, some data may still be read from HR-hosted sources, but OM becomes the conceptual and eventual runtime owner.

## Exit criteria
- OM exists as a distinct module
- positions/jobs/org units are represented under OM
- authority chain can be derived from OM structure

---

# Phase 5 — Extend PM Central into true PS staffing demand

## Goal
Move PM Central beyond planning/execution into explicit project staffing demand.

## New PS-owned concepts
- project staffing demand
- project role demand
- skill demand
- allocation demand
- timing demand
- budget constraint for assignment
- staffing conflict view

## Deliverables
- `resource_request`
- project staffing requirement UI
- project role model connected to demand
- WBS/task-level staffing demand support
- staffing request submission flow

## Exit criteria
- PM Central can express staffing demand explicitly
- staffing demand is not hidden inside notes or generic planning fields

---

# Phase 6 — Build the bridge layer

## Goal
Create the actual cross-module bridge.

## Core objects
### `resource_request`
Should include:
- project_id
- wbs_id / task_id
- requested project role
- required skill
- required level
- allocation %
- time window
- location / remote rule
- budget limit
- requester
- status

### `resource_assignment`
Should include:
- employee_id
- position_id
- project_id
- wbs_id / task_id
- project_role_id
- function_id
- allocation %
- start date / end date
- approval status
- approving chain
- cost-rate source
- utilization state

## Why this phase is the center
This is where OM, HR, and PS become one operating model instead of three parallel modules.

## Exit criteria
- request exists
- assignment exists
- both can be linked end-to-end
- they are first-class records, not implicit joins

---

# Phase 7 — Build the matrix staffing workflow

## Goal
Implement the real staffing flow across modules.

## Target workflow
1. PS creates staffing demand  
2. HR matches candidates  
3. OM-derived authority approves  
4. PS creates assignment  
5. Workspace consumes assignment as execution reality

## Required workflow states
- requested
- under HR review
- candidate proposed
- pending authority approval
- approved
- assigned
- rejected
- released

## Deliverables
- staffing request review screen
- HR candidate matching screen
- OM approval step
- PS assignment confirmation
- conflict / overlap warnings

## Exit criteria
- no direct “PM grabs employee” flow remains
- approval chain is explicit
- staffing becomes transparent and auditable

---

# Phase 8 — Build the cross-linked views

## Goal
Make the model visible and usable in the UI.

## Required views

### Position Detail (OM)
Must show:
- job
- org unit
- reporting manager
- entity
- cost center
- incumbent employee
- vacancy status
- active project allocations

### Employee Profile (HR)
Must show:
- home position
- line manager
- skills/certifications
- availability
- active assignments
- future conflicts
- utilization
- performance evidence

### Project Staffing (PS / PM Central)
Must show:
- project demand
- WBS staffing demand
- candidate search from HR
- home position / home manager from OM
- allocation %
- approval chain
- conflict warnings
- current assignment status

## Exit criteria
- each module exposes the other two where relevant
- cross-linking feels native, not bolted on

---

# Phase 9 — Add time, cost, workload, and utilization loop

## Goal
Close the feedback loop between project execution and workforce reality.

## Deliverables
- project-linked time entries
- assignment-linked utilization
- project cost attribution from assignments
- availability reduction in HR based on active assignments
- actual vs planned workload
- performance/experience feedback back into HR

## Human side
- time estimate
- actual time
- workload %
- availability
- utilization
- conflict detection

## Crew / AI side
- execution workload
- token estimate / actual
- run count
- queue / concurrency
- model/provider dependency
- utilization

## Exit criteria
- staffing is not static
- execution changes future planning
- HR and PS are connected through real usage signals

---

# Phase 10 — Connect Workspace / Work Area consumption

## Goal
Make Workspace the execution layer that consumes OM/HR/PS outputs.

## Workspace should consume
- Team from HR-backed assignment resolution
- Crew from AI Types
- project context from PS
- structural context from OM
- current work and assignments
- workload and alerts
- resources and tools allowed for this execution context

## Workspace should not own
- employee master data
- position master data
- project staffing master data
- org hierarchy master data

## Deliverables
- Team sourced from HR / assignment layer
- Crew sourced from AI Types
- workspace current work sourced from PS
- participant context enriched from OM/HR/PS

## Exit criteria
- Workspace becomes the place where the operating model is executed
- but does not become the owner of the model itself

---

# Phase 11 — Governance and audit alignment

## Goal
Make the OM–HR–PS model governable and reviewable.

## Governance must cover
- ownership boundaries
- staffing requests
- staffing approvals
- assignment changes
- conflicts and overrides
- workload drift
- authority-chain exceptions
- audit trail for assignments and releases

## Deliverables
- governance pack for OM
- alignment updates for HR and PM Central governance docs
- audit model for requests/assignments
- periodic checks for:
  - orphan assignments
  - invalid approvals
  - assignment conflicts
  - overloaded staff
  - stale requests

## Exit criteria
- bridge layer is auditable
- matrix staffing decisions are explainable
- governance can review the model coherently

---

# Phase 12 — Hardening and rollout

## Goal
Move from structural implementation to operational adoption.

## Deliverables
- conflict-resolution workflow
- substitution logic
- escalation rules
- reporting pack
- rollout plan by module
- migration strategy for OM-like structures currently living in HR
- test coverage across OM ↔ HR ↔ PS ↔ Workspace

## Exit criteria
- model is operational
- modules are linked cleanly
- no ownership confusion remains
- assignment flow is real and stable

---

# Recommended implementation order

```text
1. Freeze operating model
2. Create shared references
3. Stabilize HR as people backbone
4. Create OM module
5. Extend PM Central into true PS staffing demand
6. Build resource request + resource assignment bridge
7. Build matrix staffing workflow
8. Build cross-linked views
9. Add time/cost/utilization loop
10. Connect Workspace consumption
11. Align governance and audit
12. Harden and roll out
```

---

# Priority map

## Critical
- OM module
- resource_request
- resource_assignment
- matrix staffing workflow

## High
- cross-linked staffing screens
- authority chain from OM
- utilization / feedback loop
- PM staffing depth

## Medium
- shared catalogs refinement
- job family / position class formalization
- advanced analytics / cost loop polish

---

# Final operating principle

```text
OM = structure
HR = people
PS = demand and delivery
Resource Request + Resource Assignment = bridge
Workspace = execution
AI Types = AI participation source
```

That is the roadmap baseline.
