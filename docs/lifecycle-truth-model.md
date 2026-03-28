# Catalog Lifecycle Truth Model

Single source of truth for lifecycle state semantics across the platform.

## Core Rule: Primary Badge = Current Status

The **primary badge** shown to users is always `entry.status` — the real persisted lifecycle state. Tags, approvals, and derived states are **secondary chips** displayed alongside but never overriding the primary status.

## State Definitions

### 1. Current Status (Primary Badge)
- `entry.status` field — one of: `draft`, `active`, `deprecated`, `disabled`
- This is the **only** field used for the primary badge
- Tags like `"published"` do NOT override this — a draft entry with a published tag shows "draft" as primary

### 2. Review Approved (Secondary Chip)
- `entry.reviewState === "approved"` (register stage approved)
- Per-stage tracking: `entry.stageReviews.register === "approved"`
- Displayed as a secondary chip, not the primary badge
- Does NOT mean the entry is active or runnable

### 3. Publish Approved (Secondary Chip)
- `entry.tags` includes `"published"` OR `entry.stageReviews.publish === "approved"`
- Means the publish stage transition completed (all governance gates passed)
- Displayed as a secondary chip: "Publish approved"
- Does NOT imply runnable — requires active status + validation

### 4. Activated / Active
- `entry.status === "active"`
- Requires: register review approved + explicit activation action
- Entry can now proceed through validation and publish stages
- Required for execution — both service-backed and LLM-backed agents

### 5. Runnable / Execution Eligible (Secondary Chip)
- Derived state — computed by `isExecutionEligible()` from `shared/catalog-lifecycle.ts`
- Requirements:
  - `entry.status === "active"`
  - `entry.tags` includes `"published"`
  - `entry.stageReviews.validate === "approved"`
- Displayed as a secondary chip: "Runnable" (green) or "Not runnable" (amber)
- For LLM agents, additionally requires: active publish bundle, valid execution config
- For service-backed agents: valid runtime config (serviceUrl)

### 6. Tags / Metadata (Secondary Chips)
- Tags like `import`, `file_import`, `logic-based`, `ps`, `published`, `candidate`, etc.
- Displayed as secondary outline chips in the card content area
- Never used as primary status truth
- The `published` tag is metadata indicating a stage transition happened, NOT a status override

## Badge Rendering Rules

### Primary Badge (top-right of card)
| `entry.status` | Color | Meaning |
|----------------|-------|---------|
| `draft` | Gray | Not yet activated |
| `active` | Green | Activated and available for pipeline stages |
| `deprecated` | Red | No longer recommended |
| `disabled` | Dark red | Blocked from use |

### Secondary Chips (in chips row)
| Chip | Color | Shown when |
|------|-------|------------|
| `Publish approved` | Emerald outline | tags include "published" |
| `Reviewed` | Emerald | stageReviews.publish === "approved" |
| `Runnable` | Green | isExecutionEligible() === true |
| `Not runnable` | Amber | published tag present but not eligible |
| Validation status | Green/Red | validationStatus is set |

## Service-Backed Agent Readiness

Service-backed agents (e.g., Project Context Translator) have additional runtime requirements:
1. Lifecycle active (`status === "active"`)
2. `config.runtime.kind === "service"` present
3. Service URL resolvable from config
4. Service health is a separate runtime dimension (not a lifecycle gate)

Service health (online/offline) does NOT affect lifecycle state.

## Why Tags Must Not Override Status

A tag like `"published"` can exist on an entry with `status === "draft"` because:
- The entry was imported with the tag already present
- The stage transition system added the tag but activation was never completed
- The status was changed after publish (e.g., disabled)

If the UI used the `published` tag as the primary badge, the user would see "Published" while the execution layer blocks with "not currently active." This contradiction is the exact problem this truth model prevents.

## Consistency Rule

All surfaces (Candidate Pipeline, Catalog Detail, Execution Observability) must:
1. Show `entry.status` as the primary badge
2. Show approvals and tags as secondary chips only
3. Use `isExecutionEligible()` from `shared/catalog-lifecycle.ts` for runnable state
4. Never imply "ready/runnable" if the execution layer will block
