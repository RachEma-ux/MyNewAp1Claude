# Resource Tier Schema

> JSON Schema for resource tier definitions used by the workspace provisioning system.

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://example.local/schemas/resource-tier.schema.json",
  "title": "Resource Tier Schema",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "tierId",
    "version",
    "status",
    "displayName",
    "description",
    "allocation",
    "quotas",
    "limits",
    "cost",
    "modelAccess",
    "integrations",
    "enforcement"
  ],
  "properties": {
    "tierId": {
      "type": "string",
      "minLength": 2,
      "maxLength": 64,
      "pattern": "^[a-z0-9][a-z0-9._-]*$",
      "description": "Stable resource tier identifier (slug)."
    },
    "version": {
      "type": "string",
      "pattern": "^(0|[1-9]\\d*)\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)(?:-[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?(?:\\+[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?$",
      "description": "Semantic version (semver). Immutable once locked."
    },
    "status": {
      "type": "string",
      "enum": ["draft", "submitted", "approved", "locked", "deprecated"],
      "description": "Lifecycle status. Only 'locked' tiers should be assignable by default."
    },
    "displayName": {
      "type": "string",
      "minLength": 3,
      "maxLength": 200
    },
    "description": {
      "type": "string",
      "minLength": 10,
      "maxLength": 6000
    },
    "allocation": {
      "type": "object",
      "additionalProperties": false,
      "required": ["computeClass", "gpuClass", "storageClass", "networkClass"],
      "properties": {
        "computeClass": {
          "type": "string",
          "enum": ["xs", "sm", "md", "lg", "xl", "2xl"],
          "description": "Abstract compute class. Maps to real infra later."
        },
        "gpuClass": {
          "type": "string",
          "enum": ["none", "optional", "standard", "premium"],
          "description": "GPU availability/quality class."
        },
        "storageClass": {
          "type": "string",
          "enum": ["xs", "sm", "md", "lg", "xl"],
          "description": "Abstract storage class."
        },
        "networkClass": {
          "type": "string",
          "enum": ["restricted", "standard", "high"],
          "description": "Network egress posture and throughput class."
        },
        "notes": {
          "type": "string",
          "maxLength": 2000
        }
      }
    },
    "quotas": {
      "type": "object",
      "additionalProperties": false,
      "required": ["cpuCores", "memoryMB", "storageGB"],
      "properties": {
        "cpuCores": {
          "type": "integer",
          "minimum": 1,
          "maximum": 4096,
          "description": "Quota ceiling for CPU cores (logical)."
        },
        "memoryMB": {
          "type": "integer",
          "minimum": 256,
          "maximum": 10485760,
          "description": "Quota ceiling for RAM in MB."
        },
        "storageGB": {
          "type": "integer",
          "minimum": 1,
          "maximum": 10000000,
          "description": "Quota ceiling for storage in GB."
        },
        "gpuCount": {
          "type": "integer",
          "minimum": 0,
          "maximum": 1024,
          "default": 0,
          "description": "Quota ceiling for GPU count."
        },
        "gpuMemoryMB": {
          "type": "integer",
          "minimum": 0,
          "maximum": 10485760,
          "default": 0,
          "description": "Quota ceiling for GPU memory in MB (if applicable)."
        },
        "artifactStorageGB": {
          "type": "integer",
          "minimum": 0,
          "maximum": 10000000,
          "default": 0,
          "description": "Optional separate quota for evidence/artifact storage."
        }
      }
    },
    "limits": {
      "type": "object",
      "additionalProperties": false,
      "required": ["apiRate", "concurrency", "jobs"],
      "properties": {
        "apiRate": {
          "type": "object",
          "additionalProperties": false,
          "required": ["requestsPerMinute", "burst"],
          "properties": {
            "requestsPerMinute": {
              "type": "integer",
              "minimum": 1,
              "maximum": 100000000
            },
            "burst": {
              "type": "integer",
              "minimum": 0,
              "maximum": 100000000
            }
          }
        },
        "concurrency": {
          "type": "object",
          "additionalProperties": false,
          "required": ["maxConcurrentRuns", "maxConcurrentAgents"],
          "properties": {
            "maxConcurrentRuns": {
              "type": "integer",
              "minimum": 1,
              "maximum": 1000000
            },
            "maxConcurrentAgents": {
              "type": "integer",
              "minimum": 0,
              "maximum": 1000000
            }
          }
        },
        "jobs": {
          "type": "object",
          "additionalProperties": false,
          "required": ["maxJobDurationSeconds", "maxQueuedJobs"],
          "properties": {
            "maxJobDurationSeconds": {
              "type": "integer",
              "minimum": 1,
              "maximum": 31536000,
              "description": "Maximum duration of a single job/run in seconds."
            },
            "maxQueuedJobs": {
              "type": "integer",
              "minimum": 0,
              "maximum": 100000000
            }
          }
        }
      }
    },
    "cost": {
      "type": "object",
      "additionalProperties": false,
      "required": ["budget", "metering"],
      "properties": {
        "budget": {
          "type": "object",
          "additionalProperties": false,
          "required": ["currency", "period", "amount"],
          "properties": {
            "currency": {
              "type": "string",
              "minLength": 3,
              "maxLength": 8,
              "description": "ISO currency code (or internal token)."
            },
            "period": {
              "type": "string",
              "enum": ["daily", "weekly", "monthly", "quarterly", "yearly"],
              "description": "Budget period for this tier."
            },
            "amount": {
              "type": "number",
              "minimum": 0,
              "description": "Budget cap amount."
            }
          }
        },
        "metering": {
          "type": "object",
          "additionalProperties": false,
          "required": ["enabled", "dimensions"],
          "properties": {
            "enabled": {
              "type": "boolean",
              "default": true
            },
            "dimensions": {
              "type": "array",
              "minItems": 1,
              "items": {
                "type": "string",
                "enum": [
                  "cpuSeconds",
                  "gpuSeconds",
                  "storageGBDays",
                  "egressGB",
                  "apiCalls",
                  "tokensIn",
                  "tokensOut"
                ]
              },
              "description": "Which metering dimensions apply for this tier."
            }
          }
        },
        "extensions": {
          "type": "object",
          "description": "Optional org/plugin/vendor billing metadata.",
          "propertyNames": {
            "type": "string",
            "pattern": "^(org\\.[a-z0-9._-]+|plugin\\.[a-z0-9._-]+|vendor\\.[a-z0-9._-]+)$"
          },
          "additionalProperties": true
        }
      }
    },
    "modelAccess": {
      "type": "object",
      "additionalProperties": false,
      "required": ["mode", "allowedModelTags", "maxContextTokens"],
      "properties": {
        "mode": {
          "type": "string",
          "enum": ["denyByDefault", "allowByTag", "allowById"],
          "description": "How model access is granted under this tier."
        },
        "allowedModelTags": {
          "type": "array",
          "items": { "type": "string", "minLength": 1, "maxLength": 64 },
          "default": [],
          "description": "Tags of models permitted (if mode=allowByTag)."
        },
        "allowedModelIds": {
          "type": "array",
          "items": { "type": "string", "minLength": 1, "maxLength": 128 },
          "default": [],
          "description": "Explicit model IDs permitted (if mode=allowById)."
        },
        "maxContextTokens": {
          "type": "integer",
          "minimum": 256,
          "maximum": 10000000,
          "description": "Max context window allowed under this tier."
        },
        "maxTokensPerMinute": {
          "type": "integer",
          "minimum": 0,
          "maximum": 1000000000,
          "default": 0,
          "description": "Optional TPM cap (0 means unspecified)."
        },
        "maxRequestsPerMinute": {
          "type": "integer",
          "minimum": 0,
          "maximum": 100000000,
          "default": 0,
          "description": "Optional RPM cap (0 means unspecified)."
        }
      }
    },
    "integrations": {
      "type": "object",
      "additionalProperties": false,
      "required": ["mode", "allowedIntegrationTags"],
      "properties": {
        "mode": {
          "type": "string",
          "enum": ["denyByDefault", "allowByTag", "allowById"],
          "description": "How external integration access is granted."
        },
        "allowedIntegrationTags": {
          "type": "array",
          "items": { "type": "string", "minLength": 1, "maxLength": 64 },
          "default": [],
          "description": "Permitted integration tags."
        },
        "allowedIntegrationIds": {
          "type": "array",
          "items": { "type": "string", "minLength": 1, "maxLength": 128 },
          "default": [],
          "description": "Permitted integration IDs."
        },
        "credentialScope": {
          "type": "string",
          "enum": ["workspaceOnly", "orgScoped", "adminOnly"],
          "default": "workspaceOnly",
          "description": "How credentials are scoped for this tier."
        }
      }
    },
    "enforcement": {
      "type": "object",
      "additionalProperties": false,
      "required": ["quotaAction", "rateLimitAction", "budgetAction", "nonBypassable"],
      "properties": {
        "quotaAction": {
          "type": "string",
          "enum": ["throttle", "deny", "freeze"],
          "description": "What happens when a quota is exceeded."
        },
        "rateLimitAction": {
          "type": "string",
          "enum": ["throttle", "deny", "freeze"],
          "description": "What happens when rate limits are exceeded."
        },
        "budgetAction": {
          "type": "string",
          "enum": ["throttle", "deny", "freeze"],
          "description": "What happens when budget caps are exceeded."
        },
        "nonBypassable": {
          "type": "boolean",
          "default": true,
          "description": "Enforcement must be applied at server boundaries and cannot be bypassed by UI."
        },
        "extensions": {
          "type": "object",
          "description": "Plugin/vendor/org-specific enforcement metadata.",
          "propertyNames": {
            "type": "string",
            "pattern": "^(org\\.[a-z0-9._-]+|plugin\\.[a-z0-9._-]+|vendor\\.[a-z0-9._-]+)$"
          },
          "additionalProperties": true
        }
      }
    },
    "extensions": {
      "type": "object",
      "description": "Extensible, namespaced fields for plugins/vendors/org-specific metadata.",
      "propertyNames": {
        "type": "string",
        "pattern": "^(org\\.[a-z0-9._-]+|plugin\\.[a-z0-9._-]+|vendor\\.[a-z0-9._-]+)$"
      },
      "additionalProperties": true
    }
  },
  "allOf": [
    {
      "if": { "properties": { "status": { "const": "locked" } }, "required": ["status"] },
      "then": { "required": ["version"] }
    }
  ]
}
```
