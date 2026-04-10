# KGRA — Knowledge Graph Reasoning Agent

**Version 2.0 (Autonomous Learning Edition)**

An autonomous, self-improving hybrid reasoning agent that answers complex queries over graph sources, continuously builds its own knowledge graph, constructs reusable reasoning paths, and evaluates external knowledge bundles.

## Architecture

```mermaid
graph TB
    subgraph API Layer
        REST[FastAPI REST]
        MCP_S[MCP Server]
    end

    subgraph State Machine
        CI[classify_intent] --> RDT[resolve_domain_terms]
        RDT --> LSS[load_schema_slice]
        LSS --> CM[choose_mode]
        CM -->|query| PO[plan_operation]
        CM -->|bundle| BMR[bundle_multi_pass_review]
        PO --> VO[validate_operation]
        VO --> ER[execute_retrieval]
        ER --> ERP[expand_rank_paths]
        ER --> AEG[assemble_evidence_graph]
        ERP --> AEG
        AEG --> UTM[update_task_memory]
        UTM --> SA[synthesize_answer]
        SA --> HR[human_review]
        BMR --> BCS[bundle_coherence_scoring]
        BCS --> BRS[bundle_readiness_scoring]
        BRS --> BDR[bundle_decision_resolution]
        BDR --> BCM[bundle_contract_mapping]
        BCM --> SA
    end

    subgraph Memory Planes
        SG[Source Graph<br/>Neo4j/SPARQL<br/>Read-only]
        RG[Retrieval Graph<br/>GraphRAG<br/>Read-only]
        MG[Memory Graph<br/>Redis+Postgres<br/>Session]
        LG[Learning Graph<br/>Neo4j<br/>Permanent]
    end

    subgraph Tools
        GT[Graph Tools]
        LT[Learning Tools]
        ET[Evaluation Tools]
        MT[MCP Tools]
    end

    subgraph Governance
        PE[Policy Engine]
        AL[Audit Logger]
        HITL[Human Review]
    end

    REST --> CI
    MCP_S --> CI
    ER --> GT
    SA --> LT
    BMR --> ET
    GT --> SG
    GT --> RG
    UTM --> MG
    LT --> LG
    PE --> GT
    PE --> ET
    AL --> PE
```

## Quickstart

```bash
# 1. Install dependencies
pip install -r requirements.txt

# 2. Set environment variables
export KGRA_LLM_API_KEY=sk-...
export KGRA_POSTGRES_PASSWORD=...
export KGRA_NEO4J_PASSWORD=...
export KGRA_REDIS_PASSWORD=...

# 3. Start the API server
uvicorn kgra.src.api.app:app --host 0.0.0.0 --port 8000

# 4. Query the agent
curl -X POST http://localhost:8000/run \
  -H "Content-Type: application/json" \
  -d '{"query": "What is the capital of France?"}'

# 5. Evaluate a knowledge bundle
curl -X POST http://localhost:8000/evaluate_bundle \
  -H "Content-Type: application/json" \
  -d '{"documents": [{"name": "spec.md", "content": "..."}], "bundle_name": "my_bundle"}'
```

## Configuration

Edit `config.yaml` for non-secret settings. All secrets load from environment:

| Variable | Description |
|----------|-------------|
| `KGRA_LLM_API_KEY` | OpenAI/Anthropic API key |
| `KGRA_POSTGRES_PASSWORD` | PostgreSQL password |
| `KGRA_NEO4J_PASSWORD` | Neo4j password |
| `KGRA_REDIS_PASSWORD` | Redis password |
| `KGRA_MCP_SERVER_KEY` | API key for MCP server |

## Testing

```bash
pytest kgra/tests/ -v
```

## Adding a New Tool

1. Create function in `kgra/src/tools/` with async signature
2. Add JSON schema for input/output
3. Register in the appropriate tool category
4. Add governance policy check in `policy_engine.py`
5. Add audit logging
6. Add unit test in `kgra/tests/`

## Adding an MCP Server

1. Add entry to `config.yaml` under `mcp.registry`
2. Set API key as env var
3. Restart KGRA — auto-discovers tools
4. Governance approval required for new servers

## Deployment

```bash
docker build -f kgra/deploy/Dockerfile -t kgra:2.0.0 .
kubectl apply -f kgra/deploy/k8s/
```

## License

Internal — part of MyNewAp1Claude platform.
