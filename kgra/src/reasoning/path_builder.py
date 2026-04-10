"""
Reasoning Path Construction — builds DAGs from execution traces.
Automatically constructs paths after runs with >3 tool calls.
"""

from __future__ import annotations
import uuid
from typing import Optional


def should_build_path(tool_calls: list[dict]) -> bool:
    """Check if a reasoning path should be built (>3 tool calls or branching)."""
    return len(tool_calls) > 3


def build_reasoning_path(
    run_id: str,
    query: str,
    answer: str,
    tool_calls: list[dict],
    mode: str = "direct_query",
) -> dict:
    """Convert execution trace into a reasoning path DAG.
    Node types: QueryNode, StepNode, FactNode, ClaimNode, EvidenceNode, DecisionNode
    Edge types: precedes, supports, contradicts, resolves, depends_on
    """
    path_id = f"rp_{run_id[:8]}_{uuid.uuid4().hex[:8]}"
    nodes = []
    edges = []

    # 1. Query node
    query_id = f"{path_id}_query"
    nodes.append({
        "id": query_id,
        "type": "QueryNode",
        "content": query,
        "metadata": {"mode": mode},
    })

    # 2. Step nodes from tool calls
    prev_id = query_id
    for i, tc in enumerate(tool_calls):
        step_id = f"{path_id}_step_{i}"
        step_type = "StepNode"

        # Classify step type
        tool = tc.get("tool", "")
        if tool.startswith("execute") or tool.startswith("run_"):
            step_type = "EvidenceNode"
        elif tool in ("choose_mode", "validate_operation"):
            step_type = "DecisionNode"
        elif tool == "synthesize_answer":
            step_type = "ClaimNode"

        nodes.append({
            "id": step_id,
            "type": step_type,
            "tool": tool,
            "inputs_summary": str(tc.get("inputs", ""))[:200],
            "output_summary": str(tc.get("output_summary", ""))[:200],
            "timestamp": tc.get("timestamp", ""),
            "cost": tc.get("cost", {}),
        })

        # Edge: precedes
        edges.append({"from": prev_id, "to": step_id, "type": "precedes"})

        # Edge: depends_on for evidence nodes
        if step_type == "EvidenceNode" and i > 0:
            edges.append({"from": f"{path_id}_step_{i-1}", "to": step_id, "type": "depends_on"})

        prev_id = step_id

    # 3. Answer node
    answer_id = f"{path_id}_answer"
    nodes.append({
        "id": answer_id,
        "type": "ClaimNode",
        "content": answer[:1000],
    })
    edges.append({"from": prev_id, "to": answer_id, "type": "precedes"})

    # 4. Supports edges from evidence to answer
    evidence_ids = [n["id"] for n in nodes if n["type"] == "EvidenceNode"]
    for eid in evidence_ids:
        edges.append({"from": eid, "to": answer_id, "type": "supports"})

    return {
        "path_id": path_id,
        "run_id": run_id,
        "query": query,
        "mode": mode,
        "nodes": nodes,
        "edges": edges,
        "node_count": len(nodes),
        "edge_count": len(edges),
    }
