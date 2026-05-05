# RAC Tool Classification — Pre-bundle Decision Record

**Owner:** Agent Studio module
**RAC phase:** P0.6 (Tool / Code Execution Safety Baseline)
**Status:** Draft — pre-bundle, not yet adopted
**Authority:** Required prerequisite for P1B (CAG builder) and P9 (Tool Safety Gate)

---

## 1. Problem statement

The revised RAC roadmap places **tool risk classification** in P9 (Tool Safety Gate), but P1B (CAG builder/validator) already needs to render *"MCP tool summaries"*, *"tool use rules"*, *"risk levels"*, *"approval requirements"* into capability packs. Without a fixed taxonomy first, the first packs will hand-roll their own labels (`"high"`, `"writes"`, `"unsafe"`, `"network"`, …), P9 will inherit drift, and the boundary checks in P1E cannot meaningfully reject "unsafe" content because there is no single source of truth for what *unsafe* means.

This pre-bundle locks the taxonomy **before** any P1 code lands so:

- the CAG renderer has a stable schema to write against,
- the export readiness gate (P10) has a stable schema to read against, and
- the MCP dispatcher policy code already in `server/agent-studio/services/mcp/` has a stable schema to enforce.

---

## 2. Decisions (D-TOOL-1 … D-TOOL-6)

### D-TOOL-1 — Eight-class risk taxonomy, fixed enumeration, no `"unknown"` after P0.6

Every MCP tool surfaced into Agent Studio MUST be classified into exactly one of:

| Class | Meaning | Default action |
| --- | --- | --- |
| `read_only` | No state mutation, no external side effect (e.g. `current_time`, `text_analysis`) | Allowed in CAG, allowed in chat |
| `write` | Mutates Agent Studio-owned state (drafts, sessions, tests) | Allowed; governance receipt at dispatcher |
| `external_side_effect` | Reaches non-Agent-Studio systems with side effects (Slack post, Jira create) | Approval policy required |
| `destructive` | Deletes / overwrites / cannot be undone | Governance receipt + approval policy |
| `credential_sensitive` | Reads or transmits credentials, secrets, OAuth tokens | Forbidden in CAG body; never embedded in pack |
| `code_execution` | Runs arbitrary code or shell commands | Sandbox prerequisite (D-SBX-1) — blocked otherwise |
| `governance_sensitive` | Triggers governance state changes (publish, deprecate, disable) | Receipt always required; CAG renders only the *name* + risk badge |
| `quarantined` | Newly-registered tool that has not been classified | Forbidden in CAG and runtime until classified |

`"unknown"` is **explicitly removed** from the taxonomy. New tools enter as `"quarantined"`. P0.6 acceptance includes: classify every existing MCP tool in `server/agent-studio/services/mcp/` before P1B can start. The default-deny posture — quarantined-until-classified — is the only safe migration path.

### D-TOOL-2 — Classification lives next to the manifest, not in the pack

Risk class MUST be a manifest-level property of the tool, written by the tool owner, not derived inside CAG:

```ts
// server/agent-studio/services/mcp/types.ts (extend existing)
export interface McpToolManifestEntry {
  name: string;
  description: string;
  schema: unknown;
  // NEW (D-TOOL-2)
  riskClass: ToolRiskClass;          // one of D-TOOL-1
  approvalPolicy?: ApprovalPolicyRef; // null when riskClass=read_only
  sandboxRequirementRef?: string;     // required when riskClass=code_execution
}
```

The CAG builder reads this and surfaces the badge. It MUST NOT compute `riskClass` from heuristics on the description string. If the manifest says `read_only`, the dispatcher trusts it; if it lies, that is an MCP-side bug, not a CAG-side bug. The boundary stays clean.

### D-TOOL-3 — CAG renders class, not capability detail

Capability packs MUST include for each tool:

- `name`
- `riskClass` (from D-TOOL-1)
- one-sentence purpose summary (from manifest)
- approval-required flag (boolean derived from `approvalPolicy != null`)
- sandbox-required flag (boolean — true iff `riskClass = code_execution`)

Capability packs MUST NOT include:

- raw input schema JSON (causes prompt bloat; runtime tool-call selection uses the live schema)
- example invocations with concrete arguments (treats CAG as RAG)
- credentials, env-var hints, or `provider_*` references
- governance receipt IDs from past runs (treats CAG as audit log)

The renderer's job is *"the agent knows what tools exist and how risky they are"* — not *"the agent has memorized how to call them"*. The dispatcher always presents the live schema at call time.

### D-TOOL-4 — `code_execution` is the only class that conditionally blocks export

Per RAC P10 (export readiness):

| Tool class on agent | Export gate behavior |
| --- | --- |
| `read_only` only | Pass |
| Includes `write` / `external_side_effect` / `destructive` / `governance_sensitive` | Pass iff approval policy present |
| Includes `credential_sensitive` | Pass iff secret resolution path verified (Phase 27.3 binding) |
| Includes `code_execution` | **Pass iff sandbox prerequisite (D-SBX-1) is satisfied — otherwise hard block** |
| Includes any `quarantined` | Hard block |

`code_execution` is the only class that can convert "approval missing" into a hard block at export. Every other class downgrades to `racStatus="degraded"` with a warning, allowing the export with reduced readiness.

### D-TOOL-5 — Boundary: `riskClass` lives in the manifest contract, not in the runtime path

The classification field travels with the tool through the same path the schema uses:

```
McpToolManifestEntry  →  registerMcpTool()  →  McpToolRegistry  →  CAG builder reads
                                                                ↘ dispatcher reads
                                                                ↘ export readiness reads
```

CAG, dispatcher, and export readiness MUST all read the SAME registry. Forking a "CAG view" of risk class is forbidden. Phase 1E boundary check enforces: no module under `server/agent-studio/services/cag/` may write or recompute `riskClass`.

### D-TOOL-6 — Migration plan for existing tools

Five built-in tools live in the registry today (from `server/_core/index.ts` boot log):

| Tool | Provisional class |
| --- | --- |
| `calculator` | `read_only` |
| `current_time` | `read_only` |
| `text_analysis` | `read_only` |
| `json_parser` | `read_only` |
| `url_parser` | `read_only` |

P0.6 deliverable includes a one-shot migration that writes these classes into the manifest. Any tool registered through MCP auto-connect (`[ags-mcp] auto-connect: 1 connected, 0 failed` in boot log) defaults to `quarantined` until its owner declares a class — that is intentional friction.

---

## 3. Why (open notes)

- **Why no `"unknown"`?** Because the previous roadmap's open category lets P9 ship with TODO-shaped labels. Quarantined is hostile-by-default; unknown is permissive-by-default.
- **Why classification at the manifest, not inside CAG?** Because CAG is downstream of three other readers. Putting the truth at the manifest keeps the dispatcher and the readiness gate consistent. CAG that disagrees with the dispatcher is the bug we are most trying to avoid.
- **Why is `governance_sensitive` separate from `destructive`?** A publish is governance-sensitive but reversible. A delete is destructive. Mixing the two means publish carries the same friction as delete and gets bypassed.

---

## 4. Acceptance

- All eight classes implemented as a TypeScript union in `server/agent-studio/services/mcp/types.ts`
- All five built-in tools and any MCP-auto-connected tools classified before P1B starts
- `quarantined` tools are not embedded in any CAG pack and not callable through the dispatcher
- Phase 1E boundary check: no file under `server/agent-studio/services/cag/` matches `riskClass\s*=` other than reads
- Export readiness (P10) reads `riskClass` directly from the registry, not from CAG content

## 5. How to apply (later phases)

- **P1B builder:** read tool list, render `(name, riskClass, summary, approval-required, sandbox-required)` lines only.
- **P1B validator:** reject any pack content containing raw input-schema JSON or example arguments.
- **P9 gate:** consume the existing taxonomy; do not redefine.
- **P10 export:** map `riskClass` → readiness status using D-TOOL-4 table.
