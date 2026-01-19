import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Rocket,
  RefreshCw,
  CheckCircle,
  XCircle,
  Clock,
  Loader2,
  ExternalLink,
  Copy,
  AlertCircle,
  Play,
  Square,
  RotateCcw,
  Settings,
  History,
  Activity,
} from "lucide-react";

type DeploymentStatus = "queued" | "in_progress" | "completed" | "waiting" | "requested" | "pending";
type DeploymentConclusion = "success" | "failure" | "cancelled" | "skipped" | "timed_out" | "action_required" | null;

interface DeploymentRun {
  id: number;
  runNumber: number;
  status: DeploymentStatus;
  conclusion: DeploymentConclusion;
  htmlUrl: string;
  createdAt: string;
  updatedAt: string;
  headSha: string;
}

interface JobStep {
  name: string;
  status: string;
  conclusion: string | null;
  number: number;
}

interface Job {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  startedAt: string | null;
  completedAt: string | null;
  steps: JobStep[];
}

export default function DeployPage() {
  const [activeTab, setActiveTab] = useState("deploy");
  const [version, setVersion] = useState("2.0.0");
  const [runApp, setRunApp] = useState<"yes" | "no">("yes");
  const [duration, setDuration] = useState<"5" | "10" | "15" | "30">("15");
  const [activeRunId, setActiveRunId] = useState<number | null>(null);
  const [pollingEnabled, setPollingEnabled] = useState(false);
  const [tunnelUrl, setTunnelUrl] = useState<string | null>(null);

  // Queries
  const configQuery = trpc.deploy.getConfig.useQuery();
  const historyQuery = trpc.deploy.listHistory.useQuery({ limit: 10 });

  const statusQuery = trpc.deploy.getStatus.useQuery(
    { runId: activeRunId! },
    {
      enabled: !!activeRunId && pollingEnabled,
      refetchInterval: pollingEnabled ? 5000 : false,
    }
  );

  // Query for tunnel URL (polls while deployment is running)
  const tunnelUrlQuery = trpc.deploy.getTunnelUrl.useQuery(
    { runId: activeRunId! },
    {
      enabled: !!activeRunId && pollingEnabled && !tunnelUrl,
      refetchInterval: !tunnelUrl ? 10000 : false, // Poll every 10s until we get URL
    }
  );

  // Update tunnelUrl when found
  useEffect(() => {
    if (tunnelUrlQuery.data?.tunnelUrl) {
      setTunnelUrl(tunnelUrlQuery.data.tunnelUrl);
      toast.success("Tunnel URL available!");
    }
  }, [tunnelUrlQuery.data?.tunnelUrl]);

  // Reset tunnel URL when switching deployments
  useEffect(() => {
    setTunnelUrl(null);
  }, [activeRunId]);

  // Mutations
  const triggerMutation = trpc.deploy.trigger.useMutation({
    onSuccess: (data) => {
      toast.success("Deployment triggered!");
      if (data.runId) {
        setActiveRunId(data.runId);
        setPollingEnabled(true);
        setActiveTab("status");
      }
      historyQuery.refetch();
    },
    onError: (error) => {
      toast.error(`Failed to trigger deployment: ${error.message}`);
    },
  });

  const cancelMutation = trpc.deploy.cancel.useMutation({
    onSuccess: () => {
      toast.success("Deployment cancelled");
      historyQuery.refetch();
    },
    onError: (error) => {
      toast.error(`Failed to cancel: ${error.message}`);
    },
  });

  const rerunMutation = trpc.deploy.rerun.useMutation({
    onSuccess: () => {
      toast.success("Deployment restarted");
      setPollingEnabled(true);
      historyQuery.refetch();
    },
    onError: (error) => {
      toast.error(`Failed to rerun: ${error.message}`);
    },
  });

  // Stop polling when workflow completes
  useEffect(() => {
    if (statusQuery.data?.status === "completed") {
      setPollingEnabled(false);
    }
  }, [statusQuery.data?.status]);

  const handleTriggerDeploy = () => {
    triggerMutation.mutate({
      version,
      runApp,
      duration,
    });
  };

  const handleCopyUrl = (url: string) => {
    navigator.clipboard.writeText(url);
    toast.success("URL copied to clipboard");
  };

  const handleViewRun = (run: DeploymentRun) => {
    setActiveRunId(run.id);
    setPollingEnabled(run.status !== "completed");
    setActiveTab("status");
  };

  const getStatusBadge = (status: string, conclusion: string | null) => {
    if (status === "completed") {
      if (conclusion === "success") {
        return <Badge className="bg-green-500"><CheckCircle className="h-3 w-3 mr-1" /> Success</Badge>;
      } else if (conclusion === "failure") {
        return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" /> Failed</Badge>;
      } else if (conclusion === "cancelled") {
        return <Badge variant="secondary"><Square className="h-3 w-3 mr-1" /> Cancelled</Badge>;
      }
      return <Badge variant="outline">{conclusion}</Badge>;
    }
    if (status === "in_progress") {
      return <Badge className="bg-blue-500"><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Running</Badge>;
    }
    if (status === "queued" || status === "waiting" || status === "pending") {
      return <Badge variant="outline"><Clock className="h-3 w-3 mr-1" /> Queued</Badge>;
    }
    return <Badge variant="outline">{status}</Badge>;
  };

  const calculateProgress = (jobs: Job[]): number => {
    if (!jobs || jobs.length === 0) return 0;
    const job = jobs[0];
    if (!job.steps || job.steps.length === 0) return 0;

    const completedSteps = job.steps.filter(s => s.status === "completed").length;
    return Math.round((completedSteps / job.steps.length) * 100);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString();
  };

  const formatDuration = (startedAt: string | null, completedAt: string | null) => {
    if (!startedAt) return "-";
    const start = new Date(startedAt).getTime();
    const end = completedAt ? new Date(completedAt).getTime() : Date.now();
    const seconds = Math.floor((end - start) / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  };

  // Check if GitHub is configured
  if (configQuery.isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!configQuery.data?.configured) {
    return (
      <div className="container mx-auto py-8 max-w-4xl">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Configuration Required</AlertTitle>
          <AlertDescription>
            <p className="mb-2">
              The deployment feature requires GitHub configuration:
            </p>
            <ul className="list-disc list-inside space-y-1">
              {!configQuery.data?.hasToken && (
                <li>Set the <code className="px-1 py-0.5 bg-muted rounded">GITHUB_TOKEN</code> environment variable</li>
              )}
              {!configQuery.data?.repo && (
                <li>Set the <code className="px-1 py-0.5 bg-muted rounded">GITHUB_REPO</code> environment variable (e.g., owner/repo)</li>
              )}
            </ul>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Rocket className="h-8 w-8" />
          Deployments
        </h1>
        <p className="text-muted-foreground mt-1">
          Deploy and manage your application via GitHub Actions
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="deploy" className="flex items-center gap-2">
            <Play className="h-4 w-4" />
            Deploy
          </TabsTrigger>
          <TabsTrigger value="status" className="flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Status
          </TabsTrigger>
          <TabsTrigger value="history" className="flex items-center gap-2">
            <History className="h-4 w-4" />
            History
          </TabsTrigger>
        </TabsList>

        {/* Deploy Tab */}
        <TabsContent value="deploy" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>New Deployment</CardTitle>
              <CardDescription>
                Configure and trigger a new deployment to GitHub Actions
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="version">Version</Label>
                  <Input
                    id="version"
                    value={version}
                    onChange={(e) => setVersion(e.target.value)}
                    placeholder="e.g., 2.0.0"
                  />
                  <p className="text-xs text-muted-foreground">
                    Semantic version for this release
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="duration">Duration (minutes)</Label>
                  <Select value={duration} onValueChange={(v) => setDuration(v as any)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="5">5 minutes</SelectItem>
                      <SelectItem value="10">10 minutes</SelectItem>
                      <SelectItem value="15">15 minutes</SelectItem>
                      <SelectItem value="30">30 minutes</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    How long to keep the tunnel active
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Run Application</Label>
                <div className="flex gap-4">
                  <Button
                    variant={runApp === "yes" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setRunApp("yes")}
                  >
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Yes - Start with tunnel
                  </Button>
                  <Button
                    variant={runApp === "no" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setRunApp("no")}
                  >
                    <XCircle className="h-4 w-4 mr-2" />
                    No - Build only
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Enable to get a public URL after deployment
                </p>
              </div>

              <div className="border-t pt-4">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-muted-foreground">
                    <span className="font-medium">Repository:</span> {configQuery.data?.repo}
                  </div>
                  <Button
                    onClick={handleTriggerDeploy}
                    disabled={triggerMutation.isPending || !version}
                    size="lg"
                  >
                    {triggerMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Triggering...
                      </>
                    ) : (
                      <>
                        <Rocket className="h-4 w-4 mr-2" />
                        Deploy Now
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Status Tab */}
        <TabsContent value="status" className="space-y-4">
          {!activeRunId ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                <Activity className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No active deployment selected</p>
                <p className="text-sm">
                  Trigger a new deployment or select one from history
                </p>
              </CardContent>
            </Card>
          ) : statusQuery.isLoading ? (
            <Card>
              <CardContent className="py-8 text-center">
                <Loader2 className="h-8 w-8 mx-auto animate-spin text-muted-foreground" />
                <p className="mt-2 text-muted-foreground">Loading deployment status...</p>
              </CardContent>
            </Card>
          ) : statusQuery.error ? (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{statusQuery.error.message}</AlertDescription>
            </Alert>
          ) : statusQuery.data ? (
            <>
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        Deployment #{statusQuery.data.runNumber}
                        {getStatusBadge(statusQuery.data.status, statusQuery.data.conclusion)}
                      </CardTitle>
                      <CardDescription>
                        Started {formatDate(statusQuery.data.createdAt)}
                      </CardDescription>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => statusQuery.refetch()}
                      >
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => window.open(statusQuery.data.htmlUrl, "_blank")}
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Progress Bar */}
                  {statusQuery.data.status === "in_progress" && (
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>Progress</span>
                        <span>{calculateProgress(statusQuery.data.jobs)}%</span>
                      </div>
                      <Progress value={calculateProgress(statusQuery.data.jobs)} />
                    </div>
                  )}

                  {/* Job Steps */}
                  {statusQuery.data.jobs.map((job) => (
                    <div key={job.id} className="border rounded-lg p-4">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="font-medium">{job.name}</h4>
                        {getStatusBadge(job.status, job.conclusion)}
                      </div>
                      <div className="space-y-2">
                        {job.steps.map((step) => (
                          <div
                            key={step.number}
                            className="flex items-center gap-2 text-sm"
                          >
                            {step.status === "completed" ? (
                              step.conclusion === "success" ? (
                                <CheckCircle className="h-4 w-4 text-green-500" />
                              ) : step.conclusion === "skipped" ? (
                                <Clock className="h-4 w-4 text-muted-foreground" />
                              ) : (
                                <XCircle className="h-4 w-4 text-red-500" />
                              )
                            ) : step.status === "in_progress" ? (
                              <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                            ) : (
                              <Clock className="h-4 w-4 text-muted-foreground" />
                            )}
                            <span className={step.conclusion === "skipped" ? "text-muted-foreground" : ""}>
                              {step.name}
                            </span>
                          </div>
                        ))}
                      </div>
                      {job.startedAt && (
                        <div className="mt-3 text-xs text-muted-foreground">
                          Duration: {formatDuration(job.startedAt, job.completedAt)}
                        </div>
                      )}
                    </div>
                  ))}

                  {/* Tunnel URL Display */}
                  {tunnelUrl ? (
                    <Alert className="border-green-500 bg-green-50 dark:bg-green-950">
                      <CheckCircle className="h-4 w-4 text-green-500" />
                      <AlertTitle>Application URL</AlertTitle>
                      <AlertDescription>
                        <div className="flex items-center gap-2 mt-2">
                          <code className="flex-1 px-2 py-1 bg-muted rounded text-sm break-all">
                            {tunnelUrl}
                          </code>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleCopyUrl(tunnelUrl)}
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => window.open(tunnelUrl, "_blank")}
                          >
                            <ExternalLink className="h-4 w-4" />
                          </Button>
                        </div>
                      </AlertDescription>
                    </Alert>
                  ) : statusQuery.data?.status === "in_progress" && (
                    <Alert>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <AlertTitle>Waiting for Tunnel URL</AlertTitle>
                      <AlertDescription>
                        <p className="text-sm">
                          The tunnel URL will appear here once Cloudflare tunnel is established.
                          {tunnelUrlQuery.isFetching && " Checking..."}
                        </p>
                        <Button
                          variant="link"
                          size="sm"
                          className="p-0 h-auto mt-1"
                          onClick={() => window.open(statusQuery.data?.htmlUrl, "_blank")}
                        >
                          <ExternalLink className="h-3 w-3 mr-1" />
                          View live logs on GitHub
                        </Button>
                      </AlertDescription>
                    </Alert>
                  )}

                  {/* Action Buttons */}
                  <div className="flex gap-2 pt-2">
                    {statusQuery.data.status === "in_progress" && (
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => cancelMutation.mutate({ runId: activeRunId })}
                        disabled={cancelMutation.isPending}
                      >
                        <Square className="h-4 w-4 mr-2" />
                        Cancel
                      </Button>
                    )}
                    {statusQuery.data.status === "completed" &&
                      statusQuery.data.conclusion !== "success" && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => rerunMutation.mutate({ runId: activeRunId })}
                          disabled={rerunMutation.isPending}
                        >
                          <RotateCcw className="h-4 w-4 mr-2" />
                          Re-run
                        </Button>
                      )}
                  </div>
                </CardContent>
              </Card>

              {/* Instructions for getting URL */}
              {statusQuery.data.status === "completed" &&
                statusQuery.data.conclusion === "success" && (
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>View Tunnel URL</AlertTitle>
                    <AlertDescription>
                      <p className="mb-2">
                        The tunnel URL is available in the GitHub Actions logs.
                        Click the link below to view the workflow summary.
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => window.open(statusQuery.data.htmlUrl, "_blank")}
                      >
                        <ExternalLink className="h-4 w-4 mr-2" />
                        View on GitHub
                      </Button>
                    </AlertDescription>
                  </Alert>
                )}
            </>
          ) : null}
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Deployment History</CardTitle>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => historyQuery.refetch()}
                  disabled={historyQuery.isFetching}
                >
                  <RefreshCw className={`h-4 w-4 ${historyQuery.isFetching ? "animate-spin" : ""}`} />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {historyQuery.isLoading ? (
                <div className="py-8 text-center">
                  <Loader2 className="h-8 w-8 mx-auto animate-spin text-muted-foreground" />
                </div>
              ) : historyQuery.error ? (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Error</AlertTitle>
                  <AlertDescription>{historyQuery.error.message}</AlertDescription>
                </Alert>
              ) : !historyQuery.data?.length ? (
                <div className="py-8 text-center text-muted-foreground">
                  <History className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No deployments yet</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>#</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Commit</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {historyQuery.data.map((run) => (
                      <TableRow key={run.id}>
                        <TableCell className="font-medium">
                          {run.runNumber}
                        </TableCell>
                        <TableCell>
                          {getStatusBadge(run.status, run.conclusion)}
                        </TableCell>
                        <TableCell>
                          <code className="text-xs">{run.headSha}</code>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatDate(run.createdAt)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleViewRun(run)}
                            >
                              View
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => window.open(run.htmlUrl, "_blank")}
                            >
                              <ExternalLink className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
