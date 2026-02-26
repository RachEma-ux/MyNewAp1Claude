# Workspace Template Schema — Canonical Specification

# Phase 2A — Schema Layer

Status: Canonical Specification
Owner: Digital HQ Control Plane
Scope: Workspace template schema definition

---

## 1. Architectural Decision

We adopt an extensible template model.

This means:

- A strict, validated core contract
- A controlled, namespaced extensions layer
- Explicit override rules
- Optional capability blocks
- Compatibility validation with governance profiles and resource tiers

This balances:

- User flexibility
- Administrative control
- Version integrity
- Governance enforcement
- Future extensibility

The schema defines the spine.
Extensions provide controlled freedom.

---

## 2. Design Goals

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

## 3. Required Core Structure

### Mandatory Fields

- templateId
- version (semver)
- status (draft | submitted | approved | locked | deprecated)
- displayName
- description
- scopeAnchor (identity | objective | capability | orgUnit | generic)
- defaults
- compatibility
- injectionPoints
- evidenceRequirements

Only templates in `locked` state may provision workspaces.

---

## 4. Extensibility Model

### Extensions Block

- Keys must be namespaced:
  - org.*
  - plugin.*
  - vendor.*
- Values may contain arbitrary JSON
- Core fields cannot be overridden

### Module Config Blocks

`moduleConfigs` allows:

- Module-specific configuration
- Future per-module schema enforcement

### Overrides Block

Defines what may change after provisioning:

- Module toggling
- Governance profile change
- Resource tier change
- Extension usage

---

## 5. Validation Guarantees

The schema ensures:

- Locked templates are immutable per version
- Only valid semver values are allowed
- Scope anchors are constrained
- Module keys follow naming standards
- Governance/resource compatibility lists are enforced
- Injection points are explicitly defined

This makes template promotion machine-verifiable.

---

## 6. JSON Schema Definition

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
