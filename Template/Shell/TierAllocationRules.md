# Tier Allocation Rules
# Phase 2D — Resource Governance Layer

Status: Canonical Specification
Owner: Digital HQ Control Plane
Scope: Resource Tier assignment and binding

---

## 1. Purpose

Defines how Resource Tiers are assigned to workspaces and how allocations are validated, tracked, and enforced.

---

## 2. Allocation Lifecycle

```
requested → validated → reserved → bound → active → released
```

- **requested**: Workspace creation specifies a tier
- **validated**: System checks tier exists, is locked, and is compatible
- **reserved**: Capacity reserved in parent pool
- **bound**: Tier bound to workspace record
- **active**: Workspace operational under tier constraints
- **released**: Workspace decommissioned, capacity returned

---

## 3. Allocation Validation

Before binding a tier, the system MUST verify:

1. Tier exists in registry with status = locked
2. Tier is not deprecated
3. Tier checksums are valid
4. Tier is compatible with the workspace template
5. Tier is compatible with the governance profile
6. Parent pool has sufficient capacity
7. Requestor has permission to use this tier

Failure at any step blocks allocation.

---

## 4. Tier-to-Workspace Binding Rules

- One workspace = one active resource tier (at any point in time)
- Tier binding is recorded with timestamp and actor
- Tier binding creates an audit entry
- Tier binding snapshot is preserved for drift detection

---

## 5. Default Tier Assignment

Each workspace template declares a default tier:

| Template   | Default Tier    |
|-----------|----------------|
| Generic   | tier.standard  |
| Personal  | tier.light     |
| Project   | tier.standard  |
| Research  | tier.gpu       |

Default can be overridden at provisioning time if the requestor has permission and the tier is compatible.

---

## 6. Multi-Tier Scenarios

Future support for composite allocations:

- Primary tier (compute + storage)
- Supplementary tier (GPU burst)
- Shared tier (cross-workspace pool)

Multi-tier is deferred to Phase 3 but the allocation model must not preclude it.

---

## 7. Allocation Audit

Every allocation event must record:

- Workspace ID
- Tier ID + version
- Pool ID
- Action (reserve | bind | upgrade | downgrade | release)
- Actor
- Timestamp
- Justification (if override)

---

End of Document
