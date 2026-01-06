# Remaining TypeScript Errors Report

**Total Errors:** 201

**Generated:** 2026-01-03 09:50 AM

---

## Error Categories

### 1. Missing Module Exports (8 errors)
**Root Cause:** `@shared/types` module not properly exporting enum types

**Files Affected:**
- `client/src/components/AgentWizard.tsx` (3 errors)
- `client/src/pages/AgentChat.tsx` (3 errors)  
- `client/src/pages/Agents.tsx` (1 error)
- `client/src/pages/PromotionRequestsPage.tsx` (1 error)

**Errors:**
```
Module '"@shared/types"' has no exported member 'AgentMode'
Module '"@shared/types"' has no exported member 'GovernanceStatus'
Module '"@shared/types"' has no exported member 'AgentRoleClass'
```

**Fix:** Export types as values, not just types:
```typescript
// shared/types/agent.ts - Change from:
export type AgentMode = "sandbox" | "governed";

// To:
export const AgentMode = {
  SANDBOX: "sandbox",
  GOVERNED: "governed"
} as const;
export type AgentMode = typeof AgentMode[keyof typeof AgentMode];
```

---

### 2. Missing Database Table: promotionRequests (7 errors)
**Root Cause:** Table referenced in code but not defined in schema

**Files Affected:**
- `server/routers/agents-promotions.ts` (7 errors)

**Errors:**
```
Property 'promotionRequests' does not exist on type '{}'
```

**Fix:** Add table definition to `drizzle/schema.ts`:
```typescript
export const promotionRequests = mysqlTable("promotion_requests", {
  id: int("id").autoincrement().primaryKey(),
  agentId: int("agentId").notNull(),
  requestedBy: int("requestedBy").notNull(),
  status: mysqlEnum("status", ["pending", "approved", "rejected"]).notNull(),
  justification: text("justification"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  // ... other fields
});
```

---

### 3. Missing Database Table: agentHistory (1 error)
**Root Cause:** Table exists but missing `timestamp` column

**Files Affected:**
- `server/routers/agents-promotions.ts` (1 error)

**Errors:**
```
Property 'agentHistory' does not exist on type '{}'
Property 'timestamp' does not exist on type 'MySqlTableWithColumns<...>'
```

**Fix:** Verify agentHistory table schema has all required columns

---

### 4. Missing Agent Properties (3 errors)
**Root Cause:** Agent type from database doesn't include governance fields

**Files Affected:**
- `server/routers/agents.ts` (3 errors)

**Errors:**
```
Property 'mode' does not exist on type '{ id: number; ... }'
Property 'sandboxConstraints' does not exist on type '{ id: number; ... }'
Property 'governance' does not exist on type '{ id: number; ... }'
```

**Fix:** Use the comprehensive Agent type from `@shared/types` instead of Drizzle-inferred type

---

### 5. Drizzle ORM Overload Errors (4 errors)
**Root Cause:** Type mismatches in insert/update operations

**Files Affected:**
- `server/routers/agents.ts` (2 errors)
- `server/routers/templates.ts` (1 error)
- `server/routers/triggers.old.ts` (1 error)

**Errors:**
```
No overload matches this call
Object literal may only specify known properties, and 'mode' does not exist
```

**Fix:** Add proper type assertions or use InsertAgent type

---

### 6. Function Signature Mismatches (4 errors)
**Root Cause:** Wrong number/type of arguments

**Files Affected:**
- `server/routers/agents.ts` (4 errors)

**Errors:**
```
Expected 0 arguments, but got 1
Argument of type 'string' is not assignable to parameter of type 'number'
```

**Fix:** Check function definitions and fix argument types

---

### 7. Unused @ts-expect-error Directives (174 errors)
**Root Cause:** @ts-expect-error comments added but underlying errors were fixed

**Files Affected:**
- `server/routers/agents-promotions.ts` (4 errors)
- `server/routers/agents.ts` (15 errors)
- Multiple other files (155 errors)

**Errors:**
```
Unused '@ts-expect-error' directive
```

**Fix:** Remove all unused @ts-expect-error comments:
```bash
find server client -name "*.ts" -o -name "*.tsx" | xargs sed -i '/\/\/ @ts-expect-error/d'
```

---

## Priority Fix Order

### 🔴 Critical (Must Fix - 15 errors)
1. **Add promotionRequests table** (7 errors) - 30 minutes
2. **Fix Agent type exports** (8 errors) - 15 minutes

### 🟡 High (Should Fix - 8 errors)  
3. **Fix missing Agent properties** (3 errors) - 20 minutes
4. **Fix function signatures** (4 errors) - 15 minutes
5. **Fix agentHistory table** (1 error) - 10 minutes

### 🟢 Medium (Nice to Fix - 4 errors)
6. **Fix Drizzle overload errors** (4 errors) - 30 minutes

### ⚪ Low (Cleanup - 174 errors)
7. **Remove unused @ts-expect-error** (174 errors) - 5 minutes (automated)

---

## Estimated Time to Zero Errors

- **Critical fixes:** 45 minutes
- **High priority fixes:** 45 minutes  
- **Medium priority fixes:** 30 minutes
- **Cleanup:** 5 minutes

**Total:** ~2 hours to reach 0 TypeScript errors

---

## Quick Win Script

```bash
# 1. Remove all unused @ts-expect-error comments (5 minutes)
cd /home/ubuntu/mynewappv1
find server client -name "*.ts" -o -name "*.tsx" | xargs sed -i '/\/\/ @ts-expect-error/d'

# 2. This alone will reduce errors from 201 to ~27
```

---

## Next Actions

1. Run quick win script to remove 174 unused directives
2. Add promotionRequests table to schema
3. Fix Agent type exports to use const enums
4. Fix remaining 12 critical errors
5. Verify with `pnpm tsc --noEmit`
