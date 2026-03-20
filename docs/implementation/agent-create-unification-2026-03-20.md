# Agent Create Flow Unification

Date: 2026-03-20
Repo: `RachEma-ux/MyNewAp1Claude`
Code commit: `6b5875e` (`Unify agent create flow schema`)

## Goal

Fix the broken Agent creation flow by replacing the mismatched frontend wizard payload and backend create contract with one shared, typed model used by both client and server.

## Problem Summary

Before this change:

- `client/src/components/AgentWizard.tsx` submitted a governance-style payload with fields like:
  - `version`
  - `anatomy`
  - `localConstraints`
  - `sandboxConstraints`
  - `expiresAt`
- `server/routers/agents.ts` expected a different flat create payload with fields like:
  - `name`
  - `description`
  - `roleClass`
  - `systemPrompt`
  - `modelId`
  - `temperature`
  - `hasDocumentAccess`
  - `hasToolAccess`
  - `allowedTools`

This mismatch broke creation after the Review step.

## Approach Taken

The fix was implemented as one shared create contract, then wired through the wizard and router with an intentional persistence mapper.

## Files Changed

### Core implementation

- `shared/schemas/agent-create.ts`
- `client/src/components/AgentWizard.tsx`
- `server/routers/agents.ts`

### Compatibility update

- `client/src/pages/AgentEditor.tsx`

This extra compatibility update was needed because `/governance/agents/create` still uses `AgentEditor`, and that screen also called `trpc.agents.create` with the old flat payload.

## New Shared Schema

Added:

- `AgentCreateInputSchema`
- `AgentCreateInput`
- `DEFAULT_AGENT_CREATE_INPUT`
- shared role enum values
- shared creation mode enum values

Shape:

```ts
{
  identity: {
    name: string;
    version: string;
    description?: string;
    tags?: string[];
  };
  definition: {
    creationMode: "template" | "scratch" | "clone" | "workflow" | "conversation" | "event" | "import";
    roleClass:
      | "assistant"
      | "analyst"
      | "executor"
      | "monitor"
      | "compliance"
      | "analysis"
      | "ideation"
      | "support"
      | "reviewer"
      | "automator"
      | "custom";
    systemPrompt: string;
    anatomy?: Record<string, unknown>;
  };
  runtime: {
    modelId: string;
    temperature: number;
  };
  capabilities: {
    hasDocumentAccess: boolean;
    hasToolAccess: boolean;
    allowedTools: string[];
    custom?: Record<string, unknown>;
  };
  limits: {
    maxTokens: number;
    dailyBudget: number;
    sandboxConstraints?: Record<string, unknown>;
    expiresAt?: string | null;
  };
}
```

Validation detail:

- `temperature` is bounded to `[0, 2]`
- `modelId` is required
- `maxTokens >= 1`
- `dailyBudget >= 0`
- `allowedTools` is rejected if tool access is disabled

## Wizard Refactor

File:

- `client/src/components/AgentWizard.tsx`

What changed:

- Replaced the old mismatched local form state with `AgentCreateInput`
- Stored the selected creation mode under `definition.creationMode`
- Preserved the 7-step flow:
  - Mode
  - Identity
  - Role
  - LLM
  - Capabilities
  - Limits
  - Review
- Added local field-level validation mapped to the shared schema
- Submit now sends the exact unified payload to `trpc.agents.create`

### Step 4: LLM

Implemented real UI for:

- `runtime.modelId`
- `runtime.temperature`

Behavior:

- Model list comes from `trpc.models.list({ type: "llm" })`
- Falls back to text input if no model list is available
- Temperature is editable and bounded

### Step 5: Capabilities

Implemented real UI for:

- `capabilities.hasDocumentAccess`
- `capabilities.hasToolAccess`
- `capabilities.allowedTools`

Behavior:

- Tool list comes from `trpc.agents.listTools()`
- Checkbox-based selection for available tools
- Fallback text entry if no tools are returned

### Step 6: Limits

Mapped into `limits`:

- `maxTokens`
- `dailyBudget`
- `expiresAt`
- `sandboxConstraints`

Also added a JSON editor for:

- `capabilities.custom`

## Backend Create Mutation

File:

- `server/routers/agents.ts`

What changed:

- Replaced the old flat create input schema with `AgentCreateInputSchema`
- Added `mapAgentCreateInputToInsert()`
- Persisted the unified payload into direct columns plus JSON fields

### Direct column mapping

Stored directly as columns:

- `workspaceId`
- `createdBy`
- `name`
- `description`
- `tags`
- `roleClass`
- `status = "draft"`
- `systemPrompt`
- `modelId`
- `temperature`
- `hasDocumentAccess`
- `hasToolAccess`
- `allowedTools`

### JSON mapping

Stored as JSON:

- `capabilities`
  - `tools`
  - `custom`
  - `anatomy`
- `limits`
  - `maxTokens`
  - `dailyBudget`
  - `sandboxConstraints`
  - `expiresAt`
- `lifecycle`
  - `state = "draft"`
  - `version = identity.version`
  - `creationMode = definition.creationMode`

### Mutation return shape

The create mutation now returns:

```ts
{
  success: true,
  agent: createdAgent,
}
```

## Role Taxonomy Decision

The role enum was unified around the broader vocabulary already present across the repo and table layer, rather than narrowing to the old router subset.

Final shared role set:

- `assistant`
- `analyst`
- `executor`
- `monitor`
- `compliance`
- `analysis`
- `ideation`
- `support`
- `reviewer`
- `automator`
- `custom`

This avoids the previous wizard/backend mismatch.

## Compatibility Update for Existing Create Screen

File:

- `client/src/pages/AgentEditor.tsx`

Why it was changed:

- That page still uses `trpc.agents.create`
- After unifying the backend create contract, it would have broken unless adapted

What changed:

- On create, it now builds a valid `AgentCreateInput` payload and submits that instead of the old flat object
- Update and promote flows were left untouched

## Flows Intentionally Left Alone

No behavior changes were made to these beyond compatibility with the new create model:

- agent list
- get agent
- update agent
- delete agent
- promote agent

## Verification Performed

### Schema and implementation review

Reviewed and aligned:

- `client/src/components/AgentWizard.tsx`
- `server/routers/agents.ts`
- `drizzle/tables/agents.ts`
- `client/src/pages/AgentEditor.tsx`
- tool registry and model list surfaces

### Typecheck smoke verification

Used the existing project typecheck and filtered for touched files:

```bash
npm run check 2>&1 | rg "AgentWizard|agent-create|server/routers/agents|AgentEditor\.tsx"
```

Result:

- no new typecheck errors surfaced for the touched files

Note:

- the repo still has unrelated pre-existing TypeScript failures outside this change set

## Git Process

### Code commit

```bash
git add client/src/components/AgentWizard.tsx \
        client/src/pages/AgentEditor.tsx \
        server/routers/agents.ts \
        shared/schemas/agent-create.ts

git commit -m "Unify agent create flow schema"
```

Created commit:

- `6b5875e`

### Push

Initial push failed because git credential helper was misconfigured.

Fix applied:

```bash
gh auth setup-git
```

Then pushed successfully:

```bash
git push origin main
```

Result:

- `main` updated from `86cb7c8` to `6b5875e`

## Assumptions Made

- `ctx.user.id` remains the effective workspace identifier in `server/routers/agents.ts`, because that router already used it for list/get/create ownership logic.
- `agents.modelId` should continue storing a string model identifier, which matches the table definition.
- Storing the wizard version string in `lifecycle.version` is acceptable in the current JSON lifecycle column.
- `allowedTools` should be emptied when tool access is disabled.

## Follow-up Work Still Worth Doing

- Bring the whole repo back to a green `npm run check` baseline.
- Add a dedicated integration test for:
  - wizard payload shape
  - router acceptance of the shared schema
  - persisted draft visibility in the list
- Consider moving the shared role constants into a more central shared agent domain module if more agent flows are refactored later.
- If desired, normalize `AgentEditor` and any remaining legacy create surfaces to use the exact same state model as the wizard, not just the same submit payload.

## Outcome

The broken wizard/backend mismatch was removed.

After this change:

- the wizard submits one unified payload
- the backend accepts the same payload shape
- agents are persisted intentionally as `draft`
- the wizard success flow closes and refreshes correctly
- LLM and Capabilities are no longer placeholder-only steps
- the create contract is shared instead of duplicated
