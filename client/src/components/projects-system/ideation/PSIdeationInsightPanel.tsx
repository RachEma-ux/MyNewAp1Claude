/**
 * PS Ideation — Insight Panel (right sidebar / drawer)
 *
 * Shows: lifecycle state, step completion summary, readiness checklist,
 * selected concept preview, PS Wizard handoff preview, activity summary.
 *
 * On mobile: renders inside a Sheet drawer.
 * On desktop/tablet: renders as a persistent sidebar panel.
 */
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Activity,
  PanelLeftClose,
  Target,
  Wand2,
  BarChart3,
  Circle,
} from "lucide-react";
import type { IdeationStepKey, IdeationStepStatus } from "../../../../../server/ps/ps.ideation-types";
import { IDEATION_STEP_KEYS, IDEATION_STEP_LABELS } from "../../../../../server/ps/ps.ideation-types";

interface ReadinessResult {
  ready: boolean;
  blockers: string[];
  warnings: string[];
}

interface ActivityEntry {
  id: number;
  eventType: string;
  payload: Record<string, unknown> | null;
  createdAt: string | Date;
}

interface StepState {
  stepKey: string;
  stepStatus: string;
}

interface SelectedIdea {
  id: number;
  title: string;
  description: string | null;
}

interface Props {
  readiness: ReadinessResult | null | undefined;
  activity: ActivityEntry[];
  steps: StepState[];
  lifecycleStatus: string;
  selectedConcept: SelectedIdea | null;
  isConverted: boolean;
  onConvert?: () => void;
  onCollapse?: () => void;
  /** Mobile sheet mode */
  mobileSheet?: boolean;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

function getStepStatus(steps: StepState[], key: string): IdeationStepStatus {
  return (steps.find((s) => s.stepKey === key)?.stepStatus as IdeationStepStatus) || "not_started";
}

/** The panel content — shared between inline and sheet modes */
function InsightContent({
  readiness, activity, steps, lifecycleStatus, selectedConcept, isConverted, onConvert,
}: Omit<Props, "onCollapse" | "mobileSheet" | "mobileOpen" | "onMobileClose">) {
  const completedSteps = IDEATION_STEP_KEYS.filter((k) => getStepStatus(steps, k) === "complete");
  const totalSteps = IDEATION_STEP_KEYS.length;

  return (
    <div className="space-y-3">
      {/* Step Completion Summary */}
      <Card>
        <CardHeader className="pb-1 pt-2 px-2">
          <CardTitle className="flex items-center gap-1 text-[10px] uppercase tracking-wider">
            <BarChart3 className="w-3 h-3" /> Steps
          </CardTitle>
        </CardHeader>
        <CardContent className="px-2 pb-2">
          <div className="text-xs font-medium mb-1">{completedSteps.length}/{totalSteps} complete</div>
          <div className="space-y-0.5">
            {IDEATION_STEP_KEYS.map((key, i) => {
              const status = getStepStatus(steps, key);
              return (
                <div key={key} className="flex items-center gap-1.5">
                  {status === "complete" ? (
                    <CheckCircle2 className="w-2.5 h-2.5 text-green-500 shrink-0" />
                  ) : status === "in_progress" ? (
                    <Circle className="w-2.5 h-2.5 text-blue-500 shrink-0 fill-blue-500" />
                  ) : (
                    <Circle className="w-2.5 h-2.5 text-muted-foreground/40 shrink-0" />
                  )}
                  <span className={`text-[10px] truncate ${status === "complete" ? "text-muted-foreground line-through" : ""}`}>
                    {i + 1}. {IDEATION_STEP_LABELS[key].replace(/^\d+\.\s*/, "")}
                  </span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Readiness Checklist */}
      <Card>
        <CardHeader className="pb-1 pt-2 px-2">
          <CardTitle className="text-[10px] uppercase tracking-wider">Readiness</CardTitle>
        </CardHeader>
        <CardContent className="px-2 pb-2 space-y-1.5">
          {!readiness ? (
            <p className="text-[10px] text-muted-foreground">Loading...</p>
          ) : readiness.ready ? (
            <div className="flex items-center gap-1.5 text-green-600">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span className="text-xs font-medium">Ready for Wizard</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-red-500">
              <XCircle className="w-3.5 h-3.5" />
              <span className="text-xs font-medium">Not Ready</span>
            </div>
          )}

          {readiness?.blockers && readiness.blockers.length > 0 && (
            <div className="space-y-0.5">
              <div className="text-[9px] font-semibold uppercase text-red-500">Blockers</div>
              {readiness.blockers.map((b, i) => (
                <div key={i} className="flex items-start gap-1 text-[10px] text-red-400">
                  <XCircle className="w-2.5 h-2.5 mt-0.5 shrink-0" />
                  <span className="leading-tight">{b}</span>
                </div>
              ))}
            </div>
          )}

          {readiness?.warnings && readiness.warnings.length > 0 && (
            <div className="space-y-0.5">
              <div className="text-[9px] font-semibold uppercase text-yellow-500">Warnings</div>
              {readiness.warnings.map((w, i) => (
                <div key={i} className="flex items-start gap-1 text-[10px] text-yellow-500">
                  <AlertTriangle className="w-2.5 h-2.5 mt-0.5 shrink-0" />
                  <span className="leading-tight">{w}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Selected Concept Preview */}
      <Card>
        <CardHeader className="pb-1 pt-2 px-2">
          <CardTitle className="flex items-center gap-1 text-[10px] uppercase tracking-wider">
            <Target className="w-3 h-3" /> Concept
          </CardTitle>
        </CardHeader>
        <CardContent className="px-2 pb-2">
          {selectedConcept ? (
            <div>
              <div className="text-xs font-medium">{selectedConcept.title}</div>
              {selectedConcept.description && (
                <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-3">{selectedConcept.description}</p>
              )}
            </div>
          ) : (
            <p className="text-[10px] text-muted-foreground">No concept selected yet.</p>
          )}
        </CardContent>
      </Card>

      {/* Wizard Handoff Preview */}
      <Card>
        <CardHeader className="pb-1 pt-2 px-2">
          <CardTitle className="flex items-center gap-1 text-[10px] uppercase tracking-wider">
            <Wand2 className="w-3 h-3" /> Wizard Handoff
          </CardTitle>
        </CardHeader>
        <CardContent className="px-2 pb-2 space-y-1.5">
          {isConverted ? (
            <Badge variant="outline" className="text-[10px] bg-indigo-500/10 text-indigo-600 border-indigo-500/30">
              Already Converted
            </Badge>
          ) : readiness?.ready ? (
            <>
              <div className="flex items-center gap-1 text-green-600">
                <CheckCircle2 className="w-3 h-3" />
                <span className="text-[10px]">All checks passed</span>
              </div>
              {onConvert && (
                <Button onClick={onConvert} size="sm" className="w-full h-7 text-[10px] bg-green-600 hover:bg-green-700">
                  <Wand2 className="w-3 h-3 mr-1" />
                  Open in PS Wizard
                </Button>
              )}
            </>
          ) : (
            <div className="text-[10px] text-muted-foreground">
              Complete required steps to unlock wizard handoff.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Activity Summary */}
      <Card>
        <CardHeader className="pb-1 pt-2 px-2">
          <CardTitle className="flex items-center gap-1 text-[10px] uppercase tracking-wider">
            <Activity className="w-3 h-3" /> Activity
          </CardTitle>
        </CardHeader>
        <CardContent className="px-2 pb-2">
          {activity.length === 0 ? (
            <p className="text-[10px] text-muted-foreground">No activity yet.</p>
          ) : (
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {activity.slice(0, 15).map((a) => (
                <div key={a.id} className="text-[10px] text-muted-foreground border-b border-border/50 pb-0.5">
                  <span className="font-mono">{a.eventType}</span>
                  <div className="text-[9px]">
                    {new Date(a.createdAt).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}
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

export function PSIdeationInsightPanel({
  readiness, activity, steps, lifecycleStatus, selectedConcept, isConverted, onConvert,
  onCollapse, mobileSheet, mobileOpen, onMobileClose,
}: Props) {
  const contentProps = { readiness, activity, steps, lifecycleStatus, selectedConcept, isConverted, onConvert };

  // Mobile: render as Sheet drawer
  if (mobileSheet) {
    return (
      <Sheet open={mobileOpen} onOpenChange={(open) => !open && onMobileClose?.()}>
        <SheetContent side="right" className="w-72 p-0 pt-2 overflow-y-auto">
          <SheetHeader className="px-3 pb-2">
            <SheetTitle className="text-sm">Insights</SheetTitle>
          </SheetHeader>
          <div className="px-2 pb-4">
            <InsightContent {...contentProps} />
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  // Desktop/tablet: inline persistent panel
  return (
    <aside className="w-52 shrink-0 border-l border-border overflow-y-auto p-2">
      {onCollapse && (
        <div className="flex justify-start mb-1">
          <Button variant="ghost" size="sm" onClick={onCollapse} title="Collapse panel" className="h-6 w-6 p-0">
            <PanelLeftClose className="w-3.5 h-3.5 rotate-180" />
          </Button>
        </div>
      )}
      <InsightContent {...contentProps} />
    </aside>
  );
}
