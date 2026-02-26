# Evidence Store (Template Registry)

This folder contains immutable evidence artifacts referenced by `Template/Shell/templates.index.json`.

Rules:
- Evidence paths are stable and versioned: `{objectId}/{version}/...`
- Evidence is append-only. Never edit an existing version's evidence; create a new version.
- Each promotion must include:
  - promotion-receipt.json
  - validation-report.json
