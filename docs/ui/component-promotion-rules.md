# Component Promotion Rules

Rules for deciding where a component or hook lives in the codebase.

---

## Layer Hierarchy

```
client/src/
  components/
    ui/           ← L0: Design-system primitives (shadcn/radix)
    app/          ← L2: Cross-domain reusable patterns
    layout/       ← L2: Page shells, sidebar, header layouts
    automation/   ← (existing) domain-specific to automation
  features/
    agents/
      components/ ← L1: Agent-domain shared components
      hooks/      ← L1: Agent-domain shared hooks
    providers/
      components/ ← L1: Provider-domain shared components
      hooks/      ← L1: Provider-domain shared hooks
    models/
      components/ ← L1: Model-domain shared components
      hooks/      ← L1: Model-domain shared hooks
  hooks/          ← L2: Cross-domain shared hooks
  pages/          ← Page files (consumers, not producers)
```

---

## Decision Tree

### When you create or extract a component:

1. **Used by 1 page only** → Keep it inline in the page file, or in a co-located file next to the page.

2. **Used by 2-3 pages within the same domain** (e.g., only agent pages) → Move to `features/<domain>/components/` and re-export from the barrel `index.ts`.

3. **Used by pages across multiple domains** (e.g., agents + providers + models) → Move to `components/app/` and re-export from its barrel `index.ts`.

4. **Generic UI primitive** (no business logic, purely presentational, could ship in a design system) → Move to `components/ui/`. Must follow shadcn conventions (CVA variants, `cn()` merging, forwardRef where needed).

5. **Shared behavior (hook)** within one domain → `features/<domain>/hooks/`

6. **Shared behavior (hook)** across domains → `hooks/`

---

## Promotion Triggers

A component should be **promoted** (moved up a level) when:

- It gains a second consumer outside its current scope
- It becomes generic enough that the domain-specific parts can be removed
- A code review flags it as duplicated logic

A component should be **demoted** (moved down) when:

- It loses consumers (pages deleted or refactored)
- It accumulates domain-specific props that only one consumer uses

---

## Naming Conventions

| Layer | Convention | Example |
|---|---|---|
| `components/ui/` | lowercase-kebab files, PascalCase exports | `badge.tsx` → `Badge` |
| `components/app/` | PascalCase files, PascalCase exports | `PageShell.tsx` → `PageShell` |
| `features/*/components/` | PascalCase files, PascalCase exports | `GovernanceBadge.tsx` |
| `hooks/` | camelCase `use` prefix | `useConfirmDialog.tsx` |

---

## Import Aliases

| Alias | Path |
|---|---|
| `@/components/ui/*` | `client/src/components/ui/*` |
| `@/components/app` | `client/src/components/app/index.ts` |
| `@/features/agents/components` | `client/src/features/agents/components/index.ts` |
| `@/hooks/*` | `client/src/hooks/*` |

---

## Barrel Export Rules

- Every `index.ts` barrel re-exports all public components from its directory.
- Named exports only (no default exports from barrels).
- Keep barrel files sorted alphabetically.
- Internal helpers that are not meant to be consumed externally should NOT be exported from the barrel.
