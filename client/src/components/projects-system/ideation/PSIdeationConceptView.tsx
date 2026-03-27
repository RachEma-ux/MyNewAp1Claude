/**
 * PS Ideation — Concept View (center canvas)
 *
 * Shows selected concept preview, rationale, lifecycle context.
 * Empty state when no concept has been selected.
 */
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Target, FileText, Shield } from "lucide-react";
import { IDEATION_LIFECYCLE_CONFIGS } from "@/config/psNavConfig";

interface SelectedIdea {
  id: number;
  title: string;
  description: string | null;
}

interface Props {
  selectedConcept: SelectedIdea | null;
  lifecycleStatus: string;
  rationaleSummary?: string | null;
  problemSnapshot?: string | null;
  opportunitySnapshot?: string | null;
  guidingQuestionSnapshot?: string | null;
}

export function PSIdeationConceptView({
  selectedConcept, lifecycleStatus,
  rationaleSummary, problemSnapshot, opportunitySnapshot, guidingQuestionSnapshot,
}: Props) {
  const lcConfig = IDEATION_LIFECYCLE_CONFIGS[lifecycleStatus];

  if (!selectedConcept) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[300px] text-center p-8">
        <Target className="w-10 h-10 text-muted-foreground/40 mb-3" />
        <p className="text-sm font-medium text-muted-foreground">No concept selected yet</p>
        <p className="text-xs text-muted-foreground/70 mt-1 max-w-sm">
          Complete the workflow steps and select a concept in Step 10 (Concept Selection) to see it here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-2xl">
      {/* Selected Concept */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Target className="w-4 h-4" />
            Selected Concept
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <h3 className="text-base font-semibold">{selectedConcept.title}</h3>
          {selectedConcept.description && (
            <p className="text-sm text-muted-foreground leading-relaxed">{selectedConcept.description}</p>
          )}
        </CardContent>
      </Card>

      {/* Rationale */}
      {rationaleSummary && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <FileText className="w-4 h-4" />
              Selection Rationale
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground leading-relaxed">{rationaleSummary}</p>
          </CardContent>
        </Card>
      )}

      {/* Lifecycle Context */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Shield className="w-4 h-4" />
            Lifecycle Context
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {lcConfig ? (
            <div>
              <Badge variant="outline" className={`text-xs ${lcConfig.badgeClass}`}>
                {lcConfig.label}
              </Badge>
              <p className="text-xs text-muted-foreground mt-1">{lcConfig.description}</p>
            </div>
          ) : (
            <Badge variant="outline" className="text-xs">{lifecycleStatus}</Badge>
          )}
        </CardContent>
      </Card>

      {/* Context Snapshots */}
      {(problemSnapshot || opportunitySnapshot || guidingQuestionSnapshot) && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Background Context</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {problemSnapshot && (
              <div>
                <div className="text-xs font-medium text-muted-foreground mb-0.5">Problem</div>
                <p className="text-sm leading-relaxed">{problemSnapshot}</p>
              </div>
            )}
            {opportunitySnapshot && (
              <div>
                <div className="text-xs font-medium text-muted-foreground mb-0.5">Opportunity</div>
                <p className="text-sm leading-relaxed">{opportunitySnapshot}</p>
              </div>
            )}
            {guidingQuestionSnapshot && (
              <div>
                <div className="text-xs font-medium text-muted-foreground mb-0.5">Guiding Question</div>
                <p className="text-sm leading-relaxed">{guidingQuestionSnapshot}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
