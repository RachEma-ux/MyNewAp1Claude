# Model & Integration Allowlist Enforcement
# Phase 2D — Resource Governance Layer

Status: Canonical Specification
Owner: Digital HQ Control Plane
Scope: Server-side enforcement of model and integration access

---

## 1. Purpose

Defines how model access and integration access rules declared in Resource Tiers are enforced at runtime, ensuring workspaces can only use permitted models and integrations.

---

## 2. Model Access Enforcement

### 2.1 Access Modes

From resource-tier.schema.json:

| Mode            | Behavior                                        |
|----------------|------------------------------------------------|
| denyByDefault  | No models allowed unless explicitly permitted   |
| allowByTag     | Models matching allowed tags are permitted      |
| allowById      | Only specific model IDs are permitted           |

### 2.2 Enforcement Rules

- Every model request must be checked against the workspace's active tier
- Mode determines the matching strategy
- `allowedModelTags` and `allowedModelIds` are the allowlists
- Models not on the allowlist are denied

### 2.3 Token Limits

- `maxContextTokens`: Maximum context window per request
- `maxTokensPerMinute`: TPM rate cap (0 = unspecified)
- `maxRequestsPerMinute`: RPM rate cap (0 = unspecified)

Requests exceeding these limits are denied or throttled per quota enforcement rules.

### 2.4 Enforcement Point

Model access must be checked:

- At chat/inference request entry point (server-side)
- Before model selection/routing
- Before token billing

---

## 3. Integration Access Enforcement

### 3.1 Access Modes

| Mode            | Behavior                                           |
|----------------|---------------------------------------------------|
| denyByDefault  | No integrations allowed unless explicitly permitted |
| allowByTag     | Integrations matching allowed tags are permitted    |
| allowById      | Only specific integration IDs are permitted         |

### 3.2 Credential Scoping

| Scope          | Behavior                                    |
|---------------|---------------------------------------------|
| workspaceOnly | Credentials visible only within workspace   |
| orgScoped     | Credentials shared across org workspaces    |
| adminOnly     | Credentials managed by admin only           |

### 3.3 Enforcement Rules

- Every integration invocation must be checked against the workspace's active tier
- Mode determines the matching strategy
- Credential access is scoped per the tier's `credentialScope`
- Unauthorized integration calls are denied

### 3.4 Enforcement Point

Integration access must be checked:

- At integration invocation point (server-side)
- Before credential retrieval
- Before external API call

---

## 4. Combined Enforcement Flow

```
request (model or integration)
  → identify workspace
  → load active resource tier
  → check access mode
  → match against allowlist (tags or IDs)
  → within limits? (tokens, RPM, TPM)
    → yes: allow
    → no: deny + emit audit event
```

---

## 5. Allowlist Management

- Allowlists are defined in the Resource Tier (registry artifact)
- Allowlists are immutable for locked tiers
- Changes require a new tier version
- Admin can assign a different tier to change access

---

## 6. Fallback Behavior

If a workspace has no tier assigned:

- denyByDefault applies to all models and integrations
- No model requests allowed
- No integration calls allowed
- Admin must assign a tier before workspace is operational

---

## 7. Non-Bypassable Enforcement

Access checks must:

- Execute server-side at API boundary
- Apply before model routing or integration dispatch
- Not be circumventable by UI or client configuration
- Apply to all actors (human and AI agents)

---

## 8. Audit Requirements

Every access decision must record:

- Workspace ID
- Resource type (model | integration)
- Requested resource (model ID/tag or integration ID/tag)
- Decision (allow | deny)
- Tier ID + version
- Actor
- Timestamp

---

End of Document
