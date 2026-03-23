# Governance Center

## What It Is

Governance Center is the **canonical governance knowledge and control center** for the MyNewAp1Claude platform. It is the single place to discover, navigate, and understand all governance documentation, policies, audit reports, compliance models, and module governance profiles.

## What It Is Not

Governance Center is **not** a runtime code directory. It does not contain:
- Live TypeScript/JavaScript code that runs at application startup
- Files imported by `import` statements in server or client code
- Build artifacts or CI/CD scripts
- Database schemas or migrations

Live runtime governance code remains in its original locations (`server/governance/`, `server/policies/`, `server/middleware/`, etc.) and is documented via runtime reference files within this structure.

## How It Is Structured

```
Governance-Center/
  README.md                     -- this file

  index/                        -- navigation and organization
    GOVERNANCE_INDEX.md         -- human navigation map of all governance content
    GOVERNANCE_SCOPE.md         -- what counts as governance content
    RELOCATION_MAP.md           -- old path -> new path for moved files

  global/                       -- platform-wide governance doctrine
    GOVERNANCE_MODEL.md         -- platform governance architecture
    SECURITY_MODEL.md           -- implemented security controls
    AUDIT_MODEL.md              -- audit systems and fragmentation
    OPERATIONAL_COMPLIANCE_MODEL.md -- review cadence, evidence, compliance
    CONTROL_MATRIX.md           -- controls mapped to implementation
    POLICY_ENGINE_POSITION.md   -- rule-based vs OPA clarification
    GOVERNANCE_COVERAGE_MATRIX.md -- mutation/read governance coverage
    THREAT_MODEL.md             -- threats and governance-security risks

  modules/                      -- per-app-module governance profiles
    human-resources/            -- HR module (full governance)
    ai-types/                   -- AI types / catalog (partial)
    workspace/                  -- Workspace (partial)
    automation/                 -- Automation / workflows (minimal)
    resources/                  -- Documents / RAG (minimal)
    collaboration/              -- Chat / messaging (minimal)
    pm-central/                 -- Project management (partial)
    digital-hq/                 -- Dashboard / HQ (minimal)
    governance-center/          -- Governance UI module (full)
    infrastructure/             -- Providers / secrets / keys (low)

  platform-domains/             -- cross-cutting governance domains
    governance-core/            -- core governance engine
    policy-engine/              -- policy evaluation engines
    audit-core/                 -- audit, evidence, traceability
    identity-access/            -- auth, RBAC, access control
    module-registry/            -- catalog / registry system
    publication-lifecycle/      -- lifecycle + publication gates
    runtime-agents/             -- autonomous agents + operators

  docs/                         -- existing governance specification docs
    governance-bible/           -- core governance spec (CGT v2)
    architecture/               -- governance architecture standards
    archive/                    -- historical governance design docs

  reports/                      -- audit and compliance reports
    audit/                      -- platform audit reports

  manifests/                    -- reference manifests and policies
```

## How to Use This Folder

1. **Start with** `index/GOVERNANCE_INDEX.md` for a full navigation map
2. **Understand scope** via `index/GOVERNANCE_SCOPE.md`
3. **Read global doctrine** in `global/` for platform-wide governance
4. **Check a specific module** in `modules/<module>/README.md` for its governance profile
5. **Check a platform domain** in `platform-domains/<domain>/README.md` for cross-cutting concerns
6. **Find runtime code locations** in `*_RUNTIME_REFERENCES.md` files
7. **Review audit results** in `reports/`

## Where Runtime Governance Code Lives

Runtime governance code is intentionally kept in its existing locations:

| Location | Purpose |
|---|---|
| `server/governance/` | Core governance engine, scorecard, RBAC, lifecycle, gates |
| `server/middleware/governance.ts` | Express/tRPC governance enforcement middleware |
| `server/services/governance*.ts` | Governance audit logging and metrics services |
| `server/operators/governance-operator.ts` | Autonomous governance operator |
| `server/syscall/governance-gate.ts` | Syscall deny-by-default gate |
| `server/policies/` | Runtime policy engines |
| `config/governance/` | Runtime action registry YAML |
| `controls/` | Runtime YAML control catalog |
| `scripts/governance/` | CI governance invariant checks |
| `client/src/pages/governance/` | Governance UI pages |

These are not moved because they are live implementation code referenced by imports, builds, CI, and runtime file loaders. A dedicated runtime code refactor would be required to relocate them.
