# Wiring Matrix

The Wiring Matrix is the table view at the heart of the Application
Wiring Inventory dashboard. Rows are modules; columns are wiring
areas; each cell is a `ModuleWiringAreaStatus` rendered as a status
badge.

## Columns (in display order)

```
manifest · server-router · client-route · navigation · public-api ·
gateway · database · permission · governance · event · handoff ·
runtime · port-endpoint · agent-provider · observability · test ·
documentation
```

Defined in `DEFAULT_MATRIX_COLUMNS` (`server/platform/wiring/types.ts`).
Downstream consumers should treat the order as presentational and
use the `area` field on each cell when keying off it programmatically.

## Cell shape

```ts
{
  moduleKey: string;
  area: WiringArea;
  status: WiringStatus;
  severity: WiringSeverity;
  score: number;          // 0..100
  required: boolean;
  evidence: WiringEvidence[];
  missing: string[];
  notes?: string;
}
```

## Status legend

| Symbol | Status | Meaning |
|---|---|---|
| ✅ / ✓ | `wired` | Declared and verified. |
| 🟡 / ◐ | `partial` | Some sub-items wired, others missing. |
| ⚪ / ○ | `declared-only` | Manifest declares it, no runtime registration found. |
| 🚫 / ! | `missing` | Required by another contract; no declaration. |
| 🚫 / ✕ | `broken` | Declared and registered but failing a sanity check. |
| 🚫 / ■ | `blocked` | A hard dependency is missing/broken/blocked. |
| —     | `not-applicable` | Module legitimately does not participate. |

Optional areas with `not-applicable` status are excluded from the
readiness denominator — modules without a database aren't penalised
for not having one.

## How required vs optional is decided

The cell's `required` flag is set by the area builder in
`server/platform/wiring/inventory.ts` based on facts about the
module:

- `manifest`, `runtime`, `permission`, `database`, `observability` are
  always required for participating modules.
- `server-router`, `client-route`, `navigation` are required only if
  the manifest declares routes / routerKey.
- `public-api`, `gateway` are required only if the manifest declares
  governance actions.
- `event`, `handoff`, `port-endpoint`, `agent-provider` are optional
  by default — they only fire when the manifest declares
  participation.
- `test`, `documentation` are optional; their absence shows as a
  warning, never a blocker.

## How status maps to score

Each area builder also returns a 0-100 score. Defaults:

| Status | Default score |
|---|---|
| `wired` | 100 |
| `partial` | proportional (`done / total × 100`) |
| `declared-only` | 25–30 |
| `missing` / `broken` / `blocked` | 0–20 |
| `not-applicable` | excluded |

The score per area feeds the per-module readiness — see
`READINESS_SCORING.md`.

## Reading the report

`pnpm run check:wiring-inventory` writes
`docs/architecture/modularity/MODULE_WIRING_REPORT.md` with the
current matrix. That file is auto-generated; do not hand-edit.
