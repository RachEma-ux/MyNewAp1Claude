# Governance Scope

Defines what counts as governance content in this repository and what does not.

---

## What Belongs in Governance-Center/

Content whose primary purpose is governance documentation, reporting, reference, or policy specification:

- **Governance specification documents** — the Governance Bible, contracts, freeze protocols, enforcement rules, maturity ladder, linking frameworks
- **Global governance models** — governance model, security model, audit model, operational compliance model, control matrix, threat model, coverage matrix, policy engine position
- **Module governance profiles** — per-module governance status, controls, risks, gaps, runtime references
- **Platform domain governance profiles** — per-domain governance documentation for cross-cutting concerns
- **Governance compliance reports** — audit reports, compliance checklists, risk matrices, freeze verification, cross-domain alignment audits
- **Governance manifests** — wiki manifests, OPA policy reference copies, action registry documentation
- **Governance reference schemas** — JSON/YAML schemas that define governance data structures (reference copies, not runtime-loaded originals)
- **Governance artifacts** — evidence bundles, scorecard snapshots, audit trail exports
- **Governance index/navigation files** — this file, the governance index, relocation map
- **Archived governance design documents** — historical governance architecture, mapping, and planning docs

## What Does NOT Belong in Governance-Center/

Content that is live runtime code, build artifacts, or tightly coupled to the application's execution:

- **Runtime governance engine code** (`server/governance/*`) — TypeScript implementation of the governance engine, scorecard, RBAC, lifecycle guards, gates. These are imported by 15+ server modules and must remain in the server directory tree.
- **Runtime middleware/services** (`server/middleware/governance.ts`, `server/services/governance*.ts`) — live Express middleware and services wired into the server boot sequence.
- **Runtime config files** (`config/governance/*.yaml`, `controls/*.yaml`) — YAML files loaded at runtime via `fs.readFileSync`. Moving these would require changing runtime file lookup paths.
- **Build-copied schemas** (`schemas/`) — the build script runs `cp -r schemas dist/`. Moving schema files would break the production build.
- **CI/CD scripts** (`scripts/governance/*`, `.github/workflows/governance-*.yml`) — referenced by exact path in CI workflows. Moving these would break CI.
- **Client UI components** (`client/src/pages/governance/*`) — React components in the Vite build tree. Must remain under `client/src/`.
- **Database schema/migrations** (`drizzle/tables/governance.ts`, `drizzle/0010_governance_freeze.sql`) — Drizzle ORM requires these in the drizzle directory.
- **Test files** (`tests/governance/*`, `tests/helpers/governance-harness.ts`) — part of the Vitest test structure, imported by 25+ test files.
- **Cross-domain governance docs** (HR governance assessments, Template governance specs) — these belong to their respective domain folders, not to governance centralization. They are referenced from module governance profiles.

## The Four Types of Governance Content

### 1. Platform Governance
Cross-cutting governance that applies to the entire platform:
- Governance engine architecture
- RBAC model
- Freeze protocol
- Scorecard system
- Control catalog
- CI governance gates

**Where**: `global/` for doctrine, `platform-domains/` for implementation documentation

### 2. Module Governance
Governance specific to an app menu module:
- HR permissions and SoD
- Workspace access controls
- Agent promotion governance
- Catalog governance overlay

**Where**: `modules/<module>/`

### 3. Security Controls
Technical security mechanisms that enforce governance:
- Authentication (OAuth)
- Authorization (RBAC, procedure levels)
- Input validation (Zod schemas)
- Secrets management
- Audit logging

**Where**: `global/SECURITY_MODEL.md` + relevant platform-domain profiles

### 4. Operational Compliance
Ongoing verification that governance and security remain effective:
- Review cadence
- Evidence expectations
- Compliance ownership
- Periodic checks
- Remediation tracking

**Where**: `global/OPERATIONAL_COMPLIANCE_MODEL.md`

## Decision Rule

If in doubt, ask:

1. Is this file imported by TypeScript code? **Leave it in place.**
2. Is this file loaded at runtime via filesystem reads? **Leave it in place.**
3. Is this file referenced by a CI workflow path? **Leave it in place.**
4. Is this file part of a build pipeline? **Leave it in place.**
5. Is this file's primary purpose documentation, reporting, or reference? **Centralize it.**

A dedicated runtime governance code refactor may be approved separately in the future. Until then, runtime code stays where it is, and `Governance-Center/` serves as the canonical discovery hub.
