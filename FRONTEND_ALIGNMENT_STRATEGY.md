# Frontend-Backend Alignment Strategy

**Problem:** Frontend components access fields that don't exist in database schema

**Root Cause:** Frontend was built expecting governance fields that were never added to database

---

## Database Reality Check

### ✅ Fields That EXIST in agents table:
```typescript
// Basic info
id, workspaceId, name, description

// Configuration  
systemPrompt, modelId, temperature

// Capabilities
hasDocumentAccess, hasToolAccess, allowedTools

// Behavior
maxIterations, autoSummarize

// Lifecycle (from agent-schema.ts compatibility)
lifecycleState: "draft" | "sandbox" | "governed" | "disabled"
lifecycleVersion: number
origin: string
trigger: JSON
limits: JSON
anatomy: JSON
policyContext: JSON

// Metadata
createdBy, createdAt, updatedAt
```

### ❌ Fields That DON'T EXIST:
```typescript
// These cause TypeScript errors:
governanceStatus  // Use lifecycleState instead
mode              // Use lifecycleState instead  
governance        // Use policyContext instead
version           // Use lifecycleVersion instead
roleClass         // Not in schema
sandboxConstraints // Not in schema
expiresAt         // Not in schema
proofId           // Not in schema
```

---

## Field Mapping Strategy

| Frontend Expects | Database Has | Solution |
|-----------------|--------------|----------|
| `agent.mode` | `agent.lifecycleState` | Map: `sandbox`→`"sandbox"`, `governed`→`"governed"` |
| `agent.governanceStatus` | `agent.lifecycleState` | Map: `"sandbox"`→`"SANDBOX"`, `"governed"`→`"GOVERNED_VALID"` |
| `agent.governance` | `agent.policyContext` | Use `policyContext` or make optional |
| `agent.version` | `agent.lifecycleVersion` | Direct replacement |
| `agent.roleClass` | N/A | Remove or make optional with default |
| `agent.sandboxConstraints` | `agent.limits` | Use `limits` instead |
| `agent.expiresAt` | N/A | Remove or add to schema |
| `agent.proofId` | N/A | Remove or add to schema |

---

## Fix Strategy by File

### 1. AgentEditorPage.tsx (30 errors)

**Current Issues:**
- Accessing `agent.governanceStatus`, `agent.mode`, `agent.version`, `agent.roleClass`, `agent.governance`

**Fix:**
```typescript
// ❌ Before:
const status = agent.governanceStatus;
const mode = agent.mode;
const version = agent.version;

// ✅ After:
const status = agent.lifecycleState === "governed" ? "GOVERNED_VALID" : "SANDBOX";
const mode = agent.lifecycleState === "governed" ? "governed" : "sandbox";
const version = agent.lifecycleVersion || 1;

// For roleClass (doesn't exist):
const roleClass = "assistant"; // Default value
// Or extract from anatomy if stored there:
const roleClass = agent.anatomy?.roleClass || "assistant";
```

### 2. Agents.tsx (6 errors)

**Current Issues:**
- Accessing `agent.allowedTools`, `agent.hasToolAccess`, `agent.hasDocumentAccess`

**Fix:**
```typescript
// ✅ These fields EXIST in database, just need proper typing
const tools = agent.allowedTools || [];
const hasTools = agent.hasToolAccess ?? false;
const hasDocs = agent.hasDocumentAccess ?? true;
```

### 3. embedded-runtime.ts (8 errors)

**Current Issues:**
- Accessing `agent.mode`, `agent.governanceStatus`, `agent.expiresAt`

**Fix:**
```typescript
// ❌ Before:
if (agent.mode === "governed") { ... }
if (agent.governanceStatus === "GOVERNED_VALID") { ... }
if (agent.expiresAt && new Date() > agent.expiresAt) { ... }

// ✅ After:
if (agent.lifecycleState === "governed") { ... }
// governanceStatus check not needed - lifecycleState is sufficient
// Remove expiration check or add expiresAt to schema
```

### 4. agents.ts router (3 errors)

**Current Issues:**
- Setting `mode`, `sandboxConstraints`, `governance` on creation

**Fix:**
```typescript
// ❌ Before:
await db.insert(agents).values({
  mode: "sandbox",
  sandboxConstraints: {...},
  governance: {...}
});

// ✅ After:
await db.insert(agents).values({
  lifecycleState: "sandbox",
  limits: {...}, // Use limits instead of sandboxConstraints
  policyContext: {...} // Use policyContext instead of governance
});
```

---

## Implementation Plan

### Phase 1: Create Type Adapter (15 minutes)

Create a helper to map database Agent to frontend expectations:

```typescript
// shared/types/agent-adapter.ts

import { Agent as DbAgent } from '@/drizzle/schema';

export interface FrontendAgent extends DbAgent {
  // Computed fields
  mode: "sandbox" | "governed";
  governanceStatus: "SANDBOX" | "GOVERNED_VALID";
  version: number;
  roleClass: string;
}

export function adaptAgentForFrontend(dbAgent: DbAgent): FrontendAgent {
  return {
    ...dbAgent,
    mode: dbAgent.lifecycleState === "governed" ? "governed" : "sandbox",
    governanceStatus: dbAgent.lifecycleState === "governed" ? "GOVERNED_VALID" : "SANDBOX",
    version: dbAgent.lifecycleVersion || 1,
    roleClass: (dbAgent.anatomy as any)?.roleClass || "assistant",
  };
}
```

### Phase 2: Update tRPC Procedures (10 minutes)

```typescript
// server/routers/agents.ts

import { adaptAgentForFrontend } from '@shared/types/agent-adapter';

list: publicProcedure.query(async () => {
  const db = getDb();
  if (!db) throw new Error("Database not initialized");
  
  const agents = await db.select().from(agentsTable);
  return agents.map(adaptAgentForFrontend); // ← Transform before returning
}),
```

### Phase 3: Update Frontend Components (30 minutes)

**Option A: Use adapter (recommended)**
- tRPC returns adapted agents
- Frontend uses fields as-is
- No frontend changes needed

**Option B: Fix frontend directly**
- Replace all `agent.mode` with `agent.lifecycleState`
- Replace all `agent.governanceStatus` with derived value
- Add optional chaining everywhere

### Phase 4: Remove Non-Existent Fields (15 minutes)

For fields that truly don't exist and aren't needed:

```typescript
// Remove or comment out:
// agent.expiresAt
// agent.proofId
// agent.sandboxConstraints (use agent.limits instead)
```

---

## Quick Win: Type Adapter Approach

**Time:** 25 minutes  
**Impact:** Fixes 36 MISSING_PROPERTY errors

1. Create `agent-adapter.ts` with mapping logic (10 min)
2. Update `agents.ts` router to use adapter (10 min)
3. Test frontend loads without errors (5 min)

**Pros:**
- ✅ No frontend changes needed
- ✅ Single source of truth for mapping
- ✅ Easy to maintain
- ✅ Backward compatible

**Cons:**
- ⚠️ Adds runtime overhead (minimal)
- ⚠️ Hides database reality from frontend

---

## Alternative: Direct Frontend Fix

**Time:** 45 minutes  
**Impact:** Fixes 36 errors + improves type safety

1. Replace `mode` with `lifecycleState` (20 min)
2. Replace `governanceStatus` with derived value (15 min)
3. Remove non-existent field references (10 min)

**Pros:**
- ✅ Frontend matches database reality
- ✅ No adapter layer
- ✅ Better type safety

**Cons:**
- ⚠️ More frontend changes
- ⚠️ Harder to maintain if schema changes

---

## Recommendation

**Use Type Adapter Approach** for speed and maintainability.

This gives you:
1. **Immediate fix** - 25 minutes to working state
2. **Clean abstraction** - Frontend doesn't need to know database details
3. **Easy evolution** - Change mapping logic without touching frontend
4. **Type safety** - TypeScript enforces correct usage

Then, optionally refactor frontend later to use database fields directly.
