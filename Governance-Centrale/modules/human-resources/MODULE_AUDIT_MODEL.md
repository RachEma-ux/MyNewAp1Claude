# HR Module — Audit Model

## Document Status

- **Type:** Audit logging and compliance model
- **Module:** Human Resources
- **Last updated:** 2026-03-24

---

## 1. Audit Infrastructure

### Audit Functions (`server/hr/audit.ts`)

| Function | Purpose | Category |
|---|---|---|
| `logHrAudit()` | Generic audit logging for all HR operations | All categories |
| `logSensitiveRead()` | Audit logging for reads of sensitive/masked data | `sensitive_read` |
| `logStatusChange()` | Audit logging for state machine transitions | `status_change` |

### Audit Categories

| Category | Used For |
|---|---|
| `mutation` | Create, update, delete operations |
| `sensitive_read` | Reading compensation, relations, talent, investigation data |
| `status_change` | Lifecycle transitions (onboarding status, leave approval, etc.) |
| `assignment` | Workspace assignment changes |
| `approval` | Approval workflow decisions |
| `export` | Data export operations |
| `system` | System-level operations (seed, config changes) |

### Audit Envelope

Every audit entry includes:

- Actor ID (user performing the action)
- Target entity type and ID
- Action type (e.g., `hr.worker.create`, `hr.compensation.read`)
- Category (mutation, sensitive_read, etc.)
- Metadata (diff summary, context)
- Timestamp
- Workspace ID (when relevant)

---

## 2. Audit Coverage by Router

### Directory Router

| Operation | Audit Type | Function |
|---|---|---|
| List workers | No audit | — |
| Get worker by ID | No audit | — |
| Create worker | `mutation` | `logHrAudit()` |
| Update worker | `mutation` | `logHrAudit()` |
| List letters | No audit | — |
| Get letter | `sensitive_read` | `logSensitiveRead()` |
| Create letter | `mutation` | `logHrAudit()` |
| Update letter | `mutation` | `logHrAudit()` |

### Organization Router

| Operation | Audit Type | Function |
|---|---|---|
| List org units | No audit | — |
| Create org unit | `mutation` | `logHrAudit()` |
| Update org unit | `mutation` | `logHrAudit()` |
| Create job family | `mutation` | `logHrAudit()` |
| Update job family | `mutation` | `logHrAudit()` |
| Create job level | `mutation` | `logHrAudit()` |
| Update job level | `mutation` | `logHrAudit()` |

### Compensation Router

| Operation | Audit Type | Function |
|---|---|---|
| All reads | `sensitive_read` | `logSensitiveRead()` |
| All writes | `mutation` | `logHrAudit()` |
| Bonus approval | `approval` + SoD | `logHrAudit()` + `preventSelfApproval()` |

### Relations Router

| Operation | Audit Type | Function |
|---|---|---|
| Policy reads | No audit | — |
| Grievance/disciplinary/investigation reads | `sensitive_read` | `logSensitiveRead()` |
| Grievance/disciplinary/investigation writes | `mutation` | `logHrAudit()` |

### Talent Router

| Operation | Audit Type | Function |
|---|---|---|
| Talent review reads | `sensitive_read` | `logSensitiveRead()` |
| Talent review writes | `mutation` | `logHrAudit()` |
| Succession plan reads | No audit (not sensitive) | — |

### Time Router

| Operation | Audit Type | Function |
|---|---|---|
| Time entry reads | No audit | — |
| Time entry writes | `mutation` | `logHrAudit()` |
| Leave reads | No audit | — |
| Leave writes | `mutation` | `logHrAudit()` |
| Time/leave/overtime approval | `approval` + SoD | `logHrAudit()` + `preventSelfApproval()` |

### Performance Router

| Operation | Audit Type | Function |
|---|---|---|
| Goal/review reads | No audit | — |
| Goal/review writes | `mutation` | `logHrAudit()` |
| Manager review approval | `approval` + SoD | `logHrAudit()` + `preventSelfApproval()` |

### Compliance Router

| Operation | Audit Type | Function |
|---|---|---|
| Work permit reads | `sensitive_read` | `logSensitiveRead()` |
| Work permit writes | `mutation` | `logHrAudit()` |
| Incident reads | No audit | — |
| Incident writes | `mutation` | `logHrAudit()` |

### Analytics Router

| Operation | Audit Type | Function |
|---|---|---|
| Dashboard reads | No audit | — |
| Role assignment writes | `mutation` | `logHrAudit()` |

### Remaining Routers (Staffing, Recruiting, Lifecycle, Learning, Engagement)

| Pattern | Audit Type | Function |
|---|---|---|
| All reads | No audit | — |
| All writes | `mutation` | `logHrAudit()` |

---

## 3. Sensitive Read Audit Map

For the full per-item audit expectations including all 68 nav items, see [CARBON_SIDENAV_AUDIT_EXPECTATIONS.md](CARBON_SIDENAV_AUDIT_EXPECTATIONS.md) (Phase 0 governance package).

These nav items trigger `logSensitiveRead()` when accessed:

| Item ID | Domain | Sensitive Action |
|---|---|---|
| salary-structure | Compensation | `hr.compensation.read.sensitive` |
| annual-salary-review | Compensation | `hr.compensation.read.sensitive` |
| bonus-incentives | Compensation | `hr.compensation.read.sensitive` |
| health-insurance | Compensation | `hr.compensation.read.sensitive` |
| pension-retirement | Compensation | `hr.compensation.read.sensitive` |
| allowances-perks | Compensation | `hr.compensation.read.sensitive` |
| grievances-complaints | Relations | `hr.relations.read.sensitive` |
| disciplinary-actions | Relations | `hr.relations.read.sensitive` |
| workplace-investigations | Relations | `hr.relations.read.sensitive` |
| talent-reviews | Talent | `hr.talent.write` |

---

## 4. Self-Approval Prevention (Separation of Duties)

The `preventSelfApproval()` function blocks same-user approvals on:

| Domain | Operation | Enforcement Point |
|---|---|---|
| Time | Time entry approval | `server/hr/time/router.ts` |
| Time | Leave request approval | `server/hr/time/router.ts` |
| Time | Overtime request approval | `server/hr/time/router.ts` |
| Compensation | Bonus award approval | `server/hr/compensation/router.ts` |
| Performance | Manager review submission | `server/hr/performance/router.ts` |

---

## 5. Audit Gaps (Honest Assessment)

| Gap | Severity | Notes |
|---|---|---|
| General list queries are not audited | Low | Expected — auditing list calls would be noisy |
| HR policy reads are not audited | Low | Policies are public-internal documents |
| Succession plan reads are not audited | Medium | Could warrant sensitive-read logging |
| Analytics dashboard reads are not audited | Low | Aggregate data, not PII |
| No export audit event implemented | Medium | `export` category exists but no router uses it yet |
| Audit log viewer (`hr.analytics.listAuditLogs`) itself is not audited | Low | Circular — admin tool |

---

## 6. Navigation Observability (Phase 9)

Phase 9 added lightweight, privacy-safe navigation signal tracking. This is **not** part of the HR audit system — it is a separate operational observability layer that records only navigation behavior, never HR data content.

### Event Types

| Event Type | Trigger | Data Captured |
|---|---|---|
| `section_visit` | User opens a section landing page | Section ID only |
| `deferred_click` | User clicks a "Coming soon" card | Item ID only |
| `dead_end` | User lands on a section with no accessible items | Section ID only |
| `permission_denied` | User attempts navigation blocked by role | Item ID only |

### What Is NOT Tracked

- User identity or PII
- HR data content (names, salaries, reviews, etc.)
- Session identifiers or behavioral profiling
- Cross-page navigation paths

### Storage

Events are held in an **in-memory buffer** (`MAX_BUFFER_SIZE = 200`). No backend persistence. Buffer resets on page reload. This is intentional — the signal is for operational awareness, not compliance audit.

### Retrieval Functions

| Function | Purpose |
|---|---|
| `getNavEventSummary()` | Aggregate counts by event type |
| `getTopDeferredItems(n)` | Most-clicked deferred items (prioritization signal) |
| `getNavEventBuffer()` | Raw event buffer for debugging |
| `clearNavEvents()` | Reset the buffer |

### Source File

`client/src/lib/hrNavObservability.ts`
