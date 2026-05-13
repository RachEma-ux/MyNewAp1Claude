# Golden-Questions Evaluation — Native Graph Workspace Operator Runbook

**Plan:** Agent Studio Native Graph Workspace MVP 4 — Phases 13, 22, 23 (Graph Agent Lite, retention/feedback, graph quality)
**Status:** Formalized; CI-safe static integrity tests in repo; live evaluation operator-driven
**Owner:** Operator on staging infrastructure (Graph Agent Lite live invocation requires Neo4j CE + ASDB + RAGDB + OpenRouter model access)
**Seed:** `server/agent-studio/services/graph-skill/seed-golden-questions.ts`
**Static integrity tests:** `tests/agent-studio/graph-skill/golden-questions/`
**Last refreshed:** 2026-05-13

---

## 1. Purpose

The Golden Question suite is the regression baseline for Graph Agent Lite. Each suite captures a class of expected behavior — vault navigation, why-this-answer explanation, retrieval safety, runtime-trace navigation — and each question pins an expected retrieval path (skill pack + Cypher template) plus a minimum citation count. Phase 23 graph-quality and semantic-enrichment work re-runs these as regression checks before merging.

This runbook covers two layers:

1. **CI-safe static integrity** (runs on every PR; no infra) — verifies the seed file compiles, has no duplicate keys, references real skill packs + templates, and parses into the upsert helpers.
2. **Live evaluation** (operator-driven; needs full stack) — drives the seed into ASDB, invokes Graph Agent Lite per question, asserts citation counts + retrieval-path matches, emits a markdown report.

## 2. Repository layout

| Path | Purpose | Layer |
|---|---|---|
| `server/agent-studio/services/graph-skill/seed-golden-questions.ts` | The seed (`DEFAULT_GOLDEN_QUESTION_SUITES`) + `seedGoldenQuestionSuites()` upsert helper. | Both |
| `server/agent-studio/services/graph-skill/seed-default-packs.ts` | Skill packs that questions reference via `expectedPaths.skillPackKey`. | Static |
| `server/agent-studio/services/graph-skill/seed-cypher-templates.ts` | Cypher templates that questions reference via `expectedPaths.templateKey`. | Static |
| `tests/agent-studio/graph-skill/golden-questions/seed-integrity.test.ts` | Shape / no-duplicates / linkage / upsert-importability checks. | Static (CI) |
| `docs/architecture/agent-studio-native-graph-workspace-user-feedback.md` | ADR for the Golden Question framework. | Reference |
| `docs/evidence/graph-agent-lite/${DATE}-golden-questions/report.md` | Per-run live evaluation evidence. | Live (operator) |

## 3. CI-safe static integrity (always-on)

Run locally (mirrors what CI runs):

```bash
pnpm exec vitest run \
  --pool=forks --poolOptions.forks.singleFork \
  tests/agent-studio/graph-skill/golden-questions/seed-integrity.test.ts
```

The integrity test asserts:

1. **Seed loads** — `DEFAULT_GOLDEN_QUESTION_SUITES` exports as an array with ≥ 1 suite.
2. **Schema valid** — every suite has `suiteKey`, `name`, `description`, `questions`; every question has `questionKey`, `question`, `minimumCitationCount`.
3. **No duplicate suite keys.**
4. **No duplicate (suite, question) pairs.**
5. **Skill-pack linkage valid** — every `expectedPaths.skillPackKey` resolves to a `skillKey` in `DEFAULT_GRAPH_SKILL_PACKS`.
6. **Template linkage valid** — every `expectedPaths.templateKey` resolves to a `templateKey` in `DEFAULT_CYPHER_TEMPLATES`.
7. **Upsert helper compiles** — `seedGoldenQuestionSuites` is callable with stub upsert functions and surfaces no thrown errors on the default seed.

These checks intentionally **do not** spin up a database or Neo4j. They are repo-state assertions: if any of them fails, the seed has drifted from the skill-pack / template registry and Graph Agent Lite eligibility will break.

## 4. Live evaluation (operator)

Live evaluation is **out of CI scope** because it requires:

- ASDB Postgres with seeded skill packs + Cypher templates.
- Neo4j CE projection backend (per the [Neo4j CE benchmark runbook](./agent-studio-native-graph-workspace-neo4j-ce-benchmark-runbook.md)).
- OpenRouter model access (for Graph Agent Lite synthesis).
- Optional RAGDB fixture for GraphRAG retrieval scenarios.

### 4.1 Pre-flight checklist

| Check | Command | Expected |
|---|---|---|
| ASDB seeded | `psql -d asdb -c "SELECT count(*) FROM ags_graph_skill_packs;"` | ≥ 7 |
| Templates seeded | `psql -d asdb -c "SELECT count(*) FROM ags_query_templates;"` | ≥ 15 |
| Neo4j CE reachable | `curl -sf http://localhost:7474 \| head -n 1` | HTTP 200 / 30x |
| OpenRouter creds set | `echo $OPENROUTER_API_KEY \| wc -c` | > 1 |

### 4.2 Seed the suite into ASDB

```bash
pnpm tsx scripts/agent-studio/seed-golden-questions.ts
```

Idempotent: re-running upserts. Output JSON shape:

```json
{
  "suitesInserted": 4,
  "suitesUpdated": 0,
  "questionsInserted": 12,
  "questionsUpdated": 0,
  "errors": []
}
```

Any non-empty `errors` array blocks the run — investigate before proceeding.

### 4.3 Run the evaluation

```bash
DATE=$(date -u +%Y-%m-%d)
pnpm tsx scripts/agent-studio/run-golden-questions.ts \
  --suite all \
  --output docs/evidence/graph-agent-lite/${DATE}-golden-questions/report.md
```

Per question, the evaluator MUST:

1. Invoke Graph Agent Lite with the question text under the operator's smoke vault.
2. Capture: chosen skill pack, chosen Cypher template, retrieval mode, citation count, raw answer.
3. Compare against `expectedPaths` and `minimumCitationCount`.

### 4.4 Pass / fail criteria per question

| Field | Pass condition |
|---|---|
| `expectedPaths.skillPackKey` | If set, chosen skill pack matches. If `null`, any skill pack accepted. |
| `expectedPaths.templateKey` | If set, chosen Cypher template matches. If `null`, any template accepted. |
| `minimumCitationCount` | Returned citation count ≥ the floor. |
| `expectedAnswerPattern` | If set, the answer must match (regex). Today every entry is `null`; pattern matching is a Phase 23 future hook. |

A suite passes iff every question passes. An overall pass requires every suite to pass.

### 4.5 Decision

| Outcome | Action |
|---|---|
| 4 / 4 suites pass | Commit evidence under `docs/evidence/graph-agent-lite/${DATE}-golden-questions/`. Status report row updates to **Closed (live evaluation passed YYYY-MM-DD)**. Append a Validation Evidence link to `docs/architecture/agent-studio-native-graph-workspace-user-feedback.md`. |
| 1 suite fails on a citation-count miss only | Investigate retrieval-safety filter first; rerun before declaring regression. |
| 1 suite fails on path mismatch | Suspect eligibility ranking or template-execution-gate drift. Open a fix PR before re-running. |
| ≥ 2 suites fail | Block the Phase 23 graph-quality merge train until root cause is identified. |

## 5. Failure + rollback

- Static integrity test failures: fix the seed (`seed-golden-questions.ts`) or the referenced pack/template registry to restore linkage. Never silence the test.
- Live evaluation failures: do not edit `expectedPaths` / `minimumCitationCount` to make a failing run "pass". Capture the failure under `docs/evidence/...` and address the underlying agent behavior.

## 6. CI / staging constraints

- The static integrity test (§3) runs in CI on every PR — it is fast (< 1 s), uses no infra, and protects the seed-to-registry contract.
- A **`workflow_dispatch`-gated** GitHub Actions workflow lives at `.github/workflows/graph-golden-questions-live.yml`. The operator triggers it from the Actions tab or via `gh workflow run "Golden Questions — Live Evaluation (G10)"`. The workflow brings up a Postgres service container, seeds the suites (`scripts/agent-studio/seed-golden-questions.ts`), runs the evaluation CLI (`scripts/agent-studio/run-golden-questions.ts`), and archives the report under `docs/evidence/graph-agent-lite/<date>-golden-questions/` as a workflow artifact. The day-1 run script emits an inventory-only report (`liveWired: false`); the live-wiring PR (operator territory per §4.4) will compose the engine adapters and resolve provider credentials through `withProviderCredential` per Plan v3 D1 — never via direct `process.env` reads.
- The live evaluation (§4) MUST NOT run on per-PR CI. Any future workflow that wraps it MUST be `workflow_dispatch` only.
- The seed file is the single source of truth. Do not duplicate the question text into the runbook or evidence directories.

## 7. Hard-rule compliance reminder

- Graph Agent Lite invocations route through the existing MCP dispatcher and OpenRouter model-access path. The eval script MUST NOT bypass them.
- Graph Agent Lite is read-only. The eval MUST NOT trigger graph mutations.
- Cypher templates referenced from `expectedPaths.templateKey` MUST exist in `ags_query_templates` — the static integrity test (§3) is the guard.
