import { AlertCircle, RotateCcw } from "lucide-react";
import type { AppBlockerPayload } from "@shared/blockers";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

export function AppBlockerAlert({
  blocker,
  className,
}: {
  blocker: AppBlockerPayload;
  className?: string;
}) {
  return (
    <Alert variant="destructive" className={cn("border-red-200 bg-red-50 text-red-950", className)}>
      <AlertCircle className="h-4 w-4" />
      <AlertTitle>{blocker.title}</AlertTitle>
      <AlertDescription className="space-y-3 text-red-900">
        <p>{blocker.summary}</p>

        {blocker.details.length > 0 && (
          <ul className="list-disc pl-5">
            {blocker.details.map((detail, index) => (
              <li key={`${detail}-${index}`}>{detail}</li>
            ))}
          </ul>
        )}

        {blocker.missingRequirements.length > 0 && (
          <div>
            <p className="font-medium">Missing or required</p>
            <ul className="list-disc pl-5">
              {blocker.missingRequirements.map((item, index) => (
                <li key={`${item}-${index}`}>{item}</li>
              ))}
            </ul>
          </div>
        )}

        {blocker.fieldIssues.length > 0 && (
          <div>
            <p className="font-medium">What needs fixing</p>
            <ul className="list-disc pl-5">
              {blocker.fieldIssues.map((issue) => (
                <li key={`${issue.field}-${issue.issue}`}>
                  {issue.field}: {issue.message}
                </li>
              ))}
            </ul>
          </div>
        )}

        {blocker.recommendedActions.length > 0 && (
          <div>
            <p className="font-medium">What to do next</p>
            <ul className="list-disc pl-5">
              {blocker.recommendedActions.map((action, index) => (
                <li key={`${action}-${index}`}>{action}</li>
              ))}
            </ul>
          </div>
        )}

        {blocker.retryable && (
          <div className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-red-800">
            <RotateCcw className="h-3.5 w-3.5" />
            You can try again after fixing the issue.
          </div>
        )}
      </AlertDescription>
    </Alert>
  );
}
