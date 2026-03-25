# Workforce Assignment — Periodic Checks

## Overview

These checks must be performed on a regular cadence to detect governance drift, orphaned records, and policy violations in workforce assignments.

## Check Schedule

| # | Check | Frequency | Severity | Description |
|---|---|---|---|---|
| 1 | Orphan assignments | Weekly | High | Assignments where the linked `resource_request` no longer exists or was cancelled |
| 2 | Missing approvals | Weekly | Critical | Active `resource_assignment` records with no corresponding approval record |
| 3 | Overallocated employees | Weekly | High | Employees assigned to more projects than their availability allows |
| 4 | Inactive projects with active assignments | Bi-weekly | High | Projects marked inactive/completed that still have active assignments |
| 5 | Stale requests | Weekly | Medium | `resource_request` records in submitted/validated state for longer than the defined SLA |
| 6 | Drift vs actual usage | Monthly | Medium | Assignments that exist on paper but show no activity in project tracking |

## Check Details

### 1. Orphan Assignments

- **Query:** Find `resource_assignment` records where `request_id` references a non-existent or cancelled request.
- **Action:** Flag for HR review. Orphan assignments must be released or re-linked to a valid request.
- **Escalation:** If orphan count exceeds threshold, escalate to governance.

### 2. Missing Approvals

- **Query:** Find active `resource_assignment` records with no approval event in the audit trail.
- **Action:** Suspend assignment until approval is retroactively obtained or assignment is released.
- **Escalation:** Immediate governance escalation — this is a control bypass.

### 3. Overallocated Employees

- **Query:** Sum active assignments per employee; compare against defined availability (from HR).
- **Action:** Flag for HR and PM review. One or more assignments must be released or availability updated.
- **Escalation:** If overallocation persists beyond one check cycle, escalate to management.

### 4. Inactive Projects with Active Assignments

- **Query:** Find projects in inactive/completed status with `resource_assignment` records in active state.
- **Action:** Release assignments or reactivate project (with justification).
- **Escalation:** If not resolved within one cycle, flag as governance drift.

### 5. Stale Requests

- **Query:** Find `resource_request` records in submitted or validated state for longer than the defined SLA (e.g., 14 days).
- **Action:** Notify PM and HR. Request must be fulfilled, cancelled, or escalated.
- **Escalation:** After two cycles, auto-escalate to governance.

### 6. Drift vs Actual Usage

- **Query:** Compare active assignments against actual project activity (timesheet entries, task assignments, etc.).
- **Action:** Flag assignments with zero activity for review.
- **Escalation:** Persistent drift indicates governance bypass or process failure.

## Reporting

Check results must be logged and available to governance dashboards. Trends in check failures indicate systemic governance gaps.
