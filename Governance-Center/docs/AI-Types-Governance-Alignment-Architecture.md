# AI Types Governance & Alignment Architecture

**Detailed Technical Conception, Governance Rules, and End-to-End Design**

**Frontend · Middleware · Backend**

---

## 1. Executive Summary

This document defines the authoritative technical methodology for aligning all AI Types in the platform under a single governance-safe architectural model.

The AI Types covered are:

- Agents
- LLMs
- Models
- Bots
- Providers

The governing principle is simple:

- Source domains create and manage their own entities.
- Catalog is the only entry point for intake.
- Catalog is the only authority for candidate creation, approval, publication, activation, and runtime authority.

This architecture exists to guarantee:

- governance integrity
- architectural consistency
- predictable UX across AI domains
- strict separation of concerns
- elimination of hidden bypass paths
- safe scalability as more AI Types are introduced

This is not just a UI pattern. It is a full-stack governance model spanning:

- frontend interaction design
- routing and middleware behavior
- backend services and routers
- persistence boundaries
- lifecycle enforcement
- auditability and runtime authority

---

## 2. Why This Methodology Exists

Without a unified architecture, AI domains drift into inconsistent behavior:

- one domain creates Catalog entries directly
- another goes through an import wizard
- another grants readiness through vague terms
- another bypasses approval and behaves as if runtime-ready

That creates structural risk.

The platform needs one canonical answer to these questions:

- Who creates the domain entity?
- Who decides whether the entity is ready?
- Who owns import into Catalog?
- Who creates the candidate entry?
- Who approves publication?
- Who grants runtime authority?

The answer must always be:

| Responsibility | Owner |
|---|---|
| Domain entity creation | Source domain |
| Readiness evaluation | Source domain |
| Catalog intake | Catalog |
| Candidate creation | Catalog |
| Review / approval / publication | Catalog |
| Runtime authority | Catalog |

---

## 3. The Foundational Principle

### 3.1 Source Domain vs Catalog

Every AI Type must be split conceptually into two layers:

#### A. Source Domain

The source domain is where the entity is authored, configured, validated, and prepared.

Examples:

- Agents domain creates agents
- LLM domain creates or registers LLMs
- Models domain creates model entities
- Bots domain creates bot entities
- Providers domain creates provider entities

The source domain is responsible for:

- entity definition
- domain-specific configuration
- domain-specific validation
- dependency integrity
- readiness evaluation

The source domain is **not** responsible for:

- Catalog candidate creation
- publication
- runtime authority

---

#### B. Catalog Domain

Catalog is the authoritative intake and lifecycle control plane.

Catalog is responsible for:

- accepting eligible domain entities
- creating candidate entries
- running review / approval logic
- controlling publication
- controlling activation
- being the only source of runtime-authoritative assets

Catalog is **not** responsible for:

- domain-specific creation workflows
- domain-specific editing
- domain-specific dependency management

---

### 3.2 Absolute Rule

**No AI entity becomes runtime-usable outside Catalog.**

This means:

- a deployable entity is not runtime-ready
- an approved source-domain record is not runtime authority
- a selected entity is not published
- a candidate entry is not active

Runtime authority only exists when Catalog says so.

---

## 4. Canonical End-to-End Lifecycle

The universal lifecycle for all AI Types is:

1. Source domain creates entity
2. Source domain validates entity
3. Source domain computes readiness
4. User starts Catalog intake from Catalog → New Entry
5. Catalog delegates selection to source domain
6. Source domain returns selected eligible entity
7. Catalog creates candidate entry
8. Catalog runs review / validation / approval
9. Catalog publishes
10. Catalog activates
11. Runtime authority is granted

This separates three distinct states:

**State 1 — Domain Entity Exists**

The entity exists inside its own domain.

**State 2 — Catalog Candidate Exists**

The entity has entered governance-controlled intake.

**State 3 — Runtime Authority Exists**

The Catalog entry has passed all required stages and is now active/published.

These states must never be collapsed into one.

---

## 5. AI Types Alignment Methodology

### 5.1 Uniform Import Rule

All AI Types must enter Catalog in the same structural way:

```
Catalog
→ New Entry
→ Import
→ CatalogImportWizard
→ From Wizard
→ Source Domain Selection Mode
→ returnTo Catalog
→ Catalog creates candidate
→ review / publish / activate
```

This is the canonical method for:

- Agents
- LLMs
- Models
- Bots
- Providers

---

### 5.2 Why the Pattern Matters

This pattern guarantees that:

- import begins from one place only
- source domains cannot silently self-publish into Catalog
- candidate creation is centralized
- the UI remains consistent
- governance can be audited uniformly
- lifecycle transitions are enforceable

---

## 6. Governance Rules

These are mandatory. They are not suggestions.

### 6.1 Rule 1 — Catalog Owns Intake

All AI asset import must begin at:

```
Catalog → New Entry
```

**Forbidden:**

- Domain page → directly create Catalog candidate

---

### 6.2 Rule 2 — Domain Cannot Grant Runtime

Source domains must never:

- activate runtime authority
- mark assets as runtime-ready
- bypass publication
- expose assets as final runtime-authoritative objects

---

### 6.3 Rule 3 — Deployable Means Intake Eligibility Only

**Deployable means:**

- Eligible to enter Catalog intake

**Deployable does not mean:**

- active
- published
- callable at runtime
- globally usable

---

### 6.4 Rule 4 — Candidate Creation Belongs Only to Catalog

Candidate creation must be performed by Catalog services only.

Source domains may provide:

- sourceType
- sourceId
- readiness state
- metadata

But they must not create the candidate entry directly.

---

### 6.5 Rule 5 — Approval is Mandatory Before Activation

No entry may become active without approval.

Example rule:

```
entry.status = active
ONLY IF
reviewState = approved
```

---

### 6.6 Rule 6 — Publish is Immutable

Published entries must be:

- versioned
- immutable
- auditable
- attributable to a specific candidate and review history

---

### 6.7 Rule 7 — Audit Logging is Mandatory

The following must always be audited:

- source entity creation
- readiness state changes
- candidate creation
- approval decisions
- publish operations
- activation operations
- suspension / revocation operations

---

### 6.8 Rule 8 — No Direct Writes to Catalog Storage from Source Domains

Source-domain routers must not directly write to `catalog_entries` as their normal creation path.

If a source-domain router writes directly to Catalog storage, governance separation is broken.

---

## 7. Technical Conception — Backend

### 7.1 Backend Responsibility Layers

#### Source Domain Routers

Examples:

- `server/routers/agents.ts`
- `server/routers/llm.ts`
- `server/routers/models.ts`
- `server/routers/bots.ts`
- `server/routers/providers.ts`

These routers should do the following:

- create domain records
- update domain records
- validate dependencies
- compute readiness
- expose lists and detail endpoints
- expose deployable filtering

They should **not**:

- create Catalog candidate entries directly
- self-publish
- self-activate

---

#### Catalog Routers

Examples:

- `server/routers/catalogManage.ts`
- `server/routers/catalogRegistry.ts`

These routers own:

- intake
- candidate creation
- review state
- validation stages
- publishing
- activation
- runtime authority resolution

---

### 7.2 Required Data Separation

**Old Incorrect Pattern**

```
modelsRouter.register()
→ insert into catalog_entries
```

This is wrong because domain creation and Catalog intake are collapsed.

---

**Correct Pattern**

```
modelsRouter.register()
→ insert into models table

Catalog intake
→ create candidate in catalog_entries
```

The same must hold for Bots and any other AI Type that currently behaves as Catalog-first without proper separation.

---

### 7.3 Domain Data Model

Each AI Type should ideally have a dedicated domain record/table or equivalent authoritative storage surface.

Domain-owned entities should hold:

- identity
- description
- config
- dependencies
- lifecycle metadata internal to domain
- readiness metadata
- blocking reasons
- source-specific fields

---

### 7.4 Catalog Data Model

Catalog should hold only what Catalog owns:

- candidate entry
- source reference
- review state
- publication state
- activation state
- tags and classification
- governance metadata
- publication bundle references
- audit references

---

### 7.5 Import Contract

The backend import contract should look conceptually like:

```json
{
  "sourceType": "agent" | "llm" | "model" | "bot" | "provider",
  "sourceId": number
}
```

Catalog then resolves:

- source existence
- source eligibility
- duplicate prevention
- policy checks
- classification defaults
- initial candidate state

And creates:

```json
{
  "entryType": "<sourceType>",
  "sourceId": "<sourceId>",
  "status": "draft",
  "reviewState": "needs_review"
}
```

---

### 7.6 Readiness Evaluation Contract

Every source domain must expose readiness through a stable contract.

Recommended service interface:

```typescript
isDeployable(entity): boolean
getBlockingReasons(entity): string[]
getDeployableStatus(entity): "draft" | "building" | "blocked" | "deployable" | "imported"
```

The actual statuses may vary slightly by domain, but the exported contract must clearly support:

- whether the entity is eligible for Catalog intake
- why it is blocked if it is not

---

### 7.7 Dependency Validation

Each domain must validate its own dependency graph before an entity can become deployable.

Examples:

- Bot validates referenced agent and LLM
- Model validates provider compatibility
- LLM validates artifact, evaluation, handoff completeness
- Provider validates credentials / capabilities / health
- Agent validates template / policy / config integrity

This validation is source-domain governance, not Catalog governance.

---

### 7.8 Duplicate Prevention

Catalog must prevent duplicate candidate creation for the same source entity.

A Catalog candidate should be uniquely associated with:

- sourceType
- sourceId
- active candidate/published lineage rules

This must be checked in Catalog, not only in the UI.

---

## 8. Technical Conception — Middleware / Routing

### 8.1 Query-Param Mode Switching

All source selection pages must support a special intake mode.

Required query parameters:

```
mode=catalog-import
deployableOnly=1
returnTo=<catalog-path>
```

Agents may use `callableOnly=1` instead of `deployableOnly=1` if that is their current domain terminology.

---

### 8.2 Why Query-Param Mode is Required

The same page must support two behaviors:

**Normal Mode**

- browsing
- managing
- filtering
- opening details
- editing / lifecycle actions

**Catalog-Import Mode**

- selection-only behavior
- only eligible entities visible
- clear return control back to Catalog
- no ownership of import initiation

Using a query-param driven mode avoids duplicating pages while keeping the behavior explicit.

---

### 8.3 Middleware Responsibilities

The routing layer or page controller logic must:

- detect `mode=catalog-import`
- detect `deployableOnly=1` or equivalent
- detect `returnTo`
- switch page rendering into picker mode
- disable management actions
- enable selection action
- handle return to Catalog

---

### 8.4 Example Mode Detection

Conceptually:

```typescript
const params = new URLSearchParams(location.search)

const isCatalogImport = params.get("mode") === "catalog-import"
const deployableOnly = params.get("deployableOnly") === "1"
const returnTo = params.get("returnTo")
```

---

### 8.5 Filtering Contract

In special mode:

```typescript
const filteredItems = isCatalogImport
  ? items.filter(isDeployable)
  : items
```

This is not optional. Import mode must not show non-eligible assets.

---

### 8.6 Return Control Contract

After source selection:

```typescript
navigate(returnTo, {
  state: {
    selectedSource: {
      type: "model",
      id: entity.id
    }
  }
})
```

This return contract is essential because:

- Catalog must regain control
- source pages must not create candidates themselves
- the intake pipeline must continue inside Catalog

---

## 9. Technical Conception — Frontend

### 9.1 Frontend Design Goal

Frontend must enforce governance by design, not just by backend validation.

Users should be unable to misunderstand the flow.

That means:

- they start in Catalog
- they select import method in Catalog
- they are delegated to a source-domain selector
- they return to Catalog
- Catalog continues governance pipeline

The frontend must make this obvious.

---

### 9.2 Catalog as Mandatory Entry Point

The UI must clearly establish that import begins only here:

```
Catalog → New Entry → Import
```

There must be no primary UX path that makes it look as if import starts from:

- `/list/llms`
- `/list/models`
- `/list/bots`
- `/list/providers`

Those pages are inventories and selectors, not owners of intake.

---

### 9.3 Dual-Mode Source Pages

Every AI Type page used for selection must support two modes.

#### Normal Mode

**Purpose:**

- inventory
- management
- operational status visibility

**Behavior:**

- full dataset
- normal filters
- management actions
- detail navigation
- lifecycle actions if domain supports them

---

#### Catalog-Import Mode

**Purpose:**

- select one eligible entity to continue Catalog candidate creation

**Behavior:**

- only eligible entities shown
- clear mode banner
- selection action replaces management actions
- no edit/delete/publish actions
- return to Catalog on selection

---

### 9.4 Required UI Elements in Catalog-Import Mode

#### Banner

Every selector page must display a banner such as:

> **Catalog Import Mode**
> Select a deployable \<entity\> to continue Catalog candidate creation

This prevents confusion between browsing and intake modes.

---

#### Selection Action

The action must say:

- Select Agent
- Select LLM
- Select Model
- Select Bot
- Select Provider

It must **not** say:

- Import now
- Publish
- Activate

Because the action is selection, not import ownership.

---

#### Filtering

The list must be visibly constrained to deployable/import-eligible items only.

---

#### Layout

The page must behave like a picker, not a dashboard.

That means:

- fewer management actions
- clearer focus on selection
- reduced operational clutter
- clear return semantics

---

### 9.5 Inventory Pages

Each domain should have a canonical inventory page:

- Agents: specialized governance page
- LLMs: `/list/llms`
- Models: `/list/models`
- Bots: `/list/bots`
- Providers: `/list/providers`

These pages serve two roles:

- normal mode inventory
- Catalog import selector in special mode

This is the preferred design because it avoids duplicate page implementations.

---

### 9.6 Status Display

The UI must display readiness clearly.

Recommended surfaced statuses:

**LLMs**

- draft
- building
- blocked
- deployable
- imported

**Models / Bots / Providers**

- draft
- blocked
- deployable
- imported

**Agents**

- Existing agent lifecycle/status plus import-eligible/callable state

The key requirement is not exact wording consistency across every internal lifecycle, but that the import-readiness signal is explicit.

---

### 9.7 Important UX Rule

```
Selection ≠ Import
Import ≠ Publish
Publish ≠ Runtime
```

The frontend must never blur these stages.

---

## 10. CatalogImportWizard Design

### 10.1 Role of the Wizard

CatalogImportWizard is the orchestration layer between:

- Catalog
- source-domain selection pages

It must:

- let the user choose import method
- delegate selection to a source domain
- preserve return path
- resume candidate creation when control returns

---

### 10.2 From Wizard Section

For every AI Type, the wizard should provide an entry like:

- Agent Wizard
- LLM Selector
- Model Selector
- Bot Selector
- Provider Selector

These should navigate into the domain in special mode.

---

### 10.3 Delegation Example

For Models, conceptually:

```tsx
<Button onClick={() =>
  navigate("/list/models?mode=catalog-import&deployableOnly=1&returnTo=/llm/catalogue/candidate")
}>
  Model Wizard
</Button>
```

The same structure should be replicated per AI Type.

---

### 10.4 Candidate Page Consumption

When control returns from a source domain, the Catalog candidate page must consume the selected source from navigation state or equivalent transport mechanism.

Conceptually:

```typescript
const selectedSource = location.state?.selectedSource
```

Then Catalog performs candidate creation using that source.

This is the boundary where Catalog resumes ownership.

---

## 11. Governance Integrity Design

### 11.1 Governance Layers

#### Layer 1 — Source Domain Governance

The source domain guarantees:

- valid entity structure
- valid dependencies
- accurate deployable computation
- accurate blocker reporting

---

#### Layer 2 — Catalog Governance

Catalog guarantees:

- controlled intake
- duplicate prevention
- policy enforcement
- candidate state creation
- review gating
- approval gating
- publication
- activation

---

#### Layer 3 — Runtime Governance

Runtime uses only:

- published
- approved
- active Catalog entries

Nothing else.

---

### 11.2 Governance Gates

Catalog must validate at **candidate creation time**:

- source exists
- source is deployable
- source is not already imported in a conflicting way
- source meets intake policy requirements

Catalog must validate at **approval/publication time**:

- review checks passed
- required metadata exists
- no prohibited config
- publication prerequisites satisfied

---

### 11.3 Activation Gate

Activation must require:

- approved state
- published state
- all mandatory checks complete

If any of those are missing, activation must fail closed.

---

### 11.4 Audit Logging

Audit logging must be mandatory for:

- source selection used for candidate creation
- candidate creation
- lifecycle transitions
- approval
- rejection
- publish
- activate
- suspend / revoke

Audit logging must be **blocking** for critical governance transitions.

---

### 11.5 Runtime Authority Resolution

Runtime resolution must not inspect source domains directly for authority.

It must resolve authority from Catalog only.

**Forbidden runtime authority paths:**

- direct LLM version usage
- direct model usage
- direct provider usage
- direct bot entry usage outside Catalog runtime rules
- direct agent usage if Catalog governs that activation path

---

## 12. Consistency Enforcement Rules

### 12.1 Hard Rules

These must always hold:

1. No source domain may directly create `catalog_entries` as its canonical creation flow.
2. All imports must originate from Catalog.
3. All source selection must happen in special intake mode.
4. Every source selector must support `returnTo`.
5. Every source selector must filter to deployable/import-eligible entities.
6. Candidate creation must remain Catalog-owned.
7. Runtime authority must remain Catalog-owned.

---

### 12.2 Soft Rules

These should remain consistent whenever possible:

- use "deployable" as the surfaced readiness term where appropriate
- consistent status badge design
- consistent picker-mode banner design
- consistent selection button labels
- consistent route semantics
- consistent return-to-Catalog experience

---

## 13. Error Handling and Guardrails

### 13.1 Non-Deployable Entity Selection

If an entity is not deployable:

- it must not appear in import mode, or
- selection must be blocked with a clear error

---

### 13.2 Missing returnTo

If `returnTo` is missing:

- fail safely
- return to a known Catalog entry point
- do not allow orphaned selection flow

---

### 13.3 Duplicate Candidate Prevention

Catalog must reject duplicate intake when appropriate, with:

- explicit message
- optional navigation to existing candidate
- no silent duplication

---

### 13.4 Missing Source Entity

If the selected source no longer exists:

- Catalog must reject candidate creation
- emit clear error
- log governance failure

---

## 14. Migration Strategy

This architecture may require refactoring existing domains.

### Step 1 — Remove direct Catalog writes from source domains

Priority domains currently known to need this pattern:

- Models
- Bots

---

### Step 2 — Ensure domain-owned entity storage exists

Each domain must have its own canonical entity store.

---

### Step 3 — Add canonical inventory pages

- `/list/llms`
- `/list/models`
- `/list/bots`
- `/list/providers`

---

### Step 4 — Add catalog-import mode to each domain page

Required features:

- query-param detection
- deployable-only filtering
- selection action
- returnTo support

---

### Step 5 — Extend CatalogImportWizard

Add delegated selector entries for each AI Type.

---

### Step 6 — Move candidate creation fully into Catalog

Ensure the source domain only returns selection context.

---

### Step 7 — Validate runtime authority path

Confirm runtime uses Catalog-active/published records only.

---

## 15. Anti-Patterns That Must Never Exist

These are architectural violations.

- Domain directly creates catalog entry as its standard creation path
- Import starts from source-domain inventory page
- Source selection page creates candidate directly
- Deployable is treated as runtime-ready
- No special intake mode
- No returnTo control handoff
- Direct runtime access outside Catalog
- Missing approval before activation
- Missing audit trail for critical governance operations

---

## 16. Final Unified Pattern

This is the final pattern every AI Type must follow:

```
Source Domain
→ creates and manages entity
→ computes deployable

Catalog
→ New Entry
→ Import
→ CatalogImportWizard
→ delegates to source selector
→ receives selected source
→ creates candidate
→ review / validate / approve
→ publish
→ activate
→ runtime authority
```

---

## 17. Final Alignment Statement

All AI Types must follow this architecture:

```
Domain produces entity
→ Domain evaluates readiness
→ Catalog imports entity
→ Catalog governs lifecycle
→ Catalog alone grants runtime authority
```

This guarantees:

- architectural consistency
- governance integrity
- no intake bypass
- no runtime bypass
- coherent UX
- scalable AI Type onboarding
- auditable lifecycle control

---

## 18. Final Conclusion

Governance integrity is not achieved by adding more checks randomly across pages and routers.

It is achieved when the system is designed so that:

- domains are producers
- Catalog is intake authority
- Catalog is governance authority
- runtime authority is never granted outside Catalog

That is the methodology.

That is the technical design.

And that is the standard every AI Type must follow.
