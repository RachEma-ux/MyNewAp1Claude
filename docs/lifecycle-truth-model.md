# Catalog Lifecycle Truth Model

Single source of truth for lifecycle state semantics across the platform.

## State Definitions

### 1. Created / Draft
- `entry.status === "draft"`
- Entry exists in the catalog but has not been activated
- Can be edited freely
- Cannot be executed

### 2. Review Approved
- `entry.reviewState === "approved"` (register stage approved)
- Per-stage tracking: `entry.stageReviews.register === "approved"`
- Means the register stage checklist passed
- Does NOT mean the entry is active or runnable

### 3. Activated / Active
- `entry.status === "active"`
- Requires: register review approved + explicit activation action
- Entry can now proceed through validation and publish stages
- Required for execution — both service-backed and LLM-backed agents

### 4. Published
- `entry.tags` includes `"published"`
- Means the publish stage transition completed (all governance gates passed)
- Does NOT automatically mean runnable
- An entry can be "published" (tag) but not "active" (status) if:
  - Imported with the published tag but never activated
  - Status drifted after publish (e.g., disabled, deprecated)

### 5. Runnable / Execution Eligible
- Derived state — computed from multiple fields
- Requirements:
  - `entry.status === "active"`
  - `entry.tags` includes `"published"`
  - `entry.stageReviews.validate === "approved"`
- For LLM agents, additionally requires: active publish bundle, valid execution config, source agent exists
- For service-backed agents: valid runtime config (serviceUrl)

## Badge Rendering Rules

| State | Badge Label | Color | Meaning |
|-------|------------|-------|---------|
| Published + Active + Validated | "Published" | Green | Fully runnable |
| Published + Not Active | "Publish Approved (Not Active)" | Amber | Activation incomplete |
| Published + Active + Not Validated | "Published (Not Runnable)" | Amber | Validation incomplete |
| Not Published | (no badge) | — | Still in pipeline |

## Service-Backed Agent Readiness

Service-backed agents (e.g., Project Context Translator) have additional runtime requirements:
1. Lifecycle active (`status === "active"`)
2. `config.runtime.kind === "service"` present
3. Service URL resolvable from config
4. Service health is a separate runtime dimension (not a lifecycle gate)

Service health (online/offline) does NOT affect lifecycle state. An active, published service-backed agent with an offline service will fail at execution time with a "Service Offline" error — this is expected and distinct from lifecycle blocking.

## Consistency Rule

The app must never visually imply "ready/runnable/published" if the execution layer will block the entry. All surfaces (Candidate Pipeline, Catalog Detail, Execution Observability) use the same `getExecutionStatus()` function from `shared/catalog-lifecycle.ts` to derive consistent badge labels.
