/**
 * PRM Evidence Panel — Evidence list with upload/link capability
 */
import { trpc } from "@/lib/trpc";
import { Loader2, FileText, Link2, CheckCircle2, Circle } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PRMEvidencePanel({ caseId }: { caseId: number }) {
  const { data: evidence, isLoading } = trpc.prm.evidence.list.useQuery({ caseId });
  const utils = trpc.useUtils();
  const validateMutation = trpc.prm.evidence.validate.useMutation({
    onSuccess: () => utils.prm.evidence.list.invalidate({ caseId }),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!evidence || evidence.length === 0) {
    return <p className="text-xs text-muted-foreground py-4">No evidence attached yet.</p>;
  }

  return (
    <div className="space-y-2">
      {evidence.map((item: any) => (
        <div key={item.id} className="border rounded-lg p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-start gap-2 flex-1 min-w-0">
              {item.evidenceType === "url" ? (
                <Link2 className="h-3.5 w-3.5 mt-0.5 text-blue-500 shrink-0" />
              ) : (
                <FileText className="h-3.5 w-3.5 mt-0.5 text-muted-foreground shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-medium truncate">{item.title || "Untitled"}</h4>
                {item.notes && (
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{item.notes}</p>
                )}
                {item.externalUrl && (
                  <a
                    href={item.externalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-500 hover:underline mt-0.5 block truncate"
                  >
                    {item.externalUrl}
                  </a>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {item.isValidated ? (
                <CheckCircle2 className="h-4 w-4 text-green-500" />
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 text-[10px]"
                  onClick={() => validateMutation.mutate({ id: item.id })}
                  disabled={validateMutation.isPending}
                >
                  Validate
                </Button>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 mt-1.5 text-[10px] text-muted-foreground">
            <span className="uppercase">{item.evidenceType}</span>
            <span>{new Date(item.createdAt).toLocaleDateString()}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
