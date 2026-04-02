/**
 * PRM Case Card — Reusable case summary card
 */
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
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
  onDeleted?: () => void;
}

export function PRMCaseCard({ id, title, status, severity, priority, sourceType, createdAt, onDeleted }: CaseCardProps) {
  const [, navigate] = useLocation();

  const deleteMutation = trpc.prm.cases.delete.useMutation({
    onSuccess: () => { toast.success("Case deleted"); onDeleted?.(); },
    onError: () => toast.error("Failed to delete case"),
  });

  return (
    <div
      onClick={() => navigate(`/prm/cases/${id}`)}
      className="border rounded-lg p-3 hover:bg-muted/50 cursor-pointer transition-colors"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <h4 className="text-sm font-medium truncate flex-1">{title}</h4>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-[10px] text-muted-foreground">#{id}</span>
          <button
            title="Delete case"
            className="p-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              if (confirm(`Delete case "${title}"?`)) {
                deleteMutation.mutate({ id });
              }
            }}
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
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
