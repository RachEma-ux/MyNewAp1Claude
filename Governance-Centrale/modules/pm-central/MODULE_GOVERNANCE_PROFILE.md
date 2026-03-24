# PM Central Module — Governance Profile

## Document Status

- **Type:** Governance identity card
- **Module:** PM Central
- **Last updated:** 2026-03-24

---

## 1. Module Identity

| Field | Value |
|---|---|
| Module key | `pm-central` |
| Display name | PM Central |
| Frontend route prefix | `/pm-central/*` |
| Backend domain path | N/A (uses generic tRPC routers, no dedicated `server/pm/` domain yet) |
| Database tables | Projects managed via generic workspace/project tables |
| Module version | 11.0.0 (Phase 11 pilot) |
| Module posture | First-class UI module, workspace-integrated |

---

## 2. Governance Classification

| Dimension | Classification |
|---|---|
| Data sensitivity | **Low–Medium** — project data, no PII, no compensation data |
| Mutation sensitivity | **Medium** — project lifecycle state changes, approvals, gate decisions |
| Audit requirement | **Standard** — state changes logged via generic audit, no sensitive-read audit |
| Policy enforcement | **Planned** — project-role based access; currently open in demo mode |
| Field masking | **None** — no PII requiring field-level masking |
| Fail mode | **Fail-open (demo mode)** / Fail-closed (production with OAuth) |

---

## 3. Nav Config as Governance Surface

PM Central's nav config (`client/src/config/pmNavConfig.ts`) follows the shared module-nav standard:

### Nav-Level Governance Fields

| Field | PM Central Usage |
|---|---|
| `requiredAction` | Maps to `pm.<domain>.<operation>` action strings |
| `visibilityMode` | All sections use `show` (PM Central has no hidden capabilities) |
| `scopeType` | Mostly `all` (project data is shared within project); `self` for inbox |
| `backedBy` | All items `existing-page` (100% backed by real pages) |
| `implementationStatus` | All items `live` |
| `backendDomain` | 8 domains: portfolio, planning, execution, control, collaboration, reporting, methodology, ai |

### Differences from HR Reference

| Aspect | HR | PM Central |
|---|---|---|
| Total sections | 13 | 8 |
| Total items | 68 | 12 |
| Masking metadata | Yes (directory, compensation, relations, talent) | No |
| Sensitive audit | Yes (10 items) | No |
| Scope actions | Yes (cascading global/team/self) | No (simpler project-role model) |
| Route aliases | 28 | 0 (clean routes from start) |
| Deferred items | 35 not-started | 0 (all items live) |

---

## 4. Permission Model

### Current State

PM Central currently operates in demo mode — all routes accessible to authenticated users. No project-role enforcement is implemented in tRPC procedures yet.

### Target State (Post-Pilot)

| Role | Scope | Description |
|---|---|---|
| `viewer` | Read-only | Can view project data but not modify |
| `member` | Project | Can edit tasks, log work, participate |
| `manager` | Project | Can approve changes, manage risks, set baselines |
| `admin` | Portfolio | Can create/archive projects, manage templates, configure methodology |

### Action Namespace

```
pm.<domain>.<operation>
```

Examples: `pm.portfolio.read`, `pm.planning.write`, `pm.control.read`, `pm.ai.read`

---

## 5. Workspace Integration

PM Central is workspace-integrated:
- Projects are associated with workspaces
- Project data is scoped to workspace context
- No direct DB access from other modules — all access through tRPC

---

## 6. Governance Orchestration

Per AGENTS.md, substantial PM Central changes must follow:

**Planner → Builder → Reviewer → Tester → Governance**
