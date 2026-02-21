# Missing Properties Analysis - 51 Errors

## Distribution: Frontend vs Backend

| Location | Count | % |
|----------|-------|---|
| **Frontend** | 39 | 76.5% |
| **Backend** | 12 | 23.5% |

**Key Finding:** 76.5% of errors are in frontend code trying to access properties that don't exist.

---

## Category Breakdown

### 🔴 Category 1: Missing tRPC Procedures (11 errors, 21.6%)

**What:** Frontend calling backend endpoints that don't exist

**Where:** Frontend only

| Procedure | Errors | File |
|-----------|--------|------|
| `agentPromotions` | 4 | PromotionRequestsPage.tsx |
| `listConversations` | 1 | AgentChat.tsx |
| `createConversation` | 1 | AgentChat.tsx |
| `detectAllDrift` | 1 | DriftDetectionPage.tsx |
| `runDriftDetection` | 1 | DriftDetectionPage.tsx |
| `autoRemediate` | 1 | DriftDetectionPage.tsx |
| `deployTemplate` | 1 | AgentTemplates.tsx |
| `exportCompliance` | 1 | ComplianceExportPage.tsx |

**Root Cause:** Frontend UI was built ahead of backend implementation

**Solution Options:**
1. **Implement missing procedures** (2-4 hours per procedure)
2. **Remove UI components** that call these procedures (30 min)
3. **Add stub procedures** that return empty data (1 hour)

---

### 🟡 Category 2: Missing Database Fields (13 errors, 25.5%)

**What:** Code accessing fields that don't exist in database tables

**Where:** Both frontend (9) and backend (4)

#### Agent Table Fields (9 errors - Frontend)

| Field | Errors | Files | Status |
|-------|--------|-------|--------|
| `systemPrompt` | 4 | AgentEditorPage.tsx | ✅ EXISTS in schema! |
| `hasToolAccess` | 3 | Agents.tsx, WorkspaceDetail.tsx | ✅ EXISTS in schema! |
| `hasDocumentAccess` | 3 | Agents.tsx, WorkspaceDetail.tsx | ✅ EXISTS in schema! |
| `allowedTools` | 2 | Agents.tsx | ✅ EXISTS in schema! |
| `tools` | 1 | AgentEditorPage.tsx | ❌ Should be `allowedTools` |
| `temperature` | 1 | AgentEditorPage.tsx | ✅ EXISTS in schema! |

**Issue:** These fields EXIST in the database schema, but TypeScript doesn't see them!

**Root Cause:** Type inference problem - Drizzle isn't picking up these fields

#### Backend Database Issues (4 errors)

| Field | Errors | File | Issue |
|-------|--------|------|-------|
| `promotionRequests` | 6 | agents-promotions.ts | ✅ FIXED - table added to schema |
| `agentHistory.timestamp` | 1 | agents-promotions.ts | ❌ Missing column |
| `agentHistory` | 1 | agents-promotions.ts | ✅ Table exists |

---

### 🟢 Category 3: Governance/PKI Fields (7 errors, 13.7%)

**What:** Frontend accessing cryptographic proof fields

**Where:** Frontend only

| Field | Errors | File |
|-------|--------|------|
| `proofBundle` | 7 | AgentEditorPage.tsx |

**Root Cause:** PKI infrastructure not implemented yet

**Solution:** Either implement PKI (4-6 hours) or remove UI references (10 min)

---

### 🟢 Category 4: Trigger/Action Registry Fields (2 errors, 3.9%)

**What:** Missing fields in trigger_registry table

**Where:** Frontend only

| Field | Errors | File |
|-------|--------|------|
| `default_risk` | 1 | TriggerCreationDialog.tsx |
| `allowed_side_effects` | 1 | TriggerCreationDialog.tsx |

**Solution:** Add fields to trigger_registry schema (10 min)

---

### 🟢 Category 5: Type System Issues (18 errors, 35.3%)

**What:** Various type inference and property access issues

**Where:** Both frontend and backend

| Issue | Errors | Location | Fix |
|-------|--------|----------|-----|
| Missing `id` property | 2 | ProviderDetail.tsx, etc. | Add proper type |
| Missing `category` | 1 | HardwarePage.tsx | Add to type |
| Missing `item` | 1 | SoftwarePage.tsx | Add to type |
| `CONTAINMENT_VIOLATION` | 2 | AdmissionInterceptor.ts | Add to enum |
| `first` method | 1 | autonomous-remediation.ts | Wrong array method |
| `toISOString` | 1 | agents-control-plane.ts | Type mismatch |
| `listTools` | 1 | Agents.tsx | Missing procedure |

---

## Root Cause Summary

| Root Cause | Errors | % | Where |
|------------|--------|---|-------|
| **Type Inference Failure** | 13 | 25.5% | Frontend accessing existing DB fields |
| **Missing Implementations** | 11 | 21.6% | Frontend calling non-existent procedures |
| **Incomplete Features** | 7 | 13.7% | PKI, proofBundle |
| **Schema Incomplete** | 3 | 5.9% | Missing columns/enums |
| **Type System Issues** | 17 | 33.3% | Various type problems |

---

## Quick Wins (30 minutes → 20+ errors fixed)

### 1. Fix Type Inference for Agent Fields (10 min) → 9 errors

**Problem:** `systemPrompt`, `hasToolAccess`, `hasDocumentAccess`, `allowedTools`, `temperature` exist in schema but TypeScript doesn't see them

**Solution:** Force type assertion in tRPC procedures

```typescript
// server/routers/agents.ts
import { Agent } from '@/drizzle/schema';

list: publicProcedure.query(async () => {
  const db = getDb();
  if (!db) throw new Error("Database not initialized");
  const agents = await db.select().from(agentsTable);
  return agents as Agent[]; // ← Force correct type
}),
```

### 2. Add Missing Enum Value (5 min) → 2 errors

**Problem:** `CONTAINMENT_VIOLATION` not in enum

**Solution:**
```typescript
// modules/agents/interceptors/AdmissionInterceptor.ts
enum ViolationType {
  POLICY_VIOLATION = "POLICY_VIOLATION",
  CONTAINMENT_VIOLATION = "CONTAINMENT_VIOLATION", // ← Add this
}
```

### 3. Fix Array Method (2 min) → 1 error

**Problem:** Using `.first()` instead of `[0]`

**Solution:**
```typescript
// server/agents/autonomous-remediation.ts
const agent = agents[0]; // ← Instead of agents.first()
```

### 4. Add Trigger Fields (10 min) → 2 errors

**Problem:** `default_risk`, `allowed_side_effects` missing from trigger_registry

**Solution:** Add to schema

### 5. Add agentHistory.timestamp (3 min) → 1 error

**Problem:** Column missing

**Solution:**
```sql
ALTER TABLE agent_history ADD COLUMN timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
```

---

## Medium Wins (1-2 hours → 11 errors fixed)

### 6. Add Stub tRPC Procedures (1 hour) → 11 errors

Create empty procedures that return mock data:

```typescript
// server/routers/conversations.ts
export const conversationsRouter = router({
  listConversations: publicProcedure.query(async () => []),
  createConversation: publicProcedure.input(z.object({...})).mutation(async () => ({id: 1})),
});

// server/routers/agents.ts
agentPromotions: publicProcedure.query(async () => []),
detectAllDrift: publicProcedure.query(async () => ({drifts: []})),
// etc.
```

---

## Long-term (4-6 hours)

### 7. Implement PKI Infrastructure → 7 errors

Full cryptographic proof system for agent governance

---

## Recommended Fix Order

1. ✅ **Fix type inference** (10 min) → 9 errors fixed
2. ✅ **Add enum value** (5 min) → 2 errors fixed
3. ✅ **Fix array method** (2 min) → 1 error fixed
4. ✅ **Add trigger fields** (10 min) → 2 errors fixed
5. ✅ **Add timestamp column** (3 min) → 1 error fixed
6. ⏸️ **Add stub procedures** (1 hour) → 11 errors fixed
7. ⏸️ **Implement PKI** (4-6 hours) → 7 errors fixed

**Total Quick Wins:** 30 minutes → 15 errors fixed (29% reduction)

**With stubs:** 1.5 hours → 26 errors fixed (51% reduction)

---

## Key Insight

**The biggest issue is TYPE INFERENCE, not missing data.**

13 errors (25.5%) are from frontend trying to access fields that EXIST in the database but TypeScript can't see them. Fixing the type system will resolve these without any database changes.
