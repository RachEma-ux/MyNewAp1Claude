import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Compass, Sparkles, ArrowRight } from "lucide-react";
import { useLocation } from "wouter";

const PSM_SELECTOR_DIMENSIONS = [
  { key: "urgency", label: "Urgency", description: "How quickly must this be resolved?" },
  { key: "complexity", label: "Complexity", description: "How complex is the problem?" },
  { key: "stakeholder_count", label: "Stakeholders", description: "How many stakeholders are involved?" },
  { key: "data_availability", label: "Data Availability", description: "How much data is available for analysis?" },
  { key: "process_maturity", label: "Process Maturity", description: "How mature are existing processes?" },
  { key: "innovation_need", label: "Innovation Need", description: "How much innovation is required?" },
  { key: "risk_level", label: "Risk Level", description: "What is the risk level?" },
  { key: "optimization_need", label: "Optimization Need", description: "Is optimization the primary goal?" },
  { key: "diagnosis_need", label: "Diagnosis Need", description: "Is root cause diagnosis needed?" },
  { key: "decision_making_need", label: "Decision Making", description: "Are formal decisions required?" },
  { key: "collaboration_intensity", label: "Collaboration", description: "How much group collaboration is needed?" },
  { key: "uncertainty_level", label: "Uncertainty", description: "How uncertain is the problem space?" },
] as const;

export default function PSMSelectorPage() {
  const [, navigate] = useLocation();
  const [dimensions, setDimensions] = useState<Record<string, number>>(
    Object.fromEntries(PSM_SELECTOR_DIMENSIONS.map((d) => [d.key, 5]))
  );
  const [description, setDescription] = useState("");
  const [results, setResults] = useState<any[] | null>(null);

  const recommendMutation = trpc.psm.selector.recommend.useMutation({
    onSuccess: (data: any) => setResults(data.recommendations ?? data ?? []),
  });

  const handleRecommend = () => {
    recommendMutation.mutate({
      dimensions,
      problemDescription: description || undefined,
      limit: 10,
    });
  };

  const resetForm = () => {
    setDimensions(Object.fromEntries(PSM_SELECTOR_DIMENSIONS.map((d) => [d.key, 5])));
    setDescription("");
    setResults(null);
  };

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <Compass className="h-4 w-4 text-teal-500" /> Method Selector
        </h2>
        {results && (
          <Button size="sm" variant="outline" className="text-xs" onClick={resetForm}>
            Reset
          </Button>
        )}
      </div>

      {!results ? (
        <div className="space-y-4 max-w-2xl">
          <p className="text-xs text-muted-foreground">
            Rate each dimension (1-10) to describe your problem. The selector will recommend the best methods.
          </p>

          {/* Dimension sliders */}
          <div className="space-y-3">
            {PSM_SELECTOR_DIMENSIONS.map((dim) => (
              <div key={dim.key} className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium">{dim.label}</label>
                  <Badge variant="outline" className="text-[9px] px-1.5">{dimensions[dim.key]}</Badge>
                </div>
                <p className="text-[10px] text-muted-foreground">{dim.description}</p>
                <Slider
                  min={1}
                  max={10}
                  step={1}
                  value={[dimensions[dim.key]]}
                  onValueChange={([val]) => setDimensions((prev) => ({ ...prev, [dim.key]: val }))}
                  className="w-full"
                />
              </div>
            ))}
          </div>

          {/* Optional description */}
          <div className="space-y-1">
            <label className="text-xs font-medium">Problem Description (optional)</label>
            <Textarea
              className="text-xs h-20 resize-none"
              placeholder="Briefly describe the problem you're trying to solve..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <Button onClick={handleRecommend} disabled={recommendMutation.isPending} className="text-xs">
            {recommendMutation.isPending ? (
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
            ) : (
              <Sparkles className="h-3 w-3 mr-1" />
            )}
            Get Recommendations
          </Button>
        </div>
      ) : (
        <div className="space-y-3 max-w-3xl">
          <p className="text-xs text-muted-foreground">
            {results.length} method{results.length !== 1 ? "s" : ""} recommended based on your inputs.
          </p>

          {results.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-8">No methods matched your criteria.</p>
          )}

          {results.map((rec: any, idx: number) => (
            <Card key={rec.methodId || idx} className="hover:border-teal-500/30 transition-colors">
              <CardContent className="p-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <Badge className="text-[10px] h-5 w-5 flex items-center justify-center rounded-full p-0 shrink-0">
                      {idx + 1}
                    </Badge>
                    <div>
                      <p className="text-xs font-semibold">{rec.methodName || `Method #${rec.methodId}`}</p>
                      {rec.explanation && (
                        <p className="text-[10px] text-muted-foreground mt-0.5">{rec.explanation}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="outline" className="text-[9px]">
                      Score: {typeof rec.score === "number" ? rec.score.toFixed(1) : rec.score}
                    </Badge>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 w-6 p-0"
                      onClick={() => navigate(`/psm/methods/${rec.methodId}`)}
                    >
                      <ArrowRight className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
                {rec.topDimensions && rec.topDimensions.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {rec.topDimensions.map((d: string) => (
                      <Badge key={d} variant="outline" className="text-[8px] px-1 py-0">{d}</Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
