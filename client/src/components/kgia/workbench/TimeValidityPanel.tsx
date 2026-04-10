import { Clock, AlertTriangle } from "lucide-react";

interface TimeValidityPanelProps {
  validity?: {
    asOf?: string;
    validFrom?: string;
    validTo?: string;
    temporalWarning?: string;
  } | null;
}

export default function TimeValidityPanel({ validity }: TimeValidityPanelProps) {
  if (!validity) {
    return <div className="text-xs text-muted-foreground py-4 text-center">No temporal data</div>;
  }

  return (
    <div className="space-y-2 text-xs">
      {validity.asOf && (
        <div className="flex items-center gap-2">
          <Clock className="w-3 h-3 text-muted-foreground" />
          <span className="text-muted-foreground">As of:</span>
          <span>{new Date(validity.asOf).toLocaleString()}</span>
        </div>
      )}
      {validity.validFrom && (
        <div className="flex items-center gap-2">
          <Clock className="w-3 h-3 text-muted-foreground" />
          <span className="text-muted-foreground">Valid from:</span>
          <span>{new Date(validity.validFrom).toLocaleString()}</span>
        </div>
      )}
      {validity.validTo && (
        <div className="flex items-center gap-2">
          <Clock className="w-3 h-3 text-muted-foreground" />
          <span className="text-muted-foreground">Valid to:</span>
          <span>{new Date(validity.validTo).toLocaleString()}</span>
        </div>
      )}
      {validity.temporalWarning && (
        <div className="flex items-start gap-2 text-yellow-500 bg-yellow-500/5 rounded p-2">
          <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
          <span>{validity.temporalWarning}</span>
        </div>
      )}
    </div>
  );
}
