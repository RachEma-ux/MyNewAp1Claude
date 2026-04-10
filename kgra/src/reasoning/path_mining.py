"""
Reasoning Path Mining — frequent subgraph mining for reasoning macros.
Uses simplified gSpan-like approach for common substructures.
"""

from __future__ import annotations
from collections import Counter
from typing import Optional


def extract_tool_sequences(paths: list[dict]) -> list[list[str]]:
    """Extract ordered tool call sequences from reasoning paths."""
    sequences = []
    for path in paths:
        seq = []
        for node in path.get("nodes", []):
            tool = node.get("tool")
            if tool:
                seq.append(tool)
        if seq:
            sequences.append(seq)
    return sequences


def find_frequent_subsequences(sequences: list[list[str]], min_support: int = 3, min_length: int = 2, max_length: int = 5) -> list[dict]:
    """Find frequent tool call subsequences (simplified frequent subgraph mining)."""
    subseq_counts: Counter = Counter()

    for seq in sequences:
        seen = set()
        for length in range(min_length, min(max_length + 1, len(seq) + 1)):
            for start in range(len(seq) - length + 1):
                subseq = tuple(seq[start:start + length])
                if subseq not in seen:
                    seen.add(subseq)
                    subseq_counts[subseq] += 1

    frequent = []
    for subseq, count in subseq_counts.most_common():
        if count >= min_support:
            frequent.append({
                "sequence": list(subseq),
                "support": count,
                "length": len(subseq),
            })

    return frequent


def promote_to_macro(subseq: dict) -> dict:
    """Promote a frequent subsequence to a reasoning macro."""
    return {
        "macro_id": f"macro_{'_'.join(subseq['sequence'][:3])}",
        "name": f"Macro: {' → '.join(subseq['sequence'])}",
        "steps": subseq["sequence"],
        "support": subseq["support"],
        "type": "ReasoningMacro",
    }


def mine_reasoning_macros(paths: list[dict], min_support: int = 3) -> list[dict]:
    """Full mining pipeline: extract sequences → find frequent → promote to macros."""
    sequences = extract_tool_sequences(paths)
    if not sequences:
        return []

    frequent = find_frequent_subsequences(sequences, min_support=min_support)
    macros = [promote_to_macro(f) for f in frequent[:20]]
    return macros
