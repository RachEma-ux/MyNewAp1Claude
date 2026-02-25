# Workspace Template Schema — Canonical Specification

**Phase:** Machine-Enforceable Governance
**Artifact:** `Template/Shell/20-Template-Governance/workspace-template.schema.json`
**Model Choice:** Extensible Plugin-Style Architecture (Option B)

---

# 1. Architectural Decision

We adopt an extensible template model.

This means:

- A strict, validated **core contract**
- A controlled, namespaced **extensions layer**
- Explicit override rules
- Optional capability blocks
- Compatibility validation with governance profiles and resource tiers

This balances:

User flexibility
Administrative control
Version integrity
Governance enforcement
Future extensibility

The schema defines the spine.
Extensions provide controlled freedom.

---

# 2. Design Goals

The schema enforces:

- Required structural fields
- Lifecycle state constraints
- Semantic versioning
- Module registry seeding model
- Governance profile compatibility
- Resource tier compatibility
- Injection points for HQ control
- Evidence requirements for provisioning and promotion

The schema allows:

- Namespaced extension fields
- Per-module configuration blocks
- Controlled overrides
- Optional inheritance

---

# 3. Required Core Structure

## Mandatory Fields

- `templateId`
- `version`
- `status`
- `displayName`
- `description`
- `scopeAnchor`
- `defaults`
- `compatibility`
- `injectionPoints`
- `evidenceRequirements`

## Lifecycle States

- draft
- submitted
- approved
- locked
- deprecated

Only `locked` templates are provisionable.

---

# 4. Extensibility Model

## Extensions Block

- Must be namespaced:
  - `org.*`
  - `plugin.*`
  - `vendor.*`
- Can contain arbitrary JSON
- Cannot override core fields

## Module Config Blocks

`moduleConfigs` allows:

- Module-specific configuration
- Additional properties
- Future per-module schema enforcement

## Overrides Block

Explicit flags define what can change post-provisioning:

- Module toggling
- Governance profile change
- Resource tier change
- Extension usage

---

# 5. Validation Guarantees

The schema ensures:

- Locked templates are immutable per version
- Only valid semver allowed
- Scope anchor is constrained
- Module keys follow naming standards
- Governance/resource compatibility lists are enforced
- Injection points are explicitly defined

This makes template promotion machine-verifiable.

---

# 6. Next Governance Artifacts (Ordered)

1. governance-profile.schema.json
2. resource-tier.schema.json
3. TemplateRegistryContract.md
4. templates.index.json

---

# 7. JSON Schema Definition

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://example.local/schemas/workspace-template.schema.json",
  "title": "Workspace Template Schema",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "templateId",
    "version",
    "status",
    "displayName",
    "description",
    "scopeAnchor",
    "defaults",
    "compatibility",
    "injectionPoints",
    "evidenceRequirements"
  ],
  "properties": {
    "templateId": {
      "type": "string",
      "pattern": "^[a-z0-9][a-z0-9._-]*$"
    },
    "version": {
      "type": "string",
      "pattern": "^(0|[1-9]\\d*)\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)(?:-[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?(?:\\+[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?$"
    },
    "status": {
      "type": "string",
      "enum": ["draft", "submitted", "approved", "locked", "deprecated"]
    },
    "displayName": { "type": "string" },
    "description": { "type": "string" },
    "scopeAnchor": {
      "type": "string",
      "enum": ["generic", "identity", "objective", "capability", "orgUnit"]
    },
    "inheritsFrom": {
      "type": "object",
      "required": ["templateId", "version"],
      "properties": {
        "templateId": { "type": "string" },
        "version": { "type": "string" }
      }
    },
    "defaults": {
      "type": "object",
      "required": [
        "modules",
        "governanceProfileDefault",
        "resourceTierDefault",
        "identityDefaults"
      ],
      "properties": {
        "modules": { "type": "array" },
        "governanceProfileDefault": { "type": "string" },
        "resourceTierDefault": { "type": "string" },
        "identityDefaults": { "type": "object" }
      }
    },
    "compatibility": {
      "type": "object",
      "required": ["allowedGovernanceProfiles", "allowedResourceTiers"],
      "properties": {
        "allowedGovernanceProfiles": { "type": "array" },
        "allowedResourceTiers": { "type": "array" }
      }
    },
    "injectionPoints": {
      "type": "object",
      "required": ["policy", "resources", "audit"]
    },
    "evidenceRequirements": {
      "type": "object",
      "required": ["provisioning", "promotion"]
    },
    "moduleConfigs": {
      "type": "object",
      "additionalProperties": true
    },
    "overrides": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "allowModuleToggle": { "type": "boolean" },
        "allowGovernanceProfileChange": { "type": "boolean" },
        "allowResourceTierChange": { "type": "boolean" },
        "allowExtensions": { "type": "boolean" }
      }
    },
    "extensions": {
      "type": "object",
      "propertyNames": {
        "pattern": "^(org\\.|plugin\\.|vendor\\.)"
      },
      "additionalProperties": true
    }
  }
}
```

---

End of Document
