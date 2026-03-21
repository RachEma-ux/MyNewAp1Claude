import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { toUserSafeGovernanceMessage } from "@shared/error-presentation";
import { Loader2, ShieldCheck, ChevronDown, ChevronRight } from "lucide-react";

export default function ScorecardsExplorerPanel() {
  const { data: history, isLoading: histLoading } =
    trpc.governance.scorecardHistory.useQuery();
  const { data: latest, isLoading: latestLoading } =
    trpc.governance.scorecardLatest.useQuery();
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const isLoading = histLoading || latestLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const runs = Array.isArray(history) ? history : [];
  const selectedRun = selectedIndex !== null ? runs[selectedIndex] : null;

  return (
    <div className="container mx-auto py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Scorecards Explorer</h1>
        <p className="text-muted-foreground mt-2">
          Browse scorecard run history and inspect individual results
        </p>
      </div>

      {latest && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5" />
              Latest Run
            </CardTitle>
            <CardDescription>
              Stage: {latest.stage ?? "—"} | Score:{" "}
              {latest.scorecard?.score ?? "N/A"}/100
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4">
              <Badge
                variant={
                  latest.scorecard?.gateStatus?.passed
                    ? "default"
                    : "destructive"
                }
              >
                Gate: {latest.scorecard?.gateStatus?.status ?? "unknown"}
              </Badge>
              {latest.timestamp && (
                <span className="text-sm text-muted-foreground">
                  {new Date(latest.timestamp).toLocaleString()}
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Run History ({runs.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {runs.length > 0 ? (
            <div className="space-y-1">
              {runs.map((run: any, i: number) => (
                <div key={i}>
                  <button
                    onClick={() =>
                      setSelectedIndex(selectedIndex === i ? null : i)
                    }
                    className="w-full flex items-center justify-between py-2 px-3 hover:bg-muted/50 rounded-lg transition-colors text-left"
                  >
                    <div className="flex items-center gap-3">
                      {selectedIndex === i ? (
                        <ChevronDown className="w-4 h-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-muted-foreground" />
                      )}
                      <span className="text-sm font-medium">
                        {run.stage ?? "—"} gate
                      </span>
                      <Badge
                        variant={
                          run.scorecard?.gateStatus?.passed
                            ? "default"
                            : "destructive"
                        }
                      >
                        {run.scorecard?.gateStatus?.passed ? "PASS" : "FAIL"}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm">
                        {run.scorecard?.score ?? "—"}/100
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {run.timestamp
                          ? new Date(run.timestamp).toLocaleString()
                          : "—"}
                      </span>
                    </div>
                  </button>

                  {selectedIndex === i && selectedRun && (
                    <div className="ml-8 mr-3 mb-3 p-4 border rounded-lg bg-muted/20">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                        <div className="text-center p-2 rounded bg-muted/50">
                          <p className="text-xs text-muted-foreground">Score</p>
                          <p className="font-bold">
                            {selectedRun.scorecard?.score ?? "—"}/100
                          </p>
                        </div>
                        <div className="text-center p-2 rounded bg-muted/50">
                          <p className="text-xs text-muted-foreground">
                            Risk Critical
                          </p>
                          <p className="font-bold">
                            {selectedRun.scorecard?.riskBreakdown?.critical ??
                              0}
                          </p>
                        </div>
                        <div className="text-center p-2 rounded bg-muted/50">
                          <p className="text-xs text-muted-foreground">
                            Risk High
                          </p>
                          <p className="font-bold">
                            {selectedRun.scorecard?.riskBreakdown?.high ?? 0}
                          </p>
                        </div>
                        <div className="text-center p-2 rounded bg-muted/50">
                          <p className="text-xs text-muted-foreground">
                            Gate Reason
                          </p>
                          <p className="text-xs mt-1">
                            {toUserSafeGovernanceMessage(
                              selectedRun.scorecard?.gateStatus?.reason ?? "—"
                            )}
                          </p>
                        </div>
                      </div>

                      {selectedRun.scorecard?.controlResults && (
                        <div className="space-y-1">
                          <p className="text-sm font-medium mb-2">
                            Control Results
                          </p>
                          {selectedRun.scorecard.controlResults.map(
                            (cr: any, j: number) => (
                              <div
                                key={j}
                                className="flex items-center justify-between py-1 text-sm"
                              >
                                <span>{cr.controlId}</span>
                                <Badge
                                  variant={
                                    cr.status === "pass"
                                      ? "default"
                                      : cr.status === "fail"
                                        ? "destructive"
                                        : "secondary"
                                  }
                                >
                                  {cr.status}
                                </Badge>
                              </div>
                            )
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">
              No scorecard runs recorded
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
