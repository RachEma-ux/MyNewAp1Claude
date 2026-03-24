# HR Carbon SideNav — Rollout Status

## Current State: Live (Phase 9)

The HR Carbon SideNav is live in production. It is the primary navigation surface for the HR module.

## What Is Live

### SideNav Component
- `HRSideNav.tsx` renders a 3-level accordion (L0 toggle in MainLayout, L1 sections, L2 leaf items)
- Consumes `hrNavConfig.ts` as the single source of truth
- Role-filtered via `getVisibleSections()` — only items the user's role permits are shown
- Only `live` and `placeholder` items appear (35 `not-started` items are hidden)
- Active section auto-expands based on current route
- Observability tracking fires on section expand and item click

### Live Leaf Items (33 of 69)

Across 13 sections, these items have `implementationStatus: "live"` with a backing page and backend:

**Workforce Planning** (4 live): Job Architecture, Org Structure, Position Management, Role Definitions
**Talent Acquisition** (1 live): Recruitment Requests
**Onboarding & Offboarding** (2 live): Onboarding Checklist, Offboarding/Termination
**Employee Records** (3 live): Employee Profile, Work Permits, HR Letters & Certificates
**Compensation & Benefits** (2 live): Salary Structure, Health & Insurance
**Time & Attendance** (4 live): Time Tracking, Leave Management, Overtime, Shift Planning
**Learning & Development** (3 live): Training Catalog, Skill Development, Certifications
**Performance & Talent** (3 live): Goal Setting, Performance Reviews, Talent Reviews
**Employee Relations** (2 live): HR Policies, Grievances & Complaints
**Well Being & Engagement** (2 live): Employee Surveys, Engagement Programs
**Analytics & Reporting** (2 live): Workforce Dashboards, Compliance Reports
**Security & Access** (2 live): Access Controls, Audit Logs
**Compliance** (3 live): Incident Reporting, Compliance Management, Risk Management

### Placeholder Items (1)
- **Role-Based Access** (`security-access/roles`) — UI shell exists, backend partial. Styled with reduced opacity.

## What Is Reused from Older Flat Routes

Many live items in the Carbon SideNav point to older flat routes via the `currentRoute` field. The SideNav renders the hierarchical Carbon path but navigates to the existing flat route:

| SideNav Hierarchy | Actual Route |
|---|---|
| Workforce Planning > Org Structure | `/hr/organization` |
| Workforce Planning > Position Management | `/hr/positions` |
| Talent Acquisition > Recruitment Requests | `/hr/recruitment` |
| Onboarding > Checklist | `/hr/onboarding` |
| Offboarding > Termination | `/hr/offboarding` |
| Employee Records > Employee Profile | `/hr/directory` |
| Compensation > Salary Structure | `/hr/compensation` |
| Compensation > Health & Insurance | `/hr/benefits` |
| Time > Time Tracking | `/hr/timesheet` |
| Time > Leave Management | `/hr/leave` |
| Time > Overtime | `/hr/overtime` |
| Time > Shift Planning | `/hr/shifts` |
| Learning > Training Catalog | `/hr/training` |
| Learning > Skill Development | `/hr/skills` |
| Learning > Certifications | `/hr/certifications` |
| Performance > Goal Setting | `/hr/goals` |
| Performance > Reviews | `/hr/reviews` |
| Performance > Talent Reviews | `/hr/talent` |
| Relations > HR Policies | `/hr/policies` |
| Relations > Grievances | `/hr/grievances` |
| Engagement > Surveys | `/hr/surveys` |
| Engagement > Programs | `/hr/engagement` |
| Analytics > Dashboards | `/hr/analytics` |
| Analytics > Compliance Reports | `/hr/reports` |
| Compliance > Incidents | `/hr/incidents` |
| Compliance > Management | `/hr/compliance-mgmt` |

This backward-compatibility approach (`backwardCompatAliases` feature flag) means the SideNav hierarchy is cosmetic over existing flat routes for most items. Only newer items (job architecture, role definitions, work permits, letters/certificates, access controls, audit logs, risk management) use hierarchical routes.

## What Is Deferred (35 items)

35 nav config items have `implementationStatus: "not-started"`. They are documented in the config for planning but:
- Have no backing page component
- Have no backend API endpoint
- Are excluded from the SideNav rendering
- Are invisible to users

See [MODULE_OPEN_GAPS.md](MODULE_OPEN_GAPS.md) for the full deferred item list.

## Rollout/Readiness State

| Dimension | Status |
|---|---|
| SideNav component | Live |
| Nav config completeness | 69 items defined, 33 live, 35 deferred |
| Role filtering | Live — tested across all 5 HR roles |
| Observability | Live — client-side only (not persisted) |
| Drift detection helpers | Live — `findUnknownBackendDomains()`, `getImplementationBreakdown()` |
| Backward compatibility | Live — `currentRoute` mapping for 26 items |
| Icon resolution | Live — all 13 sections + leaf items have icons |
| Mobile responsive | Live — `onNavigate` callback closes sidebar on mobile |

## Main Risks / Open Gaps

1. **Backward-compat route divergence**: 26 items use `currentRoute` (flat) vs `href` (hierarchical). If routes are ever migrated to hierarchical paths, the `currentRoute` field must be updated or removed.
2. **Observability not persisted**: Nav tracking is client-side only. For audit evidence, events need server-side storage.
3. **`roleDefinitions` domain not in HR_BACKEND_DOMAINS**: The `role-definitions` nav item references `backendDomain: "roleDefinitions"` which is not in the `HR_BACKEND_DOMAINS` constant. `findUnknownBackendDomains()` will flag this.
4. **Section landing pages**: Most section-level entries have no dedicated landing page. Navigation goes directly to leaf items.
5. **35 deferred items**: Significant planned surface not yet implemented.
