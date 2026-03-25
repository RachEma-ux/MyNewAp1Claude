# OM/HR/PS Implementation Scoop

Because of the change you want, governance should not proceed as “one more module pack.”  
It should proceed as one operating model + three modules + one cross-module bridge.

That is the key.

The repo already has a layered governance model and an explicit governance-first rule for modules, so the right move is to extend that structure, not bypass it.

## My recommendation

Proceed in 4 governance layers, in this order:

## 1. Freeze the operating doctrine first

Before coding OM, freeze the governance truth for:

- OM owns structure
- HR owns people/capability
- PS / PM Central owns project demand and delivery
- Workspace consumes them for execution
- AI Types remains the AI-side participant source
- Resource Request + Resource Assignment are the integration bridge

This should become the official doctrine document for the OM–HR–PS model.

## 2. Package OM as a new governed module

OM does not exist yet, so governance must define it before implementation.

Create a full governance packet for OM, just like a first-class module:

- governance profile
- control surface
- audit model
- periodic checks
- risks
- open gaps
- runtime references

This follows the same governance-first structure already used in Governance Center. HR is already fully packaged, while PM Central is still only partial, so OM should be introduced cleanly rather than ad hoc.

## 3. Update HR and PM Central governance to reflect the new ownership split

Because HR currently contains OM-like capabilities, and PM Central is only a partial PS foundation, both governance packs need to be updated.

### HR governance should explicitly say:

- HR owns employees, contracts, skills, certifications, calendars, availability, performance
- HR does not own long-term org structure once OM is introduced
- any current org/position/job surfaces in HR are transitional or cross-linked

### PM Central governance should explicitly say:

- PM Central owns projects, WBS, project roles, project demand, execution, reporting
- PM Central does not own employee master data
- PM Central requests resources; it does not directly own people

That ownership clarity is the most important governance move.

## 4. Create a cross-domain governance pack for the bridge

This is the most important part.

`resource_request` and `resource_assignment` should not be buried silently inside PM Central or HR governance.

They should be documented as a cross-module governed transaction domain.

I would treat this as a platform-domain or cross-domain governance packet, not just a module note, because it spans:

- OM
- HR
- PM Central / PS
- Workspace execution
- approvals
- audit
- authority chain

## What governance should define first

### A. Ownership matrix

This must be written down clearly.

| Object | Owner |
|---|---|
| org units / jobs / positions / entities / cost centers | OM |
| employees / contracts / skills / certifications / calendars / availability / performance | HR |
| portfolios / projects / WBS / project roles / project demand / execution / reporting | PM Central / PS |
| resource_request | PS |
| resource_assignment | cross-module governed bridge |
| execution context | Workspace |
| AI participant source | AI Types |

### B. Authority matrix

Governance must define who can do what.

For example:

- PM can raise `resource_request`
- HR can validate candidate fit / availability
- OM-derived authority chain approves assignment
- PM cannot directly “take” an employee
- Workspace cannot redefine staffing ownership

This is where the matrix model becomes real.

### C. Lifecycle model for the bridge

You need lifecycle states for:

- resource request
- candidate matching
- approval
- assignment
- release
- rejection
- conflict/escalation

That lifecycle should be explicit before any code is written.

### D. Audit model

Governance must define:

- request created by whom
- candidate proposed by whom
- approval by which authority chain
- assignment created when
- release and utilization feedback
- conflict and override logging

### E. Periodic checks

You will need recurring governance checks such as:

- orphan assignments
- requests with no approver
- overallocated employees
- assignments that bypassed approval
- inactive projects with active assignments
- archived positions still used in assignment
- stale requests
- assignment drift vs actual time/utilization

## The clean governance structure I would use

### 1. New module governance pack

Create:

```text
Governance-Center/modules/organization-management/
```

with a full governance packet.

### 2. Update existing module packs

Update:

- `Governance-Center/modules/human-resources/`
- `Governance-Center/modules/pm-central/`

to reflect the new ownership boundaries.

### 3. New cross-domain governance pack

Create something like:

```text
Governance-Center/platform-domains/resource-allocation-bridge/
```

or

```text
Governance-Center/platform-domains/workforce-assignment/
```

This pack should cover:

- resource request
- candidate matching
- assignment
- approval chain
- utilization / release / feedback loop

That is the safest way to keep the bridge from becoming ownerless.

## Best order of governance work

1. Freeze OM–HR–PS governance doctrine  
2. Create OM governance pack  
3. Update HR governance pack  
4. Update PM Central governance pack  
5. Create cross-domain bridge governance pack  
6. Define shared reference ownership  
7. Define request/assignment lifecycle + authority + audit  
8. Only then begin implementation

## Bottom line

The biggest mistake would be to start by coding OM or staffing objects first.

The right governance-first move is:

Define the ownership model first,  
then define the cross-module bridge governance,  
then package OM as a new governed module,  
then realign HR and PM Central around it.

That will keep the app coherent instead of creating three modules plus a hidden bridge with unclear authority.
