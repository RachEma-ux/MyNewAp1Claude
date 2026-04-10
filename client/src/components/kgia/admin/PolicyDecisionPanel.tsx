import { Badge } from "@/components/ui/badge";
import { ShieldCheck, ShieldX, AlertTriangle } from "lucide-react";

interface PolicyDecision {
  id: number;
  action: string;
  decision: string;
  reason: string | null;
  policyRule: string | null;
  createdAt: string;
}

interface PolicyDecisionPanelProps {
  decisions: PolicyDecision[];
}

export default function PolicyDecisionPanel({ decisions }: PolicyDecisionPanelProps) {
  if (decisions.length === 0) {
    return <div className="text-xs text-muted-foreground py-4 text-center">No policy decisions</div>;
  }

  return (
    <div className="space-y-1">
      {decisions.map((d) => (
        <div key={d.id} className="flex items-start gap-2 text-xs py-1.5 px-2 rounded bg-muted/30">
          {d.decision === "allow" && <ShieldCheck className="w-3 h-3 mt-0.5 text-green-500 shrink-0" />}
          {d.decision === "deny" && <ShieldX className="w-3 h-3 mt-0.5 text-red-500 shrink-0" />}
          {d.decision === "review_required" && <AlertTriangle className="w-3 h-3 mt-0.5 text-yellow-500 shrink-0" />}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <Badge
                variant={d.decision === "allow" ? "default" : d.decision === "deny" ? "destructive" : "secondary"}
                className="text-[9px]"
              >
                {d.decision}
              </Badge>
              <span className="font-medium">{d.action}</span>
            </div>
            {d.reason && <div className="text-muted-foreground mt-0.5 truncate">{d.reason}</div>}
          </div>
          <span className="text-[10px] text-muted-foreground shrink-0">
            {new Date(d.createdAt).toLocaleTimeString()}
          </span>
        </div>
      ))}
    </div>
  );
}
