# Updated Full Plan (Phase 1 + Phase 2 + Next)

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
- [x] Define Evidence & Audit Requirements

### Template Governance

- [x] Establish Hybrid Template Governance Model (editable drafts + admin validation)
- [x] Define Template Lifecycle (draft → submitted → approved → locked → deprecated)
- [x] Define Template Promotion Protocol
- [x] Define Semantic Versioning Rules
- [x] Define Template Registry Integration Rules

---

## Phase 2 — Machine-Enforceable Governance (IN PROGRESS)

### A) Schema Layer (Hard Validation Core)

- [x] WorkspaceTemplateSchema.md (canonical doc)
- [x] workspace-template.schema.json
- [x] governance-profile.schema.json
- [x] resource-tier.schema.json

### B) Registry Layer (Catalog + Discoverability)

- [x] TemplateRegistryContract.md
- [x] templates.index.json (initial structure + sample entries)
- [ ] Add real checksums (sha256) for every referenced file
- [ ] Add real Evidence placeholders folder structure (receipts + validation reports)
- [ ] Define version lineage rules for upgrades/migrations (more than placeholder)

### C) Drift & Integrity Layer (Spec Only)

- [ ] Define Template Drift Detection Model
- [ ] Define Workspace Drift Detection Model
- [ ] Define Freeze / Auto-remediation triggers & severity mapping

### D) Resource Governance Layer (Spec Only)

- [ ] Define Resource Pool Model
- [ ] Define Tier Allocation & Upgrade/Downgrade Rules
- [ ] Define Quota Enforcement Model
- [ ] Define Budget Enforcement Model
- [ ] Define Model/Integration allowlist enforcement rules

### E) Backend Control-Plane Architecture (Spec Only)

- [ ] Define Workspace Domain Model (DB entities + relations)
- [ ] Define Provisioning Service Architecture (request → approve → provision → activate)
- [ ] Define Governance Enforcement Middleware (non-bypassable)
- [ ] Define Evidence & Audit Store Architecture
- [ ] Define Module Registry Runtime Enforcement (server-side gates)
- [ ] Define "Freeze" behavior across endpoints

---

## Deferred — One-Time Formatting Pass (After Core Files Exist)

- [ ] Normalize Markdown formatting across all Phase 1 + Phase 2 docs
- [ ] Run consistency pass on terminology + naming
- [ ] Validate JSON schemas with CI (schema lint + sample validation)
- [ ] Lock documentation baseline (no edits without version bump)

---

## Phase 3 — Runtime & Federation (Future)

- [ ] Inter-Workspace Protocol
- [ ] Cross-Workspace Data Sharing Rules
- [ ] Federated Governance Model
- [ ] Workspace Decommissioning Protocol
- [ ] Compliance & Reporting Specification
- [ ] Control Dashboard Contracts (HQ views, audit views, drift views)

---

**Next most valuable move:** finish Registry Layer properly → compute checksums + create evidence folder conventions + tighten lineage/upgrade rules.
