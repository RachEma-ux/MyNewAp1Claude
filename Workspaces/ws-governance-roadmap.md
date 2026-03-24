# Workspace Governance-First Implementation Roadmap

## Objective

Implement the Workspace system as a **governed execution environment** end-to-end, starting with **all governance requirements** first, then translating them into schema, backend, middleware, frontend, runtime behavior, and tests.

This roadmap assumes the following is already fixed as the target model:

- **Purpose** = why the workspace exists
- **Creation Basis / Anchor** = what the workspace is organized around
- **Manager phase** creates and saves **draft**
- **Admin phase** completes governed configuration and moves to **ready_for_review**
- **Governance phase** validates and promotes:
  - `draft`
  - `ready_for_review`
  - `under_review`
  - `approved`
  - `published`
  - `active`
  - `rejected`
  - `archived`
  - `deleted`

---

## Non-Negotiable Design Rules

1. **Governance comes before build**
2. **Draft save is not the same as governance approval**
3. **Approved is not the same as published**
4. **Published is not the same as active**
5. **Workspace must define both**:
   - why it exists
   - what it is organized around
6. **Workspace Manager defines intent**
7. **Administrator defines governed enablement**
8. **System / Governance validates and promotes**
9. **WS List ≠ WS Catalog**
10. **Shell must make the workspace intelligible before it makes it navigable**

---

## Phase 1 — Freeze Governance Requirements First

### Goal
Define and lock the governance model before changing schema, code, or UI.

### 1.1 Define the full governance model for Workspace
Create / update the governance docs so Workspace governance is explicit and complete.

Must define:

- workspace governance scope
- lifecycle states and meanings
- allowed lifecycle transitions
- manager vs admin vs governance authority boundaries
- review packet requirements
- publication rules
- activation rules
- rejection and archive behavior
- WS List vs WS Catalog exposure rules
- audit / evidence expectations
- periodic checks and compliance reviews

### 1.2 Define the compliance questions the wizard must satisfy
Governance must validate that a workspace has, at minimum:

- valid identity
- declared purpose
- valid anchor / creation basis
- accountable owner
- valid participation model (Team / Crew)
- declared activities
- declared needs
- governed configuration
- reviewable evidence packet
- valid lifecycle transition readiness

### 1.3 Define the governance deliverables for Workspace
Governance docs should explicitly state that Workspace needs:

- governance profile
- control surface
- audit model
- periodic checks
- risks
- open gaps
- runtime references
- lifecycle and publication doctrine
- compliance checklist for review

### 1.4 Freeze the governance semantics of the wizard
Lock the wizard as:

#### Manager phase
1. Identity
2. Purpose
3. Creation Basis / Anchor
4. Scope Details
5. Actors
6. Activities
7. Needs
→ save as `draft`

#### Admin phase
8. Configuration
→ save as `ready_for_review`

#### Governance phase
9. Review / validation
10. Promotion
→ `under_review`
→ `approved`
→ `published`
→ `active`
or
→ `rejected`
→ `archived`

### Phase 1 Definition of Done
- Governance requirements are documented and frozen
- Lifecycle is explicit and approved
- Authority boundaries are explicit and approved
- Review requirements are explicit and approved
- WS List / WS Catalog exposure model is explicit and approved

---

## Phase 2 — Normalize the Data Model

### Goal
Make the data model capable of representing the governance model cleanly.

### 2.1 Core workspace fields
Ensure the workspace schema supports:

- `name`
- `description`
- `type`
- `purposeType`
- `purposeRef`
- `anchorType`
- `anchorRef`
- `anchorLabel`
- `anchorMeta`
- `status`
- `ownerId`
- `routingProfile`
- `resourceProfile`
- `shellConfig`
- `createdAt`
- `updatedAt`

### 2.2 Team / Crew participation model
Support both:

#### Team
- human participants
- membership
- roles
- capability mapping

#### Crew
- AI participants
- participant type
- participant id
- participant label
- workspace role
- optional note
- constraints / capabilities if needed

### 2.3 Review and governance metadata
Support storage for:

- draft completeness
- ready_for_review readiness
- review notes
- approval notes
- rejection reasons
- publication metadata
- activation metadata

### 2.4 Workspace shell configuration
Persist manager-configured visibility and emphasis rules, including:

- visible context sections
- visible tool sections
- priority/emphasis
- participant-specific visibility behavior
- manager-only controls

### 2.5 Activity and audit traceability
Ensure the schema supports:
- workspace activity records
- lifecycle transition records
- actor attribution
- target/resource references
- evidence references if needed

### Phase 2 Definition of Done
- Schema fully supports purpose + anchor + lifecycle + participation + shell configuration
- Review/promotion data can be persisted cleanly
- Team/Crew model is first-class

---

## Phase 3 — Build the Governance Services

### Goal
Translate the governance rules into reusable backend services.

### 3.1 Workspace lifecycle service
Implement or normalize a dedicated lifecycle service that owns:

- allowed transitions
- readable vs executable behavior
- approved vs published vs active distinction
- rejected → archived flow
- archive / delete semantics
- return-to-draft semantics if supported

### 3.2 Workspace review readiness service
Implement a service that can answer:

> Is this workspace complete enough to move from draft to ready_for_review?

Checks should include:
- required fields completed
- anchor present if required
- actors valid
- needs declared
- configuration present where required
- no invalid module/resource mismatch

### 3.3 Workspace governance validation service
Implement a service that validates:
- structural compliance
- permission/capability coherence
- module enablement policy
- publication readiness
- activation readiness

### 3.4 Workspace publication service
Implement the logic that makes `published` distinct from `active`.

This service must drive:
- WS Catalog exposure
- visibility to participants
- runtime availability distinction

### 3.5 Shell view resolver
Backend must resolve the shell payload for a participant, including:
- context
- tools
- current work
- activity
- alerts
- quick actions
- manager-only controls
- visibility-layer rules

### Phase 3 Definition of Done
- Lifecycle rules exist as real services
- Review readiness is programmatic
- Publication is distinct from activation
- Shell rendering can be fed from resolved backend data

---

## Phase 4 — Fix Middleware and Enforcement

### Goal
Make the runtime obey the governance model.

### 4.1 WorkspaceContext everywhere
All workspace execution paths must resolve a canonical WorkspaceContext.

### 4.2 Draft save vs governance split
Separate normal controlled mutations from governed promotion mutations.

#### Draft mutations
These should be controlled but **not treated as full governance promotion actions**:
- create draft
- update draft

#### Governed mutations
These should remain lifecycle/policy-enforced:
- submitForReview
- review
- approve
- publish
- activate
- reject
- archive
- delete

### 4.3 Capability enforcement
Make capability checks authoritative for:
- membership management
- shell config updates
- routing changes
- module access
- publication/activation actions

### 4.4 Module and resource enforcement
Ensure the workspace runtime only exposes and executes:
- enabled modules
- allowed resources
- allowed Team/Crew participation
- participant-specific tool access

### Phase 4 Definition of Done
- No workspace execution path bypasses context/lifecycle/capability checks
- Draft save is not over-governed
- Publish and active are distinct runtime states

---

## Phase 5 — Implement the Wizard as a Governance Intake Pipeline

### Goal
Make the wizard produce a governance-valid workspace, not just a form submission.

### 5.1 Manager phase
Implement these steps fully:

1. Identity
2. Purpose
3. Creation Basis / Anchor
4. Scope Details
5. Actors
6. Activities
7. Needs

Every step must support:
- **Save as Draft**
- persistence at any step
- resume later
- update the same draft
- no duplicate drafts

### 5.2 Admin phase
Implement the admin continuation step:

8. Configuration

This step must define:
- modules
- routing
- resources
- shell visibility
- capability bundles
- publishability constraints

Final CTA:
- `Save as Ready for Review`

### 5.3 Governance phase
Implement review and promotion flow:
- review summary
- readiness validation
- under_review
- approve
- publish
- activate
- reject
- archive

### 5.4 Review packet
The wizard must produce a governance-readable summary containing:
- identity
- purpose
- anchor
- actors
- activities
- needs
- configuration
- open issues
- readiness status

### Phase 5 Definition of Done
- Manager can create and save drafts from any step
- Admin can continue drafts later
- Governance phase is only executable by the right role
- Review packet exists and is useful

---

## Phase 6 — Implement WS List and WS Catalog Correctly

### Goal
Separate management inventory from participant exposure.

### 6.1 WS List
This is the **management inventory**.

It must show:
- all workspaces
- all statuses
- owner
- purpose
- anchor
- next action
- filters/search

### 6.2 WS Catalog
This is the **published menu**.

It must show only:
- published workspaces
- optionally active state distinction
- participant-relevant summary

### 6.3 Runtime access
Only `active` workspaces are executable.

### Phase 6 Definition of Done
- WS List and WS Catalog are distinct in backend and UI
- Participants do not discover workspaces through WS List
- Published and Active are visibly distinct where needed

---

## Phase 7 — Shape the Shell Into the Intended Experience

### Goal
Make the shell reflect the governance-approved workspace model.

### 7.1 Left sidebar surface portions
The sidebar must be visibly divided into:

#### Context
- Identity
- Global Purpose
- Participant Mission
- Current Work
- Alerts
- Quick Actions

#### Tools
- Overview
- Resources
- Team
- Crew
- Documents
- Collaboration
- Workflows
- PM Toolbox
- Knowledge
- Reports
- Rules
- Governance

#### Settings / Control
- Oversight
- Visibility
- Configuration
- Settings

### 7.2 Main area
Main frame must be:
- purpose-first
- mission-aware
- work-driven
- next-actions-aware
- not stats-first

### 7.3 Participant-aware rendering
Manager, member, viewer, and Crew-facing views must differ by emphasis.

### 7.4 No loading blockers
No full-page blocking `isLoading`, spinner, skeleton, or similar UX anywhere.

### Phase 7 Definition of Done
- Shell is context-first
- Tools are distinct from context
- Main frame is mission/work-driven
- Visibility shaping is manager-controlled
- No loading blockers remain

---

## Phase 8 — Integrate Tool Domains Correctly

### Goal
Make Workspace consume tool domains correctly without collapsing domain ownership.

### 8.1 AI Types
Workspace uses AI Types through:
- Team
- Crew
- Resources
- selectors
- rules

### 8.2 Workflows / Automation
Workflow domain remains independent.
Workspace consumes workflow tools through the catalog/exposure model.

### 8.3 Documents / Knowledge
Files/documents/knowledge must be scoped to workspace context and participant visibility.

### 8.4 PM / execution tools
PM Toolbox must support work inside the workspace without redefining the governance model.

### Phase 8 Definition of Done
- Tool domains remain independent
- Workspace consumes them cleanly
- runtime exposure follows policy

---

## Phase 9 — Audit, Observability, and Compliance Reporting

### Goal
Make the workspace system auditable and reviewable over time.

### 9.1 Activity model
Record:
- draft creation/update
- configuration changes
- lifecycle transitions
- member changes
- crew changes
- shell visibility changes
- publish/activate actions

### 9.2 Compliance views
Create support for:
- stale drafts
- ready_for_review backlog
- approved but unpublished
- published but inactive
- archived yet still exposed
- shell visibility drift
- Team/Crew mismatch

### 9.3 Governance reporting
Make it possible for Governance Center to report on workspace compliance.

### Phase 9 Definition of Done
- Workspace governance is observable
- lifecycle is auditable
- drift can be detected

---

## Phase 10 — Testing and Promotion Readiness

### Goal
Prove the model works and is safe to use.

### 10.1 Lifecycle tests
Test:
- draft
- ready_for_review
- under_review
- approved
- published
- active
- rejected
- archived
- deleted

### 10.2 Wizard tests
Test:
- save draft on every step
- resume draft
- admin continuation
- review readiness
- correct CTA visibility by role

### 10.3 Exposure tests
Test:
- WS List vs WS Catalog
- published vs active distinction
- participant discovery rules

### 10.4 Shell tests
Test:
- context-first layout
- participant-aware rendering
- manager visibility shaping
- no blockers / no global loading guards

### 10.5 Team / Crew tests
Test:
- structured persistence
- reload
- visibility
- capability restrictions

### Phase 10 Definition of Done
- critical user/governance journeys are test-backed
- lifecycle and compliance behavior are provable

---

## Recommended Execution Order

```text
1. Freeze governance requirements
2. Normalize schema
3. Build governance/lifecycle services
4. Fix middleware/enforcement split
5. Implement wizard as governance intake
6. Implement WS List / WS Catalog
7. Shape the shell
8. Integrate tool domains
9. Add audit/compliance reporting
10. Test and validate
```

---

## Final Milestones

**Milestone 1 — Governance frozen**
Workspace governance requirements are fully defined and approved.

**Milestone 2 — Schema and services ready**
Data model and lifecycle services can represent the governance model.

**Milestone 3 — Wizard works as compliance intake**
Draft, admin completion, and review readiness are real.

**Milestone 4 — Publication model works**
WS List, WS Catalog, and Active state are distinct and enforced.

**Milestone 5 — Shell reflects the governed model**
Participants understand the workspace and can work inside it correctly.

**Milestone 6 — Governance reporting works**
Workspace becomes a fully governed module, not just a runtime feature.

---

## Final Principle

The WS Wizard should not merely create a workspace.

It should prepare, structure, and validate a workspace for governance so that publication and activation become justified lifecycle promotions rather than simple form outcomes.
