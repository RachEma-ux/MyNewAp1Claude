# Agent Studio — Extension Framework Strategy

**Status:** Adopted 2026-05-11
**Phase:** Native Graph Workspace Phase 18
**Owner:** Native Graph Workspace working group

---

## Summary

The Native Graph Workspace exposes an **internal extension model**
that lets first-party modules contribute commands, query templates,
graph skill packs, and view kinds without bypassing the
load-bearing chokepoints (MCP dispatcher, approval gate, governance
adapter, GraphRepository, raw-artifact policy).

A **third-party plugin runtime is explicitly deferred**. The
security model required to safely execute untrusted code in the
host process is the same one needed for full sandboxing,
multi-region isolation, and supply-chain attestation — none of
which are MVP-grade today.

---

## Internal extension points

The MVP recognizes five extension surfaces:

| Surface | Mechanism | Phase |
|---|---|---|
| **Operator commands** | `services/command-registry/` (Phase 18) | this PR |
| **Cypher query templates** | `ags_query_templates` table + seed pipeline | Phase 12.5 |
| **Graph Skill Packs** | `ags_graph_skill_packs` + `ags_graph_skill_pack_versions` | Phase 12.5 |
| **Vault note templates** | `ags_vault_templates` + seed pipeline | Phase 15 |
| **Saved view kinds** | `ags_vault_saved_views.view_kind` discriminator + UI handlers | Phase 16 |

Each surface follows the same shape:

1. A code-level registry / seed module defines the extension data.
2. A boot-time idempotent upsert writes the rows into ASDB (when
   the surface is DB-backed).
3. The runtime reads the row at the relevant chokepoint
   (dispatcher, template gate, planner, etc.).
4. The UI surfaces the extension through a standard component
   (command palette, template picker, view selector, etc.).

Modules that want to contribute new commands or templates ship
their data alongside their code; no operator UI accepts arbitrary
registration at runtime.

---

## Why third-party plugins are deferred

1. **Dispatcher integrity.** `dispatchMcpToolCall(input)` is the
   single tool execution chokepoint. A plugin that imports the
   dispatcher directly bypasses the proposed-tool-call validation,
   approval gate, and risk-class routing. Sandboxing untrusted
   handlers safely needs the Phase 9 sandbox machinery applied to
   *every* plugin entry point — that's not where the code is today.

2. **Governance escape hatches.** Governance enforcement
   (`evaluateGovernance`, `agsPendingPermissionRequests`,
   `requireGovernedAction`) reads action-key metadata from a static
   map. Plugins that ship their own action keys would need a
   dynamic governance manifest — a category of supply-chain risk
   we're not equipped to mitigate yet.

3. **GraphRepository invariant.** All graph access goes through
   `GraphRepository`. A plugin that imports a graph driver
   directly violates the "Neo4j driver imports forbidden outside
   the repository" source-scan rule (Phase 10 invariant). Without
   a plugin-import-allowlist enforcement, the invariant decays.

4. **CAG block injection.** CAG blocks ship as code-shaped seed
   data. Plugins that contribute CAG blocks could inject runtime
   instructions into the assembled context — the LLM cannot tell
   plugin-sourced instructions from operator-vetted ones.

5. **Vault permission model.** Plugins operating on
   `ags_vault_notes` could bypass the vault membership +
   workspace-scope checks. A reliable per-plugin permission
   bracket is itself a feature that would land before the
   plugin runtime, not after.

The decision is not "no plugins ever" — it's "no plugins until the
security model is settled." A future Phase 18.5 or 22 can re-open
the question once the gating items above have explicit owners.

---

## Plugin security strategy (what we'd need)

Before un-deferring third-party plugins, the following must exist:

- **Per-plugin sandbox** — `node:vm` boundary around plugin
  handlers, same shape as the Phase 9 tool sandbox but applied to
  *every* plugin entry point. The `riskClass="code_execution"`
  routing rule extends to plugin-supplied code.
- **Allowlist-only host imports** — plugins import from a curated
  `@plugin-api/*` surface only. Static analysis at install time
  rejects imports outside the allowlist. The MCP dispatcher,
  approval gate, GraphRepository, and governance adapter all live
  behind the allowlist boundary.
- **Signed manifests** — plugin manifests declare action keys,
  CAG blocks, tools, and resource needs. Manifests must be signed
  by a trusted publisher key; unsigned plugins refuse to load.
- **Per-plugin governance bracket** — the governance adapter
  recognizes plugin-issued action keys and applies a separate
  approval policy (e.g., destructive actions in a plugin require
  workspace-admin approval, regardless of the plugin's own
  declarations).
- **Vault permission bracket** — plugins acting on vault data
  inherit the user's workspace membership + vault role, not the
  plugin author's. Cross-vault writes are denied at the bracket
  boundary.
- **Per-plugin observability** — every plugin invocation records
  to `agsRuntimeRuns` and `ags_runtime_note_references`,
  attributed to both the user and the plugin manifest. Same
  trace-export pipeline as Phase 14 §1.

Until the five gating items have implementations + tests, the
plugin runtime stays deferred.

---

## Runtime boundaries (protected by this ADR)

The following invariants apply to **every** extension point, MVP
or future:

1. **MCP dispatcher is the only tool path.** Extensions invoke
   tools through `dispatchMcpToolCall(input)` only — no parallel
   tool execution.
2. **Approval gate cannot be bypassed.** Commands that route to
   tRPC procedures with `governedProcedure` continue to enforce
   approval. Commands cannot "wrap" a governed action to skip
   approval.
3. **Note permissions are enforced at the vault layer.** The
   vault repository checks workspace + vault membership on every
   note read/write. Extensions go through the repository, never
   through `getAsDb()` directly.
4. **Graph governance lives at the GraphRepository boundary.**
   Cypher template execution flows through the template gate
   (Phase 12.5 §13) regardless of caller.
5. **CAG governance applies to extension-shipped blocks.** A CAG
   block contributed by an extension goes through the same
   compile + validate path as a built-in.
6. **Raw artifact policy.** Extensions cannot inject raw source
   artifacts into prompts. Universal Ingestion produces
   `NormalizedKnowledgeUnit` rows; prompts read those, not raw
   files.
7. **Runtime trace is mandatory.** Every extension invocation
   records to `agsRuntimeRuns`. There is no "silent" extension
   path.
8. **Context safety filter applies to extension output.** The
   safety filter (Phase 12 §6) runs on extension-produced context
   blocks before the planner sees them.
9. **GraphRepository is the only graph access path.** No driver
   imports outside `server/agent-studio/services/graph/repository/**`
   and `server/modules/kgia/**`. Source-scan tested.
10. **Neo4j projection rules apply.** Extensions that mutate graph
    facts route through the Phase 11.5 change-proposal lifecycle,
    not direct projection writes.

A failed source-scan against any of the above 10 invariants is a
release-blocking violation.

---

## Internal command registry surface

`server/agent-studio/services/command-registry/` ships in this
PR. The shape:

```ts
interface CommandRegistration {
  commandKey: string;       // unique identifier; namespaced by module
  title: string;            // command-palette label
  description?: string;
  scope: "read" | "write" | "destructive";
  target: string;           // "trpc:agentStudio.x.y" | "route:/path" | "ui:action"
  module?: string;          // namespace
}
```

Modules call `registerCommand(...)` at boot. The UI command
palette pulls the registry via a tRPC procedure (out of scope for
this ADR; lands when the palette UI ships). Operators see the
list filtered by their workspace membership.

Destructive commands receive a confirmation prompt in the palette.
The registry does not enforce approval — that's the underlying
tRPC procedure's job — but it surfaces the scope hint so the UI
can render correctly.

---

## Acceptance criteria mapping

This ADR + the command-registry service close the Phase 18 list:

- ✅ Internal command registry exists
  (`services/command-registry/`)
- ✅ Internal extension points documented (five-surface table
  above)
- ✅ Third-party plugin runtime deferred (rationale + 5 gating
  items)
- ✅ Plugin security strategy documented (sandbox + allowlist +
  signing + governance bracket + observability)
- ✅ Runtime boundaries protected (10-invariant list)

---

## See also

- `docs/architecture/agent-studio-canvas-strategy.md` — Phase 17
- `docs/implementation/agent-studio-native-graph-workspace-roadmap.md`
  Phase 18 — original requirements
- `server/agent-studio/services/command-registry/` — implementation
