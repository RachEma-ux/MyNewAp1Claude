# Workspace Wizard — Screen-by-Screen UI Specification

## 1. Objective

Design the Workspace Wizard as a **governance-first intake, configuration, review, and promotion flow**.

It must support:

- **Manager phase** → define intent and save as `draft`
- **Admin phase** → define governed configuration and save as `ready_for_review`
- **Governance phase** → review, approve, publish, activate, or reject/archive

It must never behave like a simple "create workspace" form.

---

## 2. Global Wizard Layout

Every wizard screen should use the same shell.

### A. Top Header
Always visible.

Contains:
- workspace title or `New Workspace`
- current lifecycle status
- current phase label
- owner / accountable actor if known
- progress summary

### B. Left Phase Rail
Grouped by phase:

#### Manager Phase
1. Identity
2. Purpose
3. Creation Basis / Anchor
4. Scope Details
5. Actors
6. Activities
7. Needs

#### Admin Phase
8. Configuration

#### Governance Phase
9. Review Packet
10. Promotion

Each step must show:
- current state
- complete / incomplete marker
- warning marker
- lock state if not executable for current role

### C. Main Form Canvas
The active step is shown here.

Each step must contain:
- step title
- short explanation
- form fields
- "why this matters for governance" note
- structured inputs only where possible

### D. Right Compliance Panel
Always visible on desktop, drawer on mobile.

Must show:
- readiness summary
- required items complete / missing
- blockers
- warnings
- next lifecycle readiness
- evidence/traceability hints

### E. Footer Actions
Standard footer layout:

`[ Previous ]   [ Save as Draft ]   [ Next ]`

Rules:
- **Save as Draft** appears on every editable step
- **Save as Draft** is always centered
- saving a draft never advances the wizard
- saving a draft never navigates away
- wrong-role actions must not appear as executable

---

## 3. Global UX Rules

### Rule 1 — Draft save is available everywhere
All editable manager/admin steps must support:
- create draft if first save
- update same draft on later saves
- no duplicate drafts
- success toast/message
- remain on current step

### Rule 2 — No loading blockers
No full-page:
- spinner
- skeleton
- `Loading...`

The wizard frame must render immediately.

### Rule 3 — Purpose and Anchor are separate
The wizard must distinguish:

- **Purpose** = why the workspace exists
- **Creation Basis / Anchor** = what the workspace is organized around

### Rule 4 — Role-aware phases
- Manager can complete Manager Phase only
- Admin can continue into Admin Phase
- Governance-only actions appear only to authorized roles
- Governance Phase must never be executable to the wrong user

---

## 4. Screen-by-Screen Specification

---

## Screen 1 — Identity

### Purpose
Define what this workspace is.

### Fields
- Workspace Name
- Description
- Workspace Type
- Optional icon / color / template bias

### Guidance text
Explain:
- this creates the identifiable object to be governed
- the name and description should make the workspace easy to review later

### Right Compliance Panel
Show:
- name present / missing
- owner/accountability status
- type selected / missing

### Footer
- Previous (disabled or placeholder)
- Save as Draft
- Next

### Output
Draft contains:
- `name`
- `description`
- `type`

---

## Screen 2 — Purpose

### Purpose
Define why the workspace exists.

### Fields
- Purpose Type
  - Goal
  - Mission
  - Project
  - Team Activity
  - Research Effort
  - Operational Function
- Purpose Statement
- Optional Purpose Reference

### Guidance text
Explain:
- purpose is the reason the workspace exists
- it is not the same as the structural anchor

### Right Compliance Panel
Show:
- purpose type selected / missing
- purpose statement present / missing

### Footer
- Previous
- Save as Draft
- Next

### Output
Draft contains:
- `purposeType`
- `purposeStatement`
- `purposeRef`

---

## Screen 3 — Creation Basis / Anchor

### Purpose
Define what the workspace is organized around.

### Field
Single-choice selector:
- Per Project
- Per Employee Role
- Per HR Position
- Per Company Entity
- Per Activity
- Per Custom Factor
- Per App Module
- Per Function

### Guidance text
Explain:
- this is the organizing anchor
- it is different from purpose

### Right Compliance Panel
Show:
- anchor selected / missing
- warning if the anchor type needs structured source data

### Footer
- Previous
- Save as Draft
- Next

### Output
Draft contains:
- `anchorType`

---

## Screen 4 — Scope Details

### Purpose
Capture anchor-specific details.

### Dynamic fields by anchor type

#### Per Project
- Project selector
- Project reference
- Optional project label

#### Per Employee Role
- Role selector from role catalog

#### Per HR Position
- HR position selector

#### Per Company Entity
- Entity selector

#### Per Activity
- Activity type
- Operational area

#### Per Custom Factor
- Custom label
- Custom value
- Explanation

#### Per App Module
- Module selector
- Optional module preset rationale

#### Per Function
- Function selector

### Guidance text
Explain:
- these details make the anchor reviewable and enforceable

### Right Compliance Panel
Show:
- required anchor-specific fields complete / missing

### Footer
- Previous
- Save as Draft
- Next

### Output
Draft contains:
- `anchorRef`
- `anchorLabel`
- `anchorMeta`

---

## Screen 5 — Actors

### Purpose
Define who participates in the workspace.

### Sections

#### Team (Humans)
Fields:
- owner
- managers
- members
- viewers
- optional invited roles

#### Crew (AI)
Fields:
1. Participant Type
   - Agent
   - Bot
2. Governed catalog-backed selector
3. Workspace Crew Role
4. Optional note

Crew entries must be structured, not free text.

### Guidance text
Explain:
- Team = human participation
- Crew = AI participation
- both are part of the participation boundary

### Right Compliance Panel
Show:
- accountable owner present / missing
- Team valid / incomplete
- Crew valid / incomplete

### Footer
- Previous
- Save as Draft
- Next

### Output
Draft contains:
- Team structure
- Crew structure

---

## Screen 6 — Activities

### Purpose
Define how work happens in this workspace.

### Fields
- Primary activity type
- Secondary activity types
- Operating mode
- Execution style
- Collaboration intensity
- Workflow / automation emphasis if relevant

Examples:
- research
- monitoring
- delivery
- support
- operations
- analysis

### Guidance text
Explain:
- this shapes how the workspace will later be configured and reviewed

### Right Compliance Panel
Show:
- primary activity defined / missing
- operating mode coherence

### Footer
- Previous
- Save as Draft
- Next

### Output
Draft contains:
- activities definition
- operating mode metadata

---

## Screen 7 — Needs

### Purpose
Define what users and agents need to succeed.

### Categories
Use structured sections for:
- Permissions
- Information
- Tools
- Agents
- Resources
- Visibility
- Context

This step should be declarative:
- manager expresses what is needed
- admin later turns it into governed configuration

### Guidance text
Explain:
- this is the final manager intent step
- this does not yet define final admin configuration

### Right Compliance Panel
Show:
- needs categories complete / missing
- warnings if a critical need is absent

### Footer
- Previous
- Save as Draft
- **Manager final state**:
  - no governance submit here for manager
  - manager completes draft here

### Output
Draft contains:
- structured needs profile

### Lifecycle result
Manager save leaves workspace in:
- `draft`

---

## Screen 8 — Configuration (Admin Phase)

### Purpose
Turn intent into governed enablement.

### Fields / sections
- Enabled Modules
- Routing Profile
- Resource Profile
- Capability Bundles
- Visibility Layer / Shell Config
- Publication constraints
- Runtime defaults
- Optional resource restrictions

### Guidance text
Explain:
- this is where admin defines how the workspace will actually behave under policy

### Right Compliance Panel
Show:
- module/resource validity
- capability coherence
- shell visibility coherence
- ready_for_review readiness

### Footer
- Previous
- Save as Draft
- **Save as Ready for Review**

### Output
Draft/workspace contains:
- configuration profile
- shell config
- resource profile
- capability model

### Lifecycle result
Admin action moves workspace to:
- `ready_for_review`

---

## Screen 9 — Review Packet (Governance Phase)

### Purpose
Display the governance-readable workspace dossier.

### Content sections
Read-only or governance-editable summary:
- Identity
- Purpose
- Anchor
- Scope Details
- Team
- Crew
- Activities
- Needs
- Configuration
- Open issues
- Readiness state

### Guidance text
Explain:
- this is the review packet used to decide whether the workspace can be approved, published, and activated

### Right Compliance Panel
Show:
- blockers
- warnings
- missing evidence
- invalid combinations
- publication readiness
- activation readiness

### Footer
Role-aware only:
- Previous
- Save as Draft (if still allowed in current status)
- Begin Review / Continue Review as appropriate

### Lifecycle result
Can move workspace to:
- `under_review`

---

## Screen 10 — Promotion

### Purpose
Governance-controlled lifecycle transitions.

### Actions
Depending on status and authority, show:
- Begin Review
- Approve
- Publish
- Activate
- Reject
- Archive
- Return to Draft (if supported)

### Important UI rule
Must visibly preserve:
- `approved` ≠ `published`
- `published` ≠ `active`

These must be separate actions/states, not one button.

### Right Compliance Panel
Show:
- current status
- what next transition is allowed
- what blockers remain
- what publication means
- what activation means

### Footer
Only render actions allowed for the current status and role.

### Lifecycle results
Possible transitions:
- `under_review` → `approved`
- `approved` → `published`
- `published` → `active`
- `under_review` → `rejected`
- `rejected` → `archived`

---

## 5. Draft / Resume Behavior

The wizard must support:
- save at any editable step
- reopen later
- restore all saved values
- update existing draft
- no duplicate draft creation

### Minimum restore scope
Must restore:
- Identity
- Purpose
- Anchor
- Scope Details
- Team
- Crew
- Activities
- Needs
- Configuration (if already set)

---

## 6. Role-Specific Visibility Rules

### Workspace Manager
Can do:
- Steps 1–7
- Save as Draft at any point

Cannot do:
- admin configuration
- governance promotion actions

### Administrator
Can do:
- continue from draft
- complete Configuration
- Save as Ready for Review
- perform later governance actions only if separately authorized

### Governance / Authorized reviewer
Can do:
- review packet evaluation
- review/promotion transitions

---

## 7. Compliance Panel Checklist Model

The right panel should use a checklist like this:

### Draft readiness
- Identity complete
- Purpose complete
- Anchor complete
- Team/Crew complete
- Activities complete
- Needs complete

### Ready-for-review readiness
- Configuration complete
- Module/resource combinations valid
- Capability model valid
- Shell visibility valid

### Publication readiness
- Approved
- Publication constraints satisfied

### Activation readiness
- Published
- Runtime execution allowed

---

## 8. Visual hierarchy rules

### The wizard must feel like:
- intake
- preparation
- review
- promotion

### It must not feel like:
- a long generic form
- a one-time setup screen
- an admin-only config page from the start

### Most important visual priorities
1. Current phase
2. Current step
3. Current readiness
4. Next allowed lifecycle action

---

## 9. Final wizard design summary

```text id="5nnufl"
WS Wizard
= a staged governance intake, configuration, review, and promotion flow

Manager Phase
→ defines intent

Admin Phase
→ defines governed enablement

Governance Phase
→ validates, publishes, and activates

Final step map

Phase    Step    Main question

Manager    Identity    What is this workspace?
Manager    Purpose    Why does it exist?
Manager    Creation Basis / Anchor    What is it organized around?
Manager    Scope Details    What does that anchor mean here?
Manager    Actors    Who will participate?
Manager    Activities    How will work happen?
Manager    Needs    What is needed to succeed?
Admin    Configuration    How should it be governed and configured?
Governance    Review Packet    Is it ready for review?
Governance    Promotion    Can it be approved, published, and activated?
```
