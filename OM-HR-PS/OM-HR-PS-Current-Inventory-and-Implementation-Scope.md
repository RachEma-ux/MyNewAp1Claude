# OM–HR–PS Integration — Current Inventory and Implementation Scope

## Purpose of this document

This document serves as a **reference and job scope** for the future implementation of the **OM ↔ HR ↔ PS** operating model inside the app.

It clarifies:

- what the target model is
- what already exists in the app
- what exists but is currently owned by the wrong module
- what still needs to be created
- what the correct ownership boundaries are
- what the recommended build order should be

---

## Corrected model

### Key fact

- **OM = Organization Management**
- **OM does not exist yet as a real module**
- **Digital HQ is not OM**

This changes the inventory significantly.

### Target model

The target model is:

- **OM** = the real organizational structure
- **HR** = the people / workforce reality
- **PS** = project demand, assignment, and delivery

And the bridge between them is:

- **resource request**
- **resource assignment**

So the correct question is **not**:

> Does OM already exist somewhere under another name?

The correct question is:

> What already exists in the app that supports this model, what exists but is owned by the wrong module, and what still needs to be created?

---

## 1. What already exists in the app

### A. HR exists, and it is the strongest current pillar

HR is already the most mature module in the platform.

Its governance package states that it already includes:

- 15 backend sub-routers
- 41 frontend page components
- phases including:
  - directory
  - organization
  - staffing
  - recruiting
  - lifecycle
  - time & attendance
  - learning
  - performance
  - compensation
  - relations
  - engagement
  - compliance
  - analytics
  - talent

More importantly, HR navigation already contains several elements highly relevant to the OM ↔ HR ↔ PS model:

- Job Architecture & Role Definitions
- Organizational Structure
- Position Management
- Skills
- Certifications
- Time Tracking
- Leave
- Shifts
- Goals
- Performance Reviews
- Talent Reviews
- Directory / Employee Profile style surfaces

#### What this means

HR already provides a lot of the **people and workforce capability** side of the model.

However, it also currently contains some things that, in the target architecture, belong more properly to **OM**:

- organizational structure
- job architecture
- position management

So these capabilities already exist in the app, but they are **not yet owned by a separate OM module**.

---

### B. PM Central exists, and it is the best current base for PS

PM Central already exists as a real module.

Its current scope already includes:

- task tracking
- planning
- team coordination

Its navigation already includes:

- Portfolio & Projects
- Planning
- Execution
- Control & Risk
- Collaboration
- Reports & Analytics
- Methodology
- AI & Agent Engine

And concrete surfaces such as:

- Projects Dashboard
- Project Shells
- PM Inbox
- Templates
- Plans
- Idea Builder
- Execution Overview
- Risks
- Change Requests
- Team & Participants
- Reports
- Méthodes
- Agent Engine

#### What this means

PM Central already gives the app a real **project-system foundation**.

However, from what is currently surfaced, it is still mostly:

- planning
- execution
- reporting
- collaboration

It is **not yet** a fully explicit **project staffing / resource-demand / resource-assignment system**.

So **PS exists partially**, but the **staffing bridge layer is still missing**.

---

### C. Workspace exists as the execution environment

Workspace already exists as a governed execution environment with:

- purpose
- scoped participation
- Team and Crew
- capability resolution
- lifecycle
- shell visibility
- module/resource scoping
- audit/activity concepts

#### What this means

Workspace is already the right place where people and AI actually **do the work**.

But Workspace should **consume outputs from OM, HR, and PS**.
It should **not become the owner** of:

- organizational master data
- employee master data
- project staffing master data

So Workspace is **usable in the target model**, but it is **not the owner of the bridge**.

---

### D. AI Types exists as the AI-side staffing / capability source

The app already has an AI Types area with:

- Providers
- LLMs
- Models
- Agents
- Bots

#### What this means

For the **Crew** side, the app already has a governed source of AI participants and capabilities.

This strengthens the human/AI parallel model:

- **HR** can be the source for **Team**
- **AI Types** can be the source for **Crew**

---

### E. Digital HQ exists, but it is not OM

Digital HQ is present in the app and includes entries such as:

- Org Authority
- Roles
- Workspaces
- Agents
- Discover
- Notifications
- Risk Baselines
- Collaboration

However, Digital HQ is currently described as the **central dashboard and control-plane UI**, not as a full Organization Management module.

#### What this means

Digital HQ may later:

- host OM entry points
- link to OM surfaces
- expose OM summaries

But it should **not** be mistaken for OM itself.

So the correct reading is:

- **Digital HQ exists**
- **OM does not**

---

## 2. What exists but is currently in the wrong ownership bucket

This is the most important correction.

Several things needed for OM already exist functionally, but they currently appear under **HR**, not as a separate OM domain.

### These exist today, but are currently HR-owned or HR-hosted

- organizational structure
- job architecture / role definitions
- position management
- some staffing-related concepts
- employee profile / directory / capability surfaces

#### What this means

It is **not necessary to invent all of these concepts from zero**.

But it **is necessary** to decide whether to:

1. keep them in HR and accept that HR currently owns some org-structure concepts
2. gradually carve OM out as a distinct module and move ownership there

So the missing piece is **not** “the idea of org structure.”
The missing piece is:

> a true OM module with clear ownership boundaries

---

## 3. What still needs to be created

### A. OM as a real module

This is the biggest missing pillar.

A real **Organization Management** module is needed to own:

- org units
- jobs
- positions
- reporting relationships
- company entities
- cost centers
- organizational roles / authority chains
- vacancy / filled / frozen position states

This does **not** yet exist as a first-class module.

---

### B. The resource-request model

The target model depends on PM not “taking people directly.”

So the app needs a first-class object such as:

- `resource_request`

That should represent:

- project
- WBS / task / demand unit
- required role
- required skill
- required level
- allocation %
- time window
- budget constraint
- location / remote constraints
- approval status

From the currently exposed PM Central surfaces, there is **not yet** a dedicated project-staffing request flow.

PM Central exists, but this specific staffing-demand object still needs to be created.

---

### C. The resource-assignment model

This is the real bridge in the target model, and it still needs to be created explicitly.

A first-class object such as:

- `resource_assignment`

should link:

- employee_id (HR)
- position_id (OM)
- project_id (PS)
- WBS / task
- project_role
- function_id
- allocation %
- start / end dates
- approvals
- cost rate source
- utilization state

This is the **integration center** of the model, and it does not yet appear to exist as a first-class feature.

---

### D. Cross-module staffing approval workflow

The target workflow is:

- PM requests
- HR validates candidates / availability / skills
- OM-linked authority chain approves the loan into the project

That workflow still needs to be created.

Right now, the app has:

- HR
- PM Central
- Workspace
- Digital HQ
- Governance

But not yet a clearly visible, explicit **matrix staffing approval flow** built across them.

---

### E. Cross-linked staffing screens

The following app views will eventually be needed.

#### Position Detail
Should show:

- job
- org unit
- reporting line
- incumbent
- vacancy status
- active project allocations

#### Employee Profile
Should show:

- home position
- manager
- skills / certifications
- availability
- active assignments
- future conflicts
- utilization

#### Project Staffing
Should show:

- project role demand
- candidate search
- HR capability fit
- position / home manager
- approvals
- allocation
- conflicts

These exact cross-linked staffing views are **not yet present as an integrated trio**.

---

### F. Shared reference model

A governed shared-reference layer is still needed for things like:

- functions catalog
- skills catalog
- worker types
- approval statuses
- possibly job families / position classes

Some pieces already exist indirectly:

- HR already has skills and certifications
- PM Central already has methodology and planning structures

But the shared catalog layer still needs to be formalized if OM ↔ HR ↔ PS is to work cleanly.

---

### G. Project-scoped time / cost / utilization loop

This is another key gap.

HR already includes:

- Time Tracking
- Leave
- Overtime
- Shifts

But the target model needs **project execution feedback**, including:

- project timesheets / time entries
- project utilization
- assignment burn / workload
- cost flow back into project delivery
- feedback back into HR availability and performance

That loop is not yet clearly expressed as a full integrated **PS ↔ HR feedback system**.

---

## 4. Corrected inventory summary

### Already exists

- **HR module** — strong and broad
- **PM Central** — real but partial PS foundation
- **Workspace** — execution environment
- **AI Types** — AI capability / participant source
- **Digital HQ** — control-plane surface, but **not** OM

### Exists, but currently in HR rather than OM

- organizational structure
- job architecture
- position management
- some staffing-related structures

### Still needs to be created

- OM module
- resource request
- resource assignment
- cross-module staffing approval workflow
- cross-linked staffing screens
- shared reference catalogs
- project utilization / feedback loop

---

## 5. Strict Exists / Partial / Missing matrix

### Exists

| Domain / capability | State | What already exists | Priority |
|---|---|---|---|
| HR module | Exists | Broad HR foundation: directory, organization, staffing, recruiting, lifecycle, time & attendance, learning, performance, compensation, relations, engagement, compliance, analytics, talent | Keep / extend |
| PM Central | Exists | Real PM / project-system base: portfolio, planning, execution, control & risk, collaboration, reporting, methodology, AI/agent engine | Keep / extend |
| Workspace | Exists | Governed execution environment with Team/Crew, lifecycle, shell, visibility, participation, current-work framing | Keep / extend |
| AI Types | Exists | Governed source for Agents, Bots, Providers, LLMs, Models; usable as Crew-side participant/capability source | Keep / extend |

#### What this means

HR is already the strongest existing pillar, and PM Central is the best current base for the PS side.
Workspace and AI Types are already usable as the execution layer and AI participation source.

---

### Partial

| Domain / capability | State | What exists now | What is still missing | Priority |
|---|---|---|---|---|
| OM-related capabilities inside HR | Partial | Job Architecture, Organizational Structure, Position Management already exist in HR navigation | Proper ownership split into a dedicated OM module | High |
| PS as staffing/demand system | Partial | PM Central has projects, planning, execution, collaboration, reporting | Explicit project staffing, resource demand, resource assignment, utilization loop | High |
| Shared references | Partial | Skills, certifications, some role/position ideas exist indirectly in HR/PM | Formal shared catalogs: functions, approval statuses, worker types, job family taxonomy | Medium |
| Utilization / follow-up loop | Partial | HR time/attendance exists; PM Central execution/reporting exists | Closed loop between project demand, assignment, time, utilization, HR availability, performance feedback | High |

#### What this means

The app already has OM-like capabilities, but they are currently living under HR instead of a real OM module.
PM Central is real, but not yet a full project staffing system.

---

### Missing

| Domain / capability | State | What must be created | Priority |
|---|---|---|---|
| OM module | Missing | Real Organization Management module owning org units, jobs, positions, reporting relationships, company entities, cost centers, organizational roles | Critical |
| Resource request model | Missing | First-class project demand object linking project / WBS / role / skill / allocation / time window / budget | Critical |
| Resource assignment model | Missing | First-class bridge linking employee (HR), position (OM), project / WBS / role (PS), allocation, dates, approvals, cost source | Critical |
| Cross-module staffing workflow | Missing | PM request → HR validation → OM-chain approval → PS assignment | Critical |
| Cross-linked staffing screens | Missing | Position Detail, Employee Profile with project allocations, Project Staffing page with candidate search / conflicts / approvals | High |
| Formal matrix authority flow | Missing | Explicit approval chain derived from OM structure, not implied by PM or HR alone | High |

#### What this means

This is the real gap:

> the bridge layer does not exist yet.

That is what will turn the app from several strong modules into one enterprise operating model.

---

## 6. Correct ownership map

| Module | Owns |
|---|---|
| OM | org units, jobs, positions, reporting lines, company entities, cost centers, organizational roles |
| HR | employees, contracts, skills, certifications, calendars, availability, performance |
| PS / PM Central | portfolios, projects, WBS, project roles, project demand, assignments, execution, reporting |
| Workspace | execution context that consumes OM / HR / PS outputs |
| AI Types | AI-side capability / participant source for Crew |

---

## 7. Recommended build order

1. Create **OM** as a real module
2. Create **resource_request**
3. Create **resource_assignment**
4. Implement the **cross-module staffing approval flow**
5. Build **Position / Employee / Project Staffing** cross-linked views
6. Close the **utilization / time / cost / feedback loop**

---

## 8. Bottom line

### Exists
- HR
- PM Central
- Workspace
- AI Types

### Partial
- OM-like capabilities inside HR
- PS staffing depth
- shared references
- utilization loop

### Missing
- OM module
- resource request
- resource assignment
- staffing approval workflow
- cross-linked staffing views

That is the corrected foundation map.
