/**
 * PRM Verification Checklist — Verification checks with pass/fail and sign-off
 */
import { trpc } from "@/lib/trpc";
import { Loader2, CheckCircle2, XCircle, Circle } from "lucide-react";

export function PRMVerificationChecklist({ caseId }: { caseId: number }) {
  const { data: verifications, isLoading } = trpc.prm.verifications.list.useQuery({ caseId });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!verifications || verifications.length === 0) {
    return <p className="text-xs text-muted-foreground py-4">No verifications defined yet.</p>;
  }

  return (
    <div className="space-y-2">
      {verifications.map((v: any) => (
        <div key={v.id} className="border rounded-lg p-3">
          <div className="flex items-start gap-2">
            {v.passed === true ? (
              <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
            ) : v.passed === false ? (
              <XCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
            ) : (
              <Circle className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">{v.testCondition}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Expected: {v.expectedResult}
              </p>
              {v.actualResult && (
                <p className="text-xs mt-0.5">
                  Actual: {v.actualResult}
                </p>
              )}
              {v.signedOffAt && (
                <p className="text-[10px] text-muted-foreground mt-1">
                  Signed off: {new Date(v.signedOffAt).toLocaleString()}
                </p>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
