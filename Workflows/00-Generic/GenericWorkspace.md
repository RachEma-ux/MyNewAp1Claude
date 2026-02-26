# Generic Workspace Template — Canonical Blueprint

## Purpose

The Generic Workspace Template is the canonical parent blueprint from which all specialized workspace templates inherit. It defines the minimum structural contract, governance injection points, module registry interface, and resource allocation model that every workspace must implement.

No workspace is instantiated directly from this template. It exists as the architectural baseline — a contract that specialized templates extend by overriding specific configuration sections while preserving structural integrity.

---

## Context & Scope

**Context**: A workspace is a governed execution domain inside the Digital Headquarters (Digital HQ). Digital HQ is the control plane; workspaces are execution domains.

**Scope**: The Generic Template defines the universal structure. It does not prescribe a specific anchor (identity, objective, capability). Specialized templates bind to a specific anchor.

```
Digital HQ (Control Plane)
├── Governance Engine
├── Resource Allocation Manager
├── Identity Authority
└── Workspace Registry
    ├── Workspace A ← instantiated from a specialized template
    ├── Workspace B ← instantiated from a specialized template
    └── Workspace C ← instantiated from a specialized template
```

All specialized templates inherit from this Generic Template. The inheritance contract is:

1. Structural layers are mandatory — they cannot be removed
2. Module registry contract must be implemented
3. Governance injection points must be preserved
4. Resource allocation contract must be honored
5. Overrides are permitted only in clearly marked CONFIG OVERRIDES sections

---

## Five Structural Layers

Every workspace, regardless of type, contains these five layers:

### 1. Identity Boundary

Defines who operates within the workspace.

| Attribute         | Description                                      |
|-------------------|--------------------------------------------------|
| Humans            | Users with assigned roles                        |
| AI Agents         | Autonomous agents scoped to this workspace       |
| Roles             | Permission groupings (owner, member, viewer)     |
| Authority Levels  | Escalation hierarchy for approvals               |
| Ownership Model   | Single-owner, shared-ownership, or org-unit      |

### 2. Tool Stack

Defines what capabilities are available.

| Attribute           | Description                                    |
|---------------------|------------------------------------------------|
| Enabled Modules     | Module keys active in this workspace           |
| Automation Pipelines| Workflow triggers and actions                  |
| Agent Capabilities  | What agents can do (read, write, execute)      |
| Integrations        | External service connections                   |
| UI Modules          | Frontend shell pages rendered                  |

### 3. Data Access Layer

Defines what data is visible and mutable.

| Attribute         | Description                                      |
|-------------------|--------------------------------------------------|
| Datasets          | Accessible structured data                       |
| Documents         | Uploaded and generated documents                 |
| Logs              | Activity and audit logs                          |
| External Sources  | Connected external repositories                  |
| Version Control   | Change tracking and rollback support             |

### 4. Policy Layer

Defines what rules apply.

| Attribute               | Description                                |
|-------------------------|--------------------------------------------|
| Governance Constraints  | Rules inherited from Digital HQ            |
| Approval Gates          | Actions requiring human/admin approval     |
| Compliance Requirements | Regulatory or organizational mandates      |
| Audit Logging           | Immutable record of all actions            |
| Risk Restrictions       | Prohibited actions based on risk profile   |

### 5. Resource Allocation Layer

Defines what capacity is assigned.

| Attribute          | Description                                     |
|--------------------|-------------------------------------------------|
| CPU/GPU Limits     | Compute ceiling for this workspace              |
| Storage Quotas     | Maximum data storage                            |
| Model Access       | Which LLM models are available                  |
| API Rate Limits    | Requests per minute/hour caps                   |
| Budget Caps        | Maximum spend on external services              |
| External Credentials| Service keys scoped to this workspace           |

---

## Module Registry Contract

The module registry is the mechanism by which the Tool Stack layer is realized. Both frontend and backend must implement this contract.

### Module Key Convention

```typescript
type ModuleKey = string; // e.g., "pmt", "knowledge", "agents", "reporting"
```

### Frontend Contract

1. A `ModuleGate` component wraps every module page
2. Module enablement is fetched from the backend via tRPC
3. Disabled modules render a `ModuleDisabled` placeholder
4. Navigation entries are filtered by enabled modules
5. The shell sidebar only shows enabled module entries

### Backend Contract

1. A `workspace_modules` table stores per-workspace module bindings
2. A `seedModules(workspaceId, preset)` function applies default modules on creation
3. A `requireModule(workspaceId, moduleKey)` guard throws if a module is disabled
4. Module presets are defined per workspace type
5. Module toggle is governed (requires appropriate authority)

### Preset Schema

```typescript
const MODULE_PRESETS: Record<string, ModuleKey[]> = {
  // Specialized templates override this
  default: ["overview", "settings"],
};
```

---

## Resource Allocation Contract

Every workspace must declare a resource tier. The resource tier maps to concrete limits enforced by the Digital HQ Resource Allocation Manager.

```typescript
type ResourceTier = "minimal" | "standard" | "elevated" | "premium";

interface ResourceAllocation {
  tier: ResourceTier;
  computeUnits: number;      // abstract compute units
  storageGb: number;         // storage ceiling in GB
  modelAccess: string[];     // allowed model identifiers
  apiRateLimit: number;      // requests per minute
  budgetCapUsd: number;      // monthly spend cap
}
```

Specialized templates override the default tier and limits.

---

## Governance Injection Points

These are the locations where Digital HQ governance is injected into every workspace:

| Injection Point         | Layer     | Description                                       |
|-------------------------|-----------|---------------------------------------------------|
| Identity Validation     | Identity  | Digital HQ validates all workspace members        |
| Module Approval         | Tools     | Module activation may require admin approval      |
| Data Access Audit       | Data      | All data access is logged to the audit trail      |
| Policy Inheritance      | Policy    | Global policies are inherited and cannot be removed|
| Resource Enforcement    | Resources | Allocation limits are enforced by the control plane|
| Oversight Drawer        | UI        | Every shell includes a governance oversight panel |
| Activity Logging        | Cross-cut | All mutations are recorded in the activity log    |

---

## Default Module Gating Model

The default gating model for the Generic Template:

1. `overview` — Always enabled, not gatable
2. `settings` — Always enabled, not gatable
3. All other modules — Gatable, default state defined by preset

Gating is evaluated at two levels:

- **Frontend**: `ModuleGate` component checks `enabledModules` set
- **Backend**: `requireModule()` guard checks database before executing any module procedure

---

## Minimum Required Structural Elements

### Frontend Shell

| Element           | Required | Purpose                                |
|-------------------|----------|----------------------------------------|
| Shell Container   | Yes      | `-m-6` full-bleed layout container     |
| Sidebar           | Yes      | Collapsible navigation (48px / 240px)  |
| Main Content Area | Yes      | Sub-route rendering via `<Switch>`     |
| Status Bar        | Yes      | Entity ID, module count, health dot    |
| Oversight Drawer  | Yes      | Governance panel (Sheet from right)    |
| ModuleGate        | Yes      | Wraps every module route               |
| Pin/Unpin Toggle  | Yes      | Inset panel vs. full-bleed mode        |
| Title Bar         | Yes      | Entity name, pin/close controls        |

### Backend

| Element              | Required | Purpose                              |
|----------------------|----------|--------------------------------------|
| Module Table         | Yes      | Stores module bindings per workspace |
| Activity Log Table   | Yes      | Audit trail for all mutations        |
| Module Registry      | Yes      | CRUD for module state                |
| Seed Function        | Yes      | Applies preset on creation           |
| requireModule Guard  | Yes      | Enforces gating at procedure level   |
| Module tRPC Router   | Yes      | Exposes management + engine routes   |

---

## Integration Notes

- The Generic Template is never rendered directly — it is a structural contract
- Specialized templates import and extend the Generic Template's patterns
- Digital HQ's Workspace Registry manages all workspace instances
- The control plane enforces resource limits and policy inheritance
- All workspaces share the same `workspace_modules` table structure
- The oversight drawer always queries the governance engine
- Activity logs feed into Digital HQ's global audit system

---

## Relationship to Digital HQ

```
Digital HQ (Control Plane)
│
├── Governs: Identity, Policies, Resources, Audit
│
└── Workspace Registry
    │
    ├── Generic Template (THIS) — defines the contract
    │   ├── Personal Template  — anchored to identity
    │   ├── Project Template   — anchored to objective
    │   └── Research Template  — anchored to capability
    │
    └── Workspace Instances — instantiated from specialized templates
```

The Generic Template is the interface. Specialized templates are implementations. Workspace instances are runtime objects.
