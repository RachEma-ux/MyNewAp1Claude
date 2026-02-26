# Expanded Lineage Records (Beyond Placeholder)

```json
{
  "lineage": [
    {
      "kind": "workspaceTemplate",
      "id": "generic.workspace",
      "fromVersion": null,
      "toVersion": "1.0.0",
      "breaking": false,
      "migrationRequired": false,
      "migrationNotes": "Initial canonical baseline. No prior versions."
    },
    {
      "kind": "workspaceTemplate",
      "id": "personal.workspace",
      "fromVersion": null,
      "toVersion": "1.0.0",
      "breaking": false,
      "migrationRequired": false,
      "migrationNotes": "Initial version derived from generic.workspace@1.0.0 (inheritance)."
    },
    {
      "kind": "workspaceTemplate",
      "id": "project.workspace",
      "fromVersion": null,
      "toVersion": "1.0.0",
      "breaking": false,
      "migrationRequired": false,
      "migrationNotes": "Initial version derived from generic.workspace@1.0.0 (inheritance)."
    },
    {
      "kind": "workspaceTemplate",
      "id": "research.workspace",
      "fromVersion": null,
      "toVersion": "1.0.0",
      "breaking": false,
      "migrationRequired": false,
      "migrationNotes": "Initial version derived from generic.workspace@1.0.0 (inheritance)."
    },
    {
      "kind": "governanceProfile",
      "id": "gov.standard",
      "fromVersion": null,
      "toVersion": "1.0.0",
      "breaking": false,
      "migrationRequired": false,
      "migrationNotes": "Initial governance posture baseline."
    },
    {
      "kind": "governanceProfile",
      "id": "gov.approval",
      "fromVersion": null,
      "toVersion": "1.0.0",
      "breaking": false,
      "migrationRequired": false,
      "migrationNotes": "Initial profile. Approval gates enabled by default for publishing/export changes."
    },
    {
      "kind": "governanceProfile",
      "id": "gov.restricted",
      "fromVersion": null,
      "toVersion": "1.0.0",
      "breaking": false,
      "migrationRequired": false,
      "migrationNotes": "Initial profile. Restricted export posture and higher audit intensity baseline."
    },
    {
      "kind": "resourceTier",
      "id": "tier.light",
      "fromVersion": null,
      "toVersion": "1.0.0",
      "breaking": false,
      "migrationRequired": false,
      "migrationNotes": "Initial tier. Low quota envelope intended for personal workspaces."
    },
    {
      "kind": "resourceTier",
      "id": "tier.standard",
      "fromVersion": null,
      "toVersion": "1.0.0",
      "breaking": false,
      "migrationRequired": false,
      "migrationNotes": "Initial tier. Default quota envelope for typical workspaces."
    },
    {
      "kind": "resourceTier",
      "id": "tier.gpu",
      "fromVersion": null,
      "toVersion": "1.0.0",
      "breaking": false,
      "migrationRequired": false,
      "migrationNotes": "Initial tier. GPU-enabled envelope for data-intensive research workloads."
    }
  ]
}
```
