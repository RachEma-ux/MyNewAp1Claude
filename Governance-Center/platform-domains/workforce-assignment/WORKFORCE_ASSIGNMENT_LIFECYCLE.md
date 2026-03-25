# WORKFORCE_ASSIGNMENT_LIFECYCLE

## Purpose

Defines the formal lifecycle for the Workforce Assignment bridge.

This document exists to lock the lifecycle before implementation spreads across runtime code.

The bridge must remain a governed transaction domain linking:

- PS demand
- HR workforce validation
- OM-derived authority
- Workspace execution reality

---

## Core Rule

No employee may become project-assigned by direct PM action.

Every assignment must pass through a governed lifecycle.

---

## Resource Request Lifecycle

### States

- `draft`
- `requested`
- `under_hr_review`
- `candidate_proposed`
- `pending_approval`
- `approved`
- `rejected`
- `cancelled`

### State Meanings

#### `draft`
Initial PM-side preparation state.
Not yet active in staffing workflow.

#### `requested`
Formal staffing demand has been submitted by PM.
Visible to governed staffing flow.

#### `under_hr_review`
HR is validating candidate fit, workforce eligibility, and availability constraints.

#### `candidate_proposed`
One or more valid candidates have been proposed.
The request is no longer only demand; it is now a candidate-bearing request.

#### `pending_approval`
The request is awaiting approval through the OM-derived authority chain.

#### `approved`
The request has been approved and is eligible for assignment creation.
Approval does not itself create the assignment.

#### `rejected`
The request failed review or approval and cannot proceed.

#### `cancelled`
The request was withdrawn or terminated before assignment creation.

---

## Resource Assignment Lifecycle

### States

- `pending`
- `active`
- `released`
- `completed`
- `cancelled`

### State Meanings

#### `pending`
Assignment record exists but has not yet become execution-active.

#### `active`
The worker is actively allocated to the project/task context.
This is the execution-visible state.

#### `released`
The worker has been released from active assignment before natural end.

#### `completed`
The assignment reached its intended end state.

#### `cancelled`
The assignment was invalidated or cancelled before effective execution.

---

## Allowed Transition Rules

### Request transitions

- `draft` → `requested`
- `requested` → `under_hr_review`
- `under_hr_review` → `candidate_proposed`
- `candidate_proposed` → `pending_approval`
- `pending_approval` → `approved`
- `pending_approval` → `rejected`
- `draft` → `cancelled`
- `requested` → `cancelled`
- `under_hr_review` → `cancelled`
- `candidate_proposed` → `cancelled`

### Assignment transitions

- `pending` → `active`
- `active` → `released`
- `active` → `completed`
- `pending` → `cancelled`

---

## Explicitly Forbidden

The following are forbidden:

- direct PM creation of assignment without approved request
- assignment creation from `draft`, `requested`, `under_hr_review`, or `candidate_proposed`
- skipping HR review
- skipping OM-derived approval
- direct jump from `draft` to `approved`
- direct jump from `approved` to active execution without assignment record

---

## Publication Into Workspace

Workspace must consume only execution-valid assignment states.

Recommended visibility rule:

- `pending` → optional or limited visibility
- `active` → visible as current staffing reality
- `released` / `completed` / `cancelled` → removed from active execution view

---

## Governance Significance

This lifecycle is the control backbone of the OM–HR–PS staffing bridge.

Without it:

- PM can bypass governance
- HR validation becomes optional
- OM authority becomes symbolic
- Workspace stops reflecting governed reality
