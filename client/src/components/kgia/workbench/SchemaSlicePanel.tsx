import { Badge } from "@/components/ui/badge";

interface SchemaSlicePanelProps {
  schemaSlice?: {
    nodeLabels?: string[];
    relationshipTypes?: string[];
    properties?: Record<string, string[]>;
  } | null;
}

export default function SchemaSlicePanel({ schemaSlice }: SchemaSlicePanelProps) {
  if (!schemaSlice) {
    return <div className="text-xs text-muted-foreground py-4 text-center">No schema slice data</div>;
  }

  return (
    <div className="space-y-3 text-xs">
      {schemaSlice.nodeLabels && schemaSlice.nodeLabels.length > 0 && (
        <div>
          <div className="font-medium text-muted-foreground mb-1">Node Labels</div>
          <div className="flex flex-wrap gap-1">
            {schemaSlice.nodeLabels.map((l) => (
              <Badge key={l} variant="outline" className="text-[10px]">{l}</Badge>
            ))}
          </div>
        </div>
      )}
      {schemaSlice.relationshipTypes && schemaSlice.relationshipTypes.length > 0 && (
        <div>
          <div className="font-medium text-muted-foreground mb-1">Relationship Types</div>
          <div className="flex flex-wrap gap-1">
            {schemaSlice.relationshipTypes.map((r) => (
              <Badge key={r} variant="secondary" className="text-[10px]">{r}</Badge>
            ))}
          </div>
        </div>
      )}
      {schemaSlice.properties && Object.keys(schemaSlice.properties).length > 0 && (
        <div>
          <div className="font-medium text-muted-foreground mb-1">Properties</div>
          {Object.entries(schemaSlice.properties).map(([label, props]) => (
            <div key={label} className="mb-1">
              <span className="text-muted-foreground">{label}:</span>{" "}
              {(props as string[]).join(", ")}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
