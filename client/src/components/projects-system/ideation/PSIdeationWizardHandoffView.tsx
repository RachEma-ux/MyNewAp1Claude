/**
 * PS Ideation — Wizard Handoff View (center canvas)
 *
 * Shows readiness checklist, blockers, warnings, handoff preview,
 * translator-generated scenario package, and the Open in PS Wizard CTA.
 */
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Wand2,
  ClipboardCheck,
  FileText,
  Loader2,
  RefreshCw,
} from "lucide-react";

interface ReadinessResult {
  ready: boolean;
  blockers: string[];
  warnings: string[];
}

interface Props {
  ideationId?: number;
  readiness: ReadinessResult | null | undefined;
  isConverted: boolean;
  onConvert?: () => void;
}

export function PSIdeationWizardHandoffView({ ideationId, readiness, isConverted, onConvert }: Props) {
  // Fetch translator-generated wizard handoff if ideationId is provided
  const { data: wizardHandoff, isLoading: handoffLoading, refetch: refetchHandoff } =
    trpc.ps.ideation.contextTranslator.generateWizardHandoff.useQuery(
      { ideationId: ideationId! },
      { enabled: !!ideationId },
    );

  return (
    <div className="space-y-4 max-w-2xl">
      {/* Readiness Status */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <ClipboardCheck className="w-4 h-4" />
            Readiness Check
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!readiness ? (
            <p className="text-sm text-muted-foreground">Evaluating readiness…</p>
          ) : readiness.ready ? (
            <div className="flex items-center gap-2 text-green-600">
              <CheckCircle2 className="w-5 h-5" />
              <span className="text-sm font-medium">All checks passed — ready for PS Wizard</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-red-500">
              <XCircle className="w-5 h-5" />
              <span className="text-sm font-medium">Not ready — resolve blockers below</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Blockers */}
      {readiness?.blockers && readiness.blockers.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm text-red-500">
              <XCircle className="w-4 h-4" />
              Blockers ({readiness.blockers.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {readiness.blockers.map((b, i) => (
              <div key={i} className="flex items-start gap-2 text-sm">
                <XCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
                <span>{b}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Warnings */}
      {readiness?.warnings && readiness.warnings.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm text-yellow-500">
              <AlertTriangle className="w-4 h-4" />
              Warnings ({readiness.warnings.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {readiness.warnings.map((w, i) => (
              <div key={i} className="flex items-start gap-2 text-sm">
                <AlertTriangle className="w-4 h-4 text-yellow-500 mt-0.5 shrink-0" />
                <span>{w}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Translator-Generated Wizard Scenario Package */}
      {ideationId && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <FileText className="w-4 h-4 text-indigo-500" />
              AI-Generated Scenario Package
              <Button variant="ghost" size="sm" className="ml-auto h-6 w-6 p-0" onClick={() => refetchHandoff()}>
                <RefreshCw className="w-3 h-3" />
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {handoffLoading ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm">Loading scenario package...</span>
              </div>
            ) : wizardHandoff ? (
              <div className="space-y-2 text-xs">
                <div><span className="font-medium text-muted-foreground">Title:</span> {wizardHandoff.scenarioTitle}</div>
                <div><span className="font-medium text-muted-foreground">Summary:</span> {wizardHandoff.scenarioSummary}</div>
                <div><span className="font-medium text-muted-foreground">Business Need:</span> {wizardHandoff.businessNeed}</div>
                <div><span className="font-medium text-muted-foreground">Primary Problem:</span> {wizardHandoff.primaryProblem}</div>
                <div><span className="font-medium text-muted-foreground">Opportunity:</span> {wizardHandoff.opportunityStatement}</div>
                <div><span className="font-medium text-muted-foreground">Urgency Driver:</span> {wizardHandoff.urgencyDriver}</div>
                <div><span className="font-medium text-muted-foreground">Recommended Direction:</span> {wizardHandoff.recommendedDirection}</div>
                {wizardHandoff.feasibilityNotes && (
                  <div><span className="font-medium text-muted-foreground">Feasibility:</span> {wizardHandoff.feasibilityNotes}</div>
                )}
                {wizardHandoff.openQuestions?.length > 0 && (
                  <div>
                    <span className="font-medium text-muted-foreground">Open Questions:</span>
                    <ul className="list-disc ml-4 mt-1">
                      {wizardHandoff.openQuestions.map((q: string, i: number) => <li key={i}>{q}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                No AI scenario package yet. Use the Context Translator on Step 1 to generate one.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Handoff Preview / CTA */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Wand2 className="w-4 h-4" />
            PS Wizard Handoff
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {isConverted ? (
            <Badge variant="outline" className="text-xs bg-indigo-500/10 text-indigo-600 border-indigo-500/30">
              Already Converted
            </Badge>
          ) : readiness?.ready ? (
            <>
              <div className="flex items-center gap-2 text-green-600">
                <CheckCircle2 className="w-4 h-4" />
                <span className="text-sm">All readiness checks passed</span>
              </div>
              {onConvert && (
                <Button onClick={onConvert} className="bg-green-600 hover:bg-green-700">
                  <Wand2 className="w-4 h-4 mr-2" />
                  Open in PS Wizard
                </Button>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Complete required steps to unlock wizard handoff.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
