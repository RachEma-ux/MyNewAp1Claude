# Governance Centrale

The canonical place to find governance content in this repository.

## Purpose

Governance Centrale consolidates all governance-facing documentation, reports, manifests, schemas, artifacts, and indexes into a single discoverable location. It serves as the governance control center for the platform.

Runtime governance implementation code (engines, routers, middleware, services) remains in its original server-side locations. This folder does not contain live runtime code.

## Folder Structure

```
Governance-Centrale/
  README.md                 -- this file
  index/
    GOVERNANCE_INDEX.md     -- navigational map of all governance content
    RELOCATION_MAP.md       -- old path -> new path for moved files
    GOVERNANCE_SCOPE.md     -- definition of what counts as governance content
  docs/
    governance-bible/       -- core governance specification documents
    archive/                -- historical governance design docs
    architecture/           -- governance architecture standards
    Governance_Page_Content.md
    AI-Types-Governance-Alignment-Architecture.md
    policies-README.md
  reports/
    audit/                  -- platform audit reports (mutation, gates, risk, freeze)
    GOVERNANCE_COMPLIANCE_REPORT.md
    cross-domain-alignment-audit-2026-03-21.md
  manifests/
    wiki-governance-manifest.json
    agent_governance.rego
  artifacts/                -- governance evidence artifacts
  schemas/                  -- governance reference schemas
```

## Where Runtime Governance Code Lives

Runtime governance implementation is intentionally kept in its existing locations:

| Location | Purpose |
|---|---|
| `server/governance/` | Core governance engine, scorecard, RBAC, lifecycle, gates |
| `server/middleware/governance.ts` | Express/tRPC governance enforcement middleware |
| `server/services/governanceLogger.ts` | Governance audit logging service |
| `server/services/governanceMetrics.ts` | Governance metrics (Prometheus) |
| `server/operators/governance-operator.ts` | Autonomous governance operator |
| `server/syscall/governance-gate.ts` | Syscall deny-by-default gate |
| `server/policies/` | Runtime policy engines |
| `config/governance/` | Runtime action registry YAML |
| `controls/` | Runtime YAML control catalog |
| `scripts/governance/` | CI governance invariant checks |
| `scripts/governance-validation/` | CI governance validation probes |
| `client/src/pages/governance/` | Governance UI pages |

These are not moved because they are live implementation code referenced by imports, builds, CI, and runtime file loaders. A dedicated runtime code refactor would be required to relocate them.

## Contributing

When adding new governance documentation, reports, or reference material, place it here under the appropriate subdirectory. Runtime governance code changes should continue to be made in their existing implementation locations.
