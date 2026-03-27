/**
 * PS Ideation — Insight Panel (right sidebar)
 *
 * Shows readiness status, blockers, warnings, and activity log.
 */
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertTriangle, CheckCircle2, XCircle, Activity, PanelLeftClose } from "lucide-react";

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

interface Props {
  readiness: ReadinessResult | null | undefined;
  activity: ActivityEntry[];
  isLoading?: boolean;
  onCollapse?: () => void;
}

export function PSIdeationInsightPanel({ readiness, activity, isLoading, onCollapse }: Props) {
  return (
    <aside className="w-48 shrink-0 border-l border-border overflow-y-auto p-2 space-y-3">
      {onCollapse && (
        <div className="flex justify-start">
          <Button variant="ghost" size="sm" onClick={onCollapse} title="Collapse panel" className="h-6 w-6 p-0">
            <PanelLeftClose className="w-3.5 h-3.5 rotate-180" />
          </Button>
        </div>
      )}
      {/* Readiness */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-xs uppercase tracking-wider">Readiness</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {!readiness ? (
            <p className="text-xs text-muted-foreground">Loading...</p>
          ) : readiness.ready ? (
            <div className="flex items-center gap-2 text-green-600">
              <CheckCircle2 className="w-4 h-4" />
              <span className="text-sm font-medium">Ready for Wizard</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-red-500">
              <XCircle className="w-4 h-4" />
              <span className="text-sm font-medium">Not Ready</span>
            </div>
          )}

          {readiness?.blockers && readiness.blockers.length > 0 && (
            <div className="space-y-1">
              <div className="text-[10px] font-semibold uppercase text-red-500">Blockers</div>
              {readiness.blockers.map((b, i) => (
                <div key={i} className="flex items-start gap-1 text-xs text-red-400">
                  <XCircle className="w-3 h-3 mt-0.5 shrink-0" />
                  {b}
                </div>
              ))}
            </div>
          )}

          {readiness?.warnings && readiness.warnings.length > 0 && (
            <div className="space-y-1">
              <div className="text-[10px] font-semibold uppercase text-yellow-500">Warnings</div>
              {readiness.warnings.map((w, i) => (
                <div key={i} className="flex items-start gap-1 text-xs text-yellow-500">
                  <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                  {w}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Activity */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-1 text-xs uppercase tracking-wider">
            <Activity className="w-3 h-3" /> Activity
          </CardTitle>
        </CardHeader>
        <CardContent>
          {activity.length === 0 ? (
            <p className="text-xs text-muted-foreground">No activity yet.</p>
          ) : (
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {activity.slice(0, 20).map((a) => (
                <div key={a.id} className="text-[11px] text-muted-foreground border-b border-border/50 pb-1">
                  <span className="font-mono">{a.eventType}</span>
                  <div className="text-[10px]">
                    {new Date(a.createdAt).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </aside>
  );
}
