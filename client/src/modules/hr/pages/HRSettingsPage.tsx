/**
 * HR Settings Page — Module configuration, feature flags, and nav health
 *
 * Phase 9: Added nav config health dashboard for admin/developer visibility.
 */

import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { Settings, Activity, CheckCircle2, AlertTriangle } from "lucide-react";
import { Link } from "wouter";
import { getNavHealthSummary } from "@/config/hrNavConfigValidator";

export default function HRSettingsPage() {
  const settingsQuery = trpc.hr.settings.get.useQuery();
  const navHealth = useMemo(() => getNavHealthSummary(), []);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">HR Settings</h1>
        <Link href="/hr"><Button variant="outline" size="sm">Back to HR</Button></Link>
      </div>

      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-primary" />
            <span className="font-medium">Module: {settingsQuery.data?.module}</span>
            <Badge variant="outline">v{settingsQuery.data?.version}</Badge>
          </div>

          <div>
            <h3 className="text-sm font-medium mb-2">Feature Status</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {settingsQuery.data?.features && Object.entries(settingsQuery.data.features).map(([key, enabled]) => (
                <div key={key} className="flex items-center gap-2 text-sm">
                  <Badge variant={enabled ? "default" : "outline"} className="text-xs">
                    {enabled ? "ON" : "OFF"}
                  </Badge>
                  <span className="capitalize">{key}</span>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Nav Config Health — Phase 9 */}
      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-primary" />
            <span className="font-medium">Navigation Config Health</span>
            <Badge variant={navHealth.valid ? "default" : "destructive"} className="text-xs">
              {navHealth.valid ? "Valid" : `${navHealth.errorCount} errors`}
            </Badge>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="text-center p-2 rounded-lg bg-muted/50">
              <div className="text-2xl font-bold">{navHealth.overallCompletionPct}%</div>
              <div className="text-xs text-muted-foreground">Overall Complete</div>
            </div>
            <div className="text-center p-2 rounded-lg bg-muted/50">
              <div className="text-2xl font-bold">{navHealth.sectionsComplete}</div>
              <div className="text-xs text-muted-foreground">Sections Done</div>
            </div>
            <div className="text-center p-2 rounded-lg bg-muted/50">
              <div className="text-2xl font-bold">{navHealth.sectionsPartial}</div>
              <div className="text-xs text-muted-foreground">Sections Partial</div>
            </div>
            <div className="text-center p-2 rounded-lg bg-muted/50">
              <div className="text-2xl font-bold">{navHealth.deadEndCount}</div>
              <div className="text-xs text-muted-foreground">Dead Ends</div>
            </div>
          </div>

          {navHealth.warningCount > 0 && (
            <div className="flex items-center gap-2 text-sm text-yellow-600">
              <AlertTriangle className="w-4 h-4" />
              <span>{navHealth.warningCount} validation warnings</span>
            </div>
          )}

          <div>
            <h3 className="text-sm font-medium mb-2">Section Completion</h3>
            <div className="space-y-1">
              {navHealth.sections.map((s) => (
                <div key={s.sectionId} className="flex items-center gap-2 text-sm">
                  {s.completionPct === 100 ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                  ) : (
                    <div className="w-3.5 h-3.5 rounded-full border border-muted-foreground flex-shrink-0" />
                  )}
                  <span className="flex-1 truncate">{s.label}</span>
                  <span className="text-xs text-muted-foreground">
                    {s.liveItems + s.placeholderItems}/{s.totalItems}
                  </span>
                  <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full"
                      style={{ width: `${s.completionPct}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
