/**
 * PSExplainabilityPanel — Explainability display
 *
 * Shows positive/negative signals and winner margin from the
 * enriched matrix evaluation. All data DB-driven.
 */
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ThumbsUp,
  ThumbsDown,
  TrendingUp,
  ArrowRightLeft,
} from "lucide-react";

interface ExplainabilitySignal {
  questionCode: string;
  questionLabel: string;
  weight: number;
  scopeCode: string;
}

interface ExplainabilityReport {
  positiveSignals: ExplainabilitySignal[];
  negativeSignals: ExplainabilitySignal[];
  winnerMargin: number;
  winnerCode: string;
  runnerUpCode: string;
}

export function PSExplainabilityPanel({
  report,
  scopeLabels,
}: {
  report: ExplainabilityReport;
  scopeLabels: Record<string, string>;
}) {
  const winnerLabel = scopeLabels[report.winnerCode] || report.winnerCode;
  const runnerUpLabel = scopeLabels[report.runnerUpCode] || report.runnerUpCode;

  return (
    <div className="space-y-3">
      {/* Winner Margin */}
      <Card>
        <CardContent className="pt-4 pb-3 space-y-2">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-green-500" />
            <h4 className="text-sm font-medium">Winner Margin</h4>
          </div>
          <div className="flex items-center gap-3">
            <Badge className="bg-green-500/10 text-green-600 border-green-500/30 text-sm px-3">
              +{report.winnerMargin}
            </Badge>
            <span className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{winnerLabel}</span>
              {report.runnerUpCode && (
                <>
                  {" "}
                  <ArrowRightLeft className="w-3 h-3 inline" />{" "}
                  {runnerUpLabel}
                </>
              )}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Positive Signals */}
      {report.positiveSignals.length > 0 && (
        <Card>
          <CardContent className="pt-4 pb-3 space-y-2">
            <div className="flex items-center gap-2">
              <ThumbsUp className="w-4 h-4 text-green-500" />
              <h4 className="text-sm font-medium">
                Positive Signals ({report.positiveSignals.length})
              </h4>
            </div>
            <div className="space-y-1.5">
              {report.positiveSignals.map((s, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between text-sm gap-2"
                >
                  <span className="text-muted-foreground truncate flex-1">
                    {s.questionLabel}
                  </span>
                  <Badge
                    variant="outline"
                    className="text-[10px] text-green-600 border-green-500/30 shrink-0"
                  >
                    +{s.weight}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Negative Signals */}
      {report.negativeSignals.length > 0 && (
        <Card>
          <CardContent className="pt-4 pb-3 space-y-2">
            <div className="flex items-center gap-2">
              <ThumbsDown className="w-4 h-4 text-amber-500" />
              <h4 className="text-sm font-medium">
                Competing Signals ({report.negativeSignals.length})
              </h4>
            </div>
            <p className="text-xs text-muted-foreground">
              Questions where{" "}
              <span className="font-medium">{runnerUpLabel}</span> gained more
              weight than the winner.
            </p>
            <div className="space-y-1.5">
              {report.negativeSignals.map((s, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between text-sm gap-2"
                >
                  <span className="text-muted-foreground truncate flex-1">
                    {s.questionLabel}
                  </span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-[10px] text-muted-foreground">
                      {scopeLabels[s.scopeCode] || s.scopeCode}
                    </span>
                    <Badge
                      variant="outline"
                      className="text-[10px] text-amber-600 border-amber-500/30"
                    >
                      +{s.weight}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {report.positiveSignals.length === 0 &&
        report.negativeSignals.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No explainability signals — no questions were answered.
          </p>
        )}
    </div>
  );
}
