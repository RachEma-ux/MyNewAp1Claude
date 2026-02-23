import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { Shield, AlertTriangle, CheckCircle } from "lucide-react";

export default function HardeningPanel() {
  const { data: hardening, isLoading: hardeningLoading, error: hardeningError } = trpc.governance.hardeningCheck.useQuery();
  const { data: lint, isLoading: lintLoading, error: lintError } = trpc.governance.catalogLint.useQuery();

  const isLoading = hardeningLoading || lintLoading;

  if (isLoading) {
    return (
      <div className="container mx-auto py-8">
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">Loading hardening status...</p>
        </div>
      </div>
    );
  }

  if (hardeningError && lintError) {
    return (
      <div className="container mx-auto py-8">
        <Card>
          <CardContent className="py-12 text-center">
            <Shield className="w-12 h-12 mx-auto text-destructive mb-4" />
            <p className="text-destructive">Failed to load hardening checks</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const hardeningChecks = hardening?.checks ?? [];
  const hardeningPassed = hardeningChecks.filter((c: any) => c.passed ?? c.ok).length;
  const lintWarnings = lint?.warnings ?? lint?.issues ?? [];
  const lintValid = lint?.valid ?? (lintWarnings.length === 0);

  return (
    <div className="container mx-auto py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Production Hardening</h1>
        <p className="text-muted-foreground mt-2">
          Security controls and catalog quality validation
        </p>
      </div>

      {/* Hardening Check Results */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5" />
            Hardening Checks
          </CardTitle>
          <CardDescription>
            {hardeningPassed} of {hardeningChecks.length} checks passing
          </CardDescription>
        </CardHeader>
        <CardContent>
          {hardeningError ? (
            <p className="text-sm text-destructive">Error: {hardeningError.message}</p>
          ) : hardeningChecks.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hardening checks configured</p>
          ) : (
            <div className="space-y-3">
              {hardeningChecks.map((check: any, i: number) => {
                const passed = check.passed ?? check.ok ?? false;
                return (
                  <div key={i} className="flex items-center justify-between py-2 border-b last:border-0">
                    <div className="flex items-center gap-3">
                      {passed ? (
                        <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                      ) : (
                        <AlertTriangle className="w-4 h-4 text-destructive flex-shrink-0" />
                      )}
                      <div>
                        <p className="text-sm font-medium">{check.name || check.id || `Check ${i + 1}`}</p>
                        {check.details && (
                          <p className="text-xs text-muted-foreground">{check.details}</p>
                        )}
                      </div>
                    </div>
                    <Badge variant={passed ? "default" : "destructive"}>
                      {passed ? "PASS" : "FAIL"}
                    </Badge>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Catalog Lint Results */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5" />
            Catalog Lint
          </CardTitle>
          <CardDescription>
            {lintValid ? "Catalog is clean" : `${lintWarnings.length} warnings found`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {lintError ? (
            <p className="text-sm text-destructive">Error: {lintError.message}</p>
          ) : lintWarnings.length === 0 ? (
            <div className="flex items-center gap-3 py-4">
              <CheckCircle className="w-8 h-8 text-green-500" />
              <p className="text-muted-foreground">No lint warnings — catalog is clean</p>
            </div>
          ) : (
            <div className="space-y-2">
              {lintWarnings.map((w: any, i: number) => (
                <div key={i} className="flex items-start gap-3 py-2 border-b last:border-0">
                  <AlertTriangle className="w-4 h-4 text-yellow-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm">{typeof w === "string" ? w : w.message || w.warning || JSON.stringify(w)}</p>
                    {w.control && (
                      <p className="text-xs text-muted-foreground mt-1">Control: {w.control}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
