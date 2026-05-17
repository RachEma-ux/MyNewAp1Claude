# Graph Agent Reasoning Benchmark — 2026-05-17T17:58:56.139Z

- Commit: `unknown`
- Mode: deterministic-stub
- Result: **PASS** (6/6 scenarios passed)

## Scenarios

### simple_fact_lookup — PASS

> Single visible node → answer cites it

- Duration: 10ms
- Retrieval mode: `graphrag_global`
- Cited sourceIds: `[src:n1]`
- Graph node ids in trace: `[n1]`

| Assertion | Result | Note |
|---|---|---|
| citation count >= 1 | ✅ | got 1 |
| cited sourceId includes "src:n1" | ✅ |  |
| decision-trace graphNodeIds includes "n1" | ✅ |  |

### multi_hop_relationship — PASS

> 2-hop traversal from seed yields multiple cited facts

- Duration: 2ms
- Retrieval mode: `graphrag_global`
- Cited sourceIds: `[src:n1, src:n2, src:n3]`
- Graph node ids in trace: `[n1, n2, n3]`

| Assertion | Result | Note |
|---|---|---|
| citation count >= 2 | ✅ | got 3 |
| cited sourceId includes "src:n1" | ✅ |  |
| cited sourceId includes "src:n2" | ✅ |  |
| decision-trace graphNodeIds includes "n1" | ✅ |  |
| decision-trace graphNodeIds includes "n2" | ✅ |  |
| decision-trace graphNodeIds includes "n3" | ✅ |  |

### shortest_path_reasoning — PASS

> Local-graph retrieval that includes shortest-path endpoints in citations

- Duration: 1ms
- Retrieval mode: `graphrag_global`
- Cited sourceIds: `[src:a, src:b, src:c]`
- Graph node ids in trace: `[a, b, c]`

| Assertion | Result | Note |
|---|---|---|
| citation count >= 2 | ✅ | got 3 |
| cited sourceId includes "src:a" | ✅ |  |
| cited sourceId includes "src:c" | ✅ |  |
| decision-trace graphNodeIds includes "a" | ✅ |  |
| decision-trace graphNodeIds includes "c" | ✅ |  |

### impact_style_reasoning — PASS

> Downstream impact view (neighborhood depth 2) — cites downstream facts

- Duration: 1ms
- Retrieval mode: `graphrag_global`
- Cited sourceIds: `[src:root, src:d1, src:d2, src:d3]`
- Graph node ids in trace: `[root, d1, d2, d3]`

| Assertion | Result | Note |
|---|---|---|
| citation count >= 3 | ✅ | got 4 |
| cited sourceId includes "src:d1" | ✅ |  |
| cited sourceId includes "src:d2" | ✅ |  |
| cited sourceId includes "src:d3" | ✅ |  |
| decision-trace graphNodeIds includes "root" | ✅ |  |
| decision-trace graphNodeIds includes "d1" | ✅ |  |
| decision-trace graphNodeIds includes "d2" | ✅ |  |
| decision-trace graphNodeIds includes "d3" | ✅ |  |

### permission_hidden_distractor — PASS

> High-value SECRET node is hidden; answer cites only visible facts and trace must not carry its label

- Duration: 1ms
- Retrieval mode: `graphrag_global`
- Cited sourceIds: `[src:pub1, src:pub2]`
- Graph node ids in trace: `[pub1, pub2]`

| Assertion | Result | Note |
|---|---|---|
| citation count >= 2 | ✅ | got 2 |
| cited sourceId includes "src:pub1" | ✅ |  |
| cited sourceId includes "src:pub2" | ✅ |  |
| cited sourceId DOES NOT include "src:SECRET" | ✅ |  |
| decision-trace graphNodeIds includes "pub1" | ✅ |  |
| decision-trace graphNodeIds includes "pub2" | ✅ |  |
| no hidden label leaks into answer or trace | ✅ |  |

### stale_projection_warning — PASS

> Truncated retrieval is surfaced as a stale-projection operator signal

- Duration: 0ms
- Retrieval mode: `graphrag_global`
- Cited sourceIds: `[src:n1, src:n2]`
- Graph node ids in trace: `[n1, n2]`
- Operator signal: `truncated`

| Assertion | Result | Note |
|---|---|---|
| citation count >= 1 | ✅ | got 2 |
| retrieve step records truncation or rejectionReason | ✅ | truncated |
