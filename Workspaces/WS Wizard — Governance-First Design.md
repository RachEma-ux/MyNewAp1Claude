# WS Wizard — Governance-First Design

## Core idea

The wizard is not a simple creation form.

It is a governance intake and promotion flow.

It must help the system answer, in order:

1. Why should this workspace exist?
2. What is it organized around?
3. Who will participate?
4. How will work happen?
5. What is needed?
6. How should it be governed/configured?
7. Is it ready for review, publication, and activation?

So the wizard should feel like:

```
intake
→ configuration
→ review
→ promotion
```

not:

```
form
→ save
```

---

## 1. Wizard layout

### A. Top header

Always visible.

Contains:

- Workspace name or "New Workspace"
- Current status
  - draft
  - ready_for_review
  - under_review
  - approved
  - published
  - active
  - rejected
  - archived
- Phase label
  - Manager Phase
  - Admin Phase
  - Governance Phase
- optional:
  - owner
  - anchor summary
  - purpose summary

This header should immediately tell the user:

> where this workspace is in its lifecycle

---

### B. Left phase rail

This is the wizard progress structure.

It should group steps by phase, not just number.

**Manager Phase**

1. Identity
2. Purpose
3. Creation Basis / Anchor
4. Scope Details
5. Actors
6. Activities
7. Needs

**Admin Phase**

8. Configuration

**Governance Phase**

9. Review Packet
10. Promotion

Each step in the rail should show:

- step name
- completion state
- lock state if not allowed for current role
- warning marker if incomplete

So the left side answers:

> Where am I in the process?
> What is complete?
> What is blocked?

---

### C. Main form canvas

This is where the active step is edited.

Each step should have:

- step title
- short explanation
- form fields
- validation help
- "why this matters for governance" hint

This is important: the wizard should teach the user that the workspace is being prepared for governance, not just filled in.

---

### D. Right compliance panel

This is a key part of the design.

The right panel should show a live readiness view.

It should include:

- required fields completed / missing
- current blockers
- current warnings
- what this step contributes to governance
- readiness for next lifecycle state

Examples:

- "Purpose is missing"
- "Anchor is incomplete"
- "No Crew selected"
- "Configuration not defined"
- "Ready for review: no"

This panel is what makes the wizard feel governance-first.

---

### E. Footer actions

Consistent structure:

```
[ Previous ]   [ Save as Draft ]   [ Next ]
```

At all editable manager/admin steps:

- Previous
- Save as Draft
- Next

At the final admin step:

- Previous
- Save as Draft
- Save as Ready for Review

At governance promotion step:

- role-specific actions only:
  - Begin Review
  - Approve
  - Publish
  - Activate
  - Reject
  - Archive

No wrong-role executable CTAs.

---

## 2. Phase-by-phase step design

### Phase 1 — Manager Phase

This phase creates the intent-complete draft.

---

#### Step 1 — Identity

**Purpose of the step**

Define what this workspace is.

**Fields**

- Workspace name
- Description
- Workspace type
- optional icon / color / template bias

**Governance meaning**

Creates the identifiable object to govern.

**Readiness checks**

- name present
- owner known
- type valid

---

#### Step 2 — Purpose

**Purpose of the step**

Define why the workspace exists.

**Fields**

- Purpose type
  - goal
  - mission
  - project
  - research effort
  - operational function
  - team activity
- Purpose statement
- optional purpose reference

**Governance meaning**

Proves the workspace is not an empty shell.

**Readiness checks**

- purpose type selected
- purpose statement present

---

#### Step 3 — Creation Basis / Anchor

**Purpose of the step**

Define what the workspace is organized around.

**Choices**

- Per Project
- Per Employee Role
- Per HR Position
- Per Company Entity
- Per Activity
- Per Custom Factor
- Per App Module
- Per Function

**Governance meaning**

Defines structural scope and future policy interpretation.

**Readiness checks**

- anchor type selected

---

#### Step 4 — Scope Details

This step changes dynamically depending on Step 3.

**Examples**

- Per Project
  - project selector
  - project reference
  - project name if manual
- Per Employee Role
  - role selector
- Per HR Position
  - HR position selector
- Per Company Entity
  - entity selector
- Per Activity
  - activity type
  - operational area
- Per Custom Factor
  - custom label
  - custom value
  - explanation
- Per App Module
  - module selector
  - module preset rationale
- Per Function
  - function selector

**Governance meaning**

Makes the structural anchor reviewable and enforceable.

**Readiness checks**

- anchor-specific required fields completed

---

#### Step 5 — Actors

**Purpose of the step**

Define who participates.

**Sections**

- Team
  - owner
  - managers
  - members
  - viewers
  - optional future HR-linked participant assignment
- Crew
  - participant type
    - Agent
    - Bot
  - governed catalog-backed selector
  - crew role
  - optional note

**Governance meaning**

Defines the participation boundary.

**Readiness checks**

- owner/accountability exists
- participation model is valid
- Crew identity is structured, not free text

---

#### Step 6 — Activities

**Purpose of the step**

Define how work happens here.

**Fields**

- operating mode
- primary activity type
- optional secondary activity types
- execution style
- collaboration/automation emphasis
- optional workflow intensity

**Examples:**

- research
- delivery
- monitoring
- support
- analysis
- controlled operations

**Governance meaning**

Helps determine configuration and compliance expectations.

**Readiness checks**

- primary activity type defined

---

#### Step 7 — Needs

**Purpose of the step**

Define what users and agents need to succeed.

**Categories**

- permissions
- information
- tools
- agents
- resources
- visibility
- context

This should be declarative, not low-level admin configuration yet.

**Governance meaning**

This is the handoff between business intent and governed enablement.

**Readiness checks**

- all required need categories addressed
- no essential area left undefined

**Manager final action**

At this point:

- save draft
- status = `draft`
- appears in WS List

---

## 3. Phase 2 — Admin Phase

### Step 8 — Configuration

This is admin-only or admin-led.

**Purpose of the step**

Translate manager intent into enforceable workspace behavior.

**Sections**

- module enablement
- routing profile
- resource profile
- shell visibility configuration
- capability bundles
- participant access model
- publication constraints
- workspace behavior defaults

**Governance meaning**

This is where the workspace becomes policy-aware and reviewable.

**Readiness checks**

- valid module/resource combinations
- capability model valid
- shell visibility coherent
- no missing required controlled settings

**Final admin action**

- Save as Ready for Review
- status = `ready_for_review`

---

## 4. Phase 3 — Governance Phase

### Step 9 — Review Packet

This is not freeform editing anymore. It is a review summary.

**It must show**

- identity
- purpose
- anchor
- scope details
- team
- crew
- activities
- needs
- configuration
- open issues
- readiness state

**Right panel should show**

- review blockers
- warnings
- missing evidence
- invalid combinations
- publication risks

**Governance meaning**

Creates the reviewable workspace dossier.

---

### Step 10 — Promotion

This is lifecycle control, not form filling.

**Actions depending on status**

- Begin Review
- Approve
- Publish
- Activate
- Reject
- Archive
- Return to Draft (if supported)

**Important distinction**

Must preserve:

- approved ≠ published
- published ≠ active

So the UI should make those three states feel visibly different.

---

## 5. Lifecycle-aware wizard behavior

**Manager can do**

- create draft
- update draft
- resume draft
- stop at Step 7

**Admin can do**

- continue draft
- configure
- move to ready_for_review

**Governance can do**

- review
- approve
- publish
- activate
- reject
- archive

The wizard must not present wrong-role actions as executable.

---

## 6. Compliance panel logic

The right-side panel should behave like a live compliance checklist.

**Example sections**

- Required now
  - Purpose completed
  - Anchor completed
  - Team/Crew valid
  - Activities defined
  - Needs declared
- Required for review
  - configuration complete
  - modules valid
  - resource profile valid
  - shell visibility valid
  - capability model valid
- Required for publication
  - review approved
  - publication constraints satisfied
- Required for activation
  - published
  - executable config valid
  - active runtime allowed

This is one of the most important UX pieces.

---

## 7. Resume / draft behavior

The wizard must support:

- save as draft at any editable step
- reopen existing draft
- restore step values
- restore Team/Crew
- restore purpose/anchor/scope details
- update same draft, not create duplicates

This is mandatory if the wizard is to function as a governance intake flow.

---

## 8. What the wizard should feel like

It should feel like:

> defining a governed execution environment

not:

> filling a long form

So each step should answer one real governance question.

---

## 9. Best short design summary

```
WS Wizard
= a staged governance intake, configuration, review, and promotion flow

Manager Phase
→ define intent

Admin Phase
→ define governed enablement

Governance Phase
→ validate, publish, and activate
```

---

## 10. Final wizard structure

| Phase | Step | Main question |
|---|---|---|
| Manager | Identity | What is this workspace? |
| Manager | Purpose | Why does it exist? |
| Manager | Creation Basis / Anchor | What is it organized around? |
| Manager | Scope Details | What does that anchor specifically mean here? |
| Manager | Actors | Who will participate? |
| Manager | Activities | How will work happen? |
| Manager | Needs | What is needed to succeed? |
| Admin | Configuration | How should it be governed and configured? |
| Governance | Review Packet | Is this ready for review? |
| Governance | Promotion | Can it be approved, published, and activated? |
