import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, AlertTriangle, Info, CheckCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export interface ValidationError {
  severity: "error" | "warn" | "info";
  code: string;
  message: string;
  nodeId?: string;
}

interface ValidationPanelProps {
  errors: ValidationError[];
  warnings: ValidationError[];
  info: ValidationError[];
  onNodeClick?: (nodeId: string) => void;
}

export function ValidationPanel({ errors, warnings, info, onNodeClick }: ValidationPanelProps) {
  const hasErrors = errors.length > 0;
  const hasWarnings = warnings.length > 0;
  const hasInfo = info.length > 0;
  const isValid = !hasErrors;

  if (!hasErrors && !hasWarnings && !hasInfo) {
    return (
      <Card className="border-green-500/50 bg-green-500/10">
        <CardContent className="p-4">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-green-500" />
            <div>
              <p className="text-sm font-medium text-green-500">Workflow Valid</p>
              <p className="text-xs text-muted-foreground">No validation issues found</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {hasErrors ? (
              <AlertCircle className="h-5 w-5 text-destructive" />
            ) : hasWarnings ? (
              <AlertTriangle className="h-5 w-5 text-yellow-500" />
            ) : (
              <Info className="h-5 w-5 text-blue-500" />
            )}
            <h3 className="text-sm font-semibold">
              {hasErrors ? "Validation Failed" : hasWarnings ? "Validation Warnings" : "Validation Info"}
            </h3>
          </div>
          <div className="flex gap-2">
            {hasErrors && (
              <Badge variant="destructive">
                {errors.length} Error{errors.length !== 1 ? "s" : ""}
              </Badge>
            )}
            {hasWarnings && (
              <Badge variant="outline" className="border-yellow-500 text-yellow-500">
                {warnings.length} Warning{warnings.length !== 1 ? "s" : ""}
              </Badge>
            )}
            {hasInfo && (
              <Badge variant="outline" className="border-blue-500 text-blue-500">
                {info.length} Info
              </Badge>
            )}
          </div>
        </div>

        <div className="space-y-2">
          {errors.map((error, index) => (
            <Alert key={`error-${index}`} variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle className="text-sm font-medium">{error.code}</AlertTitle>
              <AlertDescription className="text-xs">
                {error.message}
                {error.nodeId && onNodeClick && (
                  <button
                    onClick={() => onNodeClick(error.nodeId!)}
                    className="ml-2 underline hover:no-underline"
                  >
                    View node
                  </button>
                )}
              </AlertDescription>
            </Alert>
          ))}

          {warnings.map((warning, index) => (
            <Alert key={`warning-${index}`} className="border-yellow-500/50 bg-yellow-500/10">
              <AlertTriangle className="h-4 w-4 text-yellow-500" />
              <AlertTitle className="text-sm font-medium text-yellow-500">{warning.code}</AlertTitle>
              <AlertDescription className="text-xs text-yellow-600 dark:text-yellow-400">
                {warning.message}
                {warning.nodeId && onNodeClick && (
                  <button
                    onClick={() => onNodeClick(warning.nodeId!)}
                    className="ml-2 underline hover:no-underline"
                  >
                    View node
                  </button>
                )}
              </AlertDescription>
            </Alert>
          ))}

          {info.map((infoItem, index) => (
            <Alert key={`info-${index}`} className="border-blue-500/50 bg-blue-500/10">
              <Info className="h-4 w-4 text-blue-500" />
              <AlertTitle className="text-sm font-medium text-blue-500">{infoItem.code}</AlertTitle>
              <AlertDescription className="text-xs text-blue-600 dark:text-blue-400">
                {infoItem.message}
                {infoItem.nodeId && onNodeClick && (
                  <button
                    onClick={() => onNodeClick(infoItem.nodeId!)}
                    className="ml-2 underline hover:no-underline"
                  >
                    View node
                  </button>
                )}
              </AlertDescription>
            </Alert>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
