import { Badge } from "@/components/ui/badge";

interface EvidenceNode {
  id: number;
  nodeType: string;
  label: string;
  confidence: number | null;
}

interface EvidenceEdge {
  id: number;
  fromNodeId: number;
  toNodeId: number;
  relationshipType: string;
}

interface EvidenceGraphPanelProps {
  nodes: EvidenceNode[];
  edges: EvidenceEdge[];
}

export default function EvidenceGraphPanel({ nodes, edges }: EvidenceGraphPanelProps) {
  if (nodes.length === 0) {
    return <div className="text-xs text-muted-foreground py-4 text-center">No evidence nodes</div>;
  }

  return (
    <div className="space-y-3">
      <div className="text-xs text-muted-foreground">
        {nodes.length} node{nodes.length !== 1 ? "s" : ""}, {edges.length} edge{edges.length !== 1 ? "s" : ""}
      </div>

      {/* Nodes */}
      <div className="space-y-1">
        {nodes.slice(0, 50).map((node) => (
          <div key={node.id} className="flex items-center gap-2 text-xs py-1 px-2 rounded bg-muted/30">
            <Badge variant="outline" className="text-[9px] shrink-0">{node.nodeType}</Badge>
            <span className="truncate flex-1">{node.label}</span>
            {node.confidence !== null && (
              <span className="text-muted-foreground shrink-0">{(node.confidence * 100).toFixed(0)}%</span>
            )}
          </div>
        ))}
      </div>

      {/* Edges summary */}
      {edges.length > 0 && (
        <div>
          <div className="text-xs font-medium text-muted-foreground mb-1">Relationships</div>
          <div className="space-y-0.5">
            {edges.slice(0, 20).map((edge) => (
              <div key={edge.id} className="text-[10px] text-muted-foreground px-2">
                #{edge.fromNodeId} --[{edge.relationshipType}]--> #{edge.toNodeId}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
