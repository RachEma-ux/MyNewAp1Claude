# Workspace Template Schema — JSON Schema Definition

# Phase 2A — Schema Layer

Status: Canonical Specification
Owner: Digital HQ Control Plane
Scope: JSON Schema definition for workspace templates

---

## Schema

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
      "minLength": 3,
      "maxLength": 128,
      "pattern": "^[a-z0-9][a-z0-9._-]*$",
      "description": "Stable template identifier. Lowercase slug with dots/underscores/hyphens."
    },
    "version": {
      "type": "string",
      "pattern": "^(0|[1-9]\\d*)\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)(?:-[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?(?:\\+[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?$",
      "description": "Semantic version (semver). Immutable once locked."
    },
    "status": {
      "type": "string",
      "enum": ["draft", "submitted", "approved", "locked", "deprecated"],
      "description": "Lifecycle status. Only 'locked' is provisionable."
    },
    "displayName": {
      "type": "string",
      "minLength": 3,
      "maxLength": 200
    },
    "description": {
      "type": "string",
      "minLength": 10,
      "maxLength": 4000
    },
    "scopeAnchor": {
      "type": "string",
      "enum": ["generic", "identity", "objective", "capability", "orgUnit"],
      "description": "Primary boundary anchor for the workspace template."
    },
    "inheritsFrom": {
      "type": "object",
      "additionalProperties": false,
      "required": ["templateId", "version"],
      "properties": {
        "templateId": {
          "type": "string",
          "minLength": 3,
          "maxLength": 128,
          "pattern": "^[a-z0-9][a-z0-9._-]*$"
        },
        "version": {
          "type": "string",
          "pattern": "^(0|[1-9]\\d*)\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)(?:-[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?(?:\\+[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?$"
        }
      },
      "description": "Optional inheritance reference to a parent template."
    },
    "tags": {
      "type": "array",
      "items": { "type": "string", "minLength": 1, "maxLength": 64 },
      "maxItems": 50
    },
    "owners": {
      "type": "array",
      "items": { "type": "string", "minLength": 1, "maxLength": 128 },
      "maxItems": 50,
      "description": "Optional list of responsible owners (team/user identifiers)."
    },
    "defaults": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "modules",
        "governanceProfileDefault",
        "resourceTierDefault",
        "identityDefaults"
      ],
      "properties": {
        "modules": {
          "type": "array",
          "minItems": 1,
          "items": {
            "type": "object",
            "additionalProperties": false,
            "required": ["key", "label", "enabledByDefault"],
            "properties": {
              "key": {
                "type": "string",
                "minLength": 2,
                "maxLength": 64,
                "pattern": "^[a-z0-9][a-z0-9._-]*$"
              },
              "label": { "type": "string", "minLength": 1, "maxLength": 80 },
              "enabledByDefault": { "type": "boolean" },
              "description": { "type": "string", "maxLength": 500 },
              "dependencies": {
                "type": "array",
                "items": {
                  "type": "string",
                  "minLength": 2,
                  "maxLength": 64,
                  "pattern": "^[a-z0-9][a-z0-9._-]*$"
                },
                "maxItems": 50
              }
            }
          },
          "description": "Default module registry seed for new workspaces."
        },
        "governanceProfileDefault": {
          "type": "string",
          "minLength": 2,
          "maxLength": 64,
          "pattern": "^[a-z0-9][a-z0-9._-]*$"
        },
        "resourceTierDefault": {
          "type": "string",
          "minLength": 2,
          "maxLength": 64,
          "pattern": "^[a-z0-9][a-z0-9._-]*$"
        },
        "identityDefaults": {
          "type": "object",
          "additionalProperties": false,
          "required": ["ownershipModel", "roles"],
          "properties": {
            "ownershipModel": {
              "type": "string",
              "enum": ["singleOwner", "multiOwner", "orgUnitOwned"],
              "description": "Default ownership model for provisioned workspaces."
            },
            "roles": {
              "type": "array",
              "minItems": 1,
              "items": {
                "type": "object",
                "additionalProperties": false,
                "required": ["roleKey", "label", "defaultAssignments"],
                "properties": {
                  "roleKey": {
                    "type": "string",
                    "minLength": 2,
                    "maxLength": 64,
                    "pattern": "^[a-z0-9][a-z0-9._-]*$"
                  },
                  "label": { "type": "string", "minLength": 1, "maxLength": 80 },
                  "permissions": {
                    "type": "array",
                    "items": { "type": "string", "minLength": 1, "maxLength": 128 },
                    "maxItems": 200,
                    "description": "Optional permission identifiers (RBAC/ABAC)."
                  },
                  "defaultAssignments": {
                    "type": "array",
                    "items": {
                      "type": "string",
                      "minLength": 1,
                      "maxLength": 128
                    },
                    "maxItems": 100,
                    "description": "Optional default assignees (e.g., 'owner', 'creator', 'org.admin')."
                  }
                }
              }
            },
            "aiParticipants": {
              "type": "array",
              "items": {
                "type": "object",
                "additionalProperties": false,
                "required": ["agentKey", "mode"],
                "properties": {
                  "agentKey": {
                    "type": "string",
                    "minLength": 2,
                    "maxLength": 64,
                    "pattern": "^[a-z0-9][a-z0-9._-]*$"
                  },
                  "mode": {
                    "type": "string",
                    "enum": ["disabled", "optional", "enabled"],
                    "description": "Whether the AI participant is provisioned by default."
                  },
                  "capabilities": {
                    "type": "array",
                    "items": {
                      "type": "string",
                      "minLength": 1,
                      "maxLength": 128
                    },
                    "maxItems": 200
                  }
                }
              },
              "maxItems": 100,
              "description": "Default AI participants (if any)."
            }
          }
        }
      }
    },
    "compatibility": {
      "type": "object",
      "additionalProperties": false,
      "required": ["allowedGovernanceProfiles", "allowedResourceTiers"],
      "properties": {
        "allowedGovernanceProfiles": {
          "type": "array",
          "minItems": 1,
          "items": {
            "type": "string",
            "minLength": 2,
            "maxLength": 64,
            "pattern": "^[a-z0-9][a-z0-9._-]*$"
          }
        },
        "allowedResourceTiers": {
          "type": "array",
          "minItems": 1,
          "items": {
            "type": "string",
            "minLength": 2,
            "maxLength": 64,
            "pattern": "^[a-z0-9][a-z0-9._-]*$"
          }
        },
        "constraints": {
          "type": "object",
          "description": "Optional hard constraints for validation and provisioning.",
          "additionalProperties": true
        }
      }
    },
    "injectionPoints": {
      "type": "object",
      "additionalProperties": false,
      "required": ["policy", "resources", "audit"],
      "properties": {
        "policy": {
          "type": "array",
          "minItems": 1,
          "items": { "type": "string", "minLength": 1, "maxLength": 128 },
          "description": "Where governance policies must be injected/enforced."
        },
        "resources": {
          "type": "array",
          "minItems": 1,
          "items": { "type": "string", "minLength": 1, "maxLength": 128 },
          "description": "Where resource enforcement hooks must be applied."
        },
        "audit": {
          "type": "array",
          "minItems": 1,
          "items": { "type": "string", "minLength": 1, "maxLength": 128 },
          "description": "Where audit/evidence emission must occur."
        }
      }
    },
    "evidenceRequirements": {
      "type": "object",
      "additionalProperties": false,
      "required": ["provisioning", "promotion"],
      "properties": {
        "provisioning": {
          "type": "array",
          "minItems": 1,
          "items": { "type": "string", "minLength": 1, "maxLength": 128 },
          "description": "Evidence artifacts required on workspace provisioning."
        },
        "promotion": {
          "type": "array",
          "minItems": 1,
          "items": { "type": "string", "minLength": 1, "maxLength": 128 },
          "description": "Evidence artifacts required on template promotion/locking."
        }
      }
    },
    "moduleConfigs": {
      "type": "object",
      "description": "Per-module configuration blocks. Keys are module keys.",
      "propertyNames": {
        "type": "string",
        "minLength": 2,
        "maxLength": 64,
        "pattern": "^[a-z0-9][a-z0-9._-]*$"
      },
      "additionalProperties": {
        "type": "object",
        "additionalProperties": true,
        "description": "Extensible module config. Individual module schemas may validate this later."
      }
    },
    "overrides": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "allowModuleToggle": {
          "type": "boolean",
          "default": true,
          "description": "Whether workspace admins may enable/disable modules post-provisioning."
        },
        "allowGovernanceProfileChange": {
          "type": "boolean",
          "default": false,
          "description": "Whether governance profile can be changed after provisioning (typically admin-only with approval)."
        },
        "allowResourceTierChange": {
          "type": "boolean",
          "default": false,
          "description": "Whether resource tier can be changed after provisioning (typically admin-only with approval)."
        },
        "allowExtensions": {
          "type": "boolean",
          "default": true,
          "description": "Whether extensions are permitted for this template."
        }
      },
      "description": "Defines what can be overridden post-provisioning and during instantiation."
    },
    "extensions": {
      "type": "object",
      "description": "Extensible, namespaced fields for plugins/vendors/org-specific metadata.",
      "propertyNames": {
        "type": "string",
        "pattern": "^(org\\.[a-z0-9._-]+|plugin\\.[a-z0-9._-]+|vendor\\.[a-z0-9._-]+)$",
        "description": "Keys must be namespaced (org.*, plugin.*, vendor.*)."
      },
      "additionalProperties": {
        "description": "Arbitrary JSON payload for the namespace.",
        "oneOf": [
          { "type": "object", "additionalProperties": true },
          { "type": "array", "items": {} },
          { "type": "string" },
          { "type": "number" },
          { "type": "integer" },
          { "type": "boolean" },
          { "type": "null" }
        ]
      }
    }
  }
}
```
