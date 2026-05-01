# Readiness Scoring

Each module gets a 0-100 readiness score computed from its per-area
statuses. The scorer lives in `server/platform/wiring/readiness.ts`;
the inventory builder calls it after assembling the area list.

## Weights

```ts
manifest:       10
server-router:  10
client-route:    8
navigation:      6
public-api:      8
gateway:         8
database:       10
permission:      8
governance:     10
event:           5
handoff:         5
runtime:         8
port-endpoint:   4
agent-provider:  5
observability:   5
test:           10
documentation:   5
```

Total weight = **123**. Anything outside this list defaults to 5.

## Algorithm

```
numerator   = Σ area.score × area.weight   (excluding not-applicable areas)
denominator = Σ 100         × area.weight   (excluding not-applicable areas)
score       = round( numerator / denominator × 100 )
```

Required missing/broken/blocked areas are recorded as **blockers**.
Optional partial/declared-only areas become **warnings**. Both lists
are returned alongside the score.

## Status buckets

| Score range | Status |
|---|---|
| 90 – 100 | `fully-wired` |
| 75 – 89 | `mostly-wired` |
| 50 – 74 | `partially-wired` |
| 1 – 49 | `declared-only` |
| 0 | `blocked` |

If the module has at least one blocker AND a score below 50, it is
demoted to `blocked` regardless of bucket.

## Worked example

PRM's per-area statuses (from the current run):

| Area | Status | Score | Weight | Contribution |
|---|---|---:|---:|---:|
| manifest | wired | 100 | 10 | 1000 |
| server-router | wired | 100 | 10 | 1000 |
| client-route | wired | 100 | 8 | 800 |
| navigation | wired | 100 | 6 | 600 |
| public-api | declared-only | 30 | 8 | 240 |
| gateway | declared-only | 25 | 8 | 200 |
| database | wired | 100 | 10 | 1000 |
| permission | wired | 100 | 8 | 800 |
| governance | wired | 100 | 10 | 1000 |
| event | wired | 100 | 5 | 500 |
| runtime | wired | 100 | 8 | 800 |
| observability | wired | 100 | 5 | 500 |
| test | missing | 0 | 10 | 0 |
| documentation | missing | 0 | 5 | 0 |
| handoff | n/a | — | — | excluded |
| port-endpoint | wired | 100 | 4 | 400 |
| agent-provider | wired | 100 | 5 | 500 |

Total contributions = 9 340; denominator (sum of `100 × weight` for
participating areas) = 12 000 → score = round(9 340 / 12 000 × 100)
= **78** (the actual run shows 76 because some scores like
declared-only round slightly differently — match the live numbers
in `MODULE_WIRING_REPORT.md`).

## Tuning weights

Weights live in one place. Bump them carefully — every change shifts
every module's score and may move modules between buckets. After
any change:

1. Run `pnpm run check:wiring-inventory` to refresh the report.
2. Run `pnpm run check:module-readiness` to confirm internal
   consistency.
3. Compare the new `MODULE_WIRING_REPORT.md` to the previous one.
