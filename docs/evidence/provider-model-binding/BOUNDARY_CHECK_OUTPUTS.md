# Plan v3 PMB — Boundary Check Outputs

**Captured:** 2026-05-04 against main@8517385.

Three layers of boundary enforcement. All pass.

---

## Layer 1 — Architecture scripts (in `npm run check:architecture`)

Three Plan v3-specific boundary scripts run as part of the architecture
pipeline:

```
=== check:provider-credential-resolver-boundary ===
OK — provider-credential-resolver boundary check passed (D2).

=== check:provider-key-env-boundary ===
OK — provider-key-env boundary check passed (D1).

=== check:ai-types-public-api-boundary ===
Failures: 0
Baseline warnings: 27
OK — no new AI Types public-API boundary violations beyond the baseline.
```

### What each enforces

- **`check:provider-credential-resolver-boundary`** (D2): only
  `server/openrouter/model-access/` may import the
  `withProviderCredential` resolver from
  `server/provider-connections/internal/`. Any other importer is a
  failure.
- **`check:provider-key-env-boundary`** (D1): no source file outside
  the Provider Connections seed script may read
  `process.env.<X>_API_KEY` for a provider key.
  `BUILT_IN_FORGE_API_KEY` and `OMNIRAG_API_KEY` are non-provider
  service tokens and excluded.
- **`check:ai-types-public-api-boundary`** (Phase 26): non-public-API
  paths (`/db`, `/services/`, `/execution`) may not be imported from
  outside `server/ai-types/`. Baseline-allow mode: 27 known legacy
  callers tracked in `scripts/baseline/ai-types-public-api-boundary.txt`
  warn but don't fail; new violators fail.

---

## Layer 2 — Static boundary tests (Phase 42)

```
$ npx vitest run tests/pmb/boundary.test.ts

 Test Files  1 passed (1)
      Tests  12 passed (12)
```

Twelve tests covering the seven Plan v3 boundary invariants. See
`tests/pmb/boundary.test.ts` for the assertion list. Each test
either grep-scans source files for forbidden patterns or asserts
that an enforcement mechanism is wired into `package.json`.

---

## Layer 3 — Runtime invariant tests

```
$ npx vitest run server/agent-studio/publish-no-catalog-write.test.ts

 (4 tests passed)
```

Phase 22 runtime guarantee that `publishRelease` writes exactly
1 row to `ags_agent_releases` + 1 update to `ags_agents`, and zero
writes to `catalog_entries`. Complements the static scan in
boundary invariant 2 with a runtime assertion of the same property.

---

## Cross-reference

| Invariant | Architecture script | Phase 42 test | Phase 22 runtime |
|---|---|---|---|
| AS does not store provider keys | — | inv 1 | — |
| AS does not write `catalog_entries` | — | inv 2 | publish-no-catalog-write |
| AI Types does not import AS internals | check:ai-types-public-api-boundary | inv 3 | — |
| AI Types does not query ASDB | check:ai-types-public-api-boundary | inv 4 | — |
| Model Access no `process.env` provider keys | check:provider-key-env-boundary | inv 5 | — |
| Provider Connections public API no secrets | — | inv 6 | provider-connections public-api.test.ts |
| Frontend cross-module boundary | check:cross-module-links | inv 7 | check:frontend-modularity |

Three independent layers — script-level static, test-level static,
runtime — together close every Plan v3 boundary invariant.
