import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { AlertTriangle, CheckCircle, TrendingUp, Zap } from "lucide-react";
import { toast } from "sonner";
import type { Agent, AgentMode, GovernanceStatus, AgentRoleClass } from "@shared/types";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar,
} from "recharts";

export default function DriftDetectionPage() {
  const { data: driftSummary, isLoading, refetch } = trpc.agents.detectAllDrift.useQuery();
  const runDetectionMutation = trpc.agents.runDriftDetection.useMutation();
  const remediateMutation = trpc.agents.autoRemediate.useMutation();

  const handleRunDetection = async () => {
    try {
      await runDetectionMutation.mutateAsync();
      toast.success("Drift detection completed");
      refetch();
    } catch (error: any) {
      toast.error(`Detection failed: ${error.message}`);
    }
  };

  const handleRemediate = async (agentId: string, driftType: string) => {
    try {
      await remediateMutation.mutateAsync({ agentId, driftType });
      toast.success("Remediation triggered");
      refetch();
    } catch (error: any) {
      toast.error(`Remediation failed: ${error.message}`);
    }
  };

  const getSeverityBadge = (severity: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      critical: "destructive",
      high: "destructive",
      medium: "outline",
      low: "secondary",
    };

    return <Badge variant={variants[severity] || "outline"}>{severity}</Badge>;
  };

  // Mock trend data (replace with real data from backend)
  const trendData = [
    { date: "Jan 1", drifted: 2, compliant: 18 },
    { date: "Jan 2", drifted: 3, compliant: 17 },
    { date: "Jan 3", drifted: 1, compliant: 19 },
    { date: "Jan 4", drifted: 4, compliant: 16 },
    { date: "Jan 5", drifted: 2, compliant: 18 },
    { date: "Jan 6", drifted: 1, compliant: 19 },
    { date: "Jan 7", drifted: 0, compliant: 20 },
  ];

  if (isLoading) {
    return (
      <div className="container mx-auto py-8">
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">Loading drift detection data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Drift Detection Dashboard</h1>
          <p className="text-muted-foreground mt-2">
            Monitor policy drift, spec tampering, and agent expiry
          </p>
        </div>
        <Button onClick={handleRunDetection} disabled={runDetectionMutation.isPending}>
          <Zap className="w-4 h-4 mr-2" />
          Run Detection
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Total Drifted</CardDescription>
            <CardTitle className="text-3xl">{driftSummary?.totalDrifted || 0}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              {driftSummary?.totalDrifted === 0 ? "All agents compliant" : "Requires attention"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Policy Changes</CardDescription>
            <CardTitle className="text-3xl">{driftSummary?.byType?.policy_change || 0}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">Agents affected by policy updates</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Spec Tampering</CardDescription>
            <CardTitle className="text-3xl text-destructive">
              {driftSummary?.byType?.spec_tamper || 0}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">Critical security violations</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Expired Agents</CardDescription>
            <CardTitle className="text-3xl">{driftSummary?.byType?.expired || 0}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">Agents past expiry date</p>
          </CardContent>
        </Card>
      </div>

      {/* Drift Trends Chart */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5" />
            Drift Trends (Last 7 Days)
          </CardTitle>
          <CardDescription>Track drift detection over time</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="drifted" stroke="#ef4444" name="Drifted Agents" />
              <Line type="monotone" dataKey="compliant" stroke="#22c55e" name="Compliant Agents" />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Severity Distribution */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Drift Severity Distribution</CardTitle>
          <CardDescription>Breakdown by severity level</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart
              data={[
                { severity: "Critical", count: driftSummary?.bySeverity?.critical || 0 },
                { severity: "High", count: driftSummary?.bySeverity?.high || 0 },
                { severity: "Medium", count: driftSummary?.bySeverity?.medium || 0 },
                { severity: "Low", count: driftSummary?.bySeverity?.low || 0 },
              ]}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="severity" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="count" fill="#8b5cf6" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Drift Reports */}
      <div>
        <h2 className="text-xl font-semibold mb-4">Drift Reports ({driftSummary?.reports?.length || 0})</h2>
        {!driftSummary?.reports || driftSummary.reports.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <CheckCircle className="w-12 h-12 mx-auto text-green-500 mb-4" />
              <p className="text-muted-foreground">No drift detected - all agents compliant</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {driftSummary.reports.map((report: any) => (
              <Card key={report.agentId}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle>{report.agentName}</CardTitle>
                      <CardDescription>
                        Detected {new Date(report.detectedAt).toLocaleString()}
                      </CardDescription>
                    </div>
                    <div className="flex gap-2">
                      {getSeverityBadge(report.severity)}
                      <Badge variant="outline">{report.driftType}</Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div>
                      <h4 className="font-medium mb-2 flex items-center gap-2 text-orange-500">
                        <AlertTriangle className="w-4 h-4" />
                        Issue
                      </h4>
                      <p className="text-sm text-muted-foreground">{report.details}</p>
                    </div>

                    <div>
                      <h4 className="font-medium mb-2">Recommended Action</h4>
                      <p className="text-sm text-muted-foreground">{report.recommendedAction}</p>
                    </div>

                    {report.canAutoRemediate && (
                      <div className="flex gap-2 pt-4">
                        <Button
                          onClick={() => handleRemediate(report.agentId, report.driftType)}
                          disabled={remediateMutation.isPending}
                          className="flex items-center gap-2"
                        >
                          <Zap className="w-4 h-4" />
                          Auto-Remediate
                        </Button>
                        <Button variant="outline" asChild>
                          <a href={`/agents/${report.agentId}`}>View Agent</a>
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
