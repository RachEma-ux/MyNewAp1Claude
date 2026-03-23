# Governed Linking Framework

**Status:** Draft v1.0.0  
**Intended path:** `docs/governance/LINKING_FRAMEWORK.md`  
**Canonical schema:** `schemas/governance/link_contract.schema.json`

## 1. Purpose

This framework defines how the platform creates, evaluates, activates, governs, and audits links between blocks.

A **link** is not a simple relationship. It is a **governed availability contract** between a source block and a target block.

A valid link must answer:

1. What is being linked?
2. Why is it being linked?
3. Under what conditions is the link valid?
4. What becomes available through the link?
5. Who governs the link?
6. What evidence does the link leave?

## 2. Core definition

A link in the platform is a governed contract that makes one block available to another for a defined purpose, within a defined scope, under explicit conditions, with evidence and revocation.

## 3. Why linking matters

Blocks create local value. Links create system value.

Well-governed linking increases:

- availability
- reuse
- speed
- execution quality
- consistency
- competitiveness
- trustworthy coordination across humans, AI, modules, and workspaces

In platform terms:

> **linking = making capabilities available under controlled conditions**

## 4. Master rules

These rules are platform-wide and apply to every cross-block availability decision.

1. **No link without purpose.**
2. **No purpose without scope.**
3. **No scope without governance.**
4. **No governance without evidence.**
5. **Existence is not permission.** A block cannot consume another block simply because both exist.
6. **Cross-domain links are deny-by-default.**
7. **Prefer projections over raw master data.**
8. **Every link must be revocable.**
9. **Every link must have an owner.**
10. **A link must never bypass another domain's governance.**

## 5. Block taxonomy

A linking framework must explicitly recognize the types of blocks that participate in the platform.

### 5.1 Human blocks

- Person
- Worker / employee
- Manager
- Team
- HR role
- Workspace member

### 5.2 AI blocks

- AI Type
- Agent definition
- Agent instance
- Provider / model
- AI capability profile

### 5.3 Operational blocks

- Workspace
- Module
- Tool
- Workflow
- Task
- Runtime / execution context

### 5.4 Governance blocks

- Policy pack
- Role
- Approval chain
- Risk class
- Audit stream
- Evidence set

## 6. Exposure modes

A link must declare what it makes available. A generic “linked” label is not sufficient.

| Exposure mode | Meaning |
|---|---|
| `discover` | The source can see that the target exists |
| `read` | The source can read target data or metadata |
| `use` | The source can use the target capability |
| `assign` | The source can attach or bind the target |
| `operate` | The source can execute work through the target |
| `approve` | The source can approve actions involving the target |
| `govern` | The source can create, modify, suspend, or revoke the link |

## 7. Link families

| Link family | Purpose | Examples |
|---|---|---|
| Identity | Resolve who or what something is | User ↔ Person, User ↔ HR role |
| Membership | Express belonging | Worker ↔ Team, Module ↔ Workspace |
| Assignment | Express active responsibility or allocation | Worker ↔ Position, Agent ↔ Task |
| Capability | Make abilities available | AI Type ↔ Team, Module ↔ Workspace |
| Access | Define visibility or controlled exposure | Manager ↔ Team records, Workspace ↔ HR roster projection |
| Execution | Allow work to happen | Agent instance ↔ Workflow, Human ↔ Approval task |
| Oversight | Enable review, approval, or governance | Admin ↔ HR policy control, Compliance lead ↔ incident domain |
| Evidence | Preserve traceability | Link ↔ audit event, Link ↔ policy decision |

## 8. Canonical link contract

Every governed link must be represented as a **link contract**. The canonical JSON Schema lives at:

- `schemas/governance/link_contract.schema.json`

At minimum, a link contract must define:

- source
- target
- link family
- purpose
- exposure mode(s)
- scope
- conditions
- authority
- lifecycle
- governance controls
- evidence

## 9. Mandatory fields of every link

The platform contract is intentionally explicit.

```yaml
link:
  id: link_xxx
  source:
    type: worker | team | workspace | ai_type | agent | module | role
    id: "..."
  target:
    type: worker | team | workspace | ai_type | agent | module | policy_pack
    id: "..."
  link_type: identity | membership | assignment | capability | access | execution | oversight | evidence
  purpose: "Why this link exists"
  exposure_mode:
    - discover
    - read
    - use
    - assign
    - operate
    - approve
    - govern
  scope:
    scope_kind: self | team | workspace | org_unit | global | custom
    workspace_id: null
    team_id: null
    org_unit_id: null
    fields: []
    domains: []
    data_classes: []
    projection_mode: projection | masked | summary | metadata_only | raw
  conditions:
    module_enabled: true
    policy_pack: "..."
    lifecycle_state: "active"
    environment: [dev, staging, prod, sandbox, governed]
    approvals_required: []
    predicates: []
  authority:
    owner:
      type: user | role | team | workspace | system
      id: "..."
    approvers: []
    reviewers: []
  lifecycle:
    status: proposed | pending_validation | pending_approval | approved | active | suspended | expired | revoked | archived
    effective_from: "..."
    effective_to: null
    review_every_days: 90
  governance:
    risk_level: low | medium | high | critical
    sensitivity_class: class1_low | class2_controlled | class3_sensitive | class4_highly_restricted
    audit_mode: standard | sensitive | strict
    deny_by_default: true
    segregation_of_duties: []
  evidence:
    created_by:
      type: user | role | system
      id: "..."
    approved_by: []
    audit_stream_id: "..."
    evidence_refs: []
    last_verified_at: null
```

## 10. Three-axis evaluation model

Every new link must be evaluated through three primary axes.

### Axis 1 — What is linked?

This is the object-level truth.

Examples:

- AI Type ↔ Team
- Worker ↔ Workspace
- Manager ↔ Team
- Workspace ↔ HR projection
- Agent ↔ Compensation data

### Axis 2 — What is the purpose?

The purpose must be explicit.

Examples:

- staffing
- discovery
- execution
- approval
- reporting
- visibility
- assignment
- oversight

### Axis 3 — In what conditions?

This is where governance lives.

Examples:

- only when module is enabled
- only for active employment
- only in this workspace
- only for approved AI Types
- only for masked HR data
- only when dual approval exists
- only in non-frozen runtime
- only when role + scope checks pass

## 11. Minimum governance test before activation

Before a link becomes active, the platform must answer these questions.

1. Is this link necessary?
2. What minimum value must be exposed through it?
3. Who is allowed to create it?
4. Who is allowed to approve it?
5. What scope limits apply?
6. What policy pack governs it?
7. What evidence will be recorded?
8. How is it revoked, suspended, or expired?

If these answers are weak, the link must not activate.

## 12. Link lifecycle

A link must use a real lifecycle.

| Status | Meaning |
|---|---|
| `proposed` | Link defined but not yet validated |
| `pending_validation` | Structural and policy checks in progress |
| `pending_approval` | Waiting on required approval chain |
| `approved` | Approved but not yet active |
| `active` | Live and usable |
| `suspended` | Temporarily blocked |
| `expired` | Ended due to time or validity window |
| `revoked` | Explicitly withdrawn |
| `archived` | Closed and retained for evidence |

### Activation rule

A link becomes active only when:

- source exists
- target exists
- policy check passes
- scope resolves
- required approvals exist
- lifecycle state is valid
- evidence entry is written

### Suspension triggers

A link should be suspended when:

- workspace or module is disabled
- role is revoked
- employment ends
- policy is violated
- audit anomaly is detected
- freeze condition applies

## 13. Conditions model

A link must be controlled by explicit conditions, not hidden assumptions.

### 13.1 Identity conditions

- same person
- assigned manager
- owning team

### 13.2 Lifecycle conditions

- worker active
- workspace active
- module enabled
- assignment current
- review cycle open

### 13.3 Role conditions

- employee
- manager
- HRBP
- workspace admin
- governance reviewer

### 13.4 Scope conditions

- self only
- team only
- workspace only
- org unit only
- summary only

### 13.5 Risk conditions

- low-risk metadata
- sensitive HR field
- compensation data
- disciplinary material
- compliance evidence

### 13.6 Approval conditions

- no approval
- single approval
- role-based approval
- dual control
- cross-role approval

### 13.7 Environment conditions

- dev
- staging
- production
- frozen / unfrozen
- sandbox / governed

## 14. Link classes by sensitivity

| Class | Name | Typical examples | Expectations |
|---|---|---|---|
| 1 | Low sensitivity | Team ↔ Workspace, Workspace ↔ enabled module | Minimal approvals, standard audit |
| 2 | Controlled operational | Worker ↔ Workspace staffing, Agent ↔ Workflow | Clear owner, bounded scope |
| 3 | Sensitive governed | HRBP ↔ compensation data, Manager ↔ leave approvals | Stronger approvals, masking, sensitive audit |
| 4 | Highly restricted | Investigator ↔ case evidence, Agent ↔ sensitive HR records | Strict review, narrow projection, short review cycle |

Higher classes require:

- stronger approvals
- tighter field filtering
- stronger audit
- shorter review cycles
- clearer revocation rules

## 15. Canonical link rules for this platform

1. A block cannot consume another block just because both exist.
2. All cross-domain links are deny-by-default.
3. The platform should prefer projection links over direct master-data links.
4. A link must expose the minimum necessary surface.
5. A link must be revocable without deleting source or target blocks.
6. A link must not bypass another domain’s governance.
7. Sensitive links require evidence at creation time and use time.
8. Every link must have an owner.

## 16. Decision patterns

### Pattern A — Central authority, scoped consumption

Use when one domain owns truth and another consumes it.

Example:

- HR owns employee truth
- Workspaces consume staffing summaries

Allowed:

- read projection
- scoped roster
- assignment-aware exposure

Not allowed:

- direct workspace writes to central HR core data

### Pattern B — Catalog to execution

Use when a trusted catalog feeds operating units.

Example:

- AI Types catalog ↔ Team
- AI Types catalog ↔ Agent definition

Allowed:

- discover approved types
- attach allowed types to teams and workflows
- enforce approved compositions

Not allowed:

- arbitrary runtime AI types bypassing the catalog

### Pattern C — Human to AI operational pairing

Use when a human role is linked to an AI capability.

Example:

- manager ↔ agent co-pilot
- recruiter ↔ screening assistant
- analyst ↔ reporting agent

Conditions:

- approved purpose
- visible ownership
- bounded data access
- audit trail
- revocable pairing

### Pattern D — Governance overlay

Use when the link itself is policy-sensitive.

Example:

- compensation approver ↔ salary review process
- investigator ↔ case workspace
- workspace ↔ HR-sensitive module

Conditions:

- explicit approver chain
- SoD rule
- sensitive-read logging
- periodic review

## 17. Examples aligned to the app

### Example 1 — AI Type ↔ Team

- **Purpose:** team may use a trusted AI class
- **Exposure:** `discover`, `use`
- **Conditions:** AI Type approved, team active, module enabled
- **Not exposed:** governance control, raw provider secrets
- **Governed by:** AI catalog owner + team owner

### Example 2 — Worker ↔ Workspace

- **Purpose:** staffing assignment
- **Exposure:** membership + task visibility + allowed module surface
- **Conditions:** active employment, approved assignment, date-valid
- **Governed by:** HR + workspace authority

### Example 3 — Workspace ↔ HR

- **Purpose:** roster and staffing read
- **Exposure:** projection only
- **Conditions:** workspace module enabled, scope filtered, masking applied
- **Not exposed:** raw compensation, grievance, relations core
- **Governed by:** HR domain

### Example 4 — Manager ↔ Team HR records

- **Purpose:** approval and operational visibility
- **Exposure:** team-only read + approvals
- **Conditions:** manager-of-record, no cross-team bleed, audited
- **Governed by:** HR + policy rules

### Example 5 — Agent ↔ HR data

- **Purpose:** highly restricted assistance
- **Exposure:** minimum masked dataset only
- **Conditions:** approved purpose, no direct unrestricted read, strong audit
- **Governed by:** HR policy + AI policy + runtime policy

## 18. Anti-links

The following must be blocked by default and require explicit governed exception handling.

- Workspace direct write access to HR master records
- Any authenticated user → compensation list
- AI Type → unrestricted employee records
- Agent instance → grievance details without explicit approval
- Manager → all-worker records
- Employee → all-team records
- Module enablement → automatic access to sensitive data
- Team membership → automatic approval authority

## 19. Platform capabilities required

To make linking first-class, the platform should eventually implement these capabilities.

1. **Link Registry** — stores governed links as first-class objects
2. **Link Resolver** — determines whether a link exists, is active, and what it exposes
3. **Link Policy Gate** — evaluates conditions and policy packs before use
4. **Scope Resolver** — calculates self, team, workspace, org, masked field sets, and allowed actions
5. **Link Audit Layer** — records link creation, approval, activation, use, suspension, and revocation
6. **Link Review Scheduler** — periodically revalidates sensitive links

## 20. UI meaning of linking

A governed platform should make links visible and inspectable.

The UI should expose:

- link creation intent
- what becomes available through the link
- owner, approver, and reviewer
- current status
- scope and projection mode
- governing policy pack
- last audit / last review evidence
- revocation or suspension controls

This prevents “hidden magic” and makes governed availability understandable.

## 21. Implementation principle

Do not model linking as an afterthought inside random modules.

Model it as a **platform capability**.

The same problem repeats across the system:

- HR ↔ Workspace
- Team ↔ AI Type
- Agent ↔ Workflow
- User ↔ HR role
- Module ↔ Workspace
- Manager ↔ team data
- Compliance ↔ incident records

Once the linking model is formalized, all of these become governed variations of one contract system.

## 22. Immediate rules for the current app

1. Every cross-block availability must declare:
   - purpose
   - exposure mode
   - scope
   - owner
   - policy
2. Workspace access must never replace domain governance.
3. Catalog trust does not equal runtime permission.
4. Self, team, workspace, org, and global are distinct scopes and must be enforced distinctly.
5. Sensitive domains should expose projections, not raw cores, whenever possible.
6. Every important link should be reviewable and revocable.

## 23. Canonical example instance

```json
{
  "id": "link_hr_workspace_roster_001",
  "version": "1.0.0",
  "source": {
    "type": "workspace",
    "id": "ws_ops_europe"
  },
  "target": {
    "type": "module",
    "id": "hr"
  },
  "link_type": "access",
  "purpose": "Allow a workspace to read masked staffing projections for active assignments",
  "exposure_mode": ["discover", "read"],
  "scope": {
    "scope_kind": "workspace",
    "workspace_id": "ws_ops_europe",
    "fields": ["display_name", "position_title", "assignment_status"],
    "domains": ["staffing"],
    "data_classes": ["internal", "masked_hr"],
    "projection_mode": "projection"
  },
  "conditions": {
    "module_enabled": true,
    "policy_pack": "policy.hr.workspace_roster.v1",
    "lifecycle_state": "active",
    "allowed_environments": ["governed", "prod"],
    "approvals_required": [
      {
        "type": "role_any",
        "roles": ["hrbp", "workspace_admin"]
      }
    ],
    "predicates": [
      {
        "kind": "scope",
        "operator": "eq",
        "field": "assignment.workspace_id",
        "value": "ws_ops_europe"
      }
    ]
  },
  "authority": {
    "owner": {
      "type": "role",
      "id": "hrbp"
    },
    "approvers": [
      {
        "type": "role",
        "id": "workspace_admin"
      }
    ],
    "reviewers": [
      {
        "type": "role",
        "id": "governance_reviewer"
      }
    ]
  },
  "lifecycle": {
    "status": "active",
    "effective_from": "2026-03-23T00:00:00Z",
    "effective_to": null,
    "review_every_days": 90
  },
  "governance": {
    "risk_level": "high",
    "sensitivity_class": "class3_sensitive",
    "audit_mode": "sensitive",
    "deny_by_default": true,
    "segregation_of_duties": [
      "approver_must_not_be_assignment_requester"
    ]
  },
  "evidence": {
    "created_by": {
      "type": "user",
      "id": "usr_123"
    },
    "approved_by": [
      {
        "type": "user",
        "id": "usr_456"
      }
    ],
    "audit_stream_id": "audit_hr_workspace_roster",
    "evidence_refs": [
      "approval_001",
      "policy_eval_002"
    ],
    "last_verified_at": "2026-03-23T12:00:00Z"
  }
}
```

## 24. What this framework unlocks

Once linking becomes a governed platform capability, the app can move from strong isolated blocks to trustworthy system composition.

That is where:

- HR becomes operationally useful
- AI Types become safely usable
- teams become meaningful
- workspaces become real execution containers
- governance becomes concrete
- performance gains become durable

Because then linking is no longer accidental. It becomes designed.
