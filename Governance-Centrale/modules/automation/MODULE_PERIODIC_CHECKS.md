# Automation — Module Periodic Checks

## Validation Checks

| Check | Frequency | Tool | Status |
|---|---|---|---|
| Nav config structural validation | Every test run | `automationNavConfigValidator.ts` | Active |
| Cross-module contract compatibility | Every test run | Phase 12 test suite | Active |
| Route-to-config consistency | Every test run | Phase 12 test suite | Active |
| Adoption registry consistency | Every test run | Phase 12 test suite | Active |
| Sidebar rendering verification | Manual | Visual inspection | On-demand |

## Drift Detection

Unlike HR (which has frozen baseline drift detection), Automation's nav config is small and stable (7 items, all live). Baseline drift detection can be added if the config grows significantly.

## Recommended Periodic Review

- Quarterly: Review whether WCP workflows should be merged into the Automation nav config
- On permission model maturity: Add runtime permission enforcement
- On config growth: Add frozen baseline drift detection
