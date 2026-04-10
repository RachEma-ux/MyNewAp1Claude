import { FileSearch } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface ProvenanceRef {
  sourceType: string;
  sourceRef: string;
  operationRef?: string;
}

interface ProvenancePanelProps {
  refs: ProvenanceRef[];
}

export default function ProvenancePanel({ refs }: ProvenancePanelProps) {
  if (refs.length === 0) {
    return <div className="text-xs text-muted-foreground py-4 text-center">No provenance data</div>;
  }

  return (
    <div className="space-y-1">
      {refs.map((ref, i) => (
        <div key={i} className="flex items-start gap-2 text-xs py-1.5 px-2 rounded bg-muted/30">
          <FileSearch className="w-3 h-3 mt-0.5 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <Badge variant="outline" className="text-[9px]">{ref.sourceType}</Badge>
              <span className="truncate">{ref.sourceRef}</span>
            </div>
            {ref.operationRef && (
              <div className="text-[10px] text-muted-foreground mt-0.5 truncate">
                {ref.operationRef}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
