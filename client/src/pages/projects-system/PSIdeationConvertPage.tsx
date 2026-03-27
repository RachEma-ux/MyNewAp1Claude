/**
 * PS Ideation — Convert Page
 *
 * Shows the concept package preview and triggers conversion to PS Wizard.
 */
import { useParams, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  ArrowLeft,
  Loader2,
  Wand2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  FileText,
} from "lucide-react";
import { Link } from "wouter";

export function PSIdeationConvertPage() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const ideationId = parseInt(id || "0", 10);

  const { data: ideation, isLoading: loadingIdeation } = trpc.ps.ideation.getById.useQuery(
    { id: ideationId },
    { enabled: !!ideationId },
  );

  const { data: readiness, isLoading: loadingReadiness } = trpc.ps.ideation.readiness.evaluate.useQuery(
    { ideationId },
    { enabled: !!ideationId },
  );

  const { data: conceptPkg, isLoading: loadingPkg, error: pkgError } = trpc.ps.ideation.convert.prepareConceptPackage.useQuery(
    { ideationId },
    { enabled: !!ideationId && !!readiness?.ready },
  );

  const commitMut = trpc.ps.ideation.convert.commit.useMutation({
    onSuccess: () => {
      toast.success("Ideation converted! Redirecting to wizard...");
      navigate("/ps/wizard");
    },
    onError: (e) => toast.error(e.message),
  });

  const handleCommit = () => {
    if (!confirm("Convert this ideation and send to PS Wizard? The ideation record will be frozen.")) return;
    commitMut.mutate({ ideationId });
  };

  const isLoading = loadingIdeation || loadingReadiness;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!ideation) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        Ideation not found.
      </div>
    );
  }

  if (ideation.lifecycleStatus === "converted") {
    return (
      <div className="p-4 space-y-4">
        <div className="flex items-center gap-2">
          <Link href={`/ps/ideation/${ideationId}`}>
            <Button variant="ghost" size="sm"><ArrowLeft className="w-4 h-4" /></Button>
          </Link>
          <h1 className="text-xl font-bold">Already Converted</h1>
        </div>
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            <CheckCircle2 className="w-10 h-10 mx-auto mb-2 text-green-500" />
            <p>This ideation has already been converted to a project.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-2">
        <Link href={`/ps/ideation/${ideationId}`}>
          <Button variant="ghost" size="sm"><ArrowLeft className="w-4 h-4" /></Button>
        </Link>
        <h1 className="text-xl font-bold">Convert to PS Wizard</h1>
      </div>

      {/* Readiness check */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Readiness Check</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {readiness?.ready ? (
            <div className="flex items-center gap-2 text-green-600">
              <CheckCircle2 className="w-5 h-5" />
              <span className="font-medium">All readiness checks passed</span>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-red-500">
                <XCircle className="w-5 h-5" />
                <span className="font-medium">Not ready for conversion</span>
              </div>
              {readiness?.blockers?.map((b, i) => (
                <div key={i} className="flex items-start gap-2 text-sm text-red-400 ml-7">
                  <XCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />{b}
                </div>
              ))}
            </div>
          )}
          {readiness?.warnings && readiness.warnings.length > 0 && (
            <div className="space-y-1">
              {readiness.warnings.map((w, i) => (
                <div key={i} className="flex items-start gap-2 text-sm text-yellow-500 ml-7">
                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />{w}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Concept Package Preview */}
      {readiness?.ready && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="w-4 h-4" />
              Concept Package Preview
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {loadingPkg ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : pkgError ? (
              <p className="text-sm text-red-500">{pkgError.message}</p>
            ) : conceptPkg ? (
              <div className="space-y-3 text-sm">
                <div>
                  <span className="font-medium text-muted-foreground">Title:</span> {conceptPkg.title}
                </div>
                <div>
                  <span className="font-medium text-muted-foreground">System Name:</span> {conceptPkg.systemName}
                </div>
                <div>
                  <span className="font-medium text-muted-foreground">Selected Concept:</span> {conceptPkg.selectedConcept}
                </div>
                {conceptPkg.problemStatement && (
                  <div>
                    <span className="font-medium text-muted-foreground">Problem:</span>
                    <p className="text-xs mt-1 whitespace-pre-wrap">{conceptPkg.problemStatement}</p>
                  </div>
                )}
                {conceptPkg.opportunityStatement && (
                  <div>
                    <span className="font-medium text-muted-foreground">Opportunity:</span>
                    <p className="text-xs mt-1 whitespace-pre-wrap">{conceptPkg.opportunityStatement}</p>
                  </div>
                )}
                {conceptPkg.rationale && (
                  <div>
                    <span className="font-medium text-muted-foreground">Rationale:</span>
                    <p className="text-xs mt-1 whitespace-pre-wrap">{conceptPkg.rationale}</p>
                  </div>
                )}
                {conceptPkg.feasibilityScore && (
                  <div>
                    <span className="font-medium text-muted-foreground">Feasibility:</span>{" "}
                    <Badge variant="outline">{conceptPkg.feasibilityScore}</Badge>
                  </div>
                )}
                {conceptPkg.riskLevel && (
                  <div>
                    <span className="font-medium text-muted-foreground">Risk:</span>{" "}
                    <Badge variant="outline">{conceptPkg.riskLevel}</Badge>
                  </div>
                )}
              </div>
            ) : null}
          </CardContent>
        </Card>
      )}

      {/* Action */}
      {readiness?.ready && (
        <div className="flex justify-end">
          <Button
            onClick={handleCommit}
            disabled={commitMut.isPending}
            className="bg-green-600 hover:bg-green-700"
          >
            {commitMut.isPending ? (
              <Loader2 className="w-4 h-4 mr-1 animate-spin" />
            ) : (
              <Wand2 className="w-4 h-4 mr-1" />
            )}
            Confirm & Send to Wizard
          </Button>
        </div>
      )}
    </div>
  );
}

export default PSIdeationConvertPage;
