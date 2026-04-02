/**
 * PRM Case Card — Reusable case summary card
 */
import { useLocation } from "wouter";
import { PRMStatusBadge } from "./PRMStatusBadge";
import { PRMSeverityBadge } from "./PRMSeverityBadge";

interface CaseCardProps {
  id: number;
  title: string;
  status: string;
  severity: string | null;
  priority: string | null;
  sourceType: string | null;
  createdAt: string | Date;
}

export function PRMCaseCard({ id, title, status, severity, priority, sourceType, createdAt }: CaseCardProps) {
  const [, navigate] = useLocation();

  return (
    <div
      onClick={() => navigate(`/prm/cases/${id}`)}
      className="border rounded-lg p-3 hover:bg-muted/50 cursor-pointer transition-colors"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <h4 className="text-sm font-medium truncate flex-1">{title}</h4>
        <span className="text-[10px] text-muted-foreground shrink-0">#{id}</span>
      </div>
      <div className="flex items-center gap-1.5 flex-wrap">
        <PRMStatusBadge status={status} />
        <PRMSeverityBadge severity={severity} />
        {priority && (
          <span className="text-[10px] text-muted-foreground uppercase">{priority}</span>
        )}
        {sourceType && (
          <span className="text-[10px] text-muted-foreground">{sourceType}</span>
        )}
      </div>
      <p className="text-[10px] text-muted-foreground mt-1.5">
        {new Date(createdAt).toLocaleDateString()}
      </p>
    </div>
  );
}
