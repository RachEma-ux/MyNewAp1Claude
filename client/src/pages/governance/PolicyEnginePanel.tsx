import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { CheckCircle, XCircle, Cpu } from "lucide-react";

export default function PolicyEnginePanel() {
  const { data, isLoading, error } = trpc.governance.selfCheck.useQuery();

  if (isLoading) {
    return (
      <div className="container mx-auto py-8">
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">Loading policy engine status...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto py-8">
        <Card>
          <CardContent className="py-12 text-center">
            <XCircle className="w-12 h-12 mx-auto text-destructive mb-4" />
            <p className="text-destructive">Failed to load policy engine: {error.message}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const compliant = data?.compliant ?? false;
  const checks = data?.checks ?? [];
  const passCount = checks.filter((c: any) => c.passed || c.ok).length;
  const failCount = checks.length - passCount;

  return (
    <div className="container mx-auto py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Policy Engine</h1>
        <p className="text-muted-foreground mt-2">
          Runtime governance engine health and self-check results
        </p>
      </div>

      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Cpu className="w-5 h-5" />
            Compliance Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            {compliant ? (
              <CheckCircle className="w-10 h-10 text-green-500" />
            ) : (
              <XCircle className="w-10 h-10 text-destructive" />
            )}
            <div>
              <p className="text-xl font-semibold">{compliant ? "Compliant" : "Non-Compliant"}</p>
              <p className="text-sm text-muted-foreground">
                {passCount} passed, {failCount} failed out of {checks.length} checks
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {checks.map((check: any, i: number) => {
          const passed = check.passed ?? check.ok ?? false;
          return (
            <Card key={i} className={passed ? "" : "border-destructive/30"}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{check.name || check.id || `Check ${i + 1}`}</CardTitle>
                  <Badge variant={passed ? "default" : "destructive"}>
                    {passed ? "PASS" : "FAIL"}
                  </Badge>
                </div>
                {check.description && (
                  <CardDescription>{check.description}</CardDescription>
                )}
              </CardHeader>
              {check.details && (
                <CardContent>
                  <p className="text-sm text-muted-foreground">{check.details}</p>
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
