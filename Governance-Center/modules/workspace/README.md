# Workspace — Module Governance

## What the Workspace Module Is

The Workspace module is the primary organizational unit of the platform. A workspace is a controlled, contextual execution environment where users and agents deploy structured activities using a defined set of resources, with isolated state, permissions, and configuration.

## What Governance Covers in Workspace

Governance covers:

- **Lifecycle management** — 9-status model controlling workspace progression from draft to active (or rejection/archival/deletion)
- **Promotion gates** — content-completeness validation gates enforced at every lifecycle transition from `submitForReview` through `activate`
- **Authority enforcement** — admin role checks on governance transitions (review, approve, publish, activate, reject, archive, delete); capability-based checks on member/crew/settings mutations
- **Participation governance** — Team (human) and Crew (AI) membership controlled via capability checks
- **Shell visibility** — manager-configurable participant visibility through `shellConfig`
- **Audit trail** — workspace activity log recording lifecycle transitions, member/crew changes, wizard steps, and configuration updates
- **Module enablement** — per-workspace module gates enforced server-side
- **Publication exposure** — distinction between WS List (management inventory) and WS Catalog (published workspace discovery)

## Governance-Pack Status

| Dimension | Status |
|---|---|
| Documentation pack | **Complete** — all 7 module packet files present |
| Runtime governance | **Substantial** — `governedProcedure` on mutations, lifecycle gates, capability checks, activity logging |
| Known gaps | See [MODULE_OPEN_GAPS.md](MODULE_OPEN_GAPS.md) |

### Documentation-Pack vs Runtime Maturity

The documentation pack describes the actual current runtime behavior truthfully. Where the runtime has gaps (e.g., capability-based authority not yet enforced on all lifecycle transitions, audit log failure swallowing), these are documented explicitly in the gaps and risks files. The documentation does not overclaim.

## Where to Start Reading

1. **This file** — module overview and lifecycle model
2. [MODULE_GOVERNANCE_PROFILE.md](MODULE_GOVERNANCE_PROFILE.md) — governance profile, authority model, compliance principles
3. [MODULE_CONTROL_SURFACE.md](MODULE_CONTROL_SURFACE.md) — every governance-relevant endpoint mapped
4. [MODULE_AUDIT_MODEL.md](MODULE_AUDIT_MODEL.md) — what is logged, what is not
5. [MODULE_RISKS.md](MODULE_RISKS.md) — risk register
6. [MODULE_OPEN_GAPS.md](MODULE_OPEN_GAPS.md) — honest gap inventory
7. [MODULE_PERIODIC_CHECKS.md](MODULE_PERIODIC_CHECKS.md) — recurring governance checks
8. [MODULE_RUNTIME_REFERENCES.md](MODULE_RUNTIME_REFERENCES.md) — source file map

## Lifecycle Model

Workspaces follow a canonical 9-status lifecycle:

```
draft → ready_for_review → under_review → approved → published → active
                                         ↘ rejected → draft (return)
                                                     → archived
active → archived → deleted
approved → archived
published → archived
rejected → archived
archived → draft (return, admin only)
draft → deleted (shortcut)
```

### Status Definitions

| Status | Meaning | Mutability |
|---|---|---|
| `draft` | Initial creation state; workspace is being defined | Setup-mutable (workspace.* actions allowed) |
| `ready_for_review` | Manager has submitted for governance review | Setup-mutable |
| `under_review` | Admin/governance has begun validation | Read-only |
| `approved` | Passed review; not yet visible to participants | Read-only |
| `published` | Visible in WS Catalog; not yet executing | Read-only |
| `active` | Fully operational; execution allowed | Fully executable |
| `rejected` | Failed review; can return to draft | Setup-mutable |
| `archived` | Retired; read-only with escape-hatch actions | Read-only (limited actions allowed) |
| `deleted` | Terminal; all access blocked | Non-accessible |

### Key Distinctions

- **`approved` != `published` != `active`** — Approval means governance review passed. Publication means visible in the WS Catalog. Activation means full execution is allowed. These are three separate transitions.
- **WS List != WS Catalog** — WS List is the management inventory showing all workspaces across all statuses. WS Catalog (`wsCatalogRouter.listPublished`) shows only `published` + `active` workspaces for participant discovery.
- **The Workspace Wizard is a governance intake pipeline** — It collects identity, purpose, anchor, scope, activities, needs, team, crew, and configuration data. This data feeds the promotion gate (`validateDraftCompleteness`) which enforces that workspaces cannot progress to review without structured governance content.

## Module Packet Files

| File | Purpose |
|---|---|
| [MODULE_GOVERNANCE_PROFILE.md](MODULE_GOVERNANCE_PROFILE.md) | Governance profile, authority, compliance principles |
| [MODULE_CONTROL_SURFACE.md](MODULE_CONTROL_SURFACE.md) | All governance-relevant endpoints and their controls |
| [MODULE_AUDIT_MODEL.md](MODULE_AUDIT_MODEL.md) | Audit logging model and current coverage |
| [MODULE_PERIODIC_CHECKS.md](MODULE_PERIODIC_CHECKS.md) | Recurring governance checks |
| [MODULE_RISKS.md](MODULE_RISKS.md) | Risk register |
| [MODULE_OPEN_GAPS.md](MODULE_OPEN_GAPS.md) | Known governance gaps |
| [MODULE_RUNTIME_REFERENCES.md](MODULE_RUNTIME_REFERENCES.md) | Runtime file map |

## External References

| Document | Location | Purpose |
|---|---|---|
| Workspace Foundational Contract | `docs/workspace/WORKSPACE_FOUNDATIONAL_CONTRACT.md` | Canonical workspace definition and invariant matrices |
| Workspace Invariants | `docs/workspace/WORKSPACE_INVARIANTS.md` | WS-01 through WS-15 invariant specifications |
| Workspace Definition | `Workspaces/workspace-definition.md` | Workspace type and purpose documentation |
| WS Wizard Design | `Workspaces/WS Wizard — Governance-First Design.md` | Wizard screen-by-screen specification |
