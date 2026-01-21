/**
 * LLM Dashboard - Landing page for the LLM Control Plane
 *
 * This is the entry point for the LLM domain, providing:
 * - Overview statistics and metrics
 * - Quick access to Control Plane and Wizard
 * - Recent activity feed
 * - Trust state summary (policy, attestation, drift)
 *
 * RFC-001 Compliance: Landing page, no auto-wizard opening
 */

import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Settings,
  Wand2,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  Activity,
  Layers,
  Shield,
  Cpu,
  Key,
} from "lucide-react";

export default function LLMDashboard() {
  const [, setLocation] = useLocation();
  const [wizardOpen, setWizardOpen] = useState(false);

  // Fetch dashboard statistics
  const { data: stats, isLoading } = trpc.llm.getDashboardStats.useQuery();

  const openQuickSetup = () => {
    setLocation("/llm/wizard");
  };

  const openFullLifecycle = () => {
    setLocation("/llm/create");
  };

  const openControlPlane = () => {
    setLocation("/llm/control-plane");
  };

  const openProviderWizard = () => {
    setLocation("/llm/provider-wizard");
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <Clock className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Loading LLM Dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-4 sm:py-8 px-4 max-w-7xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6 sm:mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold mb-2">LLM Control Plane</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Governed, auditable LLM registry and orchestration platform
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 w-full sm:w-auto">
          <Button variant="outline" size="lg" onClick={openControlPlane} className="w-full sm:w-auto">
            <Settings className="mr-2 h-4 w-4 sm:h-5 sm:w-5" />
            Control Plane
          </Button>
          <Button variant="outline" size="lg" onClick={() => setLocation("/llm/create")} className="w-full sm:w-auto">
            <Wand2 className="mr-2 h-4 w-4 sm:h-5 sm:w-5" />
            Wizard
          </Button>
          <Button variant="outline" size="lg" onClick={openQuickSetup} className="w-full sm:w-auto">
            <Wand2 className="mr-2 h-4 w-4 sm:h-5 sm:w-5" />
            Quick Setup
          </Button>
          <Button size="lg" onClick={openFullLifecycle} className="w-full sm:w-auto">
            <Cpu className="mr-2 h-4 w-4 sm:h-5 sm:w-5" />
            Train Model
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {/* Total LLMs */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total LLMs</CardTitle>
            <Layers className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalLLMs || 0}</div>
            <p className="text-xs text-muted-foreground">Active LLM identities</p>
          </CardContent>
        </Card>

        {/* Attestation Status */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Attestation Status</CardTitle>
            <Shield className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              <span className="text-sm">{stats?.attestationStatus.attested || 0} Attested</span>
            </div>
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-yellow-500" />
              <span className="text-sm">{stats?.attestationStatus.pending || 0} Pending</span>
            </div>
          </CardContent>
        </Card>

        {/* By Environment */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Environments</CardTitle>
            <Cpu className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              <div className="flex justify-between text-sm">
                <span>Sandbox</span>
                <Badge variant="secondary">{stats?.byEnvironment.sandbox || 0}</Badge>
              </div>
              <div className="flex justify-between text-sm">
                <span>Governed</span>
                <Badge variant="default">{stats?.byEnvironment.governed || 0}</Badge>
              </div>
              <div className="flex justify-between text-sm">
                <span>Production</span>
                <Badge variant="destructive">{stats?.byEnvironment.production || 0}</Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* By Role */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Roles</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 xs:grid-cols-2 gap-2 text-xs sm:text-sm">
              <span>Planner: {stats?.byRole.planner || 0}</span>
              <span>Executor: {stats?.byRole.executor || 0}</span>
              <span>Router: {stats?.byRole.router || 0}</span>
              <span>Guard: {stats?.byRole.guard || 0}</span>
              <span>Observer: {stats?.byRole.observer || 0}</span>
              <span>Embedder: {stats?.byRole.embedder || 0}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Activity */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>Latest LLM lifecycle events</CardDescription>
          </CardHeader>
          <CardContent>
            {stats?.recentActivity && stats.recentActivity.length > 0 ? (
              <div className="space-y-3">
                {stats.recentActivity.map((event) => (
                  <div key={event.id} className="flex items-start gap-3 pb-3 border-b last:border-0">
                    <div className="mt-1">
                      {event.eventType.includes("created") && (
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                      )}
                      {event.eventType.includes("promoted") && (
                        <Activity className="h-4 w-4 text-blue-500" />
                      )}
                      {event.eventType.includes("archived") && (
                        <XCircle className="h-4 w-4 text-gray-500" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{event.eventType}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {new Date(event.timestamp).toLocaleString()}
                      </p>
                    </div>
                    {event.environment && (
                      <Badge variant="outline" className="shrink-0">
                        {event.environment}
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <Activity className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-muted-foreground">No recent activity</p>
                <div className="flex gap-2 justify-center mt-2">
                  <Button variant="link" onClick={openQuickSetup}>
                    Quick Setup
                  </Button>
                  <Button variant="link" onClick={openFullLifecycle}>
                    Train Model
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Actions & Info */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button className="w-full" onClick={openQuickSetup}>
                <Wand2 className="mr-2 h-4 w-4" />
                Quick Setup
              </Button>
              <Button className="w-full" onClick={openFullLifecycle}>
                <Cpu className="mr-2 h-4 w-4" />
                Train Custom Model
              </Button>
              <Button variant="outline" className="w-full" onClick={() => setLocation("/llm/training")}>
                <Activity className="mr-2 h-4 w-4" />
                Training Monitor
              </Button>
              <Button variant="outline" className="w-full" onClick={openControlPlane}>
                <Settings className="mr-2 h-4 w-4" />
                Control Plane
              </Button>
              <Button variant="outline" className="w-full" onClick={openProviderWizard}>
                <Key className="mr-2 h-4 w-4" />
                Configure Providers
              </Button>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => setLocation("/llm/promotions")}
              >
                <Activity className="mr-2 h-4 w-4" />
                View Promotions
              </Button>
            </CardContent>
          </Card>

          <Alert>
            <Shield className="h-4 w-4" />
            <AlertDescription>
              <strong>Governance Active</strong>
              <p className="text-sm mt-1">
                All LLMs are policy-validated, attested, and auditable. Only compliant versions can
                execute.
              </p>
            </AlertDescription>
          </Alert>
        </div>
      </div>
    </div>
  );
}
