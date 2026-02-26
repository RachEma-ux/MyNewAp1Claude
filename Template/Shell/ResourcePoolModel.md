# Resource Pool Model
# Phase 2D — Resource Governance Layer

Status: Canonical Specification
Owner: Digital HQ Control Plane
Scope: Resource allocation, pooling, and capacity management

---

## 1. Purpose

The Resource Pool Model defines how compute, storage, GPU, and network resources are organized, allocated, and tracked across the platform.

Resource Pools are the backing capacity layer behind Resource Tiers.

---

## 2. Pool Architecture

### 2.1 Pool Definition

A Resource Pool is a bounded capacity envelope:

- Pool ID (stable slug)
- Pool type (compute | storage | gpu | network | composite)
- Total capacity (units depend on type)
- Allocated capacity (sum of active tier assignments)
- Available capacity (total - allocated)
- Status (active | draining | frozen | decommissioned)

### 2.2 Pool Hierarchy

```
Organization Pool (top-level capacity)
  └── Domain Pool (per business unit / team)
       └── Workspace Pool (per workspace allocation)
```

Each level inherits constraints from its parent. A child pool cannot exceed its parent's available capacity.

---

## 3. Capacity Units

| Resource Type | Unit         | Example               |
|---------------|-------------|----------------------|
| Compute       | vCPU-hours  | 100 vCPU-hours/month |
| Memory        | GB-hours    | 512 GB-hours/month   |
| Storage       | GB-days     | 1000 GB-days/month   |
| GPU           | GPU-hours   | 50 GPU-hours/month   |
| Network       | GB egress   | 100 GB/month         |
| API calls     | requests    | 1M requests/month    |
| Tokens        | token count | 10M tokens/month     |

---

## 4. Pool Lifecycle

```
created → active → draining → decommissioned
                 → frozen (on violation)
```

- **created**: Pool defined but not yet accepting allocations
- **active**: Pool accepting allocations and serving requests
- **draining**: No new allocations; existing allocations wind down
- **frozen**: All mutations blocked; triggered by governance violation
- **decommissioned**: Pool removed from service

---

## 5. Allocation Rules

### 5.1 Reservation Model

When a workspace is provisioned:

1. Resource Tier defines the required envelope
2. System checks parent pool has sufficient capacity
3. Capacity is reserved (soft allocation)
4. On workspace activation, allocation becomes hard
5. On workspace decommission, allocation is released

### 5.2 Overcommit Policy

- Default: no overcommit (strict reservation)
- Optional: configurable overcommit ratio per pool type
- Overcommit must be declared in pool configuration
- Overcommit violations trigger alerts, not silent failures

### 5.3 Contention Resolution

When demand exceeds available capacity:

- Priority-based queuing (workspace priority field)
- First-come-first-served within same priority
- Admin override for emergency allocations
- Denied requests must emit audit events

---

## 6. Pool Monitoring

Pools must expose:

- Current utilization percentage
- Allocation count (active workspaces)
- Peak utilization (rolling window)
- Projected exhaustion date
- Alert thresholds (warning at 80%, critical at 95%)

---

## 7. Pool Governance

- Pool creation requires admin approval
- Pool capacity changes require audit trail
- Pool freezing follows Freeze Protocol
- Pool decommissioning requires all allocations released

---

End of Document
