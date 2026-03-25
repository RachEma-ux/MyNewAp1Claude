# OM–HR–PS Operating Doctrine

## Purpose

This document defines the governance-first operating doctrine for the future **OM ↔ HR ↔ PS** model in the platform.

It exists to freeze the ownership model **before** implementation spreads across modules.

This doctrine is authoritative for:

- ownership boundaries
- bridge ownership
- approval-chain intent
- lifecycle intent for staffing transactions
- Workspace consumption boundaries
- AI participation boundaries

---

## Core principle

The platform must not implement OM–HR–PS as three disconnected modules.

It must implement:

```text
one operating model
+ three modules
+ one governed cross-module bridge
```

That bridge is:

- `resource_request`
- `resource_assignment`

---

## Module ownership doctrine

### OM — Organization Management
OM owns the formal organizational structure.

OM owns:

- org units
- jobs
- positions
- reporting relationships
- company entities
- cost centers
- organizational roles
- vacancy / filled / frozen / temporary states
- authority-chain derivation from structure

### HR — Human Resources
HR owns workforce reality.

HR owns:

- employees
- contracts
- worker classification
- skills
- certifications
- calendars
- availability
- performance
- employee status

HR does **not** become the long-term owner of organizational structure once OM is introduced.

### PS — Project System / PM Central
PS owns project demand and delivery.

PS owns:

- portfolios
- projects
- WBS
- project roles
- project demand
- execution
- reporting

PS does **not** own employee master records.

PS requests resources. It does not directly own people.

### Workspace
Workspace is the governed execution environment.

Workspace consumes outputs from:

- OM
- HR
- PS
- AI Types

Workspace does **not** own:

- organizational master data
- employee master data
- project staffing master data

### AI Types
AI Types remains the governed source for AI-side participants and capability definitions.

AI Types is the source for **Crew**, parallel to HR as the source for **Team**.

---

## Bridge doctrine

The integration center of the OM–HR–PS model is the bridge layer.

### `resource_request`
Owned by PS as the expression of project staffing demand.

### `resource_assignment`
Owned as a **cross-module governed bridge record**.

It is not to be silently buried inside only HR or only PM Central.

It must remain visible as a governed transaction connecting:

- OM structure
- HR person/capability reality
- PS project demand and delivery

---

## Authority doctrine

The matrix staffing model must follow this sequence:

1. PS raises the staffing demand
2. HR validates candidate fit, availability, and workforce constraints
3. OM-derived authority chain approves the loan into project execution
4. PS records the assignment
5. Workspace consumes the assignment for execution

### Explicit rule

PM does not directly “take” employees.

Authority over allocation comes from the governed approval chain derived from OM structure.

---

## Ownership matrix

| Object | Owner |
|---|---|
| org units / jobs / positions / entities / cost centers | OM |
| employees / contracts / skills / certifications / calendars / availability / performance | HR |
| portfolios / projects / WBS / project roles / project demand / execution / reporting | PS / PM Central |
| resource_request | PS |
| resource_assignment | cross-module governed bridge |
| execution context | Workspace |
| AI participant source | AI Types |

---

## Lifecycle doctrine for the bridge

Before implementation, the bridge must have an explicit lifecycle.

At minimum, the model must support:

- requested
- under HR review
- candidate proposed
- pending authority approval
- approved
- assigned
- released
- rejected
- escalated / conflict state

The exact implementation may vary, but the lifecycle must be defined before code is built.

---

## Audit doctrine

The bridge layer must be auditable.

Governance must define and preserve:

- who created the request
- who proposed candidates
- who approved or rejected
- which authority chain was used
- when the assignment started
- when it ended or was released
- what conflict or override occurred
- what utilization / feedback loop evidence was produced

---

## Workspace consumption doctrine

Workspace is the execution destination, not the source of truth.

Workspace should consume:

- Team from HR-backed assignment resolution
- Crew from AI Types
- project context from PS
- structural context from OM
- current work and assignment context

Workspace must not redefine staffing ownership.

---

## Transitional doctrine

Some OM-like capabilities currently live under HR.

This is acceptable only as a transitional implementation condition.

Governance must treat the following as **future OM ownership** even if currently hosted in HR:

- organizational structure
- job architecture
- position management

This prevents long-term ownership confusion.

---

## Implementation rule

The biggest governance mistake would be to start coding OM or staffing objects before freezing the operating doctrine.

The correct sequence is:

1. define ownership model
2. define cross-module bridge governance
3. package OM as a governed module
4. realign HR and PM Central governance around that model
5. then begin implementation

---

## Final rule

The OM–HR–PS change must proceed as a governance-first transformation.

Not as:

```text
three isolated modules
```

But as:

```text
one governed operating model
+ three owned domains
+ one governed bridge
```
