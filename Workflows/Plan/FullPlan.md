# Full Updated Plan (Phase 1 + Phase 2 + Next)

---

## Phase 1 — Control-Plane Specification (DONE)

### Workspace Foundation

- [x] Define Workspace Conceptual Model
- [x] Define Workspace Structural Layers (Identity / Tools / Data / Policy / Resources)
- [x] Clarify Navigation Architecture (Workspaces vs Digital HQ separation)
- [x] Establish Generic Workspace Template Strategy
- [x] Define Specialized Templates (Personal / Project / Research)
- [x] Create Workspace Template Matrix

### Provisioning Governance

- [x] Define Workspace Provisioning Protocol
- [x] Define Workspace Lifecycle State Machine
- [x] Define Evidence & Audit Requirements for provisioning

### Template Governance

- [x] Establish Hybrid Template Governance Model (editable drafts + admin validation + version bump)
- [x] Define Template Lifecycle (draft → submitted → approved → locked → deprecated)
- [x] Define Template Promotion Protocol
- [x] Define Semantic Versioning Rules
- [x] Define Template Registry Integration Rules

---

## Phase 2 — Machine-Enforceable Governance (ADVANCING)

### A) Schema Layer (Hard Validation Core)

- [x] WorkspaceTemplateSchema.md (canonical doc)
- [x] workspace-template.schema.json
- [x] governance-profile.schema.json
- [x] resource-tier.schema.json

### B) Registry Layer (Catalog + Discoverability + Integrity)

- [x] TemplateRegistryContract.md
- [x] templates.index.json (registry index structure)
- [x] Evidence folder conventions (Evidence/README.md + versioned paths)
- [x] Populate Evidence templates for each registry object/version
- [ ] Compute and replace all sha256 checksums (replace sha256:REPLACE_ME) — tool script ready, run on CI
- [x] Expanded lineage records beyond placeholder (initial version lineage entries)
- [x] Tighten version lineage rules inside TemplateRegistryContract.md (breaking change + migration constraints)

### C) Drift & Integrity Layer (Spec Only)

- [x] Define Template Drift Detection Model
- [x] Define Workspace Drift Detection Model
- [x] Define Freeze / Auto-remediation triggers & severity mapping

### D) Resource Governance Layer (Spec Only)

- [x] Define Resource Pool Model
- [x] Define Tier Allocation rules
- [x] Define Upgrade/Downgrade protocol
- [x] Define Quota enforcement behavior (throttle/deny/freeze)
- [x] Define Budget enforcement behavior (throttle/deny/freeze)
- [x] Define Model/Integration allowlist enforcement (server-side)

### E) Backend Control-Plane Architecture (Spec Only)

- [x] Define Workspace Domain Model (DB schema entities + relations)
- [x] Define Provisioning Service Architecture (request → approve → provision → activate)
- [x] Define Non-Bypassable Governance Middleware wiring
- [x] Define Evidence & Audit Store Architecture
- [x] Define Module Registry Runtime Enforcement (server-side gates)
- [x] Define Freeze behavior across endpoints + admin override logic

---

## Deferred — One-Time Formatting Pass (After All Files Exist)

- [ ] Normalize Markdown formatting across all Phase 1 + Phase 2 docs
- [ ] Run terminology consistency pass + naming alignment
- [ ] Validate JSON schemas via CI (schema lint + sample validation)
- [ ] Lock documentation baseline (no edits without version bump)

---

## Phase 3 — Runtime & Federation (Future)

- [ ] Inter-Workspace Protocol
- [ ] Cross-Workspace Data Sharing Rules
- [ ] Federated Governance Model
- [ ] Workspace Decommissioning Protocol
- [ ] Compliance & Reporting Specification
- [ ] HQ Control Dashboard Contracts (audit, drift, freeze, resource)

---

## Current Position (Right Now)

**You are here:**

Phase 2 → Registry Layer → Integrity Completion

**Next best actions:**

1. Populate Evidence artifacts for each object/version
2. Compute and replace sha256 checksums
3. Add the tightened lineage rules section into TemplateRegistryContract.md
