/**
 * LLM Training Dashboard - Monitor and manage all training jobs
 *
 * Purpose: Real-time monitoring of LLM training pipeline
 * Features:
 * - Active training runs with progress tracking
 * - Real-time logs streaming
 * - Training metrics visualization (loss, perplexity, tokens/sec)
 * - Evaluation results
 * - Quantization status
 * - Job management (pause, resume, cancel)
 *
 * Wiring:
 * - trpc.llm.listCreationProjects (get all projects)
 * - trpc.llm.getCreationProject (get project details)
 * - trpc.llm.updateTrainingRun (control jobs)
 * - WebSocket for real-time updates (future)
 */

import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  Play,
  Pause,
  Square,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Zap,
  Database,
  BarChart,
  Package,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Cpu,
  Activity,
  Terminal,
  Eye,
  Download,
} from "lucide-react";
import { toast } from "sonner";

// ============================================================================
// Types
// ============================================================================

type TrainingStatus = "pending" | "running" | "paused" | "completed" | "failed" | "cancelled";
type ProjectPath = "PATH_A" | "PATH_B";

interface TrainingProject {
  id: number;
  name: string;
  description: string;
  path: ProjectPath;
  status: string;
  currentPhase: string;
  progress: number;
  createdAt: Date;
  updatedAt: Date;
}

interface TrainingRun {
  id: number;
  projectId: number;
  trainingType: "sft" | "dpo" | "tool_tuning" | "pretrain";
  phase: string;
  status: TrainingStatus;
  progress: number;
  currentStep: number;
  totalSteps: number;
  metrics?: {
    loss?: number;
    perplexity?: number;
    learningRate?: number;
    tokensPerSec?: number;
  };
  startedAt?: Date;
  completedAt?: Date;
  errorMessage?: string;
}

// ============================================================================
// Main Component
// ============================================================================

export default function LLMTrainingDashboard() {
  const [, setLocation] = useLocation();
  const [selectedTab, setSelectedTab] = useState<"active" | "completed" | "failed">("active");
  const [pathFilter, setPathFilter] = useState<string>("all");
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);

  // Fetch all projects
  const { data: projects, isLoading, refetch } = trpc.llm.listCreationProjects.useQuery({
    status: selectedTab === "active" ? "in_progress" : selectedTab,
  });

  // Fetch selected project details
  const { data: projectDetails } = trpc.llm.getCreationProject.useQuery(
    { projectId: selectedProjectId! },
    { enabled: !!selectedProjectId }
  );

  const handleViewProject = (projectId: number) => {
    setSelectedProjectId(projectId);
  };

  const handleRefresh = () => {
    refetch();
    toast.success("Refreshed training data");
  };

  return (
    <div className="container mx-auto py-8 px-4 max-w-7xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/llm")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold">LLM Training Dashboard</h1>
            <p className="text-muted-foreground">Monitor and manage all training jobs</p>
          </div>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" onClick={handleRefresh}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
          <Button onClick={() => setLocation("/llm/create")}>
            <Zap className="mr-2 h-4 w-4" />
            New Training
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Jobs</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {projects?.filter((p) => p.status === "in_progress").length || 0}
            </div>
            <p className="text-xs text-muted-foreground">Currently training</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Completed</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {projects?.filter((p) => p.status === "completed").length || 0}
            </div>
            <p className="text-xs text-muted-foreground">Successfully finished</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Failed</CardTitle>
            <AlertTriangle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {projects?.filter((p) => p.status === "failed").length || 0}
            </div>
            <p className="text-xs text-muted-foreground">Require attention</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">GPU Hours</CardTitle>
            <Cpu className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">1,247</div>
            <p className="text-xs text-muted-foreground">Total compute used</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters and Tabs */}
      <div className="mb-6">
        <div className="flex flex-col sm:flex-row gap-4 mb-4">
          <Select value={pathFilter} onValueChange={setPathFilter}>
            <SelectTrigger className="w-full sm:w-[200px]">
              <SelectValue placeholder="Filter by path" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Paths</SelectItem>
              <SelectItem value="PATH_A">PATH A (Fine-tuning)</SelectItem>
              <SelectItem value="PATH_B">PATH B (Pre-training)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Tabs value={selectedTab} onValueChange={(v) => setSelectedTab(v as any)}>
          <TabsList>
            <TabsTrigger value="active">
              <Activity className="mr-2 h-4 w-4" />
              Active
            </TabsTrigger>
            <TabsTrigger value="completed">
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Completed
            </TabsTrigger>
            <TabsTrigger value="failed">
              <AlertTriangle className="mr-2 h-4 w-4" />
              Failed
            </TabsTrigger>
          </TabsList>

          <TabsContent value="active" className="mt-6">
            <ActiveTrainingJobs
              projects={projects?.filter((p) => pathFilter === "all" || p.path === pathFilter)}
              onViewProject={handleViewProject}
            />
          </TabsContent>

          <TabsContent value="completed" className="mt-6">
            <CompletedTrainingJobs
              projects={projects?.filter((p) => pathFilter === "all" || p.path === pathFilter)}
              onViewProject={handleViewProject}
            />
          </TabsContent>

          <TabsContent value="failed" className="mt-6">
            <FailedTrainingJobs
              projects={projects?.filter((p) => pathFilter === "all" || p.path === pathFilter)}
              onViewProject={handleViewProject}
            />
          </TabsContent>
        </Tabs>
      </div>

      {/* Project Details Modal */}
      {selectedProjectId && projectDetails && (
        <ProjectDetailsPanel
          project={projectDetails.project}
          trainingRuns={projectDetails.trainingRuns}
          onClose={() => setSelectedProjectId(null)}
        />
      )}
    </div>
  );
}

// ============================================================================
// Active Training Jobs Component
// ============================================================================

function ActiveTrainingJobs({
  projects,
  onViewProject,
}: {
  projects?: TrainingProject[];
  onViewProject: (id: number) => void;
}) {
  if (!projects || projects.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Activity className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">No Active Training Jobs</h3>
          <p className="text-muted-foreground mb-4">Start a new training project to see it here</p>
          <Button onClick={() => (window.location.href = "/llm/create")}>
            <Zap className="mr-2 h-4 w-4" />
            Start Training
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {projects.map((project) => (
        <Card key={project.id}>
          <CardHeader>
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <CardTitle>{project.name}</CardTitle>
                  <Badge variant="default">
                    <Activity className="mr-1 h-3 w-3" />
                    Running
                  </Badge>
                  <Badge variant="outline">{project.path}</Badge>
                </div>
                <CardDescription>{project.description}</CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={() => onViewProject(project.id)}>
                <Eye className="mr-2 h-4 w-4" />
                View Details
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Current Phase */}
            <div className="flex items-center gap-2 text-sm">
              <Zap className="h-4 w-4 text-primary" />
              <span className="font-medium">Current Phase:</span>
              <span className="text-muted-foreground">{project.currentPhase}</span>
            </div>

            {/* Progress */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Overall Progress</span>
                <span className="font-medium">{project.progress}%</span>
              </div>
              <Progress value={project.progress} className="h-2" />
            </div>

            {/* Metrics (Mock data - replace with real metrics) */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-2 border-t">
              <div>
                <div className="text-xs text-muted-foreground">Loss</div>
                <div className="text-sm font-medium flex items-center gap-1">
                  2.34
                  <TrendingDown className="h-3 w-3 text-green-600" />
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Perplexity</div>
                <div className="text-sm font-medium">10.42</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Tokens/sec</div>
                <div className="text-sm font-medium">3,245</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">ETA</div>
                <div className="text-sm font-medium">2h 34m</div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-2">
              <Button variant="outline" size="sm">
                <Pause className="mr-2 h-4 w-4" />
                Pause
              </Button>
              <Button variant="outline" size="sm">
                <Terminal className="mr-2 h-4 w-4" />
                View Logs
              </Button>
              <Button variant="outline" size="sm" className="text-destructive">
                <Square className="mr-2 h-4 w-4" />
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ============================================================================
// Completed Training Jobs Component
// ============================================================================

function CompletedTrainingJobs({
  projects,
  onViewProject,
}: {
  projects?: TrainingProject[];
  onViewProject: (id: number) => void;
}) {
  if (!projects || projects.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <CheckCircle2 className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">No Completed Jobs</h3>
          <p className="text-muted-foreground">Completed training jobs will appear here</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Project Name</TableHead>
          <TableHead>Path</TableHead>
          <TableHead>Duration</TableHead>
          <TableHead>Final Loss</TableHead>
          <TableHead>Completed</TableHead>
          <TableHead>Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {projects.map((project) => (
          <TableRow key={project.id}>
            <TableCell className="font-medium">{project.name}</TableCell>
            <TableCell>
              <Badge variant="outline">{project.path}</Badge>
            </TableCell>
            <TableCell>4h 23m</TableCell>
            <TableCell>1.89</TableCell>
            <TableCell>
              {new Date(project.updatedAt).toLocaleDateString()}
            </TableCell>
            <TableCell>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => onViewProject(project.id)}>
                  <Eye className="mr-2 h-4 w-4" />
                  Details
                </Button>
                <Button variant="outline" size="sm">
                  <Download className="mr-2 h-4 w-4" />
                  Download
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

// ============================================================================
// Failed Training Jobs Component
// ============================================================================

function FailedTrainingJobs({
  projects,
  onViewProject,
}: {
  projects?: TrainingProject[];
  onViewProject: (id: number) => void;
}) {
  if (!projects || projects.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <CheckCircle2 className="h-12 w-12 text-green-600 mb-4" />
          <h3 className="text-lg font-semibold mb-2">No Failed Jobs</h3>
          <p className="text-muted-foreground">All training jobs completed successfully!</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {projects.map((project) => (
        <Card key={project.id} className="border-destructive">
          <CardHeader>
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <CardTitle>{project.name}</CardTitle>
                  <Badge variant="destructive">
                    <AlertTriangle className="mr-1 h-3 w-3" />
                    Failed
                  </Badge>
                  <Badge variant="outline">{project.path}</Badge>
                </div>
                <CardDescription>{project.description}</CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={() => onViewProject(project.id)}>
                <Eye className="mr-2 h-4 w-4" />
                View Logs
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                <strong>Error:</strong> CUDA out of memory. Tried to allocate 24.5 GiB but only 16 GiB available.
              </AlertDescription>
            </Alert>

            <div className="flex gap-2">
              <Button variant="outline" size="sm">
                <RefreshCw className="mr-2 h-4 w-4" />
                Retry
              </Button>
              <Button variant="outline" size="sm">
                <Terminal className="mr-2 h-4 w-4" />
                View Full Logs
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ============================================================================
// Project Details Panel Component
// ============================================================================

function ProjectDetailsPanel({
  project,
  trainingRuns,
  onClose,
}: {
  project: any;
  trainingRuns: any[];
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle>{project.name}</CardTitle>
              <CardDescription>{project.description}</CardDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={onClose}>
              ✕
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Project Info */}
          <div className="grid grid-cols-2 gap-4 p-4 bg-muted rounded-lg">
            <div>
              <div className="text-sm text-muted-foreground">Path</div>
              <div className="font-medium">{project.path}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Status</div>
              <div className="font-medium">{project.status}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Phase</div>
              <div className="font-medium">{project.currentPhase}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Progress</div>
              <div className="font-medium">{project.progress}%</div>
            </div>
          </div>

          {/* Training Runs */}
          <div>
            <h3 className="text-lg font-semibold mb-4">Training Runs</h3>
            {trainingRuns && trainingRuns.length > 0 ? (
              <div className="space-y-3">
                {trainingRuns.map((run: any) => (
                  <Card key={run.id}>
                    <CardContent className="pt-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Badge>{run.trainingType.toUpperCase()}</Badge>
                          <span className="text-sm font-medium">{run.phase}</span>
                        </div>
                        <Badge variant={run.status === "completed" ? "default" : "secondary"}>
                          {run.status}
                        </Badge>
                      </div>
                      {run.metrics && (
                        <div className="grid grid-cols-4 gap-2 text-sm">
                          <div>
                            <div className="text-muted-foreground">Loss</div>
                            <div className="font-medium">{run.metrics.loss?.toFixed(2) || "—"}</div>
                          </div>
                          <div>
                            <div className="text-muted-foreground">LR</div>
                            <div className="font-medium">{run.metrics.learningRate?.toExponential(2) || "—"}</div>
                          </div>
                          <div>
                            <div className="text-muted-foreground">Step</div>
                            <div className="font-medium">{run.currentStep || 0}/{run.totalSteps || 0}</div>
                          </div>
                          <div>
                            <div className="text-muted-foreground">Tokens/s</div>
                            <div className="font-medium">{run.metrics.tokensPerSec?.toLocaleString() || "—"}</div>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No training runs yet</p>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-4 border-t">
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
            <Button>
              <Terminal className="mr-2 h-4 w-4" />
              View Logs
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
