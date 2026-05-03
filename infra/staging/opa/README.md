# Staging OPA bundle

This directory is mounted into the `staging-opa` container at
`/policies` (read-only). The bundle is **staging-only** — production
deployments use the real policy bundle distributed from the policy
repo, not this one.

The Phase 11 (Security / RBAC) evidence in PR 9 must record whether
it evaluated against this staging bundle or the production bundle.
A row that PASS-es here but never ran against production is at most
PARTIAL.

Files:

- `staging.rego` — minimal staging decisions (`staging.health.allow`,
  `staging.rbac.allow`) so Phase 11 has something to query without
  depending on the real bundle being mounted.
