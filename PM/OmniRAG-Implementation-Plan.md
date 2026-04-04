# OmniRAG v4 — Implementation Plan

**Created:** 2026-04-04
**Status:** Active
**Repo:** `RachEma-ux/omnirag`
**Stack:** Python 3.11, FastAPI, Pydantic v2, LangChain, LlamaIndex, Haystack
**License:** Apache 2.0

---

## Planner Agent Output

### Objective

Build OmniRAG v4 as a standalone open-source platform from the ground up, following the Full Technical Specification and Detailed Implementation Todo List. Start with Phase 0 (Foundation) and Phase 1 (Control Plane).

### Risks

1. **Termux constraint** — Cannot run Python builds/tests on device. All coding is file-only, CI runs on GitHub Actions.
2. **Dependency conflicts** — LangChain, LlamaIndex, Haystack have overlapping transitive deps. Must use optional extras to isolate.
3. **Scope creep** — Spec is 145 person-days. Must strictly phase and ship MVP (Phase 0+1+2) before touching adapters.
4. **RAM on CI** — GPU-dependent adapters (vLLM, HF large models) need conditional imports and CI matrix.

### Implementation Order

```
Step 1:  Repo + CI scaffold
Step 2:  Canonical data model (Pydantic)
Step 3:  Adapter base classes + registry
Step 4:  Runtime abstraction layer
Step 5:  YAML pipeline schema + loader
Step 6:  Pipeline DAG + interpreted executor
Step 7:  Execution strategies (single, fallback, ensemble, vote)
Step 8:  CLI skeleton (omnirag validate, run)
Step 9:  FastAPI skeleton (REST endpoints)
Step 10: First adapter (in-memory vector store) for end-to-end test
Step 11: Documentation scaffolding
```

---

## Step 1 — Repo + CI Scaffold

### 1.1 Create GitHub repo

```
gh repo create RachEma-ux/omnirag --public --description "OmniRAG v4 — Open-source control plane for RAG systems"
```

### 1.2 Project structure

```
omnirag/
├── .github/
│   └── workflows/
│       ├── ci.yml              # lint + test + type check
│       └── release.yml         # PyPI publish on tag
├── omnirag/
│   ├── __init__.py             # version
│   ├── core/
│   │   ├── __init__.py
│   │   ├── models.py           # Canonical data model (Pydantic)
│   │   ├── maturity.py         # @maturity_level decorator
│   │   └── exceptions.py       # Custom exceptions
│   ├── adapters/
│   │   ├── __init__.py
│   │   ├── base.py             # BaseAdapter ABC
│   │   ├── registry.py         # AdapterRegistry
│   │   └── memory/             # In-memory vector store (for testing)
│   │       ├── __init__.py
│   │       └── adapter.py
│   ├── runtimes/
│   │   ├── __init__.py
│   │   ├── base.py             # BaseRuntime ABC
│   │   ├── langchain.py        # LangChainRuntime (stub)
│   │   ├── llamaindex.py       # LlamaIndexRuntime (stub)
│   │   └── haystack.py         # HaystackRuntime (stub)
│   ├── pipelines/
│   │   ├── __init__.py
│   │   ├── schema.py           # YAML schema (JSON Schema for validation)
│   │   ├── loader.py           # Load + validate YAML
│   │   ├── dag.py              # PipelineDAG (topological sort)
│   │   └── executor.py         # Interpreted executor
│   ├── strategies/
│   │   ├── __init__.py
│   │   ├── base.py             # ExecutionStrategy ABC
│   │   ├── single.py           # SingleStrategy
│   │   ├── fallback.py         # FallbackStrategy
│   │   ├── ensemble.py         # EnsembleStrategy
│   │   └── vote.py             # VoteStrategy
│   ├── compiler/               # Phase 2 — placeholder
│   │   ├── __init__.py
│   │   └── planner.py          # Stub
│   ├── api/
│   │   ├── __init__.py
│   │   ├── app.py              # FastAPI app factory
│   │   ├── routes/
│   │   │   ├── __init__.py
│   │   │   ├── pipelines.py    # /pipelines CRUD
│   │   │   ├── invoke.py       # /invoke, /invoke_async
│   │   │   ├── tasks.py        # /tasks/{id}
│   │   │   └── health.py       # /health, /metrics
│   │   └── middleware.py       # Auth, CORS, logging
│   └── cli/
│       ├── __init__.py
│       └── main.py             # Click CLI (validate, run, deploy)
├── tests/
│   ├── __init__.py
│   ├── test_models.py
│   ├── test_registry.py
│   ├── test_loader.py
│   ├── test_dag.py
│   ├── test_executor.py
│   ├── test_strategies.py
│   └── test_api.py
├── examples/
│   └── simple_rag.yaml         # Example pipeline
├── AGENTS.md                   # Mandatory team definition
├── README.md
├── LICENSE                     # Apache 2.0
├── pyproject.toml              # Project config (PEP 621)
├── requirements.txt            # Pinned deps
├── requirements-dev.txt        # Dev deps (pytest, ruff, mypy)
├── Dockerfile                  # Multi-stage build
├── docker-compose.yml          # Dev: OmniRAG + Qdrant + Redis
└── .pre-commit-config.yaml     # Hooks
```

### 1.3 CI workflow (GitHub Actions)

```yaml
# .github/workflows/ci.yml
- Python 3.11
- Install deps
- ruff check (lint)
- mypy (type check)
- pytest --cov (tests, coverage ≥85%)
- bandit (security)
```

---

## Step 2 — Canonical Data Model

**File:** `omnirag/core/models.py`

Pydantic v2 models exactly as spec'd:
- `Modality` enum (text, table, image, chart, formula)
- `Relation` model
- `OmniChunk` model
- `OmniDocument` model
- `RetrievalResult` model
- `GenerationResult` model

Validation rules:
- Unique chunk IDs within document
- Embedding length consistency
- Scores aligned with chunks in RetrievalResult

---

## Step 3 — Adapter Base + Registry

**Files:** `omnirag/adapters/base.py`, `omnirag/adapters/registry.py`, `omnirag/core/maturity.py`

- `BaseAdapter` ABC with `ingest()`, `retrieve()`, `embed()`, `generate()` methods
- `@maturity_level("core"|"extended"|"experimental")` decorator
- `AdapterRegistry` — register, get, list, warn on maturity mismatch

---

## Step 4 — Runtime Abstraction

**Files:** `omnirag/runtimes/base.py` + runtime stubs

- `BaseRuntime` ABC: `load_component()`, `run_pipeline()`, `normalize_output()`
- LangChain, LlamaIndex, Haystack stubs (importable only when framework installed)
- Lazy imports to avoid hard dependency on all three

---

## Step 5 — YAML Pipeline Schema + Loader

**Files:** `omnirag/pipelines/schema.py`, `omnirag/pipelines/loader.py`

- JSON Schema for YAML validation
- `load_pipeline(path) -> PipelineConfig`
- `validate_pipeline(config) -> List[ValidationError]`
- Stage dependency checking, cycle detection

---

## Step 6 — Pipeline DAG + Executor

**Files:** `omnirag/pipelines/dag.py`, `omnirag/pipelines/executor.py`

- `PipelineDAG` — nodes=stages, edges=data deps, topological sort
- `InterpretedExecutor` — walk DAG, pass canonical models between stages
- Error recovery, timeout handling
- OpenTelemetry span creation (optional)

---

## Step 7 — Execution Strategies

**Files:** `omnirag/strategies/*.py`

- `SingleStrategy` — run first pipeline
- `FallbackStrategy` — condition functions (confidence, timeout, exception)
- `EnsembleStrategy` — parallel + merge (deduplicate, rerank, concat)
- `VoteStrategy` — majority vote weighted by confidence

---

## Step 8 — CLI

**File:** `omnirag/cli/main.py`

```bash
omnirag validate pipeline.yaml
omnirag run pipeline.yaml --query "..."
omnirag serve --port 8100
```

Using `click` library.

---

## Step 9 — FastAPI REST API

**Files:** `omnirag/api/app.py`, `omnirag/api/routes/*.py`

Endpoints per spec:
- `POST /pipelines` — upload YAML
- `GET /pipelines/{name}` — get definition
- `POST /pipelines/{name}/invoke` — sync execution
- `POST /pipelines/{name}/invoke_async` — async, returns task ID
- `GET /tasks/{task_id}/result` — poll
- `GET /health` — health check
- `GET /metrics` — Prometheus

---

## Step 10 — First Adapter (In-Memory Vector Store)

**File:** `omnirag/adapters/memory/adapter.py`

Simple in-memory vector store for end-to-end testing without external deps.
- Cosine similarity search
- CRUD on OmniChunk
- Maturity: core

---

## Step 11 — Example Pipeline + Docs

- `examples/simple_rag.yaml` — parse → chunk → embed → retrieve → generate
- `README.md` — installation, quickstart, architecture overview

---

## Validation Plan

- [ ] `omnirag validate examples/simple_rag.yaml` — passes
- [ ] Canonical models serialize/deserialize correctly
- [ ] DAG detects cycles and rejects them
- [ ] SingleStrategy produces GenerationResult
- [ ] FallbackStrategy falls through on low confidence
- [ ] EnsembleStrategy merges and deduplicates
- [ ] API returns 200 on /health
- [ ] API accepts pipeline upload and invocation
- [ ] CI passes (lint + type check + tests)

---

## Phase Boundary

This plan covers **Phase 0 + Phase 1** of the spec (~38 person-days).

**Not in scope yet:**
- Phase 2: Selective Execution Planner (compiler)
- Phase 3: Full adapter ecosystem (Qdrant, Milvus, HF, RAGatouille, etc.)
- Phase 4: K8s operator, Helm, gRPC, WebSocket
- Phase 5: Benchmarks, PyPI release

Those phases build on this foundation and will be planned separately.

---

## Governance Check

- [x] AGENTS.md will be copied to new repo (mandatory)
- [x] No cross-module imports from MyNewAp1Claude
- [x] Standalone platform — own repo, own deps, own CI
- [x] Apache 2.0 license as spec'd
- [x] Security scanning in CI (bandit, safety)
