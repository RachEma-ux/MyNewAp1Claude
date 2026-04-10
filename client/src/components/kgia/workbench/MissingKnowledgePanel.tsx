import { AlertTriangle } from "lucide-react";

interface MissingKnowledgePanelProps {
  gaps: string[];
}

export default function MissingKnowledgePanel({ gaps }: MissingKnowledgePanelProps) {
  if (gaps.length === 0) {
    return <div className="text-xs text-muted-foreground py-4 text-center">No knowledge gaps detected</div>;
  }

  return (
    <div className="space-y-1">
      {gaps.map((gap, i) => (
        <div key={i} className="flex items-start gap-2 text-xs text-yellow-500 py-1 px-2 rounded bg-yellow-500/5">
          <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
          <span>{typeof gap === "string" ? gap : JSON.stringify(gap)}</span>
        </div>
      ))}
    </div>
  );
}
