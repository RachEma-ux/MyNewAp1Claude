/**
 * PSConfidenceBadge — Confidence metrics display
 *
 * Shows overall confidence as a visual bar + badge, with expandable
 * breakdown of spread, completeness, and ambiguity pillars.
 */
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp, Shield, Activity, CheckSquare, Scale } from "lucide-react";

interface ConfidenceReport {
  overall: number;
  spread: number;
  completeness: number;
  ambiguity: number;
}

function pct(v: number): string {
  return `${Math.round(v * 100)}%`;
}

function confidenceColor(v: number): string {
  if (v >= 0.8) return "bg-green-500";
  if (v >= 0.6) return "bg-amber-500";
  return "bg-red-500";
}

function confidenceTextColor(v: number): string {
  if (v >= 0.8) return "text-green-600";
  if (v >= 0.6) return "text-amber-600";
  return "text-red-600";
}

function confidenceBadgeClass(v: number): string {
  if (v >= 0.8) return "bg-green-500/10 text-green-600 border-green-500/30";
  if (v >= 0.6) return "bg-amber-500/10 text-amber-600 border-amber-500/30";
  return "bg-red-500/10 text-red-600 border-red-500/30";
}

function MiniBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="h-1.5 bg-muted rounded-full overflow-hidden flex-1">
      <div
        className={`h-full ${color} rounded-full transition-all`}
        style={{ width: `${Math.round(value * 100)}%` }}
      />
    </div>
  );
}

export function PSConfidenceBadge({ report }: { report: ConfidenceReport }) {
  const [expanded, setExpanded] = useState(false);
  const overall = report.overall;

  return (
    <Card>
      <CardContent className="pt-4 pb-3 space-y-3">
        {/* Header with overall confidence */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className={`w-4 h-4 ${confidenceTextColor(overall)}`} />
            <h4 className="text-sm font-medium">Confidence</h4>
            <Badge className={confidenceBadgeClass(overall)}>
              {pct(overall)}
            </Badge>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? (
              <ChevronUp className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )}
          </Button>
        </div>

        {/* Overall bar */}
        <div className="space-y-1">
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className={`h-full ${confidenceColor(overall)} rounded-full transition-all`}
              style={{ width: `${Math.round(overall * 100)}%` }}
            />
          </div>
        </div>

        {/* Expanded breakdown */}
        {expanded && (
          <div className="space-y-2.5 pt-1 border-t">
            {/* Completeness */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1 text-muted-foreground">
                  <CheckSquare className="w-3 h-3" /> Completeness
                </span>
                <span className="font-medium">{pct(report.completeness)}</span>
              </div>
              <MiniBar value={report.completeness} color="bg-blue-500" />
              <p className="text-[10px] text-muted-foreground">
                Fraction of matrix questions answered
              </p>
            </div>

            {/* Spread */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1 text-muted-foreground">
                  <Activity className="w-3 h-3" /> Score Spread
                </span>
                <span className="font-medium">{pct(report.spread)}</span>
              </div>
              <MiniBar value={report.spread} color="bg-indigo-500" />
              <p className="text-[10px] text-muted-foreground">
                How differentiated the scope scores are
              </p>
            </div>

            {/* Ambiguity */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1 text-muted-foreground">
                  <Scale className="w-3 h-3" /> Ambiguity
                </span>
                <span className="font-medium">{pct(report.ambiguity)}</span>
              </div>
              <MiniBar value={report.ambiguity} color="bg-amber-500" />
              <p className="text-[10px] text-muted-foreground">
                How close the top scores are (lower is better)
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Inline badge variant for use in summary bars / preview panels */
export function PSConfidenceInline({ overall }: { overall: number }) {
  return (
    <Badge className={`text-xs ${confidenceBadgeClass(overall)}`}>
      <Shield className="w-3 h-3 mr-1" />
      {pct(overall)}
    </Badge>
  );
}
